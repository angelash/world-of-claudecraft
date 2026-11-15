// The act 6 court (act6 3 and 4, goddess_gm.md 11): the kernel checks evidence
// ownership, the goddess and defense-line tags and the strength; a line breaks when the
// accumulated strength reaches its thickness; one piece counts once per line. The model
// (when present) only performs how a goddess takes the blow. Verdicts and Janu's
// release are computed here and written back as flags.

import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { ledgerTotals } from '../goddess/state';
import { countItem } from '../inventory';
import { truthy } from '../quests/conditions';
import { registerCompute } from '../quests/effects';
import type { CourtDefenseDef, CourtState, DefenseLine, EvidenceDef, Verdict } from './types';

export const SITTING = ['eluen', 'valda', 'merca', 'sylvie', 'moira'] as const;
export const LINES: readonly DefenseLine[] = ['fact', 'just', 'need'];

/** Review crisis per goddess domain (act6 2.4, E27). */
const CRISIS_OF: Record<string, string> = {
  eluen: 'no_light',
  valda: 'residue_tide',
  merca: 'contract_halt',
  sylvie: 'winter_famine',
  moira: 'record_silence',
};

export function emptyCourt(): CourtState {
  return { strength: {}, presented: {}, mitigated: {} };
}

type Flags = Record<string, FlagValue>;

/** Strength of one evidence target, resolving dynamic sources from the world. */
export function targetStrength(
  t: EvidenceDef['targets'][number],
  flags: Flags,
  ledger: ReturnType<typeof ledgerTotals>,
): number {
  if (t.dynamic === 'miracle_ledger') {
    const tot = ledger[t.goddess];
    const count = tot?.count ?? 0;
    const s =
      1 + (count >= 10 ? 1 : 0) + (count >= 30 ? 1 : 0) + ((tot?.breaches ?? 0) > 0 ? 1 : 0);
    return Math.min(3, s);
  }
  if (t.dynamic === 'review') {
    const r = String(flags[`review.${CRISIS_OF[t.goddess] ?? ''}`] ?? 'fail');
    return r === 'self' ? 3 : r === 'barely' ? 2 : r === 'descend' ? 1 : 0;
  }
  if (t.dynamic === 'held_unaided') {
    return Number(flags.held_unaided ?? 0) >= 3 ? 3 : 1;
  }
  return t.strength;
}

/** Thickness of a line, including the +1 a failed review crisis adds to the need line. */
export function thickness(def: CourtDefenseDef, line: DefenseLine, flags: Flags): number {
  let t = def.thickness[line];
  if (line === 'need' && flags[`review.${CRISIS_OF[def.goddess] ?? ''}`] === 'fail') t += 1;
  if (
    flags.purge_route === 'god' &&
    line === 'need' &&
    (def.goddess === 'eluen' || def.goddess === 'valda')
  )
    t += 2;
  return t;
}

export function brokenLines(court: CourtState, def: CourtDefenseDef, flags: Flags): DefenseLine[] {
  const s = court.strength[def.goddess];
  if (!s) return [];
  return LINES.filter((l) => (s[l] ?? 0) >= thickness(def, l, flags));
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
  const before = brokenLines(court, def, flags);
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
    s[t.line] = (s[t.line] ?? 0) + targetStrength(t, flags, ledger);
  }
  court.strength[goddess] = s;
  const after = brokenLines(court, def, flags);
  res.newlyBroken = after.filter((l) => !before.includes(l));
  for (const l of res.newlyBroken) ctx.setFlag(`court.${goddess}.${l}`, 'broken');
  ctx.setFlag(`evidence.${ev.id}.shown`, true);
  return res;
}

/** Verdict of one goddess from the broken lines and the outlets (act6 3.5 and 5). */
export function verdictFor(
  goddess: string,
  broken: DefenseLine[],
  court: CourtState,
  flags: Flags,
): Verdict {
  if (flags.patron === goddess) return 'contend';
  const all = broken.length === 3;
  const shown = court.presented[goddess] ?? [];
  switch (goddess) {
    case 'eluen': {
      const sawTheLamps = shown.includes('E27') || shown.includes('E28');
      if (all && sawTheLamps) return 'voluntary';
      return all ? 'judged' : 'refuse';
    }
    case 'valda': {
      const persuaded =
        (broken.includes('just') && broken.includes('need')) || truthy(flags['court.valda.duel']);
      if (persuaded) return 'voluntary';
      return broken.length >= 2 ? 'judged' : 'refuse';
    }
    case 'merca': {
      if (all && truthy(flags['court.merca.outlet'])) return 'voluntary';
      return all ? 'judged' : 'refuse';
    }
    case 'sylvie': {
      const confessed = (court.mitigated.sylvie ?? []).length > 0;
      const springTurns =
        flags['review.winter_famine'] === 'self' ||
        flags['review.winter_famine'] === 'barely' ||
        shown.includes('E27');
      if ((broken.length >= 2 || confessed) && springTurns) return 'voluntary';
      return broken.length >= 2 || confessed ? 'judged' : 'refuse';
    }
    case 'moira': {
      if (all && truthy(flags.a6_charter_read)) return 'voluntary';
      return all ? 'judged' : 'refuse';
    }
    default:
      return 'refuse';
  }
}

export function computeVerdicts(ctx: SystemContext): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  const flags = ctx.world.meta.flags;
  const court = ctx.world.slices.scenes.court;
  let collapsed = 0;
  for (const g of SITTING) {
    const def = ctx.content.courtDefenses.find((d) => d.goddess === g);
    const broken = def ? brokenLines(court, def, flags) : [];
    if (broken.length === 3) collapsed++;
    out[g] = verdictFor(g, broken, court, flags);
  }
  for (const g of SITTING) ctx.setFlag(`verdict_${g}`, out[g] as Verdict);
  ctx.setFlag('court.collapsed', collapsed);
  // Two seated goddesses both claiming the garden is a breach of the covenant: the gods' war.
  if (SITTING.filter((g) => out[g] === 'contend').length >= 2) ctx.setFlag('god_war', true);
  const exposed = SITTING.filter((g) => out[g] === 'voluntary' || out[g] === 'judged').length;
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
  // Sylvie hands over the spring memory once her stance gives way (E19, act6 7.1).
  if ((v.sylvie === 'voluntary' || v.sylvie === 'judged') && !ctx.flag('a6_spring_memory')) {
    ctx.setFlag('a6_spring_memory', true);
  }
  for (const g of SITTING) {
    const s = ctx.world.slices.goddess.goddesses[g];
    if (s) s.departed = v[g] === 'voluntary' || v[g] === 'judged';
  }
});

registerCompute('janu_release', (ctx) => {
  const r = januReleases(ctx.world.meta.flags);
  ctx.setFlag('janu_supports', r.supports);
  ctx.setFlag('janu_release', r.release);
});
