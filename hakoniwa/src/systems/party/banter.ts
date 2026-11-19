// Party chatter (builtin_ai.md 11.3; companions_and_party.md 10.1): the short plays the
// companions act out among themselves. The exchanges are data (data/party/banter.json);
// their lines are the slot `party.<id>` of the line pack ln_party (PK-M1-29), so this
// module emits the line's content key and never holds a sentence (D-077).
//
// Six kinds start one: `enter` the first time the player stands in a named place, `event`
// when its condition first holds (or its event key fires), `travel` on the road, `campfire`
// at a camp at night, `relation` when two companions' relation crosses a threshold, `act`
// at the turn of an act. The cast must all be in the party and each of them over the bond
// floor (8.2: no chatter before 相识). The pacing of 10.1 holds: one exchange per ten real
// minutes exploring, one per 30 game minutes of travel, one to three a campfire night; one
// speaker at a time, and a line every `lineSec` seconds. Combat, a talk and a scene cut an
// exchange short: it is raised again later and, cut twice, is void (11.3). A caused kind
// (enter, event, act, relation) that comes at a busy or paced moment is held and plays at the
// next calm one, still in its own situation (an enter exchange only in its place); travel and
// campfire exchanges are never held, they are raised again on the next look. The selection
// (priority x freshness x relevance) is pure (./banter_select.ts) and draws no random numbers.

import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { liveUnit } from '../combat';
import { conditionHolds } from '../quests/effects';
import { mapById, playerEntity } from '../world';
import {
  type BanterCandidate,
  banterLineKey,
  banterReplyKey,
  freshness,
  pacingAllows,
  pickBanter,
} from './banter_select';
import { addBond } from './bond';
import { banterConfig } from './config';
import { atBed, atCampFire, isNight, nightOf, roleOf } from './places';
import { fieldMembers, stateOf } from './roster';
import type { BanterDef, BanterKind, BanterState, Member } from './types';
import { partyFighting } from './wounds';

/** The line pack of the exchanges' lines (builtin_ai.md 7.2: party slots live only here). */
export const PARTY_PACK = 'ln_party';
/** A journey step counts while the player has moved at least this far since the last look. */
const JOURNEY_STEP = 0.2;

export function banterState(ctx: SystemContext): BanterState {
  const slice = ctx.world.slices.party;
  slice.banter ??= { played: {} };
  return slice.banter;
}

export function banterDefs(ctx: SystemContext): BanterDef[] {
  return ctx.content.partyBanter ?? [];
}

export function banterDef(ctx: SystemContext, id: string): BanterDef | undefined {
  return banterDefs(ctx).find((b) => b.id === id);
}

/** The lines of an exchange: the slot party.<id> of ln_party (absent: none written yet). */
function slotLines(ctx: SystemContext, id: string): readonly unknown[] | undefined {
  const pack = ctx.content.linePacks?.find((p) => p.id === PARTY_PACK);
  const lines = pack?.slots[`party.${id}`];
  return Array.isArray(lines) ? lines : undefined;
}

/** Whether ln_party holds every line and reply label of an exchange. */
export function linesReady(ctx: SystemContext, def: BanterDef): boolean {
  const lines = slotLines(ctx, def.id);
  return !!lines && lines.length >= def.speakers.length + (def.replies?.length ?? 0);
}

/** The text key of one entry of the slot (a line written as an object keeps its text in zh). */
function entryKey(ctx: SystemContext, def: BanterDef, index: number, key: string): string {
  const entry = slotLines(ctx, def.id)?.[index];
  return entry !== null && typeof entry === 'object' ? `${key}.zh` : key;
}

/**
 * The persons of the party an exchange may cast: with the party (not waiting at a gate), on
 * their feet and on the player's map, with their bond.
 */
function castOf(ctx: SystemContext): Map<string, Member> {
  const out = new Map<string, Member>();
  const pe = playerEntity(ctx.world);
  if (!pe) return out;
  for (const m of fieldMembers(ctx.world)) {
    if (m.pet || stateOf(m) !== 'party') continue;
    const pair = liveUnit(ctx.world, m.entityId);
    if (!pair || pair[1].mapId !== pe.mapId) continue;
    out.set(m.id, m);
  }
  return out;
}

/** Whether every person of the cast is in the party and over the bond floor (8.2). */
function castReady(ctx: SystemContext, def: BanterDef, cast: Map<string, Member>): boolean {
  const min = banterConfig(ctx.content).minBond;
  return def.cast.every((id) => {
    const m = cast.get(id);
    // a temporary companion has no bond of its own: being here is enough
    return !!m && (m.temp !== undefined || m.bond >= min);
  });
}

