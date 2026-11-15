// Belief profiles and the cognitive state machine (reputation_and_cognition.md 2, 3.4
// to 3.7): evidence accumulates into a cognitive value; deeds beyond the observer's
// ceiling are explained away by the class's explanation order until refuting evidence
// knocks the explanations down; acceptance needs the threshold, a direct experience
// and two independent sources ("支持中需两次独立经历").

import { hashSeed, Rng } from '../../core/rng';
import type { SystemContext } from '../../core/system';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../core/time';
import { personaById } from '../npc/personas';
import { adjustRelation, relationOf } from '../npc/relations';
import type { PersonaCard } from '../npc/types';
import {
  ceilingOf,
  classParams,
  explanationDef,
  isAccepted,
  priorOf,
  STATE_NAMES,
  stateRank,
  subjectName,
  thresholdFor,
} from './params';
import type {
  BeliefProfile,
  BeliefState,
  CognitionSlice,
  EvidenceKind,
  ExplanationId,
} from './types';

const MAX_EVIDENCE = 16;
const MAX_LOG = 12;
const MAX_SUBJECTS = 6;
/** doubt to explaining at about a third of the threshold (3.5; 0.3 keeps the 3.8 example: 5 of 16) */
export const DOUBT_FRACTION = 0.3;

export interface EvidenceInput {
  kind: EvidenceKind;
  weight: number;
}

export interface ObserveInput {
  /** stable key of the observed event (the per-event random draw derives from it) */
  key: string;
  /** independence key: evidence with the same key comes from one source */
  ind: string;
  /** apparent level implied by what was observed (0 = no deed, only evidence) */
  apparent: number;
  feat?: string;
  kinds: EvidenceInput[];
  /** eyewitness or personal benefit */
  direct: boolean;
  /** situational weight multipliers for explanations */
  bonus?: Partial<Record<ExplanationId, number>>;
  /** explanation carried by a rumor version (contagion) */
  suggested?: ExplanationId | 'real' | null;
  /** short Chinese description for the reasoning log */
  what: string;
}

export interface ObserveOutcome {
  from: BeliefState;
  to: BeliefState;
  adopted: ExplanationId[];
  refuted: ExplanationId[];
  over: number;
  /** the deed was taken at face value (no overreach) */
  credited: boolean;
  belief: BeliefProfile;
}

export function beliefOf(
  slice: CognitionSlice,
  observer: string,
  subject: string,
): BeliefProfile | undefined {
  return slice.beliefs[observer]?.[subject];
}

export function newBelief(prior: number, subject: string): BeliefProfile {
  return {
    subject,
    state: 'unaware',
    publicState: 'unaware',
    value: 0,
    threshold: 0,
    prior,
    est: prior,
    explanation: null,
    stick: 0,
    refuted: [],
    identity: subject === 'player' ? '刚登记的 F 级新人' : '',
    credence: 0.5,
    lastFeat: null,
    evidence: [],
    log: [],
    lastTick: 0,
    lastFeatTick: 0,
  };
}

/** Get or create the belief; returns undefined when the observer already tracks too many subjects. */
export function ensureBelief(
  ctx: SystemContext,
  observer: string,
  subject: string,
): BeliefProfile | undefined {
  const slice = ctx.world.slices.cognition;
  let book = slice.beliefs[observer];
  if (!book) {
    book = {};
    slice.beliefs[observer] = book;
  }
  let b = book[subject];
  if (!b) {
    if (subject !== 'player' && Object.keys(book).length >= MAX_SUBJECTS) return undefined;
    b = newBelief(priorOf(ctx.world, ctx.content, subject), subject);
    book[subject] = b;
  }
  return b;
}

function pushLog(ctx: SystemContext, b: BeliefProfile, text: string): void {
  const day = calendarAt(ctx.tick).dayIndex;
  b.log.push(`第 ${day} 日：${text}`);
  if (b.log.length > MAX_LOG) b.log.splice(0, b.log.length - MAX_LOG);
}

function independenceDecay(b: BeliefProfile, ind: string): number {
  const n = b.evidence.filter((e) => e.ind === ind && e.weight > 0).length;
  return n === 0 ? 1 : n === 1 ? 0.5 : 0.25;
}

function labelOf(ctx: SystemContext, e: ExplanationId): string {
  return explanationDef(ctx.content, e)?.label ?? e;
}

const KIND_NAMES: Partial<Record<EvidenceKind, string>> = {
  seen: '亲眼所见',
  seen_close: '近处亲见',
  repeat: '又一次同样的事',
  repeat_close: '当面又做了一次',
  physical: '物证',
  multi: '好几个人说法一致',
  benefit: '切身的好处',
  authority: '权威背书',
};

