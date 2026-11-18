// The tide night's rules as pure functions (act1_borderstone.md 8.3 to 8.7): the NPC action
// table filtered by state, each line's defence and pressure in a phase, the gap, the weakest
// face and the bell call, the striker's cut, the civilian losses, the named fates, the
// buildings behind a line, and dawn's numbers (survival band, population, prosperity, trust,
// credit). No world, no context: the runtime (night.ts) hands in a condition check, a flag
// reader and a dice roll, so a test drives every row of the tables directly.

import type {
  ActorDef,
  ActorRowDef,
  CreditVersion,
  LineDef,
  LineResult,
  PhaseDef,
  TideNightDef,
  TidePost,
} from './types';

/** A condition check over the world's flags (quests' condition language). */
export type Holds = (expr: string) => boolean;
/** A chance roll: true with probability `p` (drawn from a named stream by the caller). */
export type Roll = (p: number) => boolean;

/** The pseudo line of a follower: the player's line in the phase. */
export const PLAYER_LINE = '@player';
/** The pseudo line of an actor at the boss. */
export const BOSS_LINE = '@boss';
/** The pseudo line of the face the surge hits. */
export const SURGE_LINE = '@surge';

const open = (r: ActorRowDef, holds: Holds) => !r.when || holds(r.when);

// ---------------------------------------------------------------------------
// the action table (8.4)

/**
 * The exclusive rows the state leaves open to an actor, in table order: the rows whose
 * condition holds, else the unconditioned "otherwise" rows. A chooser picks among these and
 * nothing else (8.4: the kernel filters out-of-bounds choices).
 */
export function legalRows(actor: ActorDef, holds: Holds): ActorRowDef[] {
  const exclusive = actor.rows.filter((r) => !r.always);
  const held = exclusive.filter((r) => !!r.when && holds(r.when));
  // the table's "其他" rows (no condition) are open only when no condition of the actor holds
  return held.length > 0 ? held : exclusive.filter((r) => !r.when);
}

/**
 * The rows an actor acts on: every open additive row, plus one exclusive row: the chooser's
 * pick when the state still allows it (the kernel filters out-of-bounds picks), otherwise
 * the first open row (the table lists the most committed choice first).
 */
export function pickRows(actor: ActorDef, holds: Holds, chosen?: string): ActorRowDef[] {
  const always = actor.rows.filter((r) => r.always && open(r, holds));
  const legal = legalRows(actor, holds);
  const pick = legal.find((r) => r.id === chosen) ?? legal[0];
  return pick ? [...always, pick] : always;
}

/** An actor's picks in a phase, in table order. */
export interface Picked {
  actor: ActorDef;
  rows: ActorRowDef[];
}

/** Everyone's picks for a phase; actors whose persons are all dead sit it out. */
export function pickAll(
  def: TideNightDef,
  holds: Holds,
  isDead: (npc: string) => boolean,
  chosen: Record<string, string> = {},
): Picked[] {
  const out: Picked[] = [];
  for (const actor of def.actors) {
    const npcs = actor.npcs ?? [];
    if (!actor.group && npcs.length > 0 && npcs.every(isDead)) continue;
    out.push({ actor, rows: pickRows(actor, holds, chosen[actor.id]) });
  }
  return out;
}

const allRows = (picks: readonly Picked[]) => picks.flatMap((p) => p.rows);

// ---------------------------------------------------------------------------
// one phase's lines (8.3)

/** Everything a phase's line numbers depend on. */
export interface PhaseInput {
  def: TideNightDef;
  phase: PhaseDef;
  picks: readonly Picked[];
  holds: Holds;
  /** the player's line in this phase, or null */
  playerLine: string | null;
  /** the face the surge hits (surge phases) */
  weakest?: string;
}

/** A row's posts in a phase (none, one, or a group's two lines). */
export function postsIn(row: ActorRowDef, phase: string): TidePost[] {
  const p = row.posts?.[phase];
  if (!p) return [];
  return Array.isArray(p) ? p : [p];
}