/** The places the player stands in: the map and every location around the player. */
export function placesHere(ctx: SystemContext): string[] {
  const p = playerEntity(ctx.world);
  const map = p ? mapById(ctx.content, p.mapId) : undefined;
  if (!p || !map) return [];
  const out = [p.mapId];
  for (const l of map.locations) {
    if (p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h) out.push(l.id);
  }
  return out;
}

/** Whether the player travels a journey map (the region map stands in until PK-M1-17). */
function onJourney(ctx: SystemContext): boolean {
  const p = playerEntity(ctx.world);
  const role = p ? roleOf(ctx, p.mapId) : undefined;
  return !!role && banterConfig(ctx.content).journeyRoles.includes(role);
}

/** Whether an exchange's condition holds now. */
function holdsNow(ctx: SystemContext, def: BanterDef): boolean {
  return !def.when || conditionHolds(ctx, def.when);
}

/** The candidates of a kind, with the facts the selection reads. */
function candidates(
  ctx: SystemContext,
  kind: BanterKind,
  cause: string | undefined,
  here: readonly string[],
): BanterCandidate[] {
  const st = banterState(ctx);
  const cast = castOf(ctx);
  // a cause naming an exchange of the kind (its condition rose) raises that exchange alone
  const named = cause !== undefined && banterDef(ctx, cause)?.kind === kind;
  const out: BanterCandidate[] = [];
  for (const def of banterDefs(ctx)) {
    if (def.kind !== kind) continue;
    if (named && def.id !== cause) continue;
    // an enter exchange belongs to its place: the player stands in it, and it is the place
    // just entered when a place is the cause
    if (kind === 'enter' && (def.at === undefined || !here.includes(def.at))) continue;
    if (kind === 'enter' && cause !== undefined && !named && def.at !== cause) continue;
    // an event exchange answers its own cause: its event key, or its condition coming true
    if (kind === 'event' && !named && def.on !== cause) continue;
    // a relation exchange answers a change between two of its own cast
    if (kind === 'relation' && cause?.includes(':')) {
      const [a, b] = cause.split(':');
      if (!def.cast.includes(a as string) || !def.cast.includes(b as string)) continue;
    }
    const last = st.played[def.id];
    out.push({
      def,
      facts: {
        castReady: castReady(ctx, def, cast) && linesReady(ctx, def),
        holds: holdsNow(ctx, def),
        daysSince: last === undefined ? null : Math.floor((ctx.tick - last) / TICKS_PER_GAME_DAY),
        caused: cause !== undefined && (def.on === cause || def.at === cause || def.id === cause),
      },
    });
  }
  return out;
}

/** Whether anything holds the stage: a fight, a talk, a scene, an exchange already running. */
export function stageBusy(ctx: SystemContext): boolean {
  const st = banterState(ctx);
  return !!st.running || !!st.talk || !!st.scene || partyFighting(ctx);
}

/** Start an exchange now (the first line goes out at once). */
function start(ctx: SystemContext, def: BanterDef, kind: BanterKind): void {
  const st = banterState(ctx);
  st.running = { id: def.id, line: 0, next: ctx.tick, kind };
  if (st.pending?.[def.id] !== undefined) delete st.pending[def.id];
  if (kind === 'travel') st.journey = 0;
  else if (kind === 'campfire') {
    const night = nightOf(ctx.tick);
    st.camp = st.camp?.night === night ? { night, count: st.camp.count + 1 } : { night, count: 1 };
  } else st.lastAt = ctx.tick;
  sayNext(ctx);
}

/** Try to start an exchange of a kind; returns whether one began. */
export function raise(
  ctx: SystemContext,
  kind: BanterKind,
  cause?: string,
  here: readonly string[] = placesHere(ctx),
): boolean {
  const cfg = banterConfig(ctx.content);
  const st = banterState(ctx);
  if (stageBusy(ctx) || !pacingAllows(kind, st, ctx.tick, nightOf(ctx.tick), cfg)) {
    // a cause that came at a busy moment waits for the next calm one (11.3)
    hold(ctx, kind, cause, here);
    return false;
  }
  const id = pickBanter(candidates(ctx, kind, cause, here), st, cfg);
  const def = id ? banterDef(ctx, id) : undefined;
  if (!def) {
    // the cause came while nobody could say it (the cast, the bond, the lines): keep it
    hold(ctx, kind, cause, here);
    return false;
  }
  start(ctx, def, kind);
  return true;
}

