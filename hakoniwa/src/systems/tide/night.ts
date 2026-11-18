// The tide night at run time (act1_borderstone.md 8.2 to 8.7): a written night begins when
// its start flag turns true at dusk (the act clock's night rule), walks its phases by the
// game hour (dusk, nightfall, before midnight, midnight), waits at the boss phase until the
// player brings the boss down, lets the surge break on the weakest face, and settles at
// dawn. Each phase picks the actors' rows from the action table, starts its waves through
// the flag channel combat.wave.<id>, and settles its lines through the pure rules of
// rules.ts; rolls come from the named stream `tide.fates` (and `tide.escalation`), in table
// order. Everything is a function of the world, so a save resumes the night where it was.

import { contentRef } from '../../core/content_key';
import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { TICKS_PER_GAME_HOUR, TICKS_PER_GAME_MINUTE } from '../../core/time';
import { addMemory } from '../npc/memory';
import { adjustRelation } from '../npc/relations';
import { applyEffects, conditionHolds } from '../quests/effects';
import { entitiesNear, mapById, playerEntity } from '../world';
import type { MapDef } from '../world/types';
import {
  activeLines,
  childrenShelter,
  creditVersion,
  type Holds,
  type PhaseInput,
  type Picked,
  pickAll,
  population,
  postedWitnesses,
  prosperityAfter,
  type Roll,
  settlePhase,
  sharedLine,
  surgeOutcome,
  survivalBand,
  trustChanges,
} from './rules';
import { NEVER, newNight, readTide, tideSlice } from './slice';
import type { ActorRowDef, CreditVersion, NightState, PhaseDef, TideNightDef } from './types';

/** The stream of the line fates (8.6 rule 3). */
export const FATES_STREAM = 'tide.fates';
/** The stream of a dispute's escalation casualty (act1_borderstone.md 4.4). */
export const ESCALATION_STREAM = 'tide.escalation';

const H = TICKS_PER_GAME_HOUR;

const truthy = (v: FlagValue | undefined) =>
  v !== undefined && v !== null && v !== false && v !== 0 && v !== '';
const num = (v: FlagValue | undefined) => (typeof v === 'number' ? v : undefined);

/** The written nights of the content. */
export function nightDefs(content: { tideNights?: TideNightDef[] }): TideNightDef[] {
  return content.tideNights ?? [];
}

export function nightDef(
  content: { tideNights?: TideNightDef[] },
  id: string,
): TideNightDef | undefined {
  return nightDefs(content).find((d) => d.id === id);
}

/** The night now running, with its record; undefined between nights. */
export function runningNight(ctx: {
  world: SystemContext['world'];
  content: SystemContext['content'];
}): { def: TideNightDef; st: NightState } | undefined {
  const st = readTide(ctx.world)?.night;
  if (!st || st.ended) return undefined;
  const def = nightDef(ctx.content, st.id);
  return def ? { def, st } : undefined;
}

const holdsOf =
  (ctx: SystemContext): Holds =>
  (expr) =>
    conditionHolds(ctx, expr);

function isDeadOf(ctx: SystemContext, st: NightState): (npc: string) => boolean {
  return (npc) => truthy(ctx.flag(`npc.${npc}.dead`)) || st.dead.some((d) => d.npc === npc);
}

const rollOf =
  (ctx: SystemContext, stream: string): Roll =>
  (p) =>
    ctx.rng(stream).chance(p);

/** Distance from a point to a location's rectangle (0 inside). */
function rectDistance(map: MapDef, place: string, x: number, y: number): number {
  const l = map.locations.find((p) => p.id === place);
  if (!l) return Number.POSITIVE_INFINITY;
  const dx = Math.max(l.x - x, 0, x - (l.x + l.w));
  const dy = Math.max(l.y - y, 0, y - (l.y + l.h));
  return Math.hypot(dx, dy);
}

/** The picks of a phase, rebuilt from the stored row ids. */
function picksOf(def: TideNightDef, st: NightState, phase: string): Picked[] {
  const stored = st.picks[phase] ?? {};
  const out: Picked[] = [];
  for (const actor of def.actors) {
    const ids = stored[actor.id];
    if (!ids) continue;
    const rows = ids
      .map((id) => actor.rows.find((r) => r.id === id))
      .filter((r): r is ActorRowDef => !!r);
    out.push({ actor, rows });
  }
  return out;
}

