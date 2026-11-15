// Goddess slice access and the ports other narrative systems use to write it
// (impression, interest, relation and memory tags from scenes; interventions from the
// director). Pure helpers over the slice; no events beyond what each port documents.

import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { registerModifier } from '../modifiers';
import { playerEntity } from '../world';
import type { GoddessDef, GoddessSlice, GoddessState, MiracleEntry } from './types';

export const MEMORY_TAG_LIMIT = 3;

type WorldLike = { slices: { goddess: GoddessSlice }; meta: { flags: Record<string, FlagValue> } };

export function goddessSlice(world: { slices: { goddess: GoddessSlice } }): GoddessSlice {
  return world.slices.goddess;
}

export function goddessDef(
  content: { goddesses: GoddessDef[] },
  id: string,
): GoddessDef | undefined {
  return content.goddesses.find((g) => g.id === id);
}

export function goddessState(
  world: { slices: { goddess: GoddessSlice } },
  id: string,
): GoddessState | undefined {
  return world.slices.goddess.goddesses[id];
}

export function newGoddessState(def: GoddessDef): GoddessState {
  return {
    id: def.id,
    power: def.power.start,
    faith: { ...def.faith },
    sightWeight: 0,
    gaze: 0,
    impression: 0,
    interest: 0,
    relation: 0,
    memoryTags: [],
    score: 0,
    cooldowns: {},
    breachActs: [],
    hostility: {},
    wakeDay: -1,
    wakes: 0,
    revision: 0,
    departed: false,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Mirror a goddess value into the ledger flags (goddess.<id>.impression and so on). */
function mirror(ctx: SystemContext, id: string, key: string, value: FlagValue): void {
  ctx.setFlag(`goddess.${id}.${key}`, value);
}

function each(ctx: SystemContext, goddess: string, fn: (s: GoddessState) => void): void {
  const all = ctx.world.slices.goddess.goddesses;
  const ids = goddess === 'all' ? Object.keys(all).filter((k) => k !== 'janu') : [goddess];
  for (const id of ids) {
    const s = all[id];
    if (s) fn(s);
  }
}

export function adjustImpression(ctx: SystemContext, goddess: string, amount: number): void {
  each(ctx, goddess, (s) => {
    s.impression = clamp(s.impression + amount, -3, 3);
    s.relation = clamp(s.relation + amount * 10, -100, 100);
    s.revision++;
    mirror(ctx, s.id, 'impression', s.impression);
    mirror(ctx, s.id, 'relation', s.relation);
  });
}

export function adjustInterest(ctx: SystemContext, goddess: string, amount: number): void {
  each(ctx, goddess, (s) => {
    s.interest = clamp(s.interest + amount, 0, 3);
    s.revision++;
    mirror(ctx, s.id, 'interest', s.interest);
  });
}

export function adjustRelation(ctx: SystemContext, goddess: string, amount: number): void {
  each(ctx, goddess, (s) => {
    s.relation = clamp(s.relation + amount, -100, 100);
    s.revision++;
    mirror(ctx, s.id, 'relation', s.relation);
  });
}

export function addMemoryTag(ctx: SystemContext, goddess: string, tag: string): void {
  each(ctx, goddess, (s) => {
    if (s.memoryTags.includes(tag)) return;
    s.memoryTags.push(tag);
    if (s.memoryTags.length > MEMORY_TAG_LIMIT) s.memoryTags.shift();
    s.revision++;
    mirror(ctx, s.id, 'memory_tags', s.memoryTags.join(','));
  });
}

/** Recompute gaze from the decayed sample weight, clamped by the act cap (goddess_gm.md 3.4, 3.6). */
export function refreshGaze(
  ctx: SystemContext,
  content: { goddesses: GoddessDef[] },
  goddess: string,
): void {
  const s = ctx.world.slices.goddess.goddesses[goddess];
  const def = goddessDef(content, goddess);
  if (!s || !def) return;
  const act = String(ctx.flag('act') ?? 'prologue');
  const cap = def.gazeCap[act] ?? 100;
  const gaze = Math.round(Math.min(cap, 100 * (1 - Math.exp(-0.3 * s.sightWeight))));
  if (gaze === s.gaze) return;
  s.gaze = gaze;
  s.revision++;
  mirror(ctx, goddess, 'gaze', gaze);
  // Ledger aliases (goddess_gm.md 3.4): eluen_awareness, moira_sight.
  if (goddess === 'eluen') ctx.setFlag('eluen_awareness', gaze);
  if (goddess === 'moira') ctx.setFlag('moira_sight', gaze);
}

/** Raise a goddess's sight of the player by a witness sample weight. */
export function addSight(
  ctx: SystemContext,
  content: { goddesses: GoddessDef[] },
  goddess: string,
  weight: number,
): void {
  const s = ctx.world.slices.goddess.goddesses[goddess];
  if (!s || weight <= 0) return;
  s.sightWeight += weight;
  refreshGaze(ctx, content, goddess);
}

/** Daily decay of sight weights (half-life of seven game days). */
export function decaySight(ctx: SystemContext, content: { goddesses: GoddessDef[] }): void {
  const factor = 0.5 ** (1 / 7);
  for (const id of Object.keys(ctx.world.slices.goddess.goddesses).sort()) {
    const s = ctx.world.slices.goddess.goddesses[id] as GoddessState;
    s.sightWeight *= factor;
    refreshGaze(ctx, content, id);
  }
}

/** Map id the player is on (sediment and faith scopes are keyed by map). */
export function playerMap(world: Parameters<typeof playerEntity>[0]): string {
  return playerEntity(world)?.mapId ?? '';
}

/**
 * Record an intervention in the miracle ledger (E34) and lay down its sediment
 * (goddess_gm.md 4.4): slice total, flag sediment.<map>, and a registered sediment
 * modifier for the systems that read monster pressure.
 */
export function recordIntervention(
  ctx: SystemContext,
  entry: Omit<MiracleEntry, 'id' | 'tick' | 'act'>,
): MiracleEntry {
  const slice = ctx.world.slices.goddess;
  const full: MiracleEntry = {
    ...entry,
    id: ctx.newId('miracle'),
    tick: ctx.tick,
    act: String(ctx.flag('act') ?? 'prologue'),
  };
  slice.ledger.push(full);
  if (entry.sediment > 0 && entry.mapId) {
    const total = (slice.sediment[entry.mapId] ?? 0) + entry.sediment;
    slice.sediment[entry.mapId] = total;
    ctx.setFlag(`sediment.${entry.mapId}`, Math.round(total * 100) / 100);
    if (entry.sediment >= 0.5) {
      registerModifier(ctx, {
        target: 'sediment',
        key: entry.mapId,
        add: entry.sediment,
        untilTick: ctx.tick + 28 * 28800,
        source: entry.goddess,
        visibility: 'hidden',
        note: `${entry.note}留下的澱`,
      });
    }
  }
  ctx.setFlag('miracle_count', slice.ledger.length);
  return full;
}

/** Sum of power and sediment per goddess in the miracle ledger (dynamic E34 strength). */
export function ledgerTotals(
  world: WorldLike,
): Record<string, { count: number; power: number; sediment: number; breaches: number }> {
  const out: Record<string, { count: number; power: number; sediment: number; breaches: number }> =
    {};
  for (const e of world.slices.goddess.ledger) {
    const t = out[e.goddess] ?? { count: 0, power: 0, sediment: 0, breaches: 0 };
    t.count++;
    t.power += e.power;
    t.sediment += e.sediment;
    if (e.breach) t.breaches++;
    out[e.goddess] = t;
  }
  return out;
}
