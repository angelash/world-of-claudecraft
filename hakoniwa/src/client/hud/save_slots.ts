// Save slots for the client over the save container (release_engineering.md 5): the slot
// list the windows show (cached, so painting never waits on storage), saving the running
// world through a RunSaver, loading with the previous-generation fallback, deleting, the
// autosave ring, and the one-time move of the first round's key-value saves into the
// container. Pure: the backend, the wall clock and the run id source are injected (main.ts
// wires IndexedDB); no DOM, no real clock.

import type { ContentMap } from '../../core/contracts';
import {
  AUTO_SLOTS,
  contentVersionOf,
  deserializeWorld,
  isoTime,
  type LoadedSave,
  type LogSource,
  loadSlot,
  MANUAL_SLOTS,
  RunSaver,
  type SaveBackend,
  type SaveErrorCode,
  SaveLoadError,
  type SaveVersions,
  type SlotId,
  type SlotRecord,
  type WorldMigrator,
} from '../../core/save';
import { calendarAt } from '../../core/time';
import type { World } from '../../core/world';
import { fmt, T } from '../../shared_ui/text';
import { inCombat, unitOf } from '../../systems/combat/units';
import { playerEntity } from '../../systems/world';
import { formatDate, formatTime } from './format';

export type { LoadedSave, SlotId };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The client engine's replay-log limit (EngineOptions.logLimit): reaching it autosaves at
 * the next safe point. A safety valve for play without saves for days of game time (a
 * player sends a few thousand commands a game day; the autoplayer a few hundred).
 */
export const CLIENT_LOG_LIMIT = 10_000;

/** Slots the save window writes to: the quick save and the manual saves (5.1). */
export const SLOT_IDS: readonly SlotId[] = ['quick', ...MANUAL_SLOTS];
/** Slots the title screen offers to load, in list order. */
export const LOAD_SLOTS: readonly SlotId[] = ['quick', ...AUTO_SLOTS, ...MANUAL_SLOTS];

export interface SlotMeta {
  slot: SlotId;
  tick: number;
  /** "圣历 998 年 春 第 1 日 06:00" */
  date: string;
  mapName: string;
  /** real-world save time, ISO string (client side, not simulation state) */
  savedAt: string;
  /** stored snapshot size */
  bytes: number;
  label: string;
  /** which machine wrote it (cloud conflicts, 5.7) */
  writerName: string;
  recovered: boolean;
  /** the current generation is broken; loading uses the previous one */
  fallback: boolean;
}

export function slotLabel(slot: SlotId): string {
  if (slot === 'quick') return T.saves.quick;
  if (slot === 'ironman') return T.saves.ironman;
  const auto = /^auto_(\d+)$/.exec(slot);
  if (auto) return fmt(T.saves.auto, { n: Number(auto[1]) });
  return fmt(T.saves.slot, { n: Number(slot.replace('manual_', '')) });
}

export function slotMeta(rec: SlotRecord): SlotMeta | null {
  const h = rec.header ?? rec.prev;
  if (!h) return null;
  const cal = calendarAt(h.tick);
  // Save flags (ironman, recovered), not world flags.
  const { recovered } = h.flags;
  return {
    slot: rec.slot,
    tick: h.tick,
    date: `${formatDate(cal)} ${formatTime(cal)}`,
    mapName: h.summary.mapName ?? '',
    savedAt: h.savedAt,
    bytes: h.files.snapshot.bytes,
    label: h.label,
    writerName: h.writerName,
    recovered,
    fallback: !rec.header,
  };
}

/** A failed save: the container's reason code and text. */
export class SaveFailed extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SaveFailed';
  }
}

/** What the running world is, for the slot list (loading never depends on it). */
export interface SaveInfo {
  mapId: string;
  mapName: string;
  label?: string;
}

/** The engine side a save needs: the world, its log and its content. */
export interface SaveSource extends LogSource {
  readonly content?: ContentMap;
}

export interface ClientSavesOptions {
  backend: SaveBackend;
  /** wall clock, ms since the epoch */
  now: () => number;
  /** a fresh run id (`r-` and hex) for every new game */
  newRunId: () => string;
  /** this build's version fields; the content version is computed from the content */
  versions: Omit<SaveVersions, 'worldVersion' | 'contentVersion'>;
  /** where the first round kept its saves; moved into the container once */
  legacy?: KeyValueStore | null;
  /**
   * The backend outlives the page (IndexedDB, files). When false (the in-memory fallback)
   * the old saves are left where they are instead of being moved into memory and lost.
   */
  durable?: boolean;
  migrate?: WorldMigrator;
}

