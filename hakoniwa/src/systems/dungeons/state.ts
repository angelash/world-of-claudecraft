// The state quantities of the dungeons and nests (catalog_dungeons_bosses.md 1.1 to 1.3;
// catalog_bestiary.md 2.8) and their mirror flags `dg.<id>.<field>` (world_state_registry.md
// 8.6). Instances and nests are made from their records when first touched. Activity: a
// paged creature dying inside adds, the core boss's death takes away and clears the
// dungeon, each week a nurtured dungeon goes unswept adds; at the active threshold the
// active period starts (and the overflow clock, when the record has one); at the top, or
// when the clock runs out, the dungeon overflows and falls back. Mirrors are written only
// when they change, and only for dungeons that exist (a dungeon a nest has still to turn
// into has none yet).

import type { SystemContext } from '../../core/system';
import { DAYS_PER_SEASON, DAYS_PER_WEEK, TICKS_PER_GAME_DAY } from '../../core/time';
import { dungeonConfig, dungeonDef, formOf, nestDef, startPressure } from './layout';
import { dungeonsSlice } from './slice';
import type {
  DungeonConfig,
  DungeonDef,
  DungeonPhase,
  DungeonState,
  NestDef,
  NestState,
} from './types';

/** A dungeon or a nest, with its record and live state. */
export type Target =
  | { kind: 'dungeon'; id: string; def: DungeonDef; state: DungeonState }
  | { kind: 'nest'; id: string; def: NestDef; state: NestState };

export function newInstance(cfg: DungeonConfig, def: DungeonDef): DungeonState {
  return {
    def: def.id,
    pressure: startPressure(cfg, def),
    activity: Math.max(0, Math.min(cfg.activity.max, def.activity ?? 0)),
    overflowAt: -1,
    overflowed: -1,
    choice: 'untouched',
    choiceTick: -1,
    grown: 0,
    patrol: -1,
    idle: 0,
    pending: null,
    collapsed: false,
    purified: false,
    cleared: false,
    depth: -1,
    entries: 0,
    swallowed: 0,
  };
}

export function newNest(def: NestDef): NestState {
  return {
    live: false,
    stage: def.stage ?? 1,
    since: -1,
    cleared: false,
    clearedTick: -1,
    choice: 'untouched',
    choiceTick: -1,
    pending: null,
    collapsed: false,
    collapsedTick: -1,
    purified: false,
    matured: false,
  };
}

/** The live instance of a dungeon record, made on first use; undefined for no record. */
export function instanceOf(ctx: SystemContext, id: string): DungeonState | undefined {
  const s = dungeonsSlice(ctx.world);
  const have = s.instances[id];
  if (have) return have;
  const cfg = dungeonConfig(ctx.content);
  const def = dungeonDef(ctx.content, id);
  if (!cfg || !def) return undefined;
  const made = newInstance(cfg, def);
  s.instances[id] = made;
  return made;
}

/** The live state of a nest record, made on first use; undefined for no record. */
export function nestOf(ctx: SystemContext, id: string): NestState | undefined {
  const s = dungeonsSlice(ctx.world);
  const have = s.nests[id];
  if (have) return have;
  const def = nestDef(ctx.content, id);
  if (!def) return undefined;
  const made = newNest(def);
  s.nests[id] = made;
  return made;
}

/** A dungeon or nest by id, with its state (made on first use). */
export function targetOf(ctx: SystemContext, id: string): Target | undefined {
  const d = dungeonDef(ctx.content, id);
  if (d) {
    const state = instanceOf(ctx, id);
    return state ? { kind: 'dungeon', id, def: d, state } : undefined;
  }
  const n = nestDef(ctx.content, id);
  if (n) {
    const state = nestOf(ctx, id);
    return state ? { kind: 'nest', id, def: n, state } : undefined;
  }
  return undefined;
}

/**
 * Whether a dungeon exists to be walked in: formed (every nest that turns into it has
 * matured), not collapsed and not purified into a clean site.
 */
