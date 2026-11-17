// Save slots for the client over the save container (release_engineering.md 5): the slot
// list the windows show (cached, so painting never waits on storage) with the metadata of
// ux_and_onboarding.md 3.5 (act and place, game date, real play time, level, AI mode, the
// difficulty and the thumbnail kept beside the slot by ./slot_extras.ts), the slots this build
// cannot read (damaged, newer), saving the running world through a RunSaver, loading with the
// previous-generation fallback, deleting, the autosave ring, the ironman run's one slot (5.9:
// autosaves and exit only), and the one-time move of the first round's key-value saves into
// the container. Pure: the backend, the wall clock and the run id source are injected (main.ts
// wires IndexedDB); no DOM, no real clock.

import type { ContentMap } from '../../core/contracts';
import {
  AUTO_SLOTS,
  buildVersions,
  contentVersionOf,
  deserializeWorld,
  IRONMAN_SLOT,
  isoTime,
  type LoadedSave,
  type LogSource,
  loadSlot,
  MANUAL_SLOTS,
  newerFields,
  RunSaver,
  type SaveBackend,
  type SaveErrorCode,
  SaveLoadError,
  type SaveTrigger,
  type SaveVersions,
  type SlotId,
  type SlotRecord,
  type WorldMigrator,
} from '../../core/save';
import { calendarAt } from '../../core/time';
import type { World } from '../../core/world';
import { t } from '../../shared_ui/i18n';
import { inCombat, unitOf } from '../../systems/combat/units';
import { playerEntity } from '../../systems/world';
import { formatDate, formatTime, levelFromTags } from './format';
import { type Difficulty, isDifficulty, SlotExtrasStore } from './slot_extras';

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
  /** story act at save time ('' when the world had none) */
  act: string;
  runId: string;
  /** the player's level at save time, when the save recorded it */
  level: number | null;
  /** real play time of the run up to this save, in seconds */
  playSeconds: number | null;
  /** AI preset the run played with ('off' is the built-in AI), never an address */
  aiPreset: string | null;
  /** an ironman run's save (5.9) */
  ironman: boolean;
  /** difficulty at save time, from the slot's client extras (null when not kept here) */
  difficulty: Difficulty | null;
  /** thumbnail data URL from the slot's client extras */
  thumb: string | null;
}

/** Why a slot holds no save this build can load (3.5 error states). */
export type SlotProblem = 'corrupt' | 'newer';

export function slotLabel(slot: SlotId): string {
  if (slot === 'quick') return t('ui.win.saves.quick');
  if (slot === 'ironman') return t('ui.win.saves.ironman');
  const auto = /^auto_(\d+)$/.exec(slot);
  if (auto) return t('ui.win.saves.auto', { n: Number(auto[1]) });
  return t('ui.win.saves.slot', { n: Number(slot.replace('manual_', '')) });
}

export function slotMeta(rec: SlotRecord): SlotMeta | null {
  const h = rec.header ?? rec.prev;
  if (!h) return null;
  const cal = calendarAt(h.tick);
  // Save flags (ironman, recovered), not world flags.
  const { recovered } = h.flags;
  const s = h.summary;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
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
    act: typeof s.act === 'string' ? s.act : '',
    runId: h.runId,
    level: num(s.level),
    playSeconds: num(s.playSeconds),
    aiPreset: typeof s.aiPreset === 'string' && s.aiPreset ? s.aiPreset : null,
    ironman: h.flags.ironman || rec.slot === IRONMAN_SLOT,
    difficulty: null,
    thumb: null,
  };
}

/** What keeps a slot from loading in this build, or null. */
export function slotProblem(rec: SlotRecord, gameVersion?: string): SlotProblem | null {
  if (rec.problem === 'newer_container') return 'newer';
  const h = rec.header ?? rec.prev;
  if (!h) return rec.problem && rec.problem !== 'missing' ? 'corrupt' : null;
  return newerFields(h, buildVersions(gameVersion)).length > 0 ? 'newer' : null;
}

/** The player's level from the `lvl:<n>` tag of the player entity (conventions 5). */
export function playerLevel(world: World): number | undefined {
  // A kernel-only world (tests, tools) has no world slice and so no player.
  const p = world.slices.world ? playerEntity(world) : undefined;
  const n = p ? levelFromTags(p.tags) : null;
  return n === null ? undefined : n;
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
  /**
   * The snapshot migrator a load runs through (a fixed one, for tests). Without it and
   * without `migrator`, the kernel's default: the rename table on the flags only.
   */
  migrate?: WorldMigrator;
  /**
   * The migrator built lazily on the first load (main.ts: the rename table plus every game
   * system's `idFields`, so content id renames reach the slices; the systems load deferred).
   */
  migrator?: () => Promise<WorldMigrator>;
  /** where slot thumbnails and difficulties are kept (./slot_extras.ts); none: not kept */
  extras?: KeyValueStore | null;
  /** the AI preset of the running world when it uses a model (the settings' preset name) */
  aiPreset?: () => string;
  /** manual slots this build offers to fill (ux_and_onboarding.md 3.5: 20, the web demo 5) */
  manualLimit?: number;
}