/** Explanations the current evidence already rules out. */
function refutedNow(
  ctx: SystemContext,
  e: ExplanationId,
  kinds: Set<EvidenceKind>,
): EvidenceKind | null {
  const def = explanationDef(ctx.content, e);
  if (!def) return null;
  for (const k of def.refutedBy) if (kinds.has(k)) return k;
  return null;
}

/** Fork after acceptance (3.5): hostile, exploit, worship or plain acceptance. */
function forkOf(ctx: SystemContext, p: PersonaCard, b: BeliefProfile): BeliefState {
  const rel = relationOf(ctx.world.slices.npc, p.id, b.subject);
  if (rel.like <= -30) return 'hostile';
  if (p.class === 'noble' || p.class === 'merchant' || p.class === 'royal') return 'exploit';
  const lowly = ['peasant', 'child', 'remnant', 'adventurer', 'beastkin'].includes(p.class);
  const helped = b.evidence.some((e) => e.kind === 'benefit');
  if ((lowly && (p.oldOrder ?? 0.3) < 0.5) || helped || rel.like >= 40) return 'worship';
  return 'accepted';
}

function identityFor(ctx: SystemContext, b: BeliefProfile): string {
  switch (b.state) {
    case 'worship':
      return '深藏不露的大人物';
    case 'hostile':
      return '怪物';
    case 'exploit':
      return '可用的怪人';
    case 'accepted':
      return '真正的强者';
    case 'wavering':
      return '看不透的人';
    case 'explaining':
      return b.explanation
        ? (explanationDef(ctx.content, b.explanation)?.identity ?? '怪人')
        : '怪人';
    default:
      return b.identity || '怪人';
  }
}

/**
 * Apply one observation (a witnessed deed, a believed rumor, an appraisal, a scripted
 * proof) to an observer's belief about a subject.
 */
