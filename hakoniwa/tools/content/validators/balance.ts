// V6 numeric bands (release_engineering.md 7.4): levels inside the act's level band
// (D-069), tiers on the unified ladder, prices on the price formula, quest experience
// against the per-act budget. Level and tier block; price and experience warn.
// Sources: level bands and the experience budget progression_and_pacing.md 2.2, the boss
// allowance 18.2 (story bosses up to five over the band); the ladder content_bible.md 3.1
// (content level per tier, material unit prices); the price formula content_bible.md 6.4.
//
// A row that declares its act (quests, scenes, bestiary rows) is judged at that act and
// blocks. A monster without one is judged at the earliest act the content places it (its
// spawn maps, waves and kill objectives, ./acts.ts); that inference is coarse (a map
// visitable from act 1 may hold deeper spawns, which therefore declare their bestiary
// act), so it warns at M0 and blocks from M1 (the PK-M0-29 rescale put every placed
// monster inside its band). A monster that only ability summon effects place takes its
// summoner's level (a warlock's imp; progression 3.3: summons and beast companions have
// no level of their own), so its row range is not a content level and is not judged.
// Quest experience counts every xp effect of a quest: its start, its stages (the
// settlement points of progression 3.1.1) and its rewards.

import { collectRefs, REF_PATHS } from '../../../src/content/references';
import { LEVEL_BANDS } from '../../../src/systems/combat/progression';
import { earliestActs } from './acts';
import type { Finding, ValidationInput, Validator } from './types';

/** Milestone from which an inferred act's band blocks (after the PK-M0-29 rescale). */
export const INFERRED_BLOCKING_FROM = 1;

/** Tables whose rows are judged at an inferred act when they declare none. */
export const INFERRED_ACT_TABLES: readonly string[] = ['monsters'];

/** Level band per act (1 to 6): the kernel's table (src/systems/combat/progression.ts). */
export const ACT_BANDS: Readonly<Record<number, readonly [number, number]>> = LEVEL_BANDS;

/** Story bosses may exceed the band's upper end by this much (progression 18.2). */
export const BOSS_ALLOWANCE = 5;

/** Content level range per tier (bible 3.1). */
export const TIER_LEVELS: Readonly<Record<number, readonly [number, number]>> = {
  1: [1, 9],
  2: [10, 19],
  3: [20, 34],
  4: [35, 49],
  5: [50, 59],
  6: [60, 60],
};

/** Material unit price band per tier in copper (bible 3.1); T6 has no market price. */
export const MATERIAL_PRICE: Readonly<Record<number, readonly [number, number]>> = {
  1: [2, 20],
  2: [20, 100],
  3: [100, 1000],
  4: [1000, 20000],
  5: [20000, 200000],
};

/** Price formula of bible 6.4: tier base, quality factor, slot factor. */
export const TIER_BASE: Readonly<Record<number, number>> = {
  1: 150,
  2: 1500,
  3: 15000,
  4: 120000,
  5: 1000000,
};
export const QUALITY_FACTOR: Readonly<Record<number, number>> = {
  0: 0.05,
  1: 1,
  2: 2,
  3: 5,
  4: 20,
};
export const SLOT_FACTOR: Readonly<Record<string, number>> = {
  main_hand: 1,
  chest: 1,
  legs: 1,
  head: 0.6,
  hands: 0.6,
  feet: 0.6,
  off_hand: 0.6,
  trinket: 1.2,
};
/** Armor class and two-hand factors span 0.6 to 1.6 around the slot price. */
export const PRICE_SPREAD: readonly [number, number] = [0.6, 1.6];

/** Experience shares of an act's budget that quests carry (progression 2.2). */
export const ACT_XP: Readonly<Record<number, { main: number; side: number }>> = {
  1: { main: 23520, side: 19600 },
  2: { main: 126180, side: 105150 },
  3: { main: 348300, side: 290250 },
  4: { main: 434670, side: 362225 },
  5: { main: 292740, side: 243950 },
};
export const XP_TOLERANCE = 0.1;

