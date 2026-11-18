// Scripted divine acts (DivineBeat; catalog_goddess_interventions.md 4.1, builtin_ai.md 8.3):
// the written moments a goddess must (or may) bring about in an act. A beat opens on a flag,
// on a kernel event (the first use of the coin), on act weeks, on the days before an act-clock
// night (the tide), or on a dispute stage. While open, its action gets the +5 of an open beat
// in her dawn score; without a model the executor brings it about with the written text from
// the window's midpoint (spread evenly when it lands several times), trying again each hour
// until the act goes through, and a must beat still lands at the window's end. Prologue beats
// are scripted by the prologue scenes (PK-M1-27): this module only observes their flags and
// enters them in the miracle ledger. A coincidence beat is the director's: the director
// reads `dueCoincidence` and lands the beat's menu item (its rule row 3).

import { contentKey } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { actClockState, actWeekStartTick, nightCandidates } from '../quests/act_clock';
import { currentActId } from '../quests/act_order';
import { actDef } from '../quests/acts';
import type { Effect } from '../quests/effect_types';
import { applyEffects, conditionHolds } from '../quests/effects';
import { playerEntity } from '../world';
import { displayName, executeAct, type GoddessActCommand } from './actions';
import { goddessLine } from './brain/lines';
import type { OpenBeat } from './brain/planner';
import { advanceSchemes, type SchemeEvent } from './brain/schemes';
import { beatsOf } from './brain/state';
import { addSight, goddessDef, recordIntervention } from './state';
import type { BeatState } from './types';

/** How a beat opens. */
export type BeatOpen =
  | { flag: string }
  | { event: BeatEvent }
  | { weeks: [number, number] }
  | { night: string; daysBefore: number }
  | { dispute: string; escalation: number };

/** Kernel events a beat may open on. */
export const BEAT_EVENTS = ['coin_used'] as const;
export type BeatEvent = (typeof BEAT_EVENTS)[number];

/** What lands: watched (scripted elsewhere), archived, a manifestation, an act, a coincidence. */
export const BEAT_KINDS = ['observe', 'archive', 'manifest', 'act', 'coincidence'] as const;
export type BeatKind = (typeof BEAT_KINDS)[number];

/** A written divine act (catalog 4 table row). */
export interface DivineBeatDef {
  id: string;
  /** display number DB-A<act>-<nn> */
  code: string;
  /** the goddess, or * for all five at the court (the interview anchors) */
  goddess: string;
  act: string;
  must: boolean;
  open: BeatOpen;
  /** extra condition before it opens */
  when?: string;
  /** closes the window early (the tide came) */
  unless?: string;
  kind: BeatKind;
  /** act: the divine action, its map, its target person and params */
  action?: string;
  map?: string;
  target?: string;
  params?: Record<string, string | number>;
  /** act: one landing per step (its own map and text) */
  steps?: { map: string; line: string }[];
  /** act: written texts (the first is used) */
  lines?: string[];
  /** act: lands only while the player stands on its map */
  needsPlayer?: boolean;
  /** manifest: the goddess's line slot and the scene's narration */
  slot?: string;
  narration?: string;
  /** coincidence: the director's menu item, how many times, and more when a condition holds */
  item?: string;
  times?: number;
  moreTimes?: { when: string; times: number };
  /** observe: the ledger entry of the scripted act */
  record?: { action: string; power: number };
  /** observe: the scheme step it fulfils */
  schemeEvent?: SchemeEvent;
  /** observe: a dream in the player's sleep (another goddess may notice it, catalog 2.7) */
  dreamInPlayer?: boolean;
  /** archive: sight sample weight of what she files */
  sample?: number;
  /** side effects when it lands (registered flags only) */
  effects?: Effect[];
}

type BeatContent = { divineBeats?: DivineBeatDef[] };

export function beatDef(content: BeatContent, id: string): DivineBeatDef | undefined {
  return content.divineBeats?.find((b) => b.id === id);
}

/** Landings a beat wants in this world (steps, or times with the extra condition). */
export function landingsOf(ctx: SystemContext, b: DivineBeatDef): number {
  if (b.steps) return b.steps.length;
  if (b.moreTimes && conditionHolds(ctx, b.moreTimes.when)) return b.moreTimes.times;
  return b.times ?? 1;
}