/** Options of a new run (the new game page, ux_and_onboarding.md 3.4). */
export interface RunOptions {
  /** an ironman run: one slot, autosaves and exit only (5.9) */
  ironman?: boolean;
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
  private broken: Partial<Record<SlotId, SlotProblem>> = {};
  private records = new Map<SlotId, SlotRecord>();
  private saver: RunSaver | null = null;
  private source: SaveSource | null = null;
  private readonly extras: SlotExtrasStore;
  /** play time of the attached run before this session, and when this session began */
  private play = { base: 0, since: 0 };

  constructor(private readonly opts: ClientSavesOptions) {
    this.extras = new SlotExtrasStore(opts.extras ?? null);
  }

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
    let records: SlotRecord[];
    try {
      records = await this.opts.backend.list();
    } catch (err) {
      // Keep the last good list and every slot's extras: a failed listing says nothing about
      // which saves exist, so nothing may be pruned on it.
      console.warn('[saves] listing failed', err);
      return;
    }
    const next: Partial<Record<SlotId, SlotMeta>> = {};
    const broken: Partial<Record<SlotId, SlotProblem>> = {};
    const headers = new Map<SlotId, { runId: string; savedAt: string }>();
    this.records = new Map();
    for (const r of records) {
      const problem = slotProblem(r, this.opts.versions.gameVersion);
      if (problem) broken[r.slot] = problem;
      const m = slotMeta(r);
      if (!m) continue;
      const ex = this.extras.get(r.slot, m);
      if (ex) {
        m.difficulty = ex.difficulty ?? null;
        m.thumb = ex.thumb ?? null;
      }
      headers.set(r.slot, { runId: m.runId, savedAt: m.savedAt });
      next[r.slot] = m;
      this.records.set(r.slot, r);
    }
    this.cache = next;
    this.broken = broken;
    this.extras.prune(headers);
  }

  /** Slots this build cannot load: damaged beyond the fallback, or from a newer version. */
  problems(): Partial<Record<SlotId, SlotProblem>> {
    return this.broken;
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

  /**
   * Start saving a running world: a new run (with the new game page's run options), or the
   * chain of the save it was loaded from (whose run flags carry over).
   */
  attach(source: SaveSource, from?: LoadedSave | null, run: RunOptions = {}): void {
    this.source = source;
    this.saver = new RunSaver({
      backend: this.opts.backend,
      runId: from?.header.runId ?? this.opts.newRunId(),
      versions: { ...this.opts.versions, contentVersion: this.contentVersion(source) },
      from: from?.header ?? null,
      fromMode: from?.aiMode,
      flags: run.ironman ? { ironman: true } : undefined,
    });
    const base = from?.header.summary.playSeconds;
    this.play = {
      base: typeof base === 'number' && Number.isFinite(base) && base > 0 ? base : 0,
      since: this.opts.now(),
    };
  }

  detach(): void {
    this.source = null;
    this.saver = null;
  }

  /** Manual slots this build offers to fill (3.5). */
  get manualLimit(): number {
    return this.opts.manualLimit ?? MANUAL_SLOTS.length;
  }

  /** The attached run is an ironman run (5.9): one slot, autosaves and exit only. */
  get ironman(): boolean {
    return this.saver?.ironman ?? false;
  }

  /** Real seconds played in the attached run, this session included. */
  playSeconds(): number {
    return Math.max(0, Math.floor(this.play.base + (this.opts.now() - this.play.since) / 1000));
  }

  /** A save is being written (a safe point excludes it, 5.1). */
  get writing(): boolean {
    return this.saver?.writing ?? false;
  }

  get runId(): string | null {
    return this.saver?.runId ?? null;
  }

  /**
   * Save the attached world. Throws SaveFailed (or the storage error) on failure; an ironman
   * run refuses any slot but its own and any trigger but autosave and exit (`bad_request`).
   */
  async save(slot: SlotId, info: SaveInfo, trigger: SaveTrigger = 'manual'): Promise<SlotMeta> {
    const saver = this.saver;
    const source = this.source;
    if (!saver || !source) throw new Error('no running world to save');
    const world = source.world;
    const difficulty = world.meta.flags.difficulty;
    const res = await saver.save(source, {
      slot,
      savedAt: isoTime(this.opts.now()),
      label: info.label,
      trigger,
      summary: {
        act: String(world.meta.flags.act ?? ''),
        map: info.mapId,
        mapName: info.mapName,
        level: playerLevel(world),
        playSeconds: this.playSeconds(),
        aiPreset: world.ai.mode === 'off' ? 'off' : (this.opts.aiPreset?.() ?? 'custom'),
      },
    });
    if (!res.ok) throw new SaveFailed(res.code, res.reason);
    this.extras.begin(slot, {
      runId: res.header.runId,
      savedAt: res.header.savedAt,
      difficulty: isDifficulty(difficulty) ? difficulty : undefined,
    });
    await this.refresh();
    return this.cache[slot] ?? (slotMeta({ slot, header: res.header, prev: null }) as SlotMeta);
  }

  /** Keep a thumbnail for the save `meta` describes (dropped when the slot moved on). */
  setThumb(meta: Pick<SlotMeta, 'slot' | 'runId' | 'savedAt'>, thumb: string): boolean {
    if (!this.extras.setThumb(meta.slot, meta, thumb)) return false;
    const cur = this.cache[meta.slot];
    if (cur && cur.runId === meta.runId && cur.savedAt === meta.savedAt)
      this.cache = { ...this.cache, [meta.slot]: { ...cur, thumb } };
    return true;
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

  /** An autosave: the ring, or the ironman run's own slot. */
  autosave(info: SaveInfo): Promise<SlotMeta> {
    return this.ironman
      ? this.save(IRONMAN_SLOT, info, 'auto')
      : this.save(this.nextAutoSlot(), info, 'auto');
  }

  /** The save on leaving a run (5.1 exit trigger): only an ironman run writes one here. */
  async exitSave(info: SaveInfo): Promise<SlotMeta | null> {
    if (!this.ironman || !this.saver) return null;
    return this.save(IRONMAN_SLOT, info, 'exit');
  }

  /**
   * Read a slot (falling back to its previous generation when the current one is broken).
   * Saves still being written finish first, so a load right after a save reads it.
   */
  async load(slot: SlotId): Promise<LoadedSave> {
    await this.saver?.idle();
    const migrate = this.opts.migrate ?? (await this.opts.migrator?.());
    return loadSlot(this.opts.backend, slot, migrate);
  }

  async remove(slot: SlotId): Promise<void> {
    await this.opts.backend.delete({ slotId: slot });
    this.extras.remove(slot);
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

/** Why the player cannot save right now (ux_and_onboarding.md 6.2.13), or null. */
export type SaveBlock = 'prologue' | 'combat' | 'scene' | 'dialogue' | 'writing';

/**
 * The prologue cannot be saved at all; in combat, during a scene or a conversation, and
 * while a save is still being written the save buttons wait (6.2.13).
 */
export function saveBlock(
  world: World,
  s: { inScene: boolean; talking: boolean; writing: boolean },
): SaveBlock | null {
  if (world.meta.flags.act === 'prologue') return 'prologue';
  if (s.inScene) return 'scene';
  if (s.talking) return 'dialogue';
  const unit = world.slices.world ? unitOf(world, playerEntity(world)?.id) : undefined;
  if (unit && inCombat(world, unit)) return 'combat';
  if (s.writing) return 'writing';
  return null;
}

/** The player sentence for a save block. */
export function saveBlockText(b: SaveBlock): string {
  return t(`ui.win.saves.block.${b}`);
}

/** Player text for a failed save: quota, a newer save in the slot, or "the last save is intact". */
export function saveErrorText(err: unknown): string {
  if (isQuotaError(err)) return t('ui.win.saves.quota');
  if (err instanceof SaveFailed && err.code === 'newer_version') return t('ui.win.saves.newer');
  return t('ui.win.saves.intact');
}

/** Player text for a failed load. */
export function loadErrorText(err: unknown): string {
  if (err instanceof SaveLoadError) {
    if (err.problem === 'empty') return t('ui.scr.title.no_saves');
    if (err.problem === 'newer') return t('ui.win.saves.newer');
  }
  return t('ui.win.saves.unreadable');
}

/** A note for the message log when a load had to fall back to an older generation. */
export function loadNote(loaded: LoadedSave): string | null {
  if (loaded.cloudPending) return t('ui.win.saves.cloud_pending');
  if (loaded.level > 0) return t('ui.win.saves.fell_back');
  return null;
}