export function tierForLevel(level: number): number | null {
  for (const [t, [lo, hi]] of Object.entries(TIER_LEVELS))
    if (level >= lo && level <= hi) return Number(t);
  return null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function actOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const m = /^act([1-6])$/.exec(v);
    if (m) return Number(m[1]);
  }
  return null;
}

function tierOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const m = /^T([0-7])$/i.exec(v);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Level range a row declares: `level`, or `minLevel` to `maxLevel`. */
export function levelRange(row: Record<string, unknown>): [number, number] | null {
  const lv = num(row.level);
  if (lv !== null) return [lv, lv];
  const lo = num(row.minLevel);
  const hi = num(row.maxLevel);
  if (lo !== null && hi !== null) return [lo, hi];
  return null;
}

/** Tier implied by a material id: `_t<n>` parts, `src_<source>_<grade>` (grade 1 is T1 to T2). */
export function materialTiers(id: string): number[] | null {
  const part = /_t([1-6])$/.exec(id);
  if (part) return [Number(part[1])];
  const src = /^src_[a-z]+_([1-3])$/.exec(id);
  if (src) {
    const g = Number(src[1]);
    return [g * 2 - 1, g * 2];
  }
  return null;
}

function rowsOf(input: ValidationInput, table: string): Record<string, unknown>[] {
  const v = (input.content as unknown as Record<string, unknown>)[table];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

/** Monsters that only ability summon effects place (their level is the summoner's). */
export function summonOnlyMonsters(content: ValidationInput['content']): Set<string> {
  const by = new Map<string, Set<string>>();
  for (const u of collectRefs(content, REF_PATHS)) {
    if (!u.row || !u.to.includes('monsters')) continue;
    const tables = by.get(u.value) ?? new Set<string>();
    tables.add(
      u.table === 'abilities' && /^effects\[\d+\]\.monster$/.test(u.path) ? 'summon' : u.table,
    );
    by.set(u.value, tables);
  }
  const out = new Set<string>();
  for (const [id, tables] of by) if (tables.size === 1 && tables.has('summon')) out.add(id);
  return out;
}

/** Every xp effect a quest grants: on start, on entering or completing a stage, on completion. */
export function questXp(q: Record<string, unknown>): number {
  const lists: unknown[] = [q.onStart, q.rewards];
  for (const s of Array.isArray(q.stages) ? q.stages : [])
    if (s && typeof s === 'object') {
      const st = s as { onEnter?: unknown; onComplete?: unknown };
      lists.push(st.onEnter, st.onComplete);
    }
  let sum = 0;
  for (const list of lists)
    for (const e of Array.isArray(list) ? list : [])
      if ((e as { type?: unknown }).type === 'xp')
        sum += num((e as { amount?: unknown }).amount) ?? 0;
  return sum;
}

export function balanceFindings(input: ValidationInput): Finding[] {
  const out: Finding[] = [];
  const tables = input.content as unknown as Record<string, unknown>;
  const inferred = earliestActs(input.content);
  const summons = summonOnlyMonsters(input.content);
  const unplaced: string[] = [];
  const summoned: string[] = [];
  // levels and tiers of every row that declares them
  for (const [table, value] of Object.entries(tables)) {
    if (!Array.isArray(value)) continue;
    for (const r of value as Record<string, unknown>[]) {
      if (!r || typeof r !== 'object') continue;
      const id = typeof r.id === 'string' ? r.id : '';
      const range = levelRange(r);
      if (!range) continue;
      const own = actOf(r.act);
      let act = own;
      if (act === null && INFERRED_ACT_TABLES.includes(table)) {
        if (table === 'monsters' && summons.has(id)) summoned.push(id);
        else if (inferred.known(table, id)) act = inferred.of(table, id);
        else unplaced.push(id);
      }
      const band = act !== null ? ACT_BANDS[act] : undefined;
      if (band) {
        const boss = r.rank === 'boss';
        const hiMax = band[1] + (boss ? BOSS_ALLOWANCE : 0);
        const blocks = own !== null || input.milestone >= INFERRED_BLOCKING_FROM;
        if (range[0] < band[0] || range[1] > hiMax)
          out.push({
            level: blocks ? 'error' : 'warning',
            message: `${table}:${id}: level ${range[0]} to ${range[1]} outside act ${act} band ${band[0]} to ${band[1]}${boss ? ` (boss up to ${hiMax})` : ''}${own === null ? ' (act inferred from where the content places it)' : ''}`,
            table,
            row: id,
          });
      }
      const tier = tierOf(r.tier);
      if (tier !== null && tier >= 1 && tier <= 6) {
        const [lo, hi] = TIER_LEVELS[tier] as readonly [number, number];
        if (range[1] < lo || range[0] > hi)
          out.push({
            level: 'error',
            message: `${table}:${id}: tier T${tier} is content level ${lo} to ${hi}, row is ${range[0]} to ${range[1]}`,
            table,
            row: id,
          });
      }
    }
  }
  if (unplaced.length)
    out.push({
      level: 'info',
      message: `${unplaced.length} levelled monsters are placed nowhere (no act to judge): ${unplaced.join(', ')}`,
    });
  if (summoned.length)
    out.push({
      level: 'info',
      message: `${summoned.length} monsters only summons place (level follows the summoner): ${summoned.join(', ')}`,
    });
  // prices of items (warnings until the price batch content_base_rebase_01, C45)
  for (const it of rowsOf(input, 'items')) {
    const id = typeof it.id === 'string' ? it.id : '';
    const value = num(it.value);
    if (value === null) continue;
    const kind = it.kind;
    if (kind === 'material' || kind === 'goods') {
      const tiers = tierOf(it.tier) !== null ? [tierOf(it.tier) as number] : materialTiers(id);
      if (!tiers) continue;
      const bands = tiers.map((t) => MATERIAL_PRICE[t]).filter((b) => b !== undefined);
      if (bands.length === 0) continue;
      const lo = Math.min(...bands.map((b) => b[0]));
      const hi = Math.max(...bands.map((b) => b[1]));
      if (value < lo || value > hi)
        out.push({
          level: 'warning',
          message: `items:${id}: value ${value} outside the T${tiers.join(' to T')} material band ${lo} to ${hi} copper`,
          table: 'items',
          row: id,
        });
    } else if (kind === 'weapon' || kind === 'armor' || kind === 'trinket') {
      const level = num(it.level);
      const slot = typeof it.slot === 'string' ? it.slot : kind === 'trinket' ? 'trinket' : '';
      const tier = level !== null ? tierForLevel(level) : null;
      const base = tier !== null ? TIER_BASE[tier] : undefined;
      const q = QUALITY_FACTOR[num(it.quality) ?? 1];
      const s = SLOT_FACTOR[slot];
      if (base === undefined || q === undefined || s === undefined) continue;
      const expected = base * q * s;
      const [a, b] = PRICE_SPREAD;
      if (value < expected * a || value > expected * b)
        out.push({
          level: 'warning',
          message: `items:${id}: value ${value} off the price formula (T${tier}, quality ${num(it.quality) ?? 1}, ${slot}: ${Math.round(expected * a)} to ${Math.round(expected * b)} copper)`,
          table: 'items',
          row: id,
        });
    }
  }
  // quest experience per act against the budget (warnings)
  const xp: Record<number, { main: number; side: number }> = {};
  for (const q of rowsOf(input, 'quests')) {
    const act = actOf(q.act);
    if (act === null || !ACT_XP[act]) continue;
    const sum = questXp(q);
    xp[act] ??= { main: 0, side: 0 };
    const slot = xp[act] as { main: number; side: number };
    if (q.kind === 'main') slot.main += sum;
    else slot.side += sum;
  }
  for (const [actText, budget] of Object.entries(ACT_XP)) {
    const act = Number(actText);
    const got = xp[act];
    if (!got) continue;
    for (const share of ['main', 'side'] as const) {
      const want = budget[share];
      const dev = (got[share] - want) / want;
      if (Math.abs(dev) > XP_TOLERANCE)
        out.push({
          level: 'warning',
          message: `act ${act} ${share} quest experience ${got[share]} is ${Math.round(dev * 100)}% off the budget ${want}`,
        });
    }
  }
  return out;
}

export const balanceValidator: Validator = {
  id: 'V6',
  title: 'numeric bands',
  run: balanceFindings,
};
