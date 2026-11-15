// The act 6 court (act6 3 and 4, goddess_gm.md 11): the kernel checks evidence
// ownership, the goddess and defense-line tags and the strength; a line breaks when the
// accumulated strength reaches its thickness; one piece counts once per line. The model
// (when present) only performs how a goddess takes the blow. Verdicts and Janu's
// release are computed here and written back as flags. Who sits at the court, in which
// order, her review crisis and how each one yields are her courtSeat in
// data/goddess/goddesses.json (release_engineering.md 13.2).

import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { seatedGoddesses, seatOf } from '../goddess/roster';
import { ledgerTotals } from '../goddess/state';
import type { CourtSeat, GoddessDef, VoluntaryCue } from '../goddess/types';
import { countItem } from '../inventory';
import { evaluate, flagResolver, truthy } from '../quests/conditions';
import { registerCompute } from '../quests/effects';
import type { CourtDefenseDef, CourtState, DefenseLine, EvidenceDef, Verdict } from './types';

export const LINES: readonly DefenseLine[] = ['fact', 'just', 'need'];

type Roster = { goddesses: readonly GoddessDef[] };

/** The review-crisis flag of a seat (act6 2.4, E27): review.<crisis id>. */
function crisisKey(seat: CourtSeat | undefined): string {
  return `review.${seat?.crisis.id ?? ''}`;
}

export function emptyCourt(): CourtState {
  return { strength: {}, presented: {}, mitigated: {} };
}

type Flags = Record<string, FlagValue>;

/** Strength of one evidence target, resolving dynamic sources from the world. */
export function targetStrength(
  t: EvidenceDef['targets'][number],
  flags: Flags,
  ledger: ReturnType<typeof ledgerTotals>,
  roster: Roster,
): number {
  if (t.dynamic === 'miracle_ledger') {
    const tot = ledger[t.goddess];
    const count = tot?.count ?? 0;
    const s =
      1 + (count >= 10 ? 1 : 0) + (count >= 30 ? 1 : 0) + ((tot?.breaches ?? 0) > 0 ? 1 : 0);
    return Math.min(3, s);
  }
  if (t.dynamic === 'review') {
    const r = String(flags[crisisKey(seatOf(roster, t.goddess))] ?? 'fail');
    return r === 'self' ? 3 : r === 'barely' ? 2 : r === 'descend' ? 1 : 0;
  }
  if (t.dynamic === 'held_unaided') {
    return Number(flags.held_unaided ?? 0) >= 3 ? 3 : 1;
  }
  return t.strength;
}

/**
 * Thickness of a line, including the +1 a failed review crisis adds to the need line and
 * the seat's own thickening while its condition holds (the god purge route).
 */
export function thickness(
  def: CourtDefenseDef,
  line: DefenseLine,
  flags: Flags,
  roster: Roster,
): number {
  let t = def.thickness[line];
  const seat = seatOf(roster, def.goddess);
  if (line === 'need' && flags[crisisKey(seat)] === 'fail') t += 1;
  for (const x of seat?.thicken ?? [])
    if (x.line === line && evaluate(x.when, flagResolver(flags))) t += x.add;
  return t;
}

export function brokenLines(
  court: CourtState,
  def: CourtDefenseDef,
  flags: Flags,
  roster: Roster,
): DefenseLine[] {
  const s = court.strength[def.goddess];
  if (!s) return [];
  return LINES.filter((l) => (s[l] ?? 0) >= thickness(def, l, flags, roster));
}

/** Evidence the player holds that has not been shown to this goddess yet. */
export function presentable(
  world: SystemContext['world'],
  content: { evidence: EvidenceDef[] },
  goddess: string,
): EvidenceDef[] {
  const playerId = world.slices.world.playerId;
  const shown = world.slices.scenes.court.presented[goddess] ?? [];
  return content.evidence.filter(
    (e) => countItem(world, playerId, e.item) > 0 && !shown.includes(e.id),
  );
}

export interface PresentResult {
  hit: boolean;
  newlyBroken: DefenseLine[];
  mitigated: boolean;
}

/** Present one piece of evidence to a goddess; returns what happened (pure on the slice). */
export function presentEvidence(
  ctx: SystemContext,
  goddess: string,
  ev: EvidenceDef,
): PresentResult {
  const court = ctx.world.slices.scenes.court;
  const def = ctx.content.courtDefenses.find((d) => d.goddess === goddess);
  const flags = ctx.world.meta.flags;
  const shown = court.presented[goddess] ?? [];
  court.presented[goddess] = [...shown, ev.id];
  const res: PresentResult = { hit: false, newlyBroken: [], mitigated: false };
  if (!def) return res;
  const before = brokenLines(court, def, flags, ctx.content);
  const ledger = ledgerTotals(ctx.world);
  const s = court.strength[goddess] ?? { fact: 0, just: 0, need: 0 };
  for (const t of ev.targets) {
    if (t.goddess !== goddess) continue;
    res.hit = true;
    if (t.line === 'mitigate') {
      court.mitigated[goddess] = [...(court.mitigated[goddess] ?? []), ev.id];
      res.mitigated = true;
      continue;
    }
    s[t.line] = (s[t.line] ?? 0) + targetStrength(t, flags, ledger, ctx.content);
  }
  court.strength[goddess] = s;
  const after = brokenLines(court, def, flags, ctx.content);
  res.newlyBroken = after.filter((l) => !before.includes(l));
  for (const l of res.newlyBroken) ctx.setFlag(`court.${goddess}.${l}`, 'broken');
  ctx.setFlag(`evidence.${ev.id}.shown`, true);
  return res;
}