/** The window [from, to) of a beat in ticks, or null when it has no fixed window. */
export function beatWindow(
  ctx: SystemContext,
  b: DivineBeatDef,
): { from: number; to: number } | null {
  const st = actClockState(ctx.world);
  if (!st || st.act !== b.act) return null;
  const o = b.open;
  if ('weeks' in o) {
    const [w0, w1] = o.weeks;
    return {
      from: actWeekStartTick(st.startDay, w0, st.startTick),
      to: actWeekStartTick(st.startDay, w1 + 1, st.startTick),
    };
  }
  if ('night' in o) {
    const target = nightTarget(ctx, b, o.night);
    if (target === null) return null;
    return { from: target - o.daysBefore * TICKS_PER_GAME_DAY, to: target };
  }
  return null;
}

/**
 * The night an act-clock night rule will fall on, as far as it is known now: the first
 * qualifying night still ahead once the rule's condition holds (act 1: the tide on the next
 * dark moon once the seal's unrest is full), else its last candidate (where it is forced).
 * Null when the rule has no night left.
 */
export function nightTarget(ctx: SystemContext, b: DivineBeatDef, ruleId: string): number | null {
  const st = actClockState(ctx.world);
  if (!st || st.act !== b.act) return null;
  const rule = actDef(ctx.content, b.act)?.clock?.nights?.find((r) => r.id === ruleId);
  const list = rule ? nightCandidates(rule, st.startDay, st.startTick) : [];
  const ahead = list.filter((c) => c.tick > ctx.tick);
  if (ahead.length === 0) return null;
  if (rule && conditionHolds(ctx, rule.when)) return (ahead[0] as { tick: number }).tick;
  return (list.at(-1) as { tick: number }).tick;
}

/** The window an open beat runs in (a night beat keeps the night it opened for). */
function windowOf(
  ctx: SystemContext,
  b: DivineBeatDef,
  st: BeatState,
): { from: number; to: number } | null {
  if (st.to !== undefined) return { from: st.from ?? st.opened, to: st.to };
  return beatWindow(ctx, b);
}

function stateOf(ctx: SystemContext, id: string): BeatState | undefined {
  return beatsOf(ctx.world.slices.goddess)[id];
}

function open(ctx: SystemContext, b: DivineBeatDef): BeatState {
  const beats = beatsOf(ctx.world.slices.goddess);
  const st: BeatState = { state: 'open', opened: ctx.tick, times: 0 };
  if ('night' in b.open) {
    // the omens run from now (or a week ahead of the night) to the night itself
    const win = beatWindow(ctx, b);
    if (win) {
      st.from = Math.max(ctx.tick, win.from);
      st.to = win.to;
    }
  }
  beats[b.id] = st;
  ctx.emit('goddess.beat', { beatId: b.id, code: b.code, state: 'open' });
  return st;
}

function finish(ctx: SystemContext, b: DivineBeatDef, st: BeatState, how: BeatState['by']) {
  st.state = 'done';
  st.at = ctx.tick;
  st.by = how;
  applyEffects(ctx, b.effects);
  ctx.emit('goddess.beat', { beatId: b.id, code: b.code, state: 'done' });
}

/** One landing of a beat; the beat is done after its last landing. */
function landed(ctx: SystemContext, b: DivineBeatDef, st: BeatState, how: BeatState['by']) {
  st.times = (st.times ?? 0) + 1;
  st.by = how;
  if (st.times >= landingsOf(ctx, b)) finish(ctx, b, st, how);
}

/** Content text of a beat's written field (narration, steps.<n>.line, lines.<n>). */
function beatText(b: DivineBeatDef, field: string): TextParam {
  return { key: contentKey('divineBeats', b.id, field) };
}

/** The person entity a beat aims at (its target person by ref). */
function personEntityId(ctx: SystemContext, person: string | undefined): string | undefined {
  if (!person) return undefined;
  const ents = ctx.world.slices.world.entities;
  for (const id of Object.keys(ents).sort()) {
    const e = ents[id];
    if (e?.ref === person && e.alive && !e.hidden) return e.id;
  }
  return undefined;
}