function phaseInput(
  ctx: SystemContext,
  def: TideNightDef,
  st: NightState,
  phase: PhaseDef,
): PhaseInput {
  const line = st.playerLine[phase.id];
  return {
    def,
    phase,
    picks: picksOf(def, st, phase.id),
    holds: holdsOf(ctx),
    playerLine: line ? line : null,
    weakest: phase.surge ? st.weakest : undefined,
  };
}

function startWave(ctx: SystemContext, wave: string): void {
  const key = `combat.wave.${wave}`;
  // the signal starts a wave once; combat does not clear it (a request to combat)
  if (ctx.flag(key) !== 'go') ctx.setFlag(key, 'go');
}

// ---------------------------------------------------------------------------
// beginning

/** Begin the first written night whose start flag stands and that has not run. */
export function maybeBegin(ctx: SystemContext): void {
  const s = tideSlice(ctx.world);
  if (s.night && !s.night.ended) return;
  for (const def of nightDefs(ctx.content)) {
    if (s.done.includes(def.id) || !truthy(ctx.flag(def.start))) continue;
    // the night was played out another way (an older save, a scripted tide): never again
    if (truthy(ctx.flag(def.vars.cleared))) {
      s.done.push(def.id);
      continue;
    }
    const st = newNight(def.id, ctx.tick);
    s.night = st;
    startPhase(ctx, def, st, 0);
    advanceNight(ctx);
    return;
  }
}

// ---------------------------------------------------------------------------
// phases

/** Bring the running night up to now: start every phase whose hour (and condition) came. */
export function advanceNight(ctx: SystemContext): void {
  const run = runningNight(ctx);
  if (!run) return;
  const { def, st } = run;
  st.dirty = false;
  for (let guard = 0; guard < def.phases.length + 1; guard++) {
    const cur = def.phases[st.phase];
    const nxt = def.phases[st.phase + 1];
    if (!cur || !nxt) {
      closeNight(ctx, def, st);
      return;
    }
    const due = Math.max(st.start + nxt.hour * H, st.phaseTick + (nxt.minHours ?? 0) * H);
    if (ctx.tick < due) {
      st.next = due;
      return;
    }
    if (cur.until && !conditionHolds(ctx, cur.until)) {
      st.next = NEVER;
      return;
    }
    endPhase(ctx, def, st, cur);
    st.phase += 1;
    startPhase(ctx, def, st, st.phase);
    if (st.phase === def.phases.length - 1) {
      closeNight(ctx, def, st);
      return;
    }
  }
}

function startPhase(ctx: SystemContext, def: TideNightDef, st: NightState, index: number): void {
  const ph = def.phases[index] as PhaseDef;
  const holds = holdsOf(ctx);
  st.phaseTick = ctx.tick;
  ctx.setFlag(def.vars.stage, ph.stage);
  if (index === 0) ctx.setFlag(def.vars.started, true);
  // the dusk's decisions are in by the first settled phase: the disputes settled at dusk
  if (ph.settle && !st.escalated) escalate(ctx, def, st, ph.id);
  const isDead = isDeadOf(ctx, st);
  // the people act in the phases that settle a line, bring the boss or raise the mob; at dusk
  // (the disputes are still settling) and at dawn nobody picks a row of the table
  const acts = !!(ph.settle || ph.seek || ph.surge || ph.witness || ph.mob);
  const picks = acts ? pickAll(def, holds, isDead, st.chosen) : [];
  if (acts) {
    st.picks[ph.id] = {};
    for (const p of picks)
      (st.picks[ph.id] as Record<string, string[]>)[p.actor.id] = p.rows.map((r) => r.id);
  }
  if (ph.playerLines) {
    st.samples[ph.id] = {};
    st.skipped[ph.id] = 0;
  }
  if (ph.seek) seekTarget(ctx, def, st, ph, picks);
  if (ph.surge) startSurge(ctx, def, st, ph);
  // the surge's numbers are fixed the moment it breaks loose: it settles at once
  if (ph.surge && ph.settle) settlePhaseOf(ctx, def, st, ph);
  for (const w of ph.waves ?? []) if (!w.when || holds(w.when)) startWave(ctx, w.wave);
  const rows = picks.flatMap((p) => p.rows);
  // the mob and the child who goes after the prisoner alone belong to the mob's beat (8.4)
  if (ph.mob && rows.some((r) => r.mob)) ctx.emit('tide.mob', { night: def.id, phase: ph.id });
  if (ph.mob && rows.some((r) => r.rescueAttempt))
    ctx.emit('tide.rescue_attempt', { night: def.id, phase: ph.id });
  ctx.emit('tide.phase', { night: def.id, phase: ph.id, stage: ph.stage });
}