export function observe(
  ctx: SystemContext,
  observer: string,
  subject: string,
  input: ObserveInput,
): ObserveOutcome | null {
  const p = personaById(ctx.content, observer);
  if (!p || observer === subject) return null;
  const b = ensureBelief(ctx, observer, subject);
  if (!b) return null;
  const cls = classParams(ctx.content, p.class);
  const from = b.state;
  const adopted: ExplanationId[] = [];
  const refuted: ExplanationId[] = [];
  const kinds = new Set<EvidenceKind>(input.kinds.map((k) => k.kind));
  const who = subjectName(ctx.content, subject);

  // 1. book the evidence (independence decay; class modifiers)
  const decay = independenceDecay(b, input.ind);
  for (const k of input.kinds) {
    let w = k.weight;
    if (k.kind === 'rumor' && cls.ignoreRumor) w = 0;
    if (k.kind === 'appraisal') w *= cls.instrumentTrust ?? 1;
    if (w > 0) w *= decay;
    w = Math.round(w * 100) / 100;
    b.evidence.push({
      src: input.key,
      kind: k.kind,
      weight: w,
      ind: input.ind,
      tick: ctx.tick,
      apparent: input.apparent || undefined,
      feat: input.feat,
    });
    b.value = Math.max(-10, Math.round((b.value + w) * 100) / 100);
  }
  if (b.evidence.length > MAX_EVIDENCE) b.evidence.splice(0, b.evidence.length - MAX_EVIDENCE);
  b.lastTick = ctx.tick;
  if (input.feat) b.lastFeatTick = ctx.tick;
  if (kinds.has('appraisal') && p.class === 'clergy' && !b.refuted.includes('miracle')) {
    b.refuted.push('miracle');
    pushLog(ctx, b, '光照不出这个人：光不会赐福给没有记载的人');
  }

  // 2. no deed, or a deed within common sense: take it at face value
  const F = input.apparent;
  const ceiling = ceilingOf(ctx.content, p);
  const over = F > 0 ? Math.max(F - ceiling, F - b.prior - 10) : 0;
  let credited = false;
  if (F > 0 && over <= 0) {
    credited = true;
    const before = b.est;
    b.est = Math.max(b.est, F);
    b.prior = Math.max(b.prior, F);
    b.lastFeat = { kind: input.feat ?? 'rumor', apparent: F, explanation: 'real', tick: ctx.tick };
    pushLog(ctx, b, `${input.what}，这没什么稀奇`);
    if (b.est > before && subject === 'player')
      adjustRelation(
        ctx,
        observer,
        subject,
        { awe: Math.min(15, (b.est - before) * 0.4) },
        input.what,
      );
  } else if (
    F > 0 ||
    input.kinds.some((k) => k.kind === 'rumor') ||
    (b.state !== 'unaware' && input.kinds.some((k) => k.weight > 0))
  ) {
    // 3. overreaching deed (or a rumor about one): threshold and the state machine
    const rel = relationOf(ctx.world.slices.npc, observer, subject);
    if (over > 0) b.threshold = Math.max(b.threshold, thresholdFor(ctx.content, p, over, rel));
    if (b.threshold === 0) b.threshold = thresholdFor(ctx.content, p, 0, rel);
    if (b.state === 'unaware') {
      b.state = 'doubt';
      pushLog(ctx, b, `${input.what}：不可能`);
    }
    if (
      cls.direct &&
      (input.direct || !cls.ignoreRumor) &&
      over > 0 &&
      (input.direct || b.value >= b.threshold * DOUBT_FRACTION)
    ) {
      b.state = forkOf(ctx, p, b);
      b.explanation = null;
      pushLog(ctx, b, `${input.what}。看见了就信`);
    }
    const rng = new Rng({ s: hashSeed(ctx.world.meta.seed, `${observer}:${input.key}`) });
    for (let guard = 0; guard < 8; guard++) {
      if (b.state === 'doubt' && b.value >= b.threshold * DOUBT_FRACTION) {
        const next = chooseExplanation(ctx, p, b, rng, input);
        if (next) {
          b.state = 'explaining';
          b.explanation = next;
          b.stick = 0;
          adopted.push(next);
          pushLog(ctx, b, `${input.what}，用"${labelOf(ctx, next)}"解释`);
        } else {
          b.state = 'wavering';
          pushLog(ctx, b, '怎么解释都说不通');
        }
        continue;
      }
      if (b.state === 'explaining' && b.explanation) {
        const by = refutedNow(ctx, b.explanation, kinds);
        if (by) {
          refuted.push(b.explanation);
          b.refuted.push(b.explanation);
          pushLog(ctx, b, `"${labelOf(ctx, b.explanation)}"被${KIND_NAMES[by] ?? by}推翻`);
          const next = chooseExplanation(ctx, p, b, rng, input);
          if (next) {
            b.explanation = next;
            b.stick = 0;
            adopted.push(next);
            pushLog(ctx, b, `改用"${labelOf(ctx, next)}"解释`);
          } else {
            b.explanation = null;
            b.state = 'wavering';
            pushLog(ctx, b, '也许……不，不可能');
          }
          continue;
        }
        if (F > 0) b.stick = Math.round((b.stick + 0.3) * 100) / 100;
        break;
      }
      if (b.state === 'wavering') {
        const direct = b.evidence.some(
          (e) => e.kind === 'seen' || e.kind === 'seen_close' || e.kind === 'benefit',
        );
        const sources = new Set(b.evidence.filter((e) => e.weight > 0).map((e) => e.ind)).size;
        if (b.value >= b.threshold && direct && sources >= 2) {
          const rebound = (p.oldOrder ?? 0) >= 0.6 && rng.chance((p.oldOrder ?? 0) * 0.8);
          b.state = rebound ? 'hostile' : forkOf(ctx, p, b);
          pushLog(ctx, b, rebound ? '被逼着承认，反倒更恨了' : '证据够了：他确实很强');
        }
        break;
      }
      break;
    }
    // estimated strength follows the stance (3.4: explanations discount the deed)
    const before = b.est;
    if (F > 0) {
      if (isAccepted(b.state)) b.est = Math.max(b.est, F);
      else if (b.state === 'wavering') b.est = Math.max(b.est, F * 0.8);
      else if (b.state === 'explaining' && b.explanation)
        b.est = Math.max(b.est, F * (explanationDef(ctx.content, b.explanation)?.discount ?? 0.6));
      if (isAccepted(b.state)) b.prior = Math.max(b.prior, b.est);
      b.lastFeat = {
        kind: input.feat ?? 'rumor',
        apparent: F,
        explanation: isAccepted(b.state) ? 'real' : b.explanation,
        tick: ctx.tick,
      };
    }
    if (b.est > before && subject === 'player')
      adjustRelation(
        ctx,
        observer,
        subject,
        { awe: Math.min(25, (b.est - before) * 0.5) },
        input.what,
      );
  }
  if (isAccepted(b.state) && !isAccepted(from) && subject === 'player')
    adjustRelation(ctx, observer, subject, { trust: 3 }, `承认了${who}的本事`);

  b.identity = identityFor(ctx, b);
  const trust = relationOf(ctx.world.slices.npc, observer, subject).trust / 100;
  b.credence =
    Math.round(
      Math.min(1, trust * (isAccepted(b.state) ? 1.2 : b.state === 'wavering' ? 1 : 0.7)) * 100,
    ) / 100;
  if (b.state !== from) {
    // the public stance follows at once; the daily pass applies social pressure
    b.publicState = b.state;
    ctx.emit('cognition.belief_changed', {
      observerId: observer,
      subjectId: subject,
      from,
      to: b.state,
      explanation: b.explanation,
      reason: `${STATE_NAMES[from]}到${STATE_NAMES[b.state]}：${input.what}`,
    });
  }
  return { from, to: b.state, adopted, refuted, over, credited, belief: b };
}