/** The kinds that answer a cause; only they are held for a calmer moment. */
const CAUSED: ReadonlySet<BanterKind> = new Set(['enter', 'event', 'act', 'relation']);

/**
 * Keep the caused exchanges for later (they play from resumePending): those whose condition
 * holds, not void, not heard (once-only) and fresh (a repeatable one heard lately is not).
 */
function hold(
  ctx: SystemContext,
  kind: BanterKind,
  cause: string | undefined,
  here: readonly string[],
): void {
  if (!CAUSED.has(kind)) return;
  const st = banterState(ctx);
  const perDay = banterConfig(ctx.content).freshPerDay;
  for (const c of candidates(ctx, kind, cause, here)) {
    if (!c.facts.holds || st.void?.includes(c.def.id)) continue;
    if (freshness(c.def, c.facts.daysSince, perDay) <= 0) continue;
    if (st.pending?.[c.def.id] !== undefined) continue;
    st.pending = { ...st.pending, [c.def.id]: ctx.tick };
  }
}

/** Whether the moment still fits an exchange's own situation (a held one, a retry, 11.3). */
function fitsKind(ctx: SystemContext, def: BanterDef, here: readonly string[]): boolean {
  if (def.kind === 'travel') return onJourney(ctx) && !partyFighting(ctx);
  if (def.kind === 'campfire') return atCampFire(ctx) && isNight(ctx.tick);
  if (def.kind === 'enter') return def.at !== undefined && here.includes(def.at);
  return true;
}

/** Say the line that is due, and close the exchange after its last one. */
function sayNext(ctx: SystemContext): void {
  const st = banterState(ctx);
  const run = st.running;
  const def = run ? banterDef(ctx, run.id) : undefined;
  if (!run || !def) {
    if (run) delete st.running;
    return;
  }
  const cfg = banterConfig(ctx.content);
  const speaker = def.speakers[run.line];
  if (speaker === undefined) {
    // every line said: the reply point waits for the player, else the exchange is done
    if (def.replies && def.replies.length > 0 && run.replyUntil === undefined) {
      run.replyUntil = ctx.tick + cfg.replySec * 20;
      ctx.emit('party.banter_ask', {
        exchangeId: def.id,
        options: def.replies.map((_r, i) =>
          tr(entryKey(ctx, def, def.speakers.length + i, banterReplyKey(def, i))),
        ),
        until: run.replyUntil,
      });
      return;
    }
    finish(ctx, 'done');
    return;
  }
  const m = ctx.world.slices.party.members[speaker];
  // a deleted line is a null hole (builtin_ai.md 7.1): skipped, the rest keep their places
  if (slotLines(ctx, def.id)?.[run.line] !== null) {
    ctx.emit('party.banter', {
      exchangeId: def.id,
      kind: run.kind,
      line: run.line,
      speakerId: m?.entityId || speaker,
      text: tr(entryKey(ctx, def, run.line, banterLineKey(def.id, run.line))),
    });
  }
  run.line += 1;
  run.next = ctx.tick + cfg.lineSec * 20;
}

/** End the exchange playing now. */
function finish(ctx: SystemContext, outcome: 'done' | 'cut' | 'void', reply?: number): void {
  const st = banterState(ctx);
  const run = st.running;
  if (!run) return;
  delete st.running;
  if (outcome === 'done') {
    st.played[run.id] = ctx.tick;
    // the cuts counted toward this hearing are spent: a later one starts fresh (11.3)
    if (st.cut?.[run.id] !== undefined) delete st.cut[run.id];
  }
  ctx.emit('party.banter_end', {
    exchangeId: run.id,
    kind: run.kind,
    outcome,
    ...(reply !== undefined ? { reply } : {}),
  });
}

/** Something broke in (combat, a talk, a scene): the exchange is cut, twice and it is void. */
export function cutBanter(ctx: SystemContext): void {
  const st = banterState(ctx);
  const run = st.running;
  if (!run) return;
  const cuts = (st.cut?.[run.id] ?? 0) + 1;
  st.cut = { ...st.cut, [run.id]: cuts };
  if (cuts >= 2) {
    st.void = [...(st.void ?? []), run.id];
    finish(ctx, 'void');
    return;
  }
  const kind = run.kind;
  finish(ctx, 'cut');
  // it comes again at the next suitable moment, from the first line (11.3)
  st.pending = { ...st.pending, [run.id]: ctx.tick };
  if (kind === 'campfire' && st.camp) st.camp.count = Math.max(0, st.camp.count - 1);
}

