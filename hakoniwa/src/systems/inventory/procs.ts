// Item triggers (combat_and_classes.md 13.3; catalog_equipment.md 1.5): the one `procs`
// shape for pieces, their enchants and same-forge sets. The inventory decides which
// triggers fire, in the fixed order (slots main hand to trinket; each piece's own procs in
// array order, then its enchants; then sets by id), with the chance drawn on the named
// stream `combat.proc` only for pieces that carry a matching trigger, per-piece internal
// cooldowns, and no chaining (damage or healing from a trigger fires nothing but `kill`).
// A fired trigger is an `item.proc` event with the effect resolved; combat applies it.
// Broken pieces fire nothing and do not count toward sets.

import type { SystemContext } from '../../core/system';
import { calendarAt, isNight, TICK_HZ } from '../../core/time';
import { getEntity, mapById, tagValue } from '../world';
import type { MapDef } from '../world/types';
import { activeSets, ownerSediment, type WornPiece, wornPieces } from './gear';
import { MARKS_BY_RANK, MARKS_MIN_QUALITY, MAX_MARKS } from './rules';
import {
  type EnchantDef,
  type Holding,
  type InventorySlice,
  type ItemDef,
  type ItemSetDef,
  PROC_ONS,
  type ProcDef,
  type ProcOn,
} from './types';

type ContentLike = { items: ItemDef[]; itemSets?: ItemSetDef[]; enchants?: EnchantDef[] };

// ---------------------------------------------------------------------------
// The `do` and `when` grammar

export const PROC_SCHOOLS = [
  'physical',
  'arcane',
  'fire',
  'frost',
  'holy',
  'shadow',
  'nature',
] as const;
export type ProcSchool = (typeof PROC_SCHOOLS)[number];

/** A fixed amount, or `Lv×n` (item level times n). */
export type ProcAmount = { flat: number } | { perLevel: number };

/** A parsed `do`; amounts still to be resolved against the item level. */
export type ProcEffectSpec =
  | { kind: 'aura'; aura: string; at: 'self' | 'target' }
  | { kind: 'dmg'; school: ProcSchool; amount: ProcAmount }
  | { kind: 'chain'; school: ProcSchool; amount: ProcAmount; jumps: number }
  | { kind: 'slow'; mult: number; secs: number }
  | { kind: 'dot'; school: ProcSchool; perTick: ProcAmount; secs: number }
  | { kind: 'hot'; perTick: ProcAmount; secs: number }
  | { kind: 'stack'; stats: string[]; per: number; max: number; secs: number }
  | { kind: 'cleanse' }
  | { kind: 'sed'; delta: number }
  | { kind: 'morale'; delta: number };

/** A fired effect with its amounts resolved. */
export type ProcEffect =
  | { kind: 'aura'; aura: string; at: 'self' | 'target' }
  | { kind: 'dmg'; school: ProcSchool; amount: number }
  | { kind: 'chain'; school: ProcSchool; amount: number; jumps: number }
  | { kind: 'slow'; mult: number; secs: number }
  | { kind: 'dot'; school: ProcSchool; perTick: number; secs: number }
  | { kind: 'hot'; perTick: number; secs: number }
  | { kind: 'stack'; stats: string[]; per: number; max: number; secs: number }
  | { kind: 'cleanse' }
  | { kind: 'sed'; delta: number }
  | { kind: 'morale'; delta: number };

const NUM = /^-?\d+(\.\d+)?$/;
const LEVEL = /^Lv[×x*](\d+(\.\d+)?)$/;

function num(s: string | undefined): number | null {
  return s !== undefined && NUM.test(s) ? Number(s) : null;
}

function amount(s: string | undefined): ProcAmount | null {
  if (s === undefined) return null;
  const n = num(s);
  if (n !== null) return { flat: n };
  const m = LEVEL.exec(s);
  return m ? { perLevel: Number(m[1]) } : null;
}

function school(s: string | undefined): ProcSchool | null {
  return (PROC_SCHOOLS as readonly string[]).includes(s ?? '') ? (s as ProcSchool) : null;
}

