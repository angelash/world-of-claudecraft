// The goddess roster as data (release_engineering.md 13.2): which ids exist, who sits at
// the court and in what order, and who plays a story role. Every place that used to list
// goddesses or branch on one by id asks here, so a new or renamed goddess is a data edit.

import { checkCondition } from '../quests/conditions';
import type { CourtSeat, GoddessDef, GoddessId, GoddessRole } from './types';

type GoddessContent = { goddesses: readonly GoddessDef[] };

export type SeatedGoddess = GoddessDef & { courtSeat: CourtSeat };

/** Is this string the id of a goddess persona card? */
export function isGoddessId(content: GoddessContent, raw: string): raw is GoddessId {
  return content.goddesses.some((g) => g.id === raw);
}

/** Narrow a raw string to a goddess id (undefined when no persona card carries it). */
export function goddessIdOf(content: GoddessContent, raw: string): GoddessId | undefined {
  return isGoddessId(content, raw) ? raw : undefined;
}

/** The goddesses seated at the court, in seat order. */
export function seatedGoddesses(content: GoddessContent): SeatedGoddess[] {
  return content.goddesses
    .filter((g): g is SeatedGoddess => g.courtSeat !== undefined)
    .sort((a, b) => a.courtSeat.seat - b.courtSeat.seat);
}

/** A goddess's court seat (undefined for one outside the court). */
export function seatOf(content: GoddessContent, id: string): CourtSeat | undefined {
  return content.goddesses.find((g) => g.id === id)?.courtSeat;
}

/** The goddess who holds a story role (undefined when no card claims it). */
export function goddessByRole(content: GoddessContent, role: GoddessRole): GoddessDef | undefined {
  return content.goddesses.find((g) => g.roles?.includes(role));
}

/** Who writes the epilogue record of an ending: the writer named for it, else the default. */
export function recordWriterFor(content: GoddessContent, ending: string): GoddessDef | undefined {
  const writers = content.goddesses.filter((g) => g.record);
  return (
    writers.find((g) => g.record?.endings?.includes(ending)) ??
    writers.find((g) => !g.record?.endings)
  );
}

const ROLES: readonly GoddessRole[] = ['fate_director', 'offering'];
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Load-time checks of the roster (goddess pack validator). */
export function rosterProblems(
  content: GoddessContent & {
    items?: readonly { id: string }[];
    evidence?: readonly { id: string }[];
  },
): string[] {
  const out: string[] = [];
  const gs = content.goddesses;
  if (gs.length === 0) return out;
  for (const g of gs) {
    if (!ID_PATTERN.test(g.id))
      out.push(`goddess ${g.id}: id must be lower case a to z, 0 to 9, _`);
    if (g.reach !== undefined && g.reach !== 'faith' && g.reach !== 'player')
      out.push(`goddess ${g.id}: unknown reach ${String(g.reach)}`);
    for (const r of g.roles ?? [])
      if (!ROLES.includes(r)) out.push(`goddess ${g.id}: unknown role ${r}`);
    if (g.token && content.items && !content.items.some((i) => i.id === g.token))
      out.push(`goddess ${g.id}: unknown token item ${g.token}`);
    for (const [label, cond] of [
      ['actsWhen', g.actsWhen],
      ['appearsWhen', g.appearsWhen],
    ] as const) {
      const bad = cond ? checkCondition(cond) : null;
      if (bad) out.push(`goddess ${g.id} ${label}: ${bad}`);
    }
    const seat = g.courtSeat;
    if (!seat) continue;
    const conds = [
      seat.crisis.bonus,
      ...(seat.thicken ?? []).map((t) => t.when),
      ...seat.verdict.voluntary.any.flatMap((c) => ('when' in c ? [c.when] : [])),
    ];
    for (const c of conds) {
      const bad = checkCondition(c);
      if (bad) out.push(`goddess ${g.id} courtSeat: ${bad}`);
    }
    if (seat.verdict.judgedAt < 1 || seat.verdict.judgedAt > 3)
      out.push(`goddess ${g.id} courtSeat: judgedAt must be 1 to 3`);
    for (const c of seat.verdict.voluntary.any) {
      if ('shown' in c && content.evidence)
        for (const e of c.shown)
          if (!content.evidence.some((x) => x.id === e))
            out.push(`goddess ${g.id} courtSeat: unknown evidence ${e}`);
    }
  }
  const seats = seatedGoddesses(content);
  const seatNos = new Set(seats.map((g) => g.courtSeat.seat));
  if (seatNos.size !== seats.length) out.push('goddesses: two goddesses share a court seat');
  const crises = new Set(seats.map((g) => g.courtSeat.crisis.id));
  if (crises.size !== seats.length) out.push('goddesses: two seats share a review crisis');
  for (const role of ROLES) {
    const n = gs.filter((g) => g.roles?.includes(role)).length;
    if (n !== 1) out.push(`goddesses: role ${role} held by ${n} goddesses (want exactly 1)`);
  }
  const offering = goddessByRole(content, 'offering');
  if (offering && !offering.token)
    out.push(`goddess ${offering.id}: the offering role needs a token`);
  const defaults = gs.filter((g) => g.record && !g.record.endings).length;
  if (defaults !== 1) out.push(`goddesses: ${defaults} default record writers (want exactly 1)`);
  return out;
}