function endPhase(ctx: SystemContext, def: TideNightDef, st: NightState, ph: PhaseDef): void {
  if (ph.mob) settleMob(ctx, def, st, ph);
  if (ph.playerLines) st.playerLine[ph.id] = playerLineOf(ctx, def, st, ph);
  if (ph.settle && !ph.surge) settlePhaseOf(ctx, def, st, ph);
  const holds = holdsOf(ctx);
  const isDead = isDeadOf(ctx, st);
  for (const p of picksOf(def, st, ph.id)) {
    for (const r of p.rows) {
      const rule = r.fate?.diesWhen;
      if (!rule || rule.phase !== ph.id || !holds(rule.when)) continue;
      for (const npc of p.actor.npcs ?? [])
        if (!isDead(npc)) kill(ctx, def, st, npc, ph.id, 'boss');
    }
  }
  if (ph.witness) countWitnesses(ctx, def, st, ph);
}

// ---------------------------------------------------------------------------
// the player's line (8.3)

/** Faces, and the fronts someone holds in the phase. */
function linesHeld(def: TideNightDef, st: NightState, ph: PhaseDef, ctx: SystemContext) {
  const input = phaseInput(ctx, def, st, ph);
  return activeLines({ ...input, playerLine: null });
}

/** The line the player stands on now (the nearest held line within the post radius), or ''. */
function lineUnderPlayer(
  ctx: SystemContext,
  def: TideNightDef,
  st: NightState,
  ph: PhaseDef,
): string {
  const p = playerEntity(ctx.world);
  const map = mapById(ctx.content, def.mapId);
  if (!p || !map || p.mapId !== def.mapId || !p.alive) return '';
  let at = '';
  let best = Number.POSITIVE_INFINITY;
  for (const l of linesHeld(def, st, ph, ctx)) {
    const d = rectDistance(map, l.location, p.x, p.y);
    if (d <= def.settle.postRadius && d < best) {
      best = d;
      at = l.id;
    }
  }
  return at;
}

/**
 * Where the player stood, weighted by game time: a played tick counts where the player is
 * (sampled once a game minute, carrying the ticks since the last sample). An hour-coarse
 * skip step is kept apart (`skipped`, for the record): the line rule reads the played time
 * only, and a phase with no played time falls back to the post named at dusk.
 */
export function samplePlayer(ctx: SystemContext, skipped = 0): void {
  const run = runningNight(ctx);
  if (!run) return;
  const { def, st } = run;
  const ph = def.phases[st.phase];
  if (!ph?.playerLines) return;
  if (skipped > 0) {
    st.skipped[ph.id] = (st.skipped[ph.id] ?? 0) + skipped;
    st.sampledAt = ctx.tick;
    return;
  }
  const bag = st.samples[ph.id] ?? {};
  st.samples[ph.id] = bag;
  const weight = Math.max(1, ctx.tick - Math.max(st.sampledAt ?? 0, st.phaseTick));
  st.sampledAt = ctx.tick;
  const at = lineUnderPlayer(ctx, def, st, ph);
  bag[at] = (bag[at] ?? 0) + weight;
}

/**
 * The player's line of a phase: the line where the player spent at least half of the
 * played time of the phase; when the whole phase passed in a time skip, the post chosen at
 * dusk (the dusk scene writes it) if the player is on the map; none when the player left
 * the post for the mob (8.4 Bertha).
 */
function playerLineOf(ctx: SystemContext, def: TideNightDef, st: NightState, ph: PhaseDef): string {
  if (ph.mob && def.vars.leftPost && truthy(ctx.flag(def.vars.leftPost))) return '';
  const bag = st.samples[ph.id] ?? {};
  const total = Object.values(bag).reduce((s, n) => s + n, 0);
  const held = linesHeld(def, st, ph, ctx).map((l) => l.id);
  if (total === 0) {
    const post = def.vars.post ? ctx.flag(def.vars.post) : undefined;
    const p = playerEntity(ctx.world);
    const here = !!p && p.mapId === def.mapId;
    return here && typeof post === 'string' && held.includes(post) ? post : '';
  }
  let best = '';
  let most = 0;
  for (const id of held) {
    const n = bag[id] ?? 0;
    if (n > most) {
      best = id;
      most = n;
    }
  }
  return best && most * 2 >= total ? best : '';
}