/** Keys of the first round's key-value saves. */
export const LEGACY_PREFIX = 'hakoniwa.save.';
export const LEGACY_INDEX_KEY = 'hakoniwa.saves.index';
export const LEGACY_MOVED_KEY = 'hakoniwa.saves.moved';
const LEGACY_SLOTS: Record<string, SlotId> = {
  quick: 'quick',
  '1': 'manual_01',
  '2': 'manual_02',
  '3': 'manual_03',
  '4': 'manual_04',
  '5': 'manual_05',
  '6': 'manual_06',
};

export class ClientSaves {
  private cache: Partial<Record<SlotId, SlotMeta>> = {};
  private records = new Map<SlotId, SlotRecord>();
  private saver: RunSaver | null = null;
  private source: SaveSource | null = null;

  constructor(private readonly opts: ClientSavesOptions) {}

  /** Saves outlive the page (false: the browser gave no storage; they last until it closes). */
  get durable(): boolean {
    return this.opts.durable ?? true;
  }

  /** Move first-round saves in (once), then read the slot list. Never throws. */
  async open(): Promise<void> {
    try {
      await this.moveLegacy();
    } catch (err) {
      console.warn('[saves] moving the old saves failed', err);
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    let records: SlotRecord[] = [];
    try {
      records = await this.opts.backend.list();
    } catch (err) {
      console.warn('[saves] listing failed', err);
    }
    const next: Partial<Record<SlotId, SlotMeta>> = {};
    this.records = new Map();
    for (const r of records) {
      const m = slotMeta(r);
      if (!m) continue;
      next[r.slot] = m;
      this.records.set(r.slot, r);
    }
    this.cache = next;
  }

  /** The slot list as of the last refresh (synchronous for painting). */
  list(): Partial<Record<SlotId, SlotMeta>> {
    return this.cache;
  }

  meta(slot: SlotId): SlotMeta | undefined {
    return this.cache[slot];
  }

  has(slot: SlotId): boolean {
    return this.cache[slot] !== undefined;
  }

  /** Start saving a running world: a new run, or the chain of the save it was loaded from. */
  attach(source: SaveSource, from?: LoadedSave | null): void {
    this.source = source;
    this.saver = new RunSaver({
      backend: this.opts.backend,
      runId: from?.header.runId ?? this.opts.newRunId(),
      versions: { ...this.opts.versions, contentVersion: this.contentVersion(source) },
      from: from?.header ?? null,
      fromMode: from?.aiMode,
    });
  }

  detach(): void {
    this.source = null;
    this.saver = null;
  }

  /** A save is being written (a safe point excludes it, 5.1). */
  get writing(): boolean {
    return this.saver?.writing ?? false;
  }

  get runId(): string | null {
    return this.saver?.runId ?? null;
  }

  /** Save the attached world. Throws SaveFailed (or the storage error) on failure. */
  async save(slot: SlotId, info: SaveInfo): Promise<SlotMeta> {
    const saver = this.saver;
    const source = this.source;
    if (!saver || !source) throw new Error('no running world to save');
    const world = source.world;
    const res = await saver.save(source, {
      slot,
      savedAt: isoTime(this.opts.now()),
      label: info.label,
      summary: { act: String(world.meta.flags.act ?? ''), map: info.mapId, mapName: info.mapName },
    });
    if (!res.ok) throw new SaveFailed(res.code, res.reason);
    await this.refresh();
    return this.cache[slot] ?? (slotMeta({ slot, header: res.header, prev: null }) as SlotMeta);
  }

  /** The autosave ring (5.1): an empty autosave slot, else the oldest one. */
  nextAutoSlot(): SlotId {
    let pick: SlotId = AUTO_SLOTS[0] as SlotId;
    let oldest: string | null = null;
    for (const s of AUTO_SLOTS) {
      const m = this.cache[s];
      if (!m) return s;
      if (oldest === null || m.savedAt < oldest) {
        oldest = m.savedAt;
        pick = s;
      }
    }
    return pick;
  }

  autosave(info: SaveInfo): Promise<SlotMeta> {
    return this.save(this.nextAutoSlot(), info);
  }

  /**
   * Read a slot (falling back to its previous generation when the current one is broken).
   * Saves still being written finish first, so a load right after a save reads it.
   */
  async load(slot: SlotId): Promise<LoadedSave> {
    await this.saver?.idle();
    return loadSlot(this.opts.backend, slot, this.opts.migrate);
  }

  async remove(slot: SlotId): Promise<void> {
    await this.opts.backend.delete({ slotId: slot });
    await this.refresh();
  }

  private contentVersion(source: SaveSource): string {
    return source.content ? contentVersionOf(source.content) : 'c-unknown';
  }

  /**
   * The first round's saves (whole worlds under `hakoniwa.save.<slot>`), moved in once:
   * each into its own run, into its old slot or, when that is taken, the first free manual
   * slot. A save that fails to write stays for the next start; one this build cannot read
   * stays where it is (5.2: dev saves before M2 are not migrated).
   */
  private async moveLegacy(): Promise<void> {
    const kv = this.opts.legacy;
    if (!kv || !this.durable || kv.getItem(LEGACY_MOVED_KEY)) return;
    let index: Record<string, { savedAt?: string; mapName?: string }> = {};
    try {
      index = JSON.parse(kv.getItem(LEGACY_INDEX_KEY) ?? '{}');
    } catch {
      index = {};
    }
    const taken = new Set<SlotId>((await this.opts.backend.list()).map((r) => r.slot));
    let retry = 0;
    let unreadable = 0;
    for (const [old, wanted] of Object.entries(LEGACY_SLOTS)) {
      const text = kv.getItem(LEGACY_PREFIX + old);
      if (text === null) continue;
      let world: World;
      try {
        world = deserializeWorld(text);
      } catch {
        unreadable++;
        continue;
      }
      const slot = taken.has(wanted) ? MANUAL_SLOTS.find((m) => !taken.has(m)) : wanted;
      if (!slot) {
        retry++;
        continue;
      }
      const meta = index[old] ?? {};
      const saver = new RunSaver({
        backend: this.opts.backend,
        runId: this.opts.newRunId(),
        // Pre-registry localStorage saves carry old names: renameVersion 0 makes the next load
        // apply every rename.
        versions: { ...this.opts.versions, renameVersion: 0, contentVersion: 'c-legacy' },
      });
      const res = await saver.save(
        { world, drainLog: () => [] },
        {
          slot,
          savedAt: meta.savedAt ?? isoTime(this.opts.now()),
          summary: {
            act: String(world.meta.flags.act ?? ''),
            map: '',
            mapName: meta.mapName ?? '',
          },
        },
      );
      if (res.ok) {
        taken.add(slot);
        kv.removeItem(LEGACY_PREFIX + old);
      } else {
        retry++;
      }
    }
    if (retry > 0) return;
    if (unreadable === 0) kv.removeItem(LEGACY_INDEX_KEY);
    kv.setItem(LEGACY_MOVED_KEY, '1');
  }
}

/** In-memory store for tests and for browsers without storage. */
export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(key: string): string | null {
    return this.m.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.m.set(key, value);
  }
  removeItem(key: string): void {
    this.m.delete(key);
  }
}