/** Whether a post stands on a line in a phase (a follower stands on the player's line). */
function postedOn(input: PhaseInput, post: TidePost, line: string): boolean {
  if (!post.line) return false;
  if (post.line === PLAYER_LINE) return !!input.phase.playerLines && input.playerLine === line;
  return post.line === line;
}

/** The posts on a line in a phase: who holds it and what they add. */
export function holders(
  input: PhaseInput,
  line: string,
): { actor: ActorDef; row: ActorRowDef; defence: number }[] {
  const out: { actor: ActorDef; row: ActorRowDef; defence: number }[] = [];
  for (const p of input.picks) {
    for (const row of p.rows) {
      for (const post of postsIn(row, input.phase.id)) {
        if (postedOn(input, post, line))
          out.push({ actor: p.actor, row, defence: post.defence ?? 0 });
      }
    }
  }
  return out;
}

const modApplies = (phases: string[] | undefined, phase: string) =>
  !phases || phases.includes(phase);

/** Whether a front (the shut-out slope) is held in this phase; faces are always there. */
export function lineActive(input: PhaseInput, line: LineDef): boolean {
  if (!line.front) return true;
  return holders(input, line.id).length > 0;
}

/** The lines settled in a phase: the faces and the fronts someone holds. */
export function activeLines(input: PhaseInput): LineDef[] {
  return input.def.lines.filter((l) => lineActive(input, l));
}

/**
 * A line's defence in a phase: base, the preparation sources, the actors' posts, the
 * player's +40 with the followers' +10 each on the player's line, and in the surge the bell
 * call on the face it hits (8.3, 8.4 Toma). `withPlayer: false` leaves the player's own
 * bonus out (the "saved" check of 8.6).
 */
export function lineDefence(input: PhaseInput, line: LineDef, withPlayer = true): number {
  const { def, phase } = input;
  let d = line.base;
  for (const m of def.mods ?? []) {
    if (m.line === line.id && m.defence && modApplies(m.phases, phase.id) && input.holds(m.when))
      d += m.defence;
  }
  for (const h of holders(input, line.id)) d += h.defence;
  if (withPlayer && phase.playerLines && input.playerLine === line.id) d += def.settle.playerBonus;
  if (phase.surge && input.weakest === line.id) d += callBonus(input.picks);
  return d;
}

/** A line's pressure in a phase (8.3; in the surge only the face it hits is pressed). */
export function linePressure(input: PhaseInput, line: LineDef): number {
  const { def, phase } = input;
  const rows = allRows(input.picks);
  if (phase.surge) {
    if (input.weakest !== line.id) return 0;
    let p = def.settle.surgePressure;
    for (const r of rows)
      for (const m of r.pressure ?? [])
        if (m.phase === phase.id && m.line === SURGE_LINE) p += m.amount;
    return Math.max(0, p);
  }
  let p = line.pressure?.[phase.id] ?? 0;
  for (const m of def.mods ?? []) {
    if (m.line === line.id && m.pressure && modApplies(m.phases, phase.id) && input.holds(m.when))
      p += m.pressure;
  }
  for (const r of rows)
    for (const m of r.pressure ?? []) if (m.phase === phase.id && m.line === line.id) p += m.amount;
  return Math.max(0, p);
}

/** Gap = pressure - defence, never below 0 (8.3). */
export function gapOf(pressure: number, defence: number): number {
  return Math.max(0, pressure - defence);
}

/** The bell call: defence the defenders move to the weakest face before the surge (8.4). */
export function callBonus(picks: readonly Picked[]): number {
  return allRows(picks).reduce((s, r) => s + (r.call ?? 0), 0);
}

/**
 * The face the surge hits: the face with the lowest defence when it breaks loose (8.2 phase
 * 4), before the bell call; the first in the table on a tie.
 */
