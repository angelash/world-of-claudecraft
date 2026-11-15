// Save slots in a key-value store (localStorage in the browser, a Map in tests). Each slot
// keeps the serialized world (core/save serializeWorld) under its own key and a small
// metadata index for the slot list. Pure: storage is injected.

import { deserializeWorld, serializeWorld } from '../../core/save';
import { calendarAt } from '../../core/time';
import type { World } from '../../core/world';
import { fmt, T } from '../../shared_ui/text';
import { formatDate, formatTime } from './format';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SLOT_IDS = ['quick', '1', '2', '3', '4', '5', '6'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

const PREFIX = 'hakoniwa.save.';
const INDEX_KEY = 'hakoniwa.saves.index';

export interface SlotMeta {
  slot: SlotId;
  tick: number;
  /** "圣历 998 年 春 第 1 日 06:00" */
  date: string;
  mapName: string;
  /** real-world save time, ISO string (client side, not simulation state) */
  savedAt: string;
  bytes: number;
}

export function slotLabel(slot: SlotId): string {
  return slot === 'quick' ? T.saves.quick : fmt(T.saves.slot, { n: slot });
}

export class SaveStore {
  constructor(private readonly store: KeyValueStore) {}

  list(): Partial<Record<SlotId, SlotMeta>> {
    try {
      const raw = this.store.getItem(INDEX_KEY);
      return raw ? (JSON.parse(raw) as Partial<Record<SlotId, SlotMeta>>) : {};
    } catch {
      return {};
    }
  }

  meta(slot: SlotId): SlotMeta | undefined {
    return this.list()[slot];
  }

  /** Write a slot. Throws the storage error (for example a quota error) to the caller. */
  save(slot: SlotId, world: World, mapName: string, savedAt: string): SlotMeta {
    const text = serializeWorld(world);
    this.store.setItem(PREFIX + slot, text);
    const cal = calendarAt(world.meta.tick);
    const meta: SlotMeta = {
      slot,
      tick: world.meta.tick,
      date: `${formatDate(cal)} ${formatTime(cal)}`,
      mapName,
      savedAt,
      bytes: text.length,
    };
    const index = this.list();
    index[slot] = meta;
    this.store.setItem(INDEX_KEY, JSON.stringify(index));
    return meta;
  }

  load(slot: SlotId): World | null {
    const text = this.store.getItem(PREFIX + slot);
    return text ? deserializeWorld(text) : null;
  }

  remove(slot: SlotId): void {
    this.store.removeItem(PREFIX + slot);
    const index = this.list();
    delete index[slot];
    this.store.setItem(INDEX_KEY, JSON.stringify(index));
  }

  has(slot: SlotId): boolean {
    return this.store.getItem(PREFIX + slot) !== null;
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

/** True when an error is the browser's storage quota error. */
export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22
  );
}