/** The command of a beat's next landing (the written text and target). */
function beatCommand(
  ctx: SystemContext,
  b: DivineBeatDef,
  st: BeatState,
): GoddessActCommand | null {
  const s = ctx.world.slices.goddess.goddesses[b.goddess];
  if (!s || !b.action) return null;
  const i = st.times ?? 0;
  const step = b.steps?.[i];
  const mapId = step?.map ?? b.map;
  const targetId = personEntityId(ctx, b.target);
  const targetMap = targetId ? ctx.world.slices.world.entities[targetId]?.mapId : undefined;
  const text = step ? step.line : b.lines?.[0];
  const params: GoddessActCommand['params'] = {
    ...(b.params as GoddessActCommand['params']),
    ...(mapId || targetMap ? { mapId: mapId ?? targetMap } : {}),
    ...(targetId ? { targetId } : {}),
    ...(text ? { text } : {}),
  };
  return { goddessId: b.goddess, action: b.action, revision: s.revision, params, origin: 'beat' };
}

/** Try the executor's written landing now (true when it went through). */
function runFallback(ctx: SystemContext, b: DivineBeatDef, st: BeatState): boolean {
  if (b.needsPlayer) {
    const p = playerEntity(ctx.world);
    if (!p || (b.map && p.mapId !== b.map)) return false;
  }
  const cmd = beatCommand(ctx, b, st);
  if (!cmd) return false;
  const res = executeAct(ctx, cmd, { type: 'system', system: 'goddess' });
  if (!res.ok) return false;
  landed(ctx, b, st, 'fallback');
  return true;
}

/** Days an unwindowed act beat (opened by an event or a dispute stage) stays open. */
export const UNWINDOWED_DAYS = 14;

/** When the k-th landing of a windowed beat is due (spread over the window from its middle). */
function dueTick(win: { from: number; to: number }, k: number, n: number): number {
  return Math.round(win.from + ((k + 1) / (n + 1)) * (win.to - win.from));
}

/** Land an observed or archived beat, or a manifestation, now. */
function landNow(ctx: SystemContext, b: DivineBeatDef, st: BeatState): void {
  const goddess = goddessDef(ctx.content, b.goddess);
  if (b.kind === 'archive' && goddess) addSight(ctx, ctx.content, goddess.id, b.sample ?? 0);
  if (b.kind === 'observe' && b.record && goddess) {
    recordIntervention(ctx, {
      goddess: goddess.id,
      action: b.record.action,
      mapId: playerEntity(ctx.world)?.mapId ?? '',
      power: b.record.power,
      sediment: 0,
      public: false,
      breach: false,
      note: tr('sys.goddess.note.beat', { code: b.code }),
      seen: true,
      origin: 'beat',
    });
  }
  if (b.kind === 'manifest' && goddess) {
    if (b.narration)
      ctx.emit('dialogue.line', {
        speakerId: 'narrator',
        speakerName: '',
        text: beatText(b, 'narration'),
        kind: 'narrate',
      });
    const line = (b.slot && goddessLine(ctx, goddess.id, b.slot)) || null;
    ctx.emit('dialogue.line', {
      speakerId: goddess.id,
      speakerName: displayName(ctx, goddess),
      text: line ?? tr('sys.goddess.line.manifest'),
      listenerId: ctx.world.slices.world.playerId,
      kind: 'divine',
    });
    recordIntervention(ctx, {
      goddess: goddess.id,
      action: b.action ?? '',
      mapId: playerEntity(ctx.world)?.mapId ?? '',
      power: 0,
      sediment: 0,
      public: false,
      breach: false,
      note: tr('sys.goddess.note.beat', { code: b.code }),
      seen: true,
      origin: 'beat',
    });
  }
  if (b.schemeEvent && goddess) advanceSchemes(ctx, goddess.id, { on: b.schemeEvent });
  finish(ctx, b, st, 'observed');
}

/** Whether a beat's opening holds now (flag, weeks, the night window, a dispute stage). */
function opensNow(ctx: SystemContext, b: DivineBeatDef): boolean {
  // a beat belongs to its act: a save from before the beats does not land old acts late
  if (currentActId(ctx) !== b.act) return false;
  if (b.when && !conditionHolds(ctx, b.when)) return false;
  if (b.unless && conditionHolds(ctx, b.unless)) return false;
  const o = b.open;
  if ('flag' in o) return !!ctx.flag(o.flag);
  if ('dispute' in o)
    return Number(ctx.flag(`dispute.${o.dispute}.escalation`) ?? 0) >= o.escalation;
  if ('event' in o) return false;
  const win = beatWindow(ctx, b);
  return !!win && ctx.tick >= win.from && ctx.tick < win.to;
}

/**
 * The hourly beat step (and on flag changes): open what opens, land what is observed, run
 * the written fallbacks that are due, close the windows that ran out.
 */