export function weakestFace(input: PhaseInput): string | undefined {
  const probe: PhaseInput = { ...input, weakest: undefined, playerLine: null };
  let best: LineDef | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const l of input.def.lines) {
    if (!l.face) continue;
    const d = lineDefence(probe, l, false);
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return best?.id;
}

/** The surge on its face: the gap there after the call, and whether the striker cuts it. */
export function surgeOutcome(
  input: PhaseInput,
  hasStriker: boolean,
): { weakest: string | undefined; gap: number; struck: boolean } {
  const weakest = weakestFace(input);
  const line = input.def.lines.find((l) => l.id === weakest);
  if (!line) return { weakest, gap: 0, struck: false };
  const at: PhaseInput = { ...input, weakest, playerLine: null };
  const gap = gapOf(linePressure(at, line), lineDefence(at, line, false));
  // 8.5: she strikes when the face would lose anything; a town that holds sees her watch
  return { weakest, gap, struck: hasStriker && gap > 0 };
}

// ---------------------------------------------------------------------------
// losses (8.6)

/** The town-wide casualty factor: the picked rows' factors multiplied (Oola, Nera, Ron). */
export function casualtyFactor(picks: readonly Picked[]): number {
  return allRows(picks).reduce((f, r) => f * (r.casualty ?? 1), 1);
}

/** Whether the slope's people come in late: a delaying row, and no order to open the gate. */
export function slopeDelayed(input: PhaseInput): boolean {
  const rows = allRows(input.picks);
  if (!rows.some((r) => r.slopeDelay)) return false;
  const { settle } = input.def;
  if (settle.slopeOrdered && input.holds(settle.slopeOrdered)) return false;
  const gate = settle.slopeInside.line;
  // the player on the gate line, or someone there who orders it open, opens it at once
  if (input.phase.playerLines && input.playerLine === gate) return false;
  return !holders(input, gate).some((h) => h.row.orders);
}

/**
 * The factor on a line's civilian losses for the slope's people (8.4): the shut-out front
 * carries Oola's cover; inside the fence the slope's people are counted on the gate line in
 * the first wave, with the late entry's +50% and Oola's cover.
 */
export function slopeFactor(input: PhaseInput, line: LineDef): number {
  const rows = allRows(input.picks);
  const cover = rows.reduce((f, r) => f * (r.slopeCasualty ?? 1), 1);
  if (line.front) return cover;
  const { slopeInside, slopeDelayFactor } = input.def.settle;
  if (line.id !== slopeInside.line || input.phase.id !== slopeInside.phase) return 1;
  const frontHeld = input.def.lines.some((l) => l.front && lineActive(input, l));
  if (frontHeld) return 1;
  return cover * (slopeDelayed(input) ? slopeDelayFactor : 1);
}

/** Civilians lost on a line: gap / 10 rounded down, times the factors (8.6 rule 2). */
export function civilianDeaths(gap: number, perDeath: number, factor: number): number {
  return Math.floor(gap / perDeath) * factor;
}

/** The first building behind a line not yet damaged, when the gap reaches the threshold. */
export function damagedBuilding(
  line: LineDef,
  gap: number,
  threshold: number,
  already: readonly string[],
): string | undefined {
  if (gap < threshold) return undefined;
  return (line.behind ?? []).find((b) => !already.includes(b));
}

/** A named person's fate on a line (8.6 rule 3, with 8.4's Boro and Dris). */
export type Fate = 'dead' | 'injured' | null;

export function namedFate(
  def: TideNightDef,
  row: ActorRowDef,
  npc: string,
  phase: string,
  gap: number,
  roll: Roll,
): { fate: Fate; cause: string } {
  const f = row.fate;
  const s = def.settle;
  // a row that promises the night's survival ("生还") takes the death rolls away, not the wounds
  if (!f?.survives) {
    if (f?.diesAtGap && f.diesAtGap.phase === phase && gap >= f.diesAtGap.gap)
      return { fate: 'dead', cause: 'charge' };
    let dead = false;
    if (f?.deathRoll) dead = gap >= f.deathRoll.gap && roll(f.deathRoll.chance);
    else if (gap >= s.death.gap && !s.protected.includes(npc)) dead = roll(s.death.chance);
    if (dead) return { fate: 'dead', cause: 'line' };
  }
  if (gap >= s.injury.gap && roll(s.injury.chance)) return { fate: 'injured', cause: 'line' };
  return { fate: null, cause: '' };
}