// ---------------------------------------------------------------------------
// settling

function kill(
  ctx: SystemContext,
  def: TideNightDef,
  st: NightState,
  npc: string,
  phase: string,
  cause: string,
): void {
  st.dead.push({ npc, phase, cause });
  if (!truthy(ctx.flag(`npc.${npc}.dead`))) ctx.setFlag(`npc.${npc}.dead`, true);
  ctx.emit('tide.fate', { night: def.id, npc, fate: 'dead', phase, cause });
}

/** A dispute's escalation casualty, settled once the night's first wave comes (4.4). */
function escalate(ctx: SystemContext, def: TideNightDef, st: NightState, phase: string): void {
  st.escalated = true;
  const e = def.escalation;
  if (!e || !conditionHolds(ctx, e.when)) return;
  const isDead = isDeadOf(ctx, st);
  if (!isDead(e.npc) && rollOf(ctx, ESCALATION_STREAM)(e.chance)) {
    kill(ctx, def, st, e.npc, phase, 'escalation');
    return;
  }
  st.extraDeaths += e.civilians;
}

function settleLines(ctx: SystemContext, def: TideNightDef, st: NightState, ph: PhaseDef): void {
  const input = phaseInput(ctx, def, st, ph);
  const isDead = isDeadOf(ctx, st);
  const res = settlePhase(input, rollOf(ctx, FATES_STREAM), isDead, st.buildings, !!st.struck);
  st.results.push({ phase: ph.id, lines: res.lines });
  for (const l of res.lines) {
    for (const b of l.damaged) {
      st.buildings.push(b);
      ctx.emit('tide.damaged', { night: def.id, line: l.line, place: b, phase: ph.id });
    }
  }
  for (const f of res.fates) {
    if (f.fate === 'dead') kill(ctx, def, st, f.npc, ph.id, f.cause);
    else {
      if (!st.injured.some((i) => i.npc === f.npc)) st.injured.push({ npc: f.npc, phase: ph.id });
      // badly hurt (8.6 rule 3): the registry's injury level of the person
      ctx.setFlag(`npc.${f.npc}.injury`, def.settle.injuryValue);
      ctx.emit('tide.fate', {
        night: def.id,
        npc: f.npc,
        fate: 'injured',
        phase: ph.id,
        cause: f.cause,
      });
    }
  }
  ctx.emit('tide.settled', {
    night: def.id,
    phase: ph.id,
    lines: res.lines.map((l) => ({
      line: l.line,
      defence: l.defence,
      pressure: l.pressure,
      gap: l.gap,
      deaths: l.deaths,
    })),
  });
}

/** The boss arrives: it goes for the player in range, else for the door-marked children. */
function seekTarget(
  ctx: SystemContext,
  def: TideNightDef,
  st: NightState,
  ph: PhaseDef,
  picks: readonly Picked[],
): void {
  const seek = ph.seek;
  if (!seek) return;
  const map = mapById(ctx.content, def.mapId);
  const p = playerEntity(ctx.world);
  const near =
    !!map &&
    !!p &&
    p.alive &&
    p.mapId === def.mapId &&
    rectDistance(map, seek.place, p.x, p.y) <= seek.range;
  const target = near ? seek.near : seek.far;
  st.boss = target;
  ctx.setFlag(def.vars.colossusTarget, target);
  if (!near) exposeChildren(ctx, def, picks);
}

/** The children's marks show when the boss comes for them in a crowd (8.6). */
function exposeChildren(ctx: SystemContext, def: TideNightDef, picks: readonly Picked[]): void {
  const at = childrenShelter(picks);
  if (!at || !def.crowdShelters?.includes(at) || truthy(ctx.flag(def.vars.exposed))) return;
  // kept where the player can see them (A1-M11 children_safe), they are not in the crowd
  if (def.exposedUnless && conditionHolds(ctx, def.exposedUnless)) return;
  ctx.setFlag(def.vars.exposed, true);
}

/** The boss turned on a marked child (combat.door_seek): the same exposure rule. */
export function onDoorSeek(ctx: SystemContext, reason: string): void {
  const run = runningNight(ctx);
  if (!run || reason !== 'mark') return;
  const ph = run.def.phases[run.st.phase];
  if (!ph?.seek) return;
  exposeChildren(ctx, run.def, picksOf(run.def, run.st, ph.id));
}