export function standing(
  world: { slices: object },
  content: Pick<SystemContext['content'], 'nests'>,
  def: DungeonDef,
): boolean {
  const s = (world.slices as { dungeons?: { instances: Record<string, DungeonState> } }).dungeons;
  const st = s?.instances[def.id];
  if (st?.collapsed || st?.purified) return false;
  return formed(world, content, def.id);
}

/** Whether every nest that turns into the dungeon has matured (no such nest: formed). */
export function formed(
  world: { slices: object },
  content: Pick<SystemContext['content'], 'nests'>,
  dungeonId: string,
): boolean {
  const s = (world.slices as { dungeons?: { nests: Record<string, NestState> } }).dungeons;
  return (content.nests ?? [])
    .filter((n) => n.becomes === dungeonId)
    .every((n) => s?.nests[n.id]?.matured === true);
}

const DAY = TICKS_PER_GAME_DAY;

/** A dungeon's phase now (registry 8.6). */
export function dungeonPhase(cfg: DungeonConfig, st: DungeonState, now: number): DungeonPhase {
  if (st.purified) return 'purified';
  if (st.overflowed >= 0 && now < st.overflowed + DAY) return 'overflow';
  return formOf(cfg, st.pressure);
}

/** A nest's phase now: a lair, a shallow dungeon once matured, or a clean site. */
export function nestPhase(st: NestState): DungeonPhase {
  if (st.purified) return 'purified';
  return st.matured ? 'shallow' : 'lair';
}

/** Whether a dungeon is in its active period. */
export function isActive(cfg: DungeonConfig, st: DungeonState): boolean {
  return !st.collapsed && !st.purified && st.activity >= cfg.activity.active;
}

function mirror(ctx: SystemContext, key: string, value: string | number | boolean): void {
  if (ctx.flag(key) !== value) ctx.setFlag(key, value);
}

/** Write a dungeon's mirror flags (only the ones that changed; none before it forms). */
export function mirrorDungeon(ctx: SystemContext, id: string, st: DungeonState): void {
  const cfg = dungeonConfig(ctx.content);
  if (!cfg || !formed(ctx.world, ctx.content, id)) return;
  const base = `dg.${id}`;
  mirror(ctx, `${base}.phase`, dungeonPhase(cfg, st, ctx.tick));
  mirror(ctx, `${base}.pressure`, Math.round(st.pressure));
  mirror(ctx, `${base}.active`, isActive(cfg, st));
  mirror(ctx, `${base}.choice`, st.choice);
  if (st.cleared) mirror(ctx, `${base}.cleared`, true);
  if (st.depth >= 0) mirror(ctx, `${base}.depth`, st.depth);
  if (st.collapsed) mirror(ctx, `${base}.collapsed`, true);
}

/** Write a live nest's mirror flags (only the ones that changed). */
export function mirrorNest(ctx: SystemContext, id: string, st: NestState): void {
  if (!st.live) return;
  const base = `dg.${id}`;
  mirror(ctx, `${base}.stage`, st.stage);
  mirror(ctx, `${base}.phase`, nestPhase(st));
  mirror(ctx, `${base}.choice`, st.choice);
  if (ctx.flag(`dg.${id}.cleared`) !== st.cleared) ctx.setFlag(`dg.${id}.cleared`, st.cleared);
  if (st.collapsed) mirror(ctx, `${base}.collapsed`, true);
}

/** Write the mirrors of a target. */
export function mirrorTarget(ctx: SystemContext, t: Target): void {
  if (t.kind === 'dungeon') mirrorDungeon(ctx, t.id, t.state);
  else mirrorNest(ctx, t.id, t.state);
}

/** Say the active period ended (a collapse, a clean site), when it was on. */
export function endActive(ctx: SystemContext, id: string, wasActive: boolean): void {
  if (wasActive) ctx.emit('dungeon.active', { dungeonId: id, active: false });
}