/** A settled phase: each line's numbers, and the named fates on the lines. */
export interface PhaseSettlement {
  lines: LineResult[];
  fates: { npc: string; fate: 'dead' | 'injured'; line: string; cause: string }[];
}

/**
 * Settle one phase (8.6 rules 1 to 5). `isDead` and `damaged` carry the night so far; the
 * rolls are drawn in table order (lines, then actors, then their persons).
 */
export function settlePhase(
  input: PhaseInput,
  roll: Roll,
  isDead: (npc: string) => boolean,
  damaged: readonly string[],
  struck = false,
): PhaseSettlement {
  const { def, phase } = input;
  const s = def.settle;
  const town = casualtyFactor(input.picks);
  const lines: LineResult[] = [];
  const fates: PhaseSettlement['fates'] = [];
  const hurt = new Set<string>();
  const broken = [...damaged];
  for (const line of activeLines(input)) {
    const defence = lineDefence(input, line);
    const pressure = linePressure(input, line);
    const gap = gapOf(pressure, defence);
    const cut = !!phase.surge && struck && input.weakest === line.id;
    const player = !!phase.playerLines && input.playerLine === line.id;
    const res: LineResult = {
      line: line.id,
      defence,
      pressure,
      gap,
      deaths: 0,
      player,
      damaged: [],
    };
    if (cut) res.struck = true;
    lines.push(res);
    if (cut || gap === 0) continue;
    res.deaths = civilianDeaths(gap, s.gapPerDeath, town * slopeFactor(input, line));
    const b = damagedBuilding(line, gap, s.buildingGap, broken);
    if (b) {
      res.damaged.push(b);
      broken.push(b);
    }
    for (const h of holders(input, line.id)) {
      // a deserter or a runaway (a post that takes defenders away) does not stand there
      if (h.defence < 0) continue;
      for (const npc of h.actor.npcs ?? []) {
        if (isDead(npc) || hurt.has(npc)) continue;
        const { fate, cause } = namedFate(def, h.row, npc, phase.id, gap, roll);
        if (!fate) continue;
        hurt.add(npc);
        fates.push({ npc, fate, line: line.id, cause });
      }
    }
  }
  return { lines, fates };
}

// ---------------------------------------------------------------------------
// dawn (8.6, 8.7)

/** The survival band of the night's civilian deaths (8.6). */
export function survivalBand(def: TideNightDef, civilians: number): string {
  for (const b of def.settle.survival)
    if (b.max === undefined || civilians <= b.max) return b.value;
  return def.settle.survival[def.settle.survival.length - 1]?.value ?? '';
}

/**
 * About 800 less the dead (8.6), from the count the town has now (the base when nothing
 * wrote it), kept in the registry's range.
 */
export function population(def: TideNightDef, dead: number, current?: number): number {
  const p = def.settle.population;
  return Math.max(p.min, Math.min(p.max, (current ?? p.base) - dead));
}

/**
 * Prosperity after the night (8.6): the current value (50 when nothing wrote it), -5 per
 * damaged building, plus each picked row's change once (Nera opening her stock, the band
 * taken on, Moss gone south with the strongbox unless the cart was stopped).
 */
export function prosperityAfter(
  def: TideNightDef,
  current: number | undefined,
  buildings: number,
  rows: readonly ActorRowDef[],
  holds: Holds,
): number {
  const p = def.settle.prosperity;
  let v = (current ?? p.start) + p.perBuilding * buildings;
  for (const r of rows) {
    if (!r.prosperity) continue;
    if (r.prosperityUnless && holds(r.prosperityUnless)) continue;
    v += r.prosperity;
  }
  return Math.max(p.min, Math.min(p.max, v));
}