/** Parse a `do`; null when it does not follow the grammar of catalog_equipment.md 1.5. */
export function parseProcDo(text: string): ProcEffectSpec | null {
  const p = text.split(':');
  switch (p[0]) {
    case 'aura': {
      if (p.length !== 2 || !p[1]) return null;
      const [aura, at = 'target'] = p[1].split('@');
      if (!aura || (at !== 'self' && at !== 'target')) return null;
      return { kind: 'aura', aura, at };
    }
    case 'dmg': {
      const s = school(p[1]);
      const a = amount(p[2]);
      return p.length === 3 && s && a ? { kind: 'dmg', school: s, amount: a } : null;
    }
    case 'chain': {
      const s = school(p[1]);
      const a = amount(p[2]);
      const j = num(p[3]);
      return p.length === 4 && s && a && j !== null && j >= 1
        ? { kind: 'chain', school: s, amount: a, jumps: j }
        : null;
    }
    case 'slow': {
      const m = num(p[1]);
      const t = num(p[2]);
      return p.length === 3 && m !== null && t !== null ? { kind: 'slow', mult: m, secs: t } : null;
    }
    case 'dot': {
      const s = school(p[1]);
      const a = amount(p[2]);
      const t = num(p[3]);
      return p.length === 4 && s && a && t !== null
        ? { kind: 'dot', school: s, perTick: a, secs: t }
        : null;
    }
    case 'hot': {
      const a = amount(p[1]);
      const t = num(p[2]);
      return p.length === 3 && a && t !== null ? { kind: 'hot', perTick: a, secs: t } : null;
    }
    case 'stack': {
      const per = num(p[2]);
      const max = num(p[3]);
      const t = num(p[4]);
      const stats = (p[1] ?? '').split('|').filter((x) => x.length > 0);
      return p.length === 5 && stats.length > 0 && per !== null && max !== null && t !== null
        ? { kind: 'stack', stats, per, max, secs: t }
        : null;
    }
    case 'cleanse':
      return p.length === 1 ? { kind: 'cleanse' } : null;
    case 'sed':
    case 'morale': {
      const d = num((p[1] ?? '').replace(/^\+/, ''));
      return p.length === 2 && d !== null ? { kind: p[0], delta: d } : null;
    }
    default:
      return null;
  }
}

export type ProcCond =
  | { atom: 'target.family'; value: string }
  | { atom: 'zone.sed'; min: number }
  | { atom: 'night' }
  | { atom: 'region'; value: string }
  | { atom: 'solo' }
  | { atom: 'hp'; below: number }
  | { atom: 'holder'; value: string };

/** Parse a `when` (atoms joined by commas); null when an atom is unknown. */
export function parseProcWhen(text: string): ProcCond[] | null {
  const out: ProcCond[] = [];
  for (const raw of text.split(',')) {
    const c = parseAtom(raw.trim());
    if (!c) return null;
    out.push(c);
  }
  return out;
}

const ATOMS: readonly [RegExp, (m: RegExpExecArray) => ProcCond][] = [
  [/^night$/, () => ({ atom: 'night' })],
  [/^solo$/, () => ({ atom: 'solo' })],
  [/^target\.family=([a-z_]+)$/, (m) => ({ atom: 'target.family', value: m[1] as string })],
  [/^zone\.sed>=(\d+)$/, (m) => ({ atom: 'zone.sed', min: Number(m[1]) })],
  [/^region=([a-z0-9_]+)$/, (m) => ({ atom: 'region', value: m[1] as string })],
  [/^hp<(\d+(\.\d+)?)$/, (m) => ({ atom: 'hp', below: Number(m[1]) })],
  [/^holder=([a-z0-9_]+)$/, (m) => ({ atom: 'holder', value: m[1] as string })],
];

function parseAtom(a: string): ProcCond | null {
  for (const [re, make] of ATOMS) {
    const m = re.exec(a);
    if (m) return make(m);
  }
  return null;
}