export function stepBeats(ctx: SystemContext): void {
  const defs = ctx.content.divineBeats ?? [];
  const act = currentActId(ctx);
  for (const b of defs) {
    let st = stateOf(ctx, b.id);
    if (st && st.state !== 'open') continue;
    if (!st) {
      if (!opensNow(ctx, b)) continue;
      st = open(ctx, b);
    }
    if (b.kind === 'observe' || b.kind === 'archive') {
      landNow(ctx, b, st);
      continue;
    }
    if (b.kind === 'manifest' || b.kind === 'coincidence') {
      // landed by the coin (beatEvent) or by the director (dueCoincidence + directorLanded)
      if (act !== b.act) closeBeat(ctx, b, st);
      continue;
    }
    const closed = (b.unless && conditionHolds(ctx, b.unless)) || act !== b.act;
    // a night beat follows its night when it turns out sooner (the tide made certain early)
    if ('night' in b.open && st.to !== undefined) {
      const target = nightTarget(ctx, b, b.open.night);
      if (target !== null && target < st.to) st.to = Math.max(ctx.tick + 1, target);
    }
    const win = windowOf(ctx, b, st);
    const n = landingsOf(ctx, b);
    // a beat opened by an event or a stage has no window: it lands at once, a day apart
    const end = win?.to ?? st.opened + UNWINDOWED_DAYS * TICKS_PER_GAME_DAY;
    if (closed || ctx.tick >= end) {
      // a must beat still lands what is left at the window's end (the executor's written
      // fallback; written acts wait for no cooldown). A window the act leaves behind is
      // closed as missed: the act-1 must windows all end inside the act (the tide omens come
      // before the tide), so only a broken act clock would leave one open.
      if (b.must && act === b.act) while (st.state === 'open' && runFallback(ctx, b, st)) {}
      if (st.state === 'open') closeBeat(ctx, b, st);
      continue;
    }
    const k = st.times ?? 0;
    const due = win ? dueTick(win, k, n) : st.opened + k * TICKS_PER_GAME_DAY;
    if (ctx.tick >= due) runFallback(ctx, b, st);
  }
}

/** Close a window: a beat that did not land every time it should is missed (catalog 17.2). */
function closeBeat(ctx: SystemContext, b: DivineBeatDef, st: BeatState): void {
  st.state = 'missed';
  st.at = ctx.tick;
  ctx.emit('goddess.beat', { beatId: b.id, code: b.code, state: st.state });
}

/** A kernel event opens and lands the beats that wait for it (the coin's first use). */
export function beatEvent(ctx: SystemContext, event: BeatEvent): number {
  let n = 0;
  for (const b of ctx.content.divineBeats ?? []) {
    const o = b.open;
    if (!('event' in o) || o.event !== event || currentActId(ctx) !== b.act) continue;
    if (stateOf(ctx, b.id)) continue;
    if (b.when && !conditionHolds(ctx, b.when)) continue;
    landNow(ctx, b, open(ctx, b));
    n++;
  }
  return n;
}

/**
 * Her own act may land an open act beat (the planner chose its action: +5 paid off) when it
 * is the beat's action on the beat's map, to the beat's person if it names one. True when it
 * landed one (the act then stands outside her act budget).
 */
export function beatActed(
  ctx: SystemContext,
  goddess: string,
  action: string,
  mapId: string,
  origin: string | undefined,
  targetId?: string,
): boolean {
  if (origin !== 'plan' && origin !== 'scheme') return false;
  let any = false;
  for (const b of ctx.content.divineBeats ?? []) {
    if (b.kind !== 'act' || b.goddess !== goddess || b.action !== action) continue;
    const st = stateOf(ctx, b.id);
    if (st?.state !== 'open') continue;
    const step = b.steps?.[st.times ?? 0];
    const want = step?.map ?? b.map;
    if (want && want !== mapId) continue;
    if (b.target && personEntityId(ctx, b.target) !== targetId) continue;
    landed(ctx, b, st, 'plan');
    any = true;
  }
  return any;
}

/** Her open act beats for the dawn planner (the +5 term). */
export function openBeatActs(ctx: SystemContext, goddess: string): OpenBeat[] {
  const out: OpenBeat[] = [];
  for (const b of ctx.content.divineBeats ?? []) {
    if (b.kind !== 'act' || b.goddess !== goddess || !b.action) continue;
    const st = stateOf(ctx, b.id);
    if (st?.state !== 'open') continue;
    const step = b.steps?.[st.times ?? 0];
    const targetId = b.target ? personEntityId(ctx, b.target) : undefined;
    // a beat aimed at a person who is not in the world now waits for the executor
    if (b.target && !targetId) continue;
    const mapId =
      step?.map ??
      b.map ??
      (targetId ? ctx.world.slices.world.entities[targetId]?.mapId : undefined);
    out.push({
      action: b.action,
      ...(mapId ? { mapId } : {}),
      ...(targetId ? { targetId } : {}),
    });
  }
  return out;
}