/** The player answered the reply point (8.4: the bond of the option). */
export function answerBanter(
  ctx: SystemContext,
  exchangeId: string,
  option: number,
): string | null {
  const st = banterState(ctx);
  const run = st.running;
  if (!run || run.id !== exchangeId || run.replyUntil === undefined) return 'no_banter';
  const def = banterDef(ctx, exchangeId);
  const reply = def?.replies?.[option];
  if (!def || !reply) return 'no_target';
  const bond = reply.bond ?? {};
  for (const id of Object.keys(bond).sort()) {
    const m = ctx.world.slices.party.members[id];
    if (m && !m.pet) addBond(ctx, m, bond[id] as number, `banter:${exchangeId}`);
  }
  finish(ctx, 'done', option);
  return null;
}

/**
 * A pending exchange gets its calm moment. Among those that fit the moment (their own
 * situation, the pacing, the cast, the lines, the condition, the freshness), an exchange cut
 * short comes first (11.3: it comes again from the first line); then the selection rule of
 * 11.3 (priority x freshness, every held one counts as caused), ties by id. A retry skips the
 * exploring and travel gaps but never the campfire's count a night.
 */
function resumePending(ctx: SystemContext, here: readonly string[]): boolean {
  const st = banterState(ctx);
  const pending = st.pending;
  if (!pending) return false;
  const cfg = banterConfig(ctx.content);
  const cast = castOf(ctx);
  const night = nightOf(ctx.tick);
  const ready: BanterCandidate[] = [];
  for (const id of Object.keys(pending).sort()) {
    const def = banterDef(ctx, id);
    if (!def || st.void?.includes(id) || (def.once !== false && st.played[id] !== undefined)) {
      delete pending[id];
      continue;
    }
    const last = st.played[id];
    const daysSince =
      last === undefined ? null : Math.floor((ctx.tick - last) / TICKS_PER_GAME_DAY);
    // a repeatable one heard again since it was held is not fresh: it waits for a new cause
    if (freshness(def, daysSince, cfg.freshPerDay) <= 0) {
      delete pending[id];
      continue;
    }
    if (!fitsKind(ctx, def, here)) continue;
    const retry = (st.cut?.[id] ?? 0) > 0;
    const paced = pacingAllows(def.kind, st, ctx.tick, night, cfg);
    if (retry ? def.kind === 'campfire' && !paced : !paced) continue;
    if (!castReady(ctx, def, cast) || !linesReady(ctx, def) || !holdsNow(ctx, def)) continue;
    ready.push({ def, facts: { castReady: true, holds: true, daysSince, caused: true } });
  }
  const retries = ready.filter((c) => (st.cut?.[c.def.id] ?? 0) > 0);
  const id = pickBanter(retries.length > 0 ? retries : ready, st, cfg);
  const def = id ? banterDef(ctx, id) : undefined;
  if (def) {
    delete pending[def.id];
    start(ctx, def, def.kind);
  }
  if (st.pending && Object.keys(st.pending).length === 0) delete st.pending;
  return !!def;
}

/** The journey and campfire clocks, and the first visit of a place. */
function tickPlaces(ctx: SystemContext): { here: string[]; entered: string[]; moved: boolean } {
  const st = banterState(ctx);
  const here = placesHere(ctx);
  const was = new Set(st.here ?? []);
  const entered = here.filter((id) => !was.has(id));
  st.here = here;
  let moved = false;
  const p = playerEntity(ctx.world);
  if (p) {
    const prev = st.pos;
    moved =
      !!prev && prev[0] === p.mapId && Math.hypot(p.x - prev[1], p.y - prev[2]) >= JOURNEY_STEP;
    st.pos = [p.mapId, p.x, p.y];
    // the look runs once a game second (20 ticks): a moving second is 20 ticks of journey
    if (moved && onJourney(ctx) && !partyFighting(ctx)) st.journey = (st.journey ?? 0) + 20;
  }
  return { here, entered, moved };
}

/** Whether a companion stands with the player, alive and on its feet (metric 12). */
function withCompanions(ctx: SystemContext): boolean {
  const pe = playerEntity(ctx.world);
  if (!pe) return false;
  return fieldMembers(ctx.world).some((m) => {
    if (m.pet) return false;
    const pair = liveUnit(ctx.world, m.entityId);
    return !!pair && pair[1].mapId === pe.mapId;
  });
}