/** Problems with one trigger definition (content validation). */
export function procProblems(p: ProcDef): string[] {
  if (typeof p !== 'object' || p === null) return ['not a trigger'];
  const out: string[] = [];
  if (!PROC_ONS.includes(p.on)) out.push(`unknown on '${String(p.on)}'`);
  if (typeof p.chance !== 'number' || !(p.chance > 0 && p.chance <= 1)) {
    out.push('chance out of (0, 1]');
  }
  if (p.icd !== undefined && !(typeof p.icd === 'number' && p.icd >= 0)) out.push('bad icd');
  if (typeof p.do !== 'string' || !parseProcDo(p.do)) out.push(`bad do '${String(p.do)}'`);
  if (p.when !== undefined && (typeof p.when !== 'string' || !parseProcWhen(p.when))) {
    out.push(`bad when '${String(p.when)}'`);
  }
  return out;
}

const resolve = (a: ProcAmount, level: number): number =>
  'flat' in a ? a.flat : a.perLevel * Math.max(1, level);

/** Resolve the amounts of a parsed effect at an item level. */
export function resolveEffect(spec: ProcEffectSpec, level: number): ProcEffect {
  switch (spec.kind) {
    case 'dmg':
      return { kind: 'dmg', school: spec.school, amount: resolve(spec.amount, level) };
    case 'chain':
      return { ...spec, amount: resolve(spec.amount, level) };
    case 'dot':
      return { ...spec, perTick: resolve(spec.perTick, level) };
    case 'hot':
      return { kind: 'hot', perTick: resolve(spec.perTick, level), secs: spec.secs };
    default:
      return spec;
  }
}

// ---------------------------------------------------------------------------
// Where triggers come from

export interface ProcSource {
  /** per-piece key of the internal cooldowns */
  key: string;
  kind: 'item' | 'enchant' | 'set';
  /** the item, enchant or set id */
  sourceId: string;
  itemId?: string;
  instanceId?: string;
  /** the item level `Lv×n` reads */
  level: number;
  /** the holder `holder=` reads */
  holder?: string;
  procs: ProcDef[];
}