/** Why a person's trust moved after the night (a text key segment). */
export type TrustReason = 'same_line' | 'saved' | 'left_children';

/**
 * Trust after the night (8.6): +15 to the named persons who held the player's line, +25 to
 * those the player saved there (the gap without the player's own bonus would have reached
 * the injury threshold), and the children's people's -20 when the player left them to the
 * boss. The gain is the largest one per person; the loss adds to it.
 */
export function trustChanges(
  def: TideNightDef,
  shared: readonly { npc: string; saved: boolean }[],
  holds: Holds,
  isDead: (npc: string) => boolean,
): { npc: string; amount: number; reason: TrustReason }[] {
  const t = def.settle.trust;
  const gain = new Map<string, boolean>();
  for (const s of shared) {
    if (isDead(s.npc)) continue;
    gain.set(s.npc, (gain.get(s.npc) ?? false) || s.saved);
  }
  const out: { npc: string; amount: number; reason: TrustReason }[] = [];
  for (const [npc, saved] of [...gain].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
    out.push({ npc, amount: saved ? t.saved : t.sameLine, reason: saved ? 'saved' : 'same_line' });
  if (holds(t.leftChildren.when)) {
    for (const npc of t.leftChildren.npcs) {
      if (isDead(npc)) continue;
      out.push({ npc, amount: t.leftChildren.amount, reason: 'left_children' });
    }
  }
  return out;
}

/** The named persons on the player's line in a phase, and whether the player saved them. */
export function sharedLine(input: PhaseInput): { npc: string; saved: boolean }[] {
  const line = input.def.lines.find((l) => l.id === input.playerLine);
  if (!line || !input.phase.playerLines) return [];
  const without = gapOf(linePressure(input, line), lineDefence(input, line, false));
  const saved = without >= input.def.settle.injury.gap;
  const out: { npc: string; saved: boolean }[] = [];
  for (const h of holders(input, line.id)) {
    if (h.defence < 0) continue;
    for (const npc of h.actor.npcs ?? []) out.push({ npc, saved });
  }
  return out;
}

/**
 * Who drove the tide back (8.7, registry compute tide_attribution): the first version whose
 * test passes; the last one is the fallback.
 */
export function creditVersion(
  def: TideNightDef,
  witnesses: readonly string[],
  trustOf: (npc: string) => number,
  struck: boolean,
  holds: Holds,
): CreditVersion | undefined {
  const versions = def.credit.versions;
  for (const v of versions) {
    if (v.witnesses) {
      const n = witnesses.filter((w) => trustOf(w) >= (v.witnesses?.trust ?? 0)).length;
      if (n < v.witnesses.count) continue;
    }
    if (v.strike && !struck) continue;
    if (v.when && !holds(v.when)) continue;
    return v;
  }
  return versions[versions.length - 1];
}

/** The named persons the boss phase's posts and shelters put in sight of the fight. */
export function postedWitnesses(
  def: TideNightDef,
  picks: readonly Picked[],
  phase: string,
): string[] {
  const out = new Set<string>();
  const { lines, shelters } = def.credit;
  for (const p of picks) {
    for (const r of p.rows) {
      const posted = postsIn(r, phase).some((post) => !!post.line && lines.includes(post.line));
      const sheltered = !!r.shelter && shelters.includes(r.shelter);
      if (posted || sheltered) for (const npc of p.actor.npcs ?? []) out.add(npc);
    }
  }
  return [...out].sort();
}

/** Where the children are kept on the night: the last picked row that moves them. */
export function childrenShelter(picks: readonly Picked[]): string | undefined {
  let at: string | undefined;
  for (const r of allRows(picks)) if (r.children) at = r.children;
  return at;
}