/** The surge breaks loose (8.2 phase 4): its face, the bell call, the striker (8.5). */
function startSurge(ctx: SystemContext, def: TideNightDef, st: NightState, ph: PhaseDef): void {
  const input = phaseInput(ctx, def, st, ph);
  const striker = def.striker;
  const hasStriker = !!striker && !isDeadOf(ctx, st)(striker.npc);
  const out = surgeOutcome(input, hasStriker);
  st.weakest = out.weakest;
  st.gapWeakest = out.gap;
  st.struck = out.struck;
  if (out.weakest) ctx.setFlag(def.vars.weakest, out.weakest);
  ctx.setFlag(def.vars.gapWeakest, out.gap);
  // a striker who died earlier in the night neither strikes nor watches
  if (striker && hasStriker) {
    ctx.setFlag(striker.revealed, out.struck);
    if (out.struck) {
      ctx.setFlag(striker.strike, true);
      ctx.emit('tide.strike', { night: def.id, line: out.weakest ?? '', gap: out.gap });
    }
  }
  const wave = def.lines.find((l) => l.id === out.weakest)?.surgeWave;
  if (wave && !out.struck) startWave(ctx, wave);
}

/** How the mob ends (8.4 Bertha): the scene's outcome, else the first that stops it. */
function settleMob(ctx: SystemContext, def: TideNightDef, st: NightState, ph: PhaseDef): void {
  const mob = def.mob;
  if (!mob) return;
  const rows = picksOf(def, st, ph.id).flatMap((p) => p.rows);
  if (!rows.some((r) => r.mob)) return;
  const written = ctx.flag(mob.var);
  let outcome = typeof written === 'string' ? written : '';
  if (!outcome) {
    const hit = mob.outcomes.find((o) => !o.when || conditionHolds(ctx, o.when));
    outcome = hit?.value ?? '';
    if (outcome) ctx.setFlag(mob.var, outcome);
  }
  st.mob = outcome;
  if (outcome && mob.effects?.[outcome]) applyEffects(ctx, mob.effects[outcome]);
}

/** The named people who saw the boss fall (8.7): posted there, sheltered there, or close by. */
function countWitnesses(ctx: SystemContext, def: TideNightDef, st: NightState, ph: PhaseDef): void {
  const isDead = isDeadOf(ctx, st);
  const seen = new Set(postedWitnesses(def, picksOf(def, st, ph.id), ph.id));
  const p = playerEntity(ctx.world);
  const people = new Set([
    ...(ctx.content.npcs ?? []).map((n) => n.id),
    ...((ctx.content as { companions?: { id: string }[] }).companions ?? []).map((c) => c.id),
  ]);
  if (p && p.mapId === def.mapId) {
    for (const e of entitiesNear(ctx.world, p.mapId, p.x, p.y, def.credit.radius)) {
      if (e.ref && e.kind !== 'monster' && people.has(e.ref)) seen.add(e.ref);
    }
  }
  st.witnesses = [...seen].filter((n) => !isDead(n)).sort();
  st.witnessTrust = {};
  for (const n of st.witnesses) st.witnessTrust[n] = num(ctx.flag(`trust.${n}`)) ?? 0;
}

/**
 * Who drove the tide back (8.7; the registry's compute tide_attribution): the witnesses'
 * trust as it stood when the colossus fell, the striker's cut, and the conditions now.
 */
export function creditOf(
  ctx: SystemContext,
  def: TideNightDef,
  st: NightState,
): CreditVersion | undefined {
  const trust = st.witnessTrust ?? {};
  return creditVersion(
    def,
    st.witnesses,
    (n) => trust[n] ?? num(ctx.flag(`trust.${n}`)) ?? 0,
    !!st.struck,
    holdsOf(ctx),
  );
}

// ---------------------------------------------------------------------------
// dawn

