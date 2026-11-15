// Named computations over world flags: the prologue door hints (prologue 4.9), the
// act 5 settlement of the fronts (act5 7.3, 8), the review crises (act6 2.4) and the
// ending judgement (act6 11.0 to 11.6). Pure functions over a flag map and the goddess
// roster (the seated goddesses and their review crises come from their courtSeat in
// data/goddess/goddesses.json), plus thin registrations that write the results back as flags.

import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { seatedGoddesses } from '../goddess/roster';
import type { GoddessDef } from '../goddess/types';
import type { EndingId, Verdict } from '../scenes/types';
import { evaluate, flagResolver, truthy } from './conditions';
import { DOOR_HINTS } from './effect_types';
import { registerCompute } from './effects';

type Flags = Record<string, FlagValue>;

type Roster = { goddesses: readonly GoddessDef[] };

function n(flags: Flags, key: string, dflt = 0): number {
  const v = Number(flags[key] ?? dflt);
  return Number.isFinite(v) ? v : dflt;
}

/** The two strongest door hints, ties broken in the order blade, beast, breath, pact, shadow, spirit. */
export function topDoorHints(flags: Flags): string[] {
  return [...DOOR_HINTS]
    .map((d, i) => ({ d, i, v: n(flags, `p_hint.${d}`) }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .slice(0, 2)
    .map((x) => x.d);
}

export const FRONTS = ['north', 'east', 'south', 'ring', 'rear'] as const;

export type FrontState = 'held' | 'stalemate' | 'lost' | 'collapsed';

/** Act 5 fronts without the player (act5 7.3): ratio from autonomy and support. */
export function frontOutcomes(flags: Flags): Record<(typeof FRONTS)[number], FrontState> {
  const autonomy = Math.max(n(flags, 'autonomy'), n(flags, 'territory_autonomy'));
  const support: Record<(typeof FRONTS)[number], boolean> = {
    north: truthy(flags['companion.ron.recruited']),
    // the strategy conclave, or the conclave scene played on its own
    east: truthy(flags.a4_conclave_done) || truthy(flags['scene.a4_conclave.seen']),
    south: truthy(flags['companion.shiya.recruited']),
    ring: n(flags, 'a5_gate_ring') >= 5,
    rear: truthy(flags.a2_village_founded),
  };
  const out = {} as Record<(typeof FRONTS)[number], FrontState>;
  for (const f of FRONTS) {
    const r =
      (0.5 + autonomy / 100) *
      (support[f] ? 1.3 : 1) *
      (truthy(flags['companion.yeyu.recruited']) ? 1.05 : 1);
    out[f] = r >= 1.2 ? 'held' : r >= 0.9 ? 'stalemate' : r >= 0.6 ? 'lost' : 'collapsed';
  }
  return out;
}

/** Settle the act 5 climax: fronts, a5_held_unaided, a5_janu_act, purify, continent. */
export function act5Outcome(flags: Flags): Flags {
  const fronts = frontOutcomes(flags);
  const out: Flags = {};
  let held = 0;
  let collapsed = 0;
  for (const f of FRONTS) {
    out[`front.${f}`] = fronts[f];
    if (fronts[f] === 'held' || fronts[f] === 'stalemate') held++;
    if (fronts[f] === 'collapsed') collapsed++;
  }
  const people = flags.a5_purge_route === 'people';
  const ring = n(flags, 'a5_gate_ring');
  out.a5_held_unaided = Math.max(held, n(flags, 'a5_held_unaided'));
  out.a5_janu_act = people && ring >= 5 ? 'receive' : 'seal';
  out.a5_purify_success = people && ring >= 5;
  let continent = n(flags, 'continent', 70);
  continent -= collapsed * 15;
  if (flags.a5_faceless_end === 'destroyed' && ring < 5) continent -= 30;
  out.continent = Math.max(0, Math.min(100, continent));
  if (out.a5_janu_act === 'seal') out.janu_faith = Math.min(100, n(flags, 'janu_faith') + 40);
  return out;
}

export type CrisisResult = 'self' | 'barely' | 'descend' | 'fail';

const CRISIS_SCORE: Record<CrisisResult, number> = { self: 1, barely: 0.6, descend: 0.5, fail: 0 };

/**
 * The review crises (act6 2.4), one per seated goddess in seat order: descended, held by
 * the garden itself, barely, or failed. A crisis's bonus condition adds 10 strength.
 */
export function reviewOutcome(flags: Flags, roster: Roster): Flags {
  const out: Flags = {};
  let sum = 0;
  let descents = 0;
  const autonomy = Math.max(n(flags, 'autonomy'), n(flags, 'territory_autonomy'));
  const crises = seatedGoddesses(roster).map((g) => g.courtSeat.crisis);
  const resolve = flagResolver(flags);
  for (const c of crises) {
    let r: CrisisResult;
    if (truthy(flags[`review.${c.id}.descend`])) {
      r = 'descend';
      descents++;
    } else {
      const strength = autonomy + (evaluate(c.bonus, resolve) ? 10 : 0);
      r = strength >= 60 ? 'self' : strength >= 40 ? 'barely' : 'fail';
    }
    out[`review.${c.id}`] = r;
    sum += CRISIS_SCORE[r];
  }
  out.a6_review_score = Math.round((sum / Math.max(1, crises.length)) * 100) / 100;
  out.a6_descents = descents;
  return out;
}

const MYSTERY_FLAGS = [
  'a1_dream_door_woman',
  'a6_name_spoken',
  'a2_aiden_no_page',
  'a5_truth_purge_cycle',
  'a3_ash_tells_sundering',
  'a4_moira_trade_records',
  'a6_janu_intent_revealed',
  'a6_charter_read',
  'a6_earth_truth',
];

export function mysteriesAll(flags: Flags): boolean {
  return MYSTERY_FLAGS.every((k) => truthy(flags[k])) && n(flags, 'a4_lies_exposed') >= 5;
}

/** The true-ending world conditions beyond the verdicts (act6 11.1.1, D-043). */
export function releaseConditions(flags: Flags): boolean {
  return (
    flags.a5_purge_route === 'people' &&
    n(flags, 'a5_gate_ring') >= 5 &&
    n(flags, 'a5_held_unaided') >= 3 &&
    flags.a5_janu_act === 'receive' &&
    n(flags, 'continent', 70) >= 50 &&
    n(flags, 'a6_review_score') >= 0.6 &&
    n(flags, 'autonomy') >= 60
  );
}

/** The ending, by the judgement order of act6 11.0 (first match wins). */
export function judgeEnding(flags: Flags, roster: Roster): EndingId {
  const seated: string[] = seatedGoddesses(roster).map((g) => g.id);
  if (n(flags, 'continent', 70) < 20 || truthy(flags.a6_god_war)) return 'reclaim';
  if (truthy(flags.a6_player_absorb)) return 'new_god';
  if (!truthy(flags.a6_janu_release) && truthy(flags.a6_janu_restore_chosen))
    return 'janu_restored';
  const verdicts = seated.map((g) => ({
    g,
    v: String(flags[`verdict.${g}`] ?? 'refuse') as Verdict,
  }));
  const patron = String(flags.a6_patron ?? '');
  if (seated.includes(patron)) return `rule_${patron}` as EndingId;
  const contenders = verdicts.filter((x) => x.v === 'contend');
  if (contenders.length >= 2) return 'reclaim';
  const staying = verdicts.filter((x) => x.v === 'refuse' || x.v === 'contend');
  if (staying.length === 1) return `rule_${staying[0]?.g}` as EndingId;
  if (staying.length > 1) {
    const top = [...staying].sort(
      (a, b) => n(flags, `goddess.${b.g}.score`) - n(flags, `goddess.${a.g}.score`),
    )[0];
    return `rule_${top?.g}` as EndingId;
  }
  if (!truthy(flags.a6_janu_release)) return 'janu_restored';
  return releaseConditions(flags) ? 'release' : 'release_unfinished';
}

function write(ctx: SystemContext, out: Flags): void {
  for (const k of Object.keys(out).sort()) ctx.setFlag(k, out[k] as FlagValue);
}

registerCompute('prologue_door_hints', (ctx) => {
  ctx.setFlag('p_door_hints', topDoorHints(ctx.world.meta.flags).join(','));
});

registerCompute('act5_outcome', (ctx) => write(ctx, act5Outcome(ctx.world.meta.flags)));

registerCompute('review_score', (ctx) =>
  write(ctx, reviewOutcome(ctx.world.meta.flags, ctx.content)),
);

registerCompute('ending', (ctx) => {
  const flags = ctx.world.meta.flags;
  const voluntary = seatedGoddesses(ctx.content).filter(
    (g) => flags[`verdict.${g.id}`] === 'voluntary',
  ).length;
  ctx.setFlag('a6_release_tone', voluntary >= 4 ? 'gentle' : 'hard');
  ctx.setFlag('mysteries_all', mysteriesAll(flags));
  ctx.setFlag('ending', judgeEnding(ctx.world.meta.flags, ctx.content));
  ctx.setFlag('a6_judgment', true);
});