/** Pick an explanation: the first two still standing, weighted 3:1, with situational bonuses. */
function chooseExplanation(
  ctx: SystemContext,
  p: PersonaCard,
  b: BeliefProfile,
  rng: Rng,
  input: ObserveInput,
): ExplanationId | null {
  const order = classParams(ctx.content, p.class).order;
  // explanations already knocked down stay down; a fresh one may be adopted and knocked
  // down in the same breath (the 3.8 chain: '你其实是哪家的少爷吧？' then the pickaxe)
  const standing = order.filter((e) => !b.refuted.includes(e));
  if (standing.length === 0) return null;
  const sug = input.suggested;
  if (sug && sug !== 'real' && standing.includes(sug)) return sug;
  if (standing.length === 1) return standing[0] as ExplanationId;
  const [a, c] = standing as [ExplanationId, ExplanationId];
  const wa = 3 * (input.bonus?.[a] ?? 1);
  const wc = 1 * (input.bonus?.[c] ?? 1);
  return rng.weighted([
    { w: wa, v: a },
    { w: wc, v: c },
  ]);
}

/** Daily regression (3.5): 14 days without deeds drop one level unless the deed was repeated. */
export function regressBeliefs(ctx: SystemContext): void {
  const slice = ctx.world.slices.cognition;
  const span = 14 * TICKS_PER_GAME_DAY;
  for (const observer of Object.keys(slice.beliefs).sort()) {
    const book = slice.beliefs[observer] ?? {};
    for (const subject of Object.keys(book).sort()) {
      const b = book[subject] as BeliefProfile;
      if (b.lastFeatTick === 0 || ctx.tick - b.lastFeatTick < span) continue;
      if (b.evidence.some((e) => e.kind === 'repeat')) continue;
      const from = b.state;
      if (isAccepted(b.state)) b.state = 'wavering';
      else if (b.state === 'wavering') b.state = 'explaining';
      else if (b.state === 'explaining') b.state = 'doubt';
      else continue;
      b.lastFeatTick = ctx.tick;
      pushLog(ctx, b, '那次可能真是运气');
      ctx.emit('cognition.belief_changed', {
        observerId: observer,
        subjectId: subject,
        from,
        to: b.state,
        explanation: b.explanation,
        reason: '很久没见到新的事迹，看法回落',
      });
    }
  }
}

/** Public stance lags the private state under social pressure (3.6). */
export function updatePublicStances(ctx: SystemContext): void {
  const slice = ctx.world.slices.cognition;
  const npcs = ctx.world.slices.npc.npcs;
  const byMapSubject = new Map<string, BeliefState[]>();
  for (const observer of Object.keys(slice.beliefs).sort()) {
    const mapId = npcs[observer]?.mapId ?? '';
    for (const [subject, b] of Object.entries(slice.beliefs[observer] ?? {})) {
      const key = `${mapId}|${subject}`;
      const list = byMapSubject.get(key) ?? [];
      list.push(b.state);
      byMapSubject.set(key, list);
    }
  }
  for (const observer of Object.keys(slice.beliefs).sort()) {
    const p = personaById(ctx.content, observer);
    const mapId = npcs[observer]?.mapId ?? '';
    for (const [subject, b] of Object.entries(slice.beliefs[observer] ?? {})) {
      const states = byMapSubject.get(`${mapId}|${subject}`) ?? [b.state];
      const counts = new Map<BeliefState, number>();
      for (const s of states) counts.set(s, (counts.get(s) ?? 0) + 1);
      let major: BeliefState = b.state;
      let best = 0;
      for (const [s, n] of [...counts.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
        if (n > best) {
          best = n;
          major = s;
        }
      }
      b.publicState =
        (p?.pressure ?? 0.5) >= 0.5 && stateRank(b.state) > stateRank(major) ? major : b.state;
    }
  }
}