/** Unique picked rows over the night, with their actor (each actor's row counted once). */
function nightRows(def: TideNightDef, st: NightState): { actor: string; row: ActorRowDef }[] {
  const seen = new Set<string>();
  const out: { actor: string; row: ActorRowDef }[] = [];
  for (const ph of def.phases) {
    for (const p of picksOf(def, st, ph.id)) {
      for (const r of p.rows) {
        const k = `${p.actor.id}/${r.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ actor: p.actor.id, row: r });
      }
    }
  }
  return out;
}

/** The children's fates at dawn (7.2): dead, healthy, or a deadline that runs on. */
function settleChildren(ctx: SystemContext, def: TideNightDef): string[] {
  const pending: string[] = [];
  for (const c of def.children ?? []) {
    if (ctx.flag(c.var) !== undefined) continue;
    if (conditionHolds(ctx, c.dies)) {
      ctx.setFlag(c.var, c.dead);
      continue;
    }
    if (c.healthy && conditionHolds(ctx, c.healthy.when)) {
      ctx.setFlag(c.var, c.healthy.value);
      continue;
    }
    if (c.diesLater || c.healthy) pending.push(c.var);
  }
  return pending;
}

/**
 * After the night, once a game hour: a child whose deadline ran out after the tide dies
 * (7.2: Toby enters stage three after an early tide; Lin falls ill after it and goes
 * untreated); a child whose window of falling ill passed is written healthy. A cure written
 * meanwhile, or a new act, ends the watch.
 */
export function settleLateChildren(ctx: SystemContext): void {
  const s = readTide(ctx.world);
  if (!s || s.pendingChildren.length === 0) return;
  const def = s.night ? nightDef(ctx.content, s.night.id) : undefined;
  // the deadline belongs to the night's act: a new act drops it
  if (!def || ctx.flag('act') !== def.act) {
    s.pendingChildren = [];
    return;
  }
  const left: string[] = [];
  for (const v of s.pendingChildren) {
    const c = def.children?.find((x) => x.var === v);
    if (!c || ctx.flag(v) !== undefined) continue;
    if (c.diesLater && conditionHolds(ctx, c.diesLater)) ctx.setFlag(v, c.dead);
    else if (c.healthy && conditionHolds(ctx, c.healthy.when)) ctx.setFlag(v, c.healthy.value);
    else left.push(v);
  }
  s.pendingChildren = left;
}

/** Settle a phase's lines; after the night's last settled phase, the night's numbers. */
function settlePhaseOf(ctx: SystemContext, def: TideNightDef, st: NightState, ph: PhaseDef): void {
  settleLines(ctx, def, st, ph);
  const index = def.phases.indexOf(ph);
  if (!def.phases.slice(index + 1).some((p) => p.settle)) settleNight(ctx, def, st);
}

/**
 * The night's numbers (8.6, 8.7): written once the last settled phase (the surge) is
 * settled, so the scenes of the colossus's fall and the dawn read them at once; dawn only
 * closes the night.
 */
function settleNight(ctx: SystemContext, def: TideNightDef, st: NightState): void {
  if (st.summary) return;
  const holds = holdsOf(ctx);
  const isDead = isDeadOf(ctx, st);
  const s = tideSlice(ctx.world);
  const lineDeaths = st.results.reduce((n, r) => n + r.lines.reduce((m, l) => m + l.deaths, 0), 0);
  const civilians = Math.round(lineDeaths + st.extraDeaths);
  const named = st.dead.map((d) => d.npc);
  const survival = survivalBand(def, civilians);
  // about 800 less the night's dead, from what the town counts now (8.6)
  const pop = population(def, civilians + named.length, num(ctx.flag(def.vars.population)));
  const rows = nightRows(def, st);
  const prosperity = prosperityAfter(
    def,
    num(ctx.flag(def.vars.prosperity)),
    st.buildings.length,
    rows.map((r) => r.row),
    holds,
  );
  ctx.setFlag(def.vars.survival, survival);
  ctx.setFlag(def.vars.population, pop);
  ctx.setFlag(def.vars.prosperity, prosperity);
  ctx.setFlag(def.vars.otherDead, named.filter((n) => !def.settle.ownLines.includes(n)).length);
  // the credit (8.7), on the witnesses' trust at the fight (before the night's own changes)
  const credit = creditOf(ctx, def, st);
  if (credit) ctx.setFlag(def.vars.credit, credit.id);
  // trust (8.6)
  const shared = def.phases
    .filter((ph) => ph.settle && ph.playerLines)
    .flatMap((ph) => sharedLine(phaseInput(ctx, def, st, ph)));
  // the people's minds live in the NPC system; a world without it (a lean test) has none
  const minds = !!(ctx.world.slices as { npc?: unknown }).npc;
  for (const t of minds ? trustChanges(def, shared, holds, isDead) : [])
    adjustRelation(ctx, t.npc, 'player', { trust: t.amount }, tr(`sys.tide.reason.${t.reason}`));
  // the children (7.2) and where they are now
  s.pendingChildren = settleChildren(ctx, def);
  if (ctx.flag(def.vars.childrenAt) === undefined) {
    const at = def.childrenAt?.find((c) => !c.when || holds(c.when));
    if (at) ctx.setFlag(def.vars.childrenAt, at.value);
  }
  // the striker's drink (8.5)
  const ally = def.striker?.ally;
  if (st.struck && ally && holds(ally.when)) ctx.setFlag(ally.flag, true);
  // what each one did, remembered (builtin_ai.md 5.8: the collective node's result)
  const remembered = new Map<string, number>();
  for (const { actor, row } of rows) {
    const a = def.actors.find((x) => x.id === actor);
    for (const npc of minds ? (a?.npcs ?? []) : []) {
      if (isDead(npc) || (remembered.get(npc) ?? 0) >= 2) continue;
      remembered.set(npc, (remembered.get(npc) ?? 0) + 1);
      addMemory(ctx, npc, {
        text: contentRef('tideNights', def.id, `actors.${actor}.rows.${row.id}.label`),
        src: 'self',
        imp: 0.6,
        tag: 'tide',
      });
    }
  }
  const losses = [...new Set(rows.flatMap((r) => (r.row.loss ? [r.row.loss] : [])))].sort();
  // a shut-out front's people hold the night against the town (8.6: the slope, -30)
  const grievances: { group: string; amount: number }[] = [];
  const g = def.settle.grievance;
  if (g && st.results.some((r) => r.lines.some((l) => l.line === g.front))) {
    grievances.push({ group: g.group, amount: g.amount });
    ctx.emit('tide.grievance', { night: def.id, group: g.group, amount: g.amount });
  }
  st.summary = {
    civilians,
    named,
    injured: st.injured.map((i) => i.npc),
    buildings: [...st.buildings],
    survival,
    population: pop,
    prosperity,
    credit: credit?.id ?? '',
    tellers: credit?.tellers ?? [],
    losses,
    grievances,
  };
}

/** Dawn: the night ends; the clear flag is its last write (8.2 phase 5). */
function closeNight(ctx: SystemContext, def: TideNightDef, st: NightState): void {
  if (st.ended) return;
  settleNight(ctx, def, st);
  const s = tideSlice(ctx.world);
  const sum = st.summary;
  st.ended = true;
  st.next = NEVER;
  if (!s.done.includes(def.id)) s.done.push(def.id);
  ctx.emit('tide.ended', {
    night: def.id,
    civilians: sum?.civilians ?? 0,
    dead: sum?.named ?? [],
    survival: sum?.survival ?? '',
    credit: sum?.credit ?? '',
    tellers: sum?.tellers ?? [],
  });
  // last: the story (quests, companions, records) reads every other result when it turns
  ctx.setFlag(def.vars.cleared, true);
}

/**
 * The night was ended from outside (its clear flag written by someone else): settle what
 * the phase reached and finish without the waves still to come.
 */
export function endEarly(ctx: SystemContext): void {
  const run = runningNight(ctx);
  if (!run || !truthy(ctx.flag(run.def.vars.cleared))) return;
  const { def, st } = run;
  const ph = def.phases[st.phase];
  if (ph) endPhase(ctx, def, st, ph);
  closeNight(ctx, def, st);
}

/** One step of the running night at a tick (or a time-skip step): due phases, samples. */
export function tickNight(ctx: SystemContext): void {
  const run = runningNight(ctx);
  if (!run) return;
  if (truthy(ctx.flag(run.def.vars.cleared))) {
    endEarly(ctx);
    return;
  }
  if (ctx.tick % TICKS_PER_GAME_MINUTE === 0) samplePlayer(ctx);
  if (run.st.dirty || ctx.tick >= run.st.next) advanceNight(ctx);
}

/** One hour-coarse skip step of the running night: time away from the lines, then due phases. */
export function skipNight(ctx: SystemContext, from: number, to: number): void {
  const run = runningNight(ctx);
  if (!run) return;
  if (truthy(ctx.flag(run.def.vars.cleared))) {
    endEarly(ctx);
    return;
  }
  samplePlayer(ctx, Math.max(1, to - from));
  if (run.st.dirty || ctx.tick >= run.st.next) advanceNight(ctx);
}