/** The dungeon overflows: the surge goes out, the activity falls back, the clock stops. */
export function overflow(ctx: SystemContext, def: DungeonDef, st: DungeonState): void {
  const cfg = dungeonConfig(ctx.content);
  if (!cfg) return;
  st.activity = cfg.activity.afterOverflow;
  st.overflowAt = -1;
  st.overflowed = ctx.tick;
  ctx.emit(
    'dungeon.overflow',
    def.overflowTo ? { dungeonId: def.id, toMap: def.overflowTo } : { dungeonId: def.id },
  );
  ctx.emit('dungeon.active', { dungeonId: def.id, active: isActive(cfg, st) });
  mirrorDungeon(ctx, def.id, st);
}

/**
 * Change a dungeon's activity by `delta` (clamped to 0..max). Crossing into the active
 * period starts the overflow clock; leaving it stops the clock; reaching the top
 * overflows at once. A collapsed or purified dungeon has no activity.
 */
export function addActivity(
  ctx: SystemContext,
  def: DungeonDef,
  st: DungeonState,
  delta: number,
): void {
  const cfg = dungeonConfig(ctx.content);
  if (!cfg || st.collapsed || st.purified || delta === 0) return;
  const was = isActive(cfg, st);
  st.activity = Math.max(0, Math.min(cfg.activity.max, st.activity + delta));
  const now = isActive(cfg, st);
  if (!was && now && def.overflowDays !== undefined)
    st.overflowAt = ctx.tick + def.overflowDays * DAY;
  if (!now) st.overflowAt = -1;
  if (was !== now) ctx.emit('dungeon.active', { dungeonId: def.id, active: now });
  if (st.activity >= cfg.activity.max) overflow(ctx, def, st);
  else mirrorDungeon(ctx, def.id, st);
}

/**
 * The core boss died (or a script says the dungeon is cleared): activity falls, the clock
 * stops, and it counts as a clearing sweep.
 */
export function clearDungeon(
  ctx: SystemContext,
  def: DungeonDef,
  st: DungeonState,
  credit: { victimId?: string; killerId?: string } = {},
): void {
  const cfg = dungeonConfig(ctx.content);
  if (!cfg || st.collapsed || st.purified) return;
  st.cleared = true;
  st.overflowAt = -1;
  sweep(ctx, st);
  ctx.emit('dungeon.cleared', { id: def.id, kind: 'dungeon', ...credit });
  addActivity(ctx, def, st, cfg.activity.coreKill);
  mirrorDungeon(ctx, def.id, st);
}

/** The nest's lord or head died (or a script cleared it): the growth window starts over. */
export function clearNest(
  ctx: SystemContext,
  def: NestDef,
  st: NestState,
  credit: { victimId?: string; killerId?: string } = {},
): void {
  if (!st.live || st.collapsed || st.purified || st.matured) return;
  st.cleared = true;
  st.clearedTick = ctx.tick;
  st.since = ctx.tick;
  ctx.emit('dungeon.cleared', { id: def.id, kind: 'nest', ...credit });
  mirrorNest(ctx, def.id, st);
}

/** A clearing sweep went through (a garrison, a guild branch): the idle weeks start over. */
export function sweep(ctx: SystemContext, st: DungeonState): void {
  st.patrol = ctx.tick;
  st.idle = 0;
}

/**
 * Nurture over time (1.1, 1.2): the core grows by a share each season, and each whole week
 * without a clearing sweep adds activity.
 */
export function growNurtured(ctx: SystemContext, def: DungeonDef, st: DungeonState): void {
  const cfg = dungeonConfig(ctx.content);
  if (!cfg || st.choice !== 'nurture' || st.pending || st.choiceTick < 0) return;
  const seasons = Math.floor((ctx.tick - st.choiceTick) / (DAYS_PER_SEASON * DAY));
  while (st.grown < seasons) {
    st.pressure = Math.round(st.pressure * (1 + cfg.nurtureGrowth));
    st.grown++;
  }
  const from = Math.max(st.choiceTick, st.patrol);
  const weeks = Math.floor((ctx.tick - from) / (DAYS_PER_WEEK * DAY));
  while (st.idle < weeks && !st.collapsed && !st.purified) {
    st.idle++;
    addActivity(ctx, def, st, cfg.activity.idleNurture);
  }
}