/** True when an error is a storage quota error (a failed save or the browser's own). */
export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number | string };
  return (
    e.code === 'quota' ||
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22
  );
}

/** A safe point for an autosave (5.1): not in combat, not in a scene, not writing. */
export function atSafePoint(world: World, s: { inScene: boolean; writing: boolean }): boolean {
  if (s.inScene || s.writing) return false;
  const unit = unitOf(world, playerEntity(world)?.id);
  return !unit || !inCombat(world, unit);
}

/** Player text for a failed save: quota, a newer save in the slot, or "the last save is intact". */
export function saveErrorText(err: unknown): string {
  if (isQuotaError(err)) return T.saves.quota;
  if (err instanceof SaveFailed && err.code === 'newer_version') return T.saves.newer;
  return T.saves.intact;
}

/** Player text for a failed load. */
export function loadErrorText(err: unknown): string {
  if (err instanceof SaveLoadError) {
    if (err.problem === 'empty') return T.app.noSaves;
    if (err.problem === 'newer') return T.saves.newer;
  }
  return T.saves.unreadable;
}

/** A note for the message log when a load had to fall back to an older generation. */
export function loadNote(loaded: LoadedSave): string | null {
  if (loaded.cloudPending) return T.saves.cloudPending;
  if (loaded.level > 0) return T.saves.fellBack;
  return null;
}