/** Every trigger source of an owner's working gear, in resolution order. */
export function procSources(pieces: WornPiece[], content: ContentLike): ProcSource[] {
  const out: ProcSource[] = [];
  for (const p of pieces) {
    if (!p.working) continue;
    const key = p.inst?.instanceId ?? p.slot;
    const level = p.def.level ?? 1;
    const base = {
      itemId: p.def.id,
      instanceId: p.inst?.instanceId,
      level,
      holder: p.inst?.holder,
    };
    if (p.def.procs?.length) {
      out.push({ ...base, key, kind: 'item', sourceId: p.def.id, procs: p.def.procs });
    }
    for (const a of p.inst?.affixes ?? []) {
      const e = content.enchants?.find((x) => x.id === a);
      if (e?.procs?.length) {
        out.push({ ...base, key: `${key}/${a}`, kind: 'enchant', sourceId: a, procs: e.procs });
      }
    }
  }
  for (const a of activeSets(pieces, content)) {
    const procs = a.bonuses.flatMap((b) => b.procs ?? []);
    if (procs.length === 0) continue;
    const level = Math.max(
      1,
      ...pieces.filter((p) => p.working && p.def.set === a.set.id).map((p) => p.def.level ?? 1),
    );
    out.push({ key: `set:${a.set.id}`, kind: 'set', sourceId: a.set.id, level, procs });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Firing

/** What the caller knows about the moment; an atom it cannot answer does not hold. */
export interface ProcEnv {
  targetFamily?: string;
  zoneSed?: number;
  night?: boolean;
  region?: string;
  /** only one hostile target */
  solo?: boolean;
  /** the holder's health fraction */
  hpFrac?: number;
}

function holds(c: ProcCond, env: ProcEnv, src: ProcSource): boolean {
  switch (c.atom) {
    case 'target.family':
      return env.targetFamily === c.value;
    case 'zone.sed':
      return (env.zoneSed ?? -1) >= c.min;
    case 'night':
      return env.night === true;
    case 'region':
      return env.region === c.value;
    case 'solo':
      return env.solo === true;
    case 'hp':
      return env.hpFrac !== undefined && env.hpFrac < c.below;
    case 'holder':
      return src.holder === c.value;
  }
}

export interface FiredProc {
  source: ProcSource;
  index: number;
  effect: ProcEffect;
}

function timers(slice: InventorySlice, ownerId: string): Record<string, number> {
  slice.timers ??= {};
  const t = slice.timers[ownerId] ?? {};
  slice.timers[ownerId] = t;
  return t;
}

/** Drop an owner's expired timers (keeps the save small). */
export function pruneTimers(slice: InventorySlice, ownerId: string, tick: number): void {
  const t = slice.timers?.[ownerId];
  if (!t || !slice.timers) return;
  for (const [k, v] of Object.entries(t)) if (v <= tick) delete t[k];
  if (Object.keys(t).length === 0) delete slice.timers[ownerId];
  if (Object.keys(slice.timers).length === 0) delete slice.timers;
}

/** Cheap test before the full walk: a worn piece with triggers, a set, or an enchant. */
function mayTrigger(h: Holding, content: ContentLike): boolean {
  for (const id of Object.values(h.equipped)) {
    const def = id ? content.items.find((i) => i.id === id) : undefined;
    if (def && (def.procs?.length || def.set)) return true;
  }
  for (const iid of Object.values(h.worn ?? {})) {
    if (iid && (h.instances?.[iid]?.affixes?.length ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Check one trigger point for an owner's gear and fire what passes (chance on
 * `combat.proc`, internal cooldowns, conditions); every fired trigger is emitted as
 * `item.proc`. Returns the fired triggers in resolution order.
 */
export function fireProcs(
  ctx: SystemContext,
  ownerId: string,
  on: ProcOn,
  opts: { targetId?: string; env?: ProcEnv | (() => ProcEnv) } = {},
): FiredProc[] {
  const h = ctx.world.slices.inventory.owners[ownerId];
  if (!h || !mayTrigger(h, ctx.content)) return [];
  const pieces = wornPieces(ctx.world, ctx.content, ownerId);
  const sources = procSources(pieces, ctx.content);
  if (!sources.some((s) => s.procs.some((p) => p.on === on))) return [];
  const slice = ctx.world.slices.inventory;
  let env: ProcEnv | undefined;
  const envOf = (): ProcEnv => {
    env ??= typeof opts.env === 'function' ? opts.env() : (opts.env ?? {});
    return env;
  };
  const fired: FiredProc[] = [];
  for (const src of sources) {
    src.procs.forEach((p, index) => {
      if (p.on !== on) return;
      const key = `proc:${src.key}#${index}`;
      const ready = slice.timers?.[ownerId]?.[key] ?? 0;
      if (ready > ctx.tick) return;
      const conds = p.when ? parseProcWhen(p.when) : [];
      if (!conds?.every((c) => holds(c, envOf(), src))) return;
      const spec = parseProcDo(p.do);
      if (!spec) return;
      if (ctx.rng('combat.proc').next() >= p.chance) return;
      if ((p.icd ?? 0) > 0) {
        pruneTimers(slice, ownerId, ctx.tick);
        timers(slice, ownerId)[key] = ctx.tick + Math.round((p.icd ?? 0) * TICK_HZ);
      }
      const effect = resolveEffect(spec, src.level);
      fired.push({ source: src, index, effect });
      ctx.emit('item.proc', {
        ownerId,
        targetId: opts.targetId,
        on,
        source: src.kind,
        sourceId: src.sourceId,
        itemId: src.itemId,
        instanceId: src.instanceId,
        effect,
      });
    });
  }
  return fired;
}

/** What the inventory can tell about the moment for an owner (target family by tag). */
export function envFor(ctx: SystemContext, ownerId: string, targetId?: string): ProcEnv {
  const w = ctx.world as unknown as Parameters<typeof getEntity>[0];
  const me = getEntity(w, ownerId);
  const target = targetId ? getEntity(w, targetId) : undefined;
  const content = ctx.content as unknown as { maps?: MapDef[] };
  const map = me && content.maps ? mapById(content as { maps: MapDef[] }, me.mapId) : undefined;
  return {
    targetFamily: target ? tagValue(target, 'family') : undefined,
    zoneSed: ownerSediment(ctx.world, content, ownerId),
    night: isNight(calendarAt(ctx.tick)),
    region: map?.region,
  };
}

// ---------------------------------------------------------------------------
// Combat events to trigger points

/** An aura id under `abilityId` is a periodic tick, not a swing or a cast. */
function periodic(ctx: SystemContext, abilityId: string | undefined): boolean {
  if (!abilityId) return false;
  const auras = (ctx.content as unknown as { auras?: { id: string }[] }).auras ?? [];
  return auras.some((a) => a.id === abilityId);
}

interface DamageLike {
  sourceId: string;
  targetId: string;
  abilityId?: string;
  school: string;
  outcome: string;
  weaponClass?: string;
  fromProc?: boolean;
}

/** hit, spell, crit for the dealer; struck and block for the one hit (13.3). */
export function onDamage(ctx: SystemContext, d: DamageLike): void {
  if (d.fromProc) return;
  const landed = d.outcome === 'hit' || d.outcome === 'crit';
  const weapon = d.weaponClass !== undefined && d.weaponClass !== 'none';
  const env = () => envFor(ctx, d.sourceId, d.targetId);
  if (landed && !periodic(ctx, d.abilityId)) {
    const physical = d.school === 'physical';
    if (weapon || (physical && d.weaponClass === undefined)) {
      fireProcs(ctx, d.sourceId, 'hit', { targetId: d.targetId, env });
    } else if (!physical) fireProcs(ctx, d.sourceId, 'spell', { targetId: d.targetId, env });
  }
  if (d.outcome === 'crit') fireProcs(ctx, d.sourceId, 'crit', { targetId: d.targetId, env });
  const struck = weapon && (landed || d.outcome === 'block');
  const back = () => envFor(ctx, d.targetId, d.sourceId);
  if (struck) fireProcs(ctx, d.targetId, 'struck', { targetId: d.sourceId, env: back });
  if (d.outcome === 'block')
    fireProcs(ctx, d.targetId, 'block', { targetId: d.sourceId, env: back });
}

export function onHeal(
  ctx: SystemContext,
  d: { sourceId: string; targetId: string; crit: boolean; fromProc?: boolean },
): void {
  if (d.fromProc) return;
  const env = () => envFor(ctx, d.sourceId, d.targetId);
  fireProcs(ctx, d.sourceId, 'heal', { targetId: d.targetId, env });
  if (d.crit) fireProcs(ctx, d.sourceId, 'crit', { targetId: d.targetId, env });
}

/** `kill` fires even for a kill made by a trigger; the kill also marks fine pieces. */
export function onKill(
  ctx: SystemContext,
  d: { killerId?: string; victimId: string; rank: string; family?: string },
): void {
  if (!d.killerId) return;
  fireProcs(ctx, d.killerId, 'kill', {
    targetId: d.victimId,
    env: () => envFor(ctx, d.killerId as string, d.victimId),
  });
  const points = MARKS_BY_RANK[d.rank] ?? 0;
  if (points > 0) addMarks(ctx, d.killerId, points, d.family ? `family:${d.family}` : 'other');
}

/**
 * Add wear marks to every worn fine-or-better piece of an owner (catalog_equipment.md 2.8),
 * up to 100, keeping the origin tally that opening an edge reads.
 */
export function addMarks(ctx: SystemContext, ownerId: string, points: number, from: string): void {
  if (points <= 0) return;
  for (const p of wornPieces(ctx.world, ctx.content, ownerId)) {
    if (!p.inst || p.def.quality < MARKS_MIN_QUALITY) continue;
    const before = p.inst.marks ?? 0;
    const add = Math.min(points, MAX_MARKS - before);
    if (add <= 0) continue;
    p.inst.marks = before + add;
    p.inst.markFrom ??= {};
    p.inst.markFrom[from] = (p.inst.markFrom[from] ?? 0) + add;
  }
}