/** Once a game second: the running exchange, the clocks, and the kinds that fire by time. */
export function tickBanter(ctx: SystemContext): void {
  const st = banterState(ctx);
  const run = st.running;
  if (run) {
    if (st.talk || st.scene || partyFighting(ctx)) {
      cutBanter(ctx);
    } else if (run.replyUntil !== undefined) {
      if (ctx.tick >= run.replyUntil) finish(ctx, 'done');
    } else if (ctx.tick >= run.next) {
      sayNext(ctx);
    }
  }
  const { here, entered, moved } = tickPlaces(ctx);
  // a condition coming true is noticed on every look, busy or not: an event that passes
  // during a fight still has its word afterwards (11.3)
  raiseRisen(ctx, here);
  // a place first stood in is kept too: an arrival in a fight plays once the fight is over
  for (const id of entered) hold(ctx, 'enter', id, here);
  if (!withCompanions(ctx)) return;
  const camp = atCampFire(ctx) && isNight(ctx.tick);
  // the metric's denominator: the road actually walked and the time at the fire (14.2)
  const road = moved && onJourney(ctx) && !partyFighting(ctx);
  if (camp || road) st.exposure = (st.exposure ?? 0) + 20;
  // nothing new starts while an exchange runs, or a fight, a talk or a scene holds the stage
  if (stageBusy(ctx)) return;
  if (resumePending(ctx, here)) return;
  if (camp) raise(ctx, 'campfire', undefined, here);
  else if (onJourney(ctx)) raise(ctx, 'travel', undefined, here);
}

/** Kinds raised by their condition turning true when they name no event of their own. */
const RISING: ReadonlySet<BanterKind> = new Set(['event', 'act', 'relation']);

/**
 * Event, act and relation exchanges with no event key: their condition turning true is the
 * cause (11.3 事件之后, 幕次). A once-only exchange whose condition already holds at the first
 * look counts too (a save from before the exchange existed): it has not been heard yet.
 */
function raiseRisen(ctx: SystemContext, here: readonly string[]): void {
  const st = banterState(ctx);
  const held = st.held ?? {};
  for (const def of banterDefs(ctx)) {
    if (!RISING.has(def.kind) || def.on !== undefined || !def.when) continue;
    const now = holdsNow(ctx, def);
    const before = held[def.id];
    held[def.id] = now;
    if (!now || before === true) continue;
    if (before === undefined && def.once === false) continue;
    // every risen exchange is kept; resumePending plays them one at a time (11.3 selection)
    hold(ctx, def.kind, def.id, here);
  }
  st.held = held;
}

/**
 * A camp talk before sleep (companions_and_party.md 8.4 营地谈话: +1 bond, one companion a
 * night): the player sits with one companion at a camp or an inn at night. Returns a
 * refusal code or null. The topics themselves are the dialogue system's (15).
 */
export function campTalk(ctx: SystemContext, companionId: string): string | null {
  const m = ctx.world.slices.party.members[companionId];
  if (!m || m.pet || m.temp) return 'no_companion';
  const pe = playerEntity(ctx.world);
  const pair = liveUnit(ctx.world, m.entityId);
  if (!pe || !pair || pair[1].mapId !== pe.mapId) return 'not_in_party';
  if (partyFighting(ctx)) return 'in_combat';
  // before sleep (8.4 "入睡前"): at night, at a camp or a bed
  if (!isNight(ctx.tick) || !(atCampFire(ctx) || atBed(ctx))) return 'not_night';
  // 营地谈话 opens at 同行 (8.2)
  if (m.bond < banterConfig(ctx.content).campTalkBond) return 'bond_low';
  const st = banterState(ctx);
  const night = nightOf(ctx.tick);
  if (st.talked?.night === night) return 'talked';
  st.talked = { night, companionId };
  addBond(ctx, m, 1, 'camp_talk');
  ctx.emit('party.camp_talk', { companionId, night });
  return null;
}

/** Two companions' relation crossed a threshold (11.3 `relation`). */
export function onRelation(ctx: SystemContext, a: string, b: string): void {
  const members = ctx.world.slices.party.members;
  if (!members[a] || !members[b]) return;
  raise(ctx, 'relation', `${a}:${b}`);
}

/** The talk and scene gates (the stage is held while either is on). */
export function setBanterGate(ctx: SystemContext, gate: 'talk' | 'scene', on: boolean): void {
  const st = banterState(ctx);
  if (on) st[gate] = true;
  else delete st[gate];
  if (on) cutBanter(ctx);
}