/** Schemes hung on an open beat (adopted directly when the window opens): none in act 1. */
export function forcedSchemes(_ctx: SystemContext, _goddess: string): string[] {
  return [];
}

/**
 * The coincidence beat due now, for the director's rule row 3 (written coincidences): the
 * beat's menu item when its next landing's time has come inside its window.
 */
export function dueCoincidence(ctx: SystemContext): { beat: string; item: string } | null {
  for (const b of ctx.content.divineBeats ?? []) {
    if (b.kind !== 'coincidence' || !b.item) continue;
    let st = stateOf(ctx, b.id);
    if (!st) {
      if (!opensNow(ctx, b)) continue;
      st = open(ctx, b);
    }
    if (st.state !== 'open') continue;
    const win = windowOf(ctx, b, st);
    if (!win) continue;
    if (ctx.tick >= win.to) {
      closeBeat(ctx, b, st);
      continue;
    }
    if (ctx.tick >= dueTick(win, st.times ?? 0, landingsOf(ctx, b)))
      return { beat: b.id, item: b.item };
  }
  return null;
}

/** The director landed a menu item: the coincidence beats waiting for it count one landing. */
export function directorLanded(ctx: SystemContext, itemId: string): void {
  for (const b of ctx.content.divineBeats ?? []) {
    if (b.kind !== 'coincidence' || b.item !== itemId) continue;
    const st = stateOf(ctx, b.id);
    if (st?.state === 'open') landed(ctx, b, st, 'plan');
  }
}

/** The beats' states for the debug panel and the acceptance tests. */
export function beatReport(ctx: {
  world: SystemContext['world'];
  content: SystemContext['content'];
}) {
  const beats = ctx.world.slices.goddess.beats ?? {};
  return (ctx.content.divineBeats ?? []).map((b) => ({
    id: b.id,
    code: b.code,
    must: b.must,
    state: (beats[b.id]?.state ?? 'waiting') as BeatState['state'] | 'waiting',
    by: beats[b.id]?.by,
    times: beats[b.id]?.times ?? 0,
  }));
}

/** Load-time problems of the beat table (catalog 17.1 rule 5). */
export function beatProblems(content: {
  divineBeats?: readonly DivineBeatDef[];
  goddesses: readonly { id: string }[];
  divineActions: readonly { id: string }[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of content.divineBeats ?? []) {
    const at = `beat ${b.id}`;
    if (!b.id.startsWith('div_beat_')) out.push(`${at}: id must start with div_beat_`);
    if (!/^DB-A\d-\d{2}$/.test(b.code)) out.push(`${at}: code must be DB-A<act>-<nn>`);
    if (seen.has(b.id)) out.push(`${at}: duplicate id`);
    seen.add(b.id);
    if (b.goddess !== '*' && !content.goddesses.some((g) => g.id === b.goddess))
      out.push(`${at}: unknown goddess ${b.goddess}`);
    if (!(BEAT_KINDS as readonly string[]).includes(b.kind)) out.push(`${at}: unknown kind`);
    if (b.kind === 'act') {
      if (!b.action || !content.divineActions.some((a) => a.id === b.action))
        out.push(`${at}: an act beat names a known action`);
      if (b.goddess === '*') out.push(`${at}: an act beat names one goddess`);
    }
    if (b.kind === 'coincidence' && !b.item) out.push(`${at}: a coincidence names a menu item`);
    if (b.kind === 'manifest' && !b.slot) out.push(`${at}: a manifestation names a line slot`);
    const o = b.open as Record<string, unknown>;
    if ('event' in o && !(BEAT_EVENTS as readonly string[]).includes(String(o.event)))
      out.push(`${at}: unknown open event ${String(o.event)}`);
    if ('weeks' in o) {
      const w = o.weeks as number[];
      if (!Array.isArray(w) || w.length !== 2 || !((w[0] as number) <= (w[1] as number)))
        out.push(`${at}: weeks are [from, to]`);
    }
  }
  return out;
}