function cueHolds(
  cue: VoluntaryCue,
  broken: DefenseLine[],
  shown: string[],
  flags: Flags,
): boolean {
  if ('lines' in cue) return cue.lines.every((l) => broken.includes(l));
  if ('shown' in cue) return cue.shown.some((e) => shown.includes(e));
  return evaluate(cue.when, flagResolver(flags));
}

/**
 * Verdict of one goddess from the broken lines and the outlets (act6 3.5 and 5), by her
 * seat's verdict rule: judged once enough lines broke (or a confession, when the rule
 * says so), voluntary when a cue holds (only once judged unless the rule says alone).
 */
export function verdictFor(
  goddess: string,
  broken: DefenseLine[],
  court: CourtState,
  flags: Flags,
  roster: Roster,
): Verdict {
  if (flags.patron === goddess) return 'contend';
  const rule = seatOf(roster, goddess)?.verdict;
  if (!rule) return 'refuse';
  const shown = court.presented[goddess] ?? [];
  const confessed = (court.mitigated[goddess] ?? []).length > 0;
  const judged = broken.length >= rule.judgedAt || (!!rule.mitigationJudges && confessed);
  const yields = rule.voluntary.any.some((c) => cueHolds(c, broken, shown, flags));
  if (yields && (rule.voluntary.alone || judged)) return 'voluntary';
  return judged ? 'judged' : 'refuse';
}

export function computeVerdicts(ctx: SystemContext): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  const flags = ctx.world.meta.flags;
  const court = ctx.world.slices.scenes.court;
  const seated = seatedGoddesses(ctx.content).map((g) => g.id as string);
  let collapsed = 0;
  for (const g of seated) {
    const def = ctx.content.courtDefenses.find((d) => d.goddess === g);
    const broken = def ? brokenLines(court, def, flags, ctx.content) : [];
    if (broken.length === 3) collapsed++;
    out[g] = verdictFor(g, broken, court, flags, ctx.content);
  }
  for (const g of seated) ctx.setFlag(`verdict_${g}`, out[g] as Verdict);
  ctx.setFlag('court.collapsed', collapsed);
  // Two seated goddesses both claiming the garden is a breach of the covenant: the gods' war.
  if (seated.filter((g) => out[g] === 'contend').length >= 2) ctx.setFlag('god_war', true);
  const exposed = seated.filter((g) => out[g] === 'voluntary' || out[g] === 'judged').length;
  ctx.setFlag('a4_lies_exposed', Math.max(Number(flags.a4_lies_exposed ?? 0), exposed));
  return out;
}

/** Janu lets go (act6 6.2): all required conditions and at least three supports. */
export function januReleases(flags: Flags): { release: boolean; supports: number } {
  const required =
    truthy(flags.a6_charter_read) &&
    (flags.janu_act === 'receive' ||
      (flags.janu_act === 'seal' && truthy(flags['court.janu.e32']))) &&
    truthy(flags['court.player_lets_go']);
  const supports = [
    Number(flags.gate_ring ?? 0) >= 5,
    flags.faceless_end === 'redeemed',
    Number(flags.remnants ?? 0) >= 40 || truthy(flags['court.tavi_called']),
    flags.verdict_sylvie === 'voluntary',
    truthy(flags['companion.yeyu.recruited']) && Number(flags.yeyu_letters ?? 0) >= 5,
    !truthy(flags.ash_dead) && truthy(flags.a3_ash_tells_sundering),
  ].filter(Boolean).length;
  return { release: required && supports >= 3, supports };
}

registerCompute('court_verdicts', (ctx) => {
  const v = computeVerdicts(ctx);
  const seated = seatedGoddesses(ctx.content);
  // A seat's yield flag once her stance gives way: Sylvie hands over the spring memory
  // (E19, act6 7.1).
  for (const g of seated) {
    const flag = g.courtSeat.yieldFlag;
    if (flag && (v[g.id] === 'voluntary' || v[g.id] === 'judged') && !ctx.flag(flag)) {
      ctx.setFlag(flag, true);
    }
  }
  for (const g of seated) {
    const s = ctx.world.slices.goddess.goddesses[g.id];
    if (s) s.departed = v[g.id] === 'voluntary' || v[g.id] === 'judged';
  }
});

registerCompute('janu_release', (ctx) => {
  const r = januReleases(ctx.world.meta.flags);
  ctx.setFlag('janu_supports', r.supports);
  ctx.setFlag('janu_release', r.release);
});
