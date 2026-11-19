// Response strategies (builtin_ai.md 6.5, 18) that turn a classified intent into the
// NPC's line and its world consequences: R1 answers a topic of the topic graph (the topic
// the clause names, through its entity or its words; the 6.6 refusal table applies), R2 a
// reaction or built-in reply, R3 the ledger refusal of the topic or clue the clause touches,
// R4 a redirect with two suggested topics, R5 a system-entry marker another system reads
// off the result, R6 cognition evidence, R7 a relation change, R8 a notification flag, R9
// ends the session. Conditions named by `if` are evaluated here, not in data,
// because they read live NPC and relation state the content layer cannot see.

import type { SystemContext } from '../../../core/system';
import { type TextParam, tr } from '../../../core/text';
import { calendarAt } from '../../../core/time';
import { observe } from '../../cognition/belief';
import { tellPlayer } from '../../cognition/rumor';
import { guestClaim } from '../../cognition/sources';
import type { EvidenceKind } from '../../cognition/types';
import { moodOf } from '../../npc/brain/mood';
import { personaById } from '../../npc/personas';
import { adjustRelation, relationBand, relationOf } from '../../npc/relations';
import type { PersonaCard } from '../../npc/types';
import { conditionHolds } from '../../quests/effects';
import { lineText } from '../lines/fill';
import { FILL_SLOTS, suppressionDays } from '../lines/grammar';
import { type LineHistory, recordLine } from '../lines/history';
import { selectLine } from '../lines/select';
import { dayPartOf } from '../lines/trust';
import { opinion, rumorLine, smallTalk, trustBand, varsFor } from '../replies';
import { isScripted } from '../scripted';
import { speakerLayers } from '../speak';
import { inScope, isKnower } from '../topics/access';
import { allTopics, topicById, topicsAsked, topicsOfSubject } from '../topics/graph';
import { clueMisLine, clueRefusal, lockedCluesIn } from '../topics/ledger';
import {
  REFUSALS_TO_END,
  redirectFor,
  sayTopic,
  speakerView,
  type TopicSaid,
  topicTitle,
} from '../topics/talk';
import type { TopicDef } from '../topics/types';
import { onlyModifies } from './head';
import type { ClassifyContext, ClassifyResult, EntityHit, IntentDef, ResponseStep } from './types';

export interface RespondInput {
  npcRef: string;
  text: string;
  result: ClassifyResult;
  ctx: ClassifyContext;
  /** this NPC's reaction-slot repetition ledger toward the player, when the caller keeps one */
  history?: LineHistory;
  /** the topic of the open conversation ({topic} of clarify) */
  topic?: string;
  /** refusals per topic in the open conversation (the anti-loop of 6.6) */
  refusals?: Record<string, number>;
}

export interface RespondOutcome {
  line: TextParam;
  /** the session should end after this line (R9) */
  end: boolean;
  /** R5: another system reads this entry and its params off the result */
  entry: { id: string; params: Record<string, string> } | null;
  /** R8: a notification raised (guard, clergy, goddess, audit) */
  notify: string[];
  /** world-affecting response codes that actually fired, for the caller's own bookkeeping */
  codes: string[];
  /** the intent repeated today where the rules count a repeat as an offense (6.4 row 9) */
  offense?: boolean;
  /** topics offered instead of a refused or misunderstood question (R4, 6.6) */
  suggest: string[];
  /** the topic answered or refused this round */
  topic?: string;
  /** the round refused a topic or a clue (patience, 6.1) */
  refused?: boolean;
  /** what was refused: the topic id, or clue:<lore id> (a repeat costs patience, 6.1, 6.6) */
  refusedKey?: string;
  /** the third refusal of one topic in this talk: the person ends it (6.6) */
  refusedOut?: boolean;
  /** what the R8 audit notification is about (a suspected spoiler names its clues, 6.6) */
  audit?: { reason: 'suspected_spoiler'; clues: string[] };
}

function entityOf(entities: readonly EntityHit[], kinds: readonly string[]): EntityHit | undefined {
  return entities.find((e) => kinds.includes(e.kind));
}

/**
 * Whether this offense is the third one today toward the same person (builtin_ai 6.1: the
 * third offense of a day ends the talk). The dialogue slice counts the offenses after each
 * reply, so two already counted today make this one the third.
 */
function thirdOffenseToday(ctx: SystemContext, npcRef: string): boolean {
  const o = ctx.world.slices.dialogue.offenses?.[npcRef];
  return !!o && o.day === calendarAt(ctx.tick).dayIndex && o.n >= 2;
}

/** The day key of an intent the player already used on a person (`seen:` keeps it apart). */
function seenKey(npcRef: string, intent: string): string {
  return `seen:${npcRef}:${intent}`;
}

/** The same intent toward the same person was already answered today (5.5 anti-farming). */
function repeatToday(ctx: SystemContext, npcRef: string, intent: string): boolean {
  return (
    ctx.world.slices.dialogue.intentRelDay?.[seenKey(npcRef, intent)] ===
    calendarAt(ctx.tick).dayIndex
  );
}

/** Notes that the intent was answered today, for the next `repeat_today` check. */
function markSeenToday(ctx: SystemContext, npcRef: string, intent: string): void {
  const slice = ctx.world.slices.dialogue;
  slice.intentRelDay ??= {};
  const day = calendarAt(ctx.tick).dayIndex;
  // only today's marks matter: older ones are dropped so the record stays small
  for (const [k, d] of Object.entries(slice.intentRelDay))
    if (k.startsWith('seen:') && d < day) delete slice.intentRelDay[k];
  slice.intentRelDay[seenKey(npcRef, intent)] = day;
}

function dayPart(ctx: SystemContext): 'day' | 'night' {
  return dayPartOf(calendarAt(ctx.tick).hour);
}

/**
 * Whether a persona has a behavioural trait of the lexicon (its `traits` table: a trait
 * code to the persona trait words that carry it); the card lists the words, not the code.
 */
export function personaHasTrait(
  ctx: SystemContext,
  persona: PersonaCard | undefined,
  trait: string,
): boolean {
  if (!persona) return false;
  const words = ctx.content.intentLexicon?.traits[trait];
  return !!words && persona.traits.some((w) => words.includes(w));
}

/** Whether a persona reads as a functional kind of the lexicon's `roles` table (entity tags). */
function personaReadsAs(
  ctx: SystemContext,
  persona: PersonaCard | undefined,
  kind: string,
): boolean {
  if (!persona) return false;
  const tags = ctx.content.intentLexicon?.roles[kind];
  return !!tags && persona.tags.some((t) => tags.includes(t));
}

/** Evaluates a response step's `if` against live state (not content data: builtin_ai 6.6). */
function holds(
  ctx: SystemContext,
  npcRef: string,
  name: string | undefined,
  persona: PersonaCard | undefined,
  rel: ReturnType<typeof relationOf>,
  result: ClassifyResult,
  rctx: ClassifyContext,
): boolean {
  if (!name) return true;
  switch (name) {
    case 'grudge':
      return rel.like <= -40;
    case 'forgiven':
      return rel.like > -40;
    case 'not_offended':
      return rel.like > -15;
    case 'guard':
      return personaReadsAs(ctx, persona, 'guard');
    case 'clergy':
      return persona?.class === 'clergy' || personaReadsAs(ctx, persona, 'clergy');
    case 'merchant':
      return persona?.class === 'merchant' || personaReadsAs(ctx, persona, 'merchant');
    case 'service':
      return personaReadsAs(ctx, persona, 'service');
    case 'low_trust':
      return rel.trust < 30;
    case 'troubled': {
      // the mood of builtin_ai.md 3.3: afraid, angry, worried or worn out
      const st = ctx.world.slices.npc.npcs[npcRef];
      const mood = st ? moodOf(st, ctx.tick) : 'calm';
      return mood === 'fear' || mood === 'angry' || mood === 'worried' || mood === 'tired';
    }
    case 'repeat_today':
      return repeatToday(ctx, npcRef, result.main);
    case 'third_insult':
      return thirdOffenseToday(ctx, npcRef);
    case 'pending':
      return !!rctx.afterQuestion;
    case 'in_topic':
      return !!rctx.inTopic;
    case 'known_person':
      return !!entityOf(result.entities, ['person']);
    case 'earth_refuse':
      // gunpowder and paper money (builtin_ai 6.4 row 45, D-064): the earth word list
      // tags these with the generic 'earth' kind too, so the refusal check must read
      // which lexicon list actually matched, not just the entity kind.
      return result.entities.some((e) => e.kind === 'earth' && e.source === 'earth_refuse');
    default:
      // an `if` name outside RESPOND_IF_NAMES is a data typo, caught by
      // content.ts's ruleSetProblems (the data validation gate), not here: a step whose
      // condition can never be checked must still default open rather than break dialogue.
      return true;
  }
}

function mainEntity(result: ClassifyResult): EntityHit | undefined {
  const c = result.clauses[result.mainClause];
  return c?.clause.entities[0];
}

/** Fills {person}, {place}, {event}, {lore} in a topic id from the main clause's entity. */
function topicId(template: string, result: ClassifyResult): string {
  const e = mainEntity(result);
  return template.replace(/\{(person|place|event|lore)\}/, () =>
    e ? e.id.replace(/[^a-z0-9_]/gi, '_') : 'none',
  );
}

/** The prefix a template's entity slot reads ({place} -> place_, ...). */
const SLOT_PREFIX: Record<string, string> = {
  person: 'person_',
  place: 'place_',
  event: 'event_',
  lore: 'lore_',
};

/**
 * The topics a clause names, nearest first (builtin_ai 6.2, 6.3 step 3): the topics of its
 * entities (their `aliases`, a person's own topic), the last entity first because the head
 * noun of a Chinese question comes last ("遗迹里的神纹"), then the topics whose words the
 * clause uses; only those the speaker may speak of at all, own topics first. `prefix`
 * narrows them to one kind.
 */
function namedTopics(
  ctx: SystemContext,
  npcRef: string,
  result: ClassifyResult,
  prefix?: string,
): TopicDef[] {
  const clause = result.clauses[result.mainClause]?.clause;
  const fits = (t: TopicDef) => (!prefix || t.id.startsWith(prefix)) && !t.id.startsWith('gen_');
  const out: TopicDef[] = [];
  const add = (t: TopicDef) => {
    if (fits(t) && !out.includes(t)) out.push(t);
  };
  for (const e of [...(clause?.entities ?? [])].reverse())
    for (const t of topicsOfSubject(ctx.content, e.id)) add(t);
  for (const t of topicsAsked(ctx.content, result.normalized, fits)) add(t);
  const sp = speakerView(ctx, npcRef);
  const own = (t: TopicDef) => (t.owners ?? []).includes(npcRef);
  return out
    .filter((t) => inScope(t, sp) || isKnower(t, sp))
    .sort((a, b) => Number(own(b)) - Number(own(a)));
}

/**
 * The topics an R1 step names: the conversation's topic for {topic}; for an entity slot the
 * named topics of that kind; a fixed id as written.
 */
function graphTopics(
  ctx: SystemContext,
  npcRef: string,
  template: string,
  result: ClassifyResult,
  current: string | undefined,
): TopicDef[] {
  if (template === '{topic}') {
    const t = current ? topicById(ctx.content, current) : undefined;
    return t ? [t] : [];
  }
  const slot = /\{(person|place|event|lore)\}/.exec(template)?.[1];
  if (!slot) {
    const t = topicById(ctx.content, template);
    return t ? [t] : [];
  }
  return namedTopics(ctx, npcRef, result, SLOT_PREFIX[slot]);
}

/** Say the first topic that gives a line (an answer or a 6.6 refusal); null when none does. */
function sayFirst(
  ctx: SystemContext,
  npcRef: string,
  topics: readonly TopicDef[],
  refusals: Record<string, number> | undefined,
  target?: string,
): TopicSaid | null {
  for (const t of topics) {
    const said = sayTopic(ctx, npcRef, t.id, { refusals, target });
    if (said && !said.silent) return said;
  }
  return null;
}

/**
 * Never confirm a locked clue the player named (6.6 rows 5, 6): a knower answers by the
 * clue's ledger handling (topics/ledger.ts; a misdirection is said sincerely, not refused),
 * anyone else hears nonsense; the same clue pressed a third time in one talk ends it (the
 * anti-loop of 6.6), and asking it again costs patience like any refused question. A
 * `forced` answer is the low-confidence case (6.6 last row): not known, whoever speaks.
 */
function refuseClue(
  ctx: SystemContext,
  npcRef: string,
  clues: readonly { id: string; knowers?: string[] }[],
  out: RespondOutcome,
  refusals: Record<string, number> | undefined,
  history: LineHistory | undefined,
  forced?: 'unknown',
): void {
  const { refusal, clue } = forced
    ? { refusal: forced, clue: undefined }
    : clueRefusal(ctx.content.ledgerRefusals, clues, npcRef);
  const misLine = refusal === 'mis' && clue ? clueMisLine(ctx, npcRef, clue) : null;
  if (misLine) {
    out.line = misLine;
    return;
  }
  const key = `clue:${clues[0]?.id}`;
  out.refused = true;
  out.refusedKey = key;
  if (refusals) {
    refusals[key] = (refusals[key] ?? 0) + 1;
    if (refusals[key] >= REFUSALS_TO_END) {
      out.line = reactionLine(ctx, npcRef, ['farewell'], history) ?? out.line;
      out.end = true;
      out.refusedOut = true;
      return;
    }
  }
  out.line =
    reactionLine(
      ctx,
      npcRef,
      [`react.${refusal === 'mis' ? 'evade' : refusal}`, 'react.unknown'],
      history,
    ) ?? tr('sys.dialogue.intent.fallback');
}

/**
 * The map or map/location a place entity names: a content place as it is, a generic word
 * (公会, 铁匠铺) through the place topics that alias it.
 */
function placeTarget(ctx: SystemContext, e: EntityHit | undefined): string | undefined {
  if (!e || e.kind !== 'place') return undefined;
  if (e.id.includes('/') || (ctx.content.maps ?? []).some((m) => m.id === e.id)) return e.id;
  for (const t of topicsOfSubject(ctx.content, e.id))
    for (const a of t.aliases ?? [])
      if (a.includes('/') || (ctx.content.maps ?? []).some((m) => m.id === a)) return a;
  return undefined;
}

/** A topic answer or refusal as the outcome of this round. */
function tookTopic(out: RespondOutcome, said: TopicSaid): void {
  out.line = said.line;
  out.topic = said.topic.id;
  // a sincere misdirection is an answer to the speaker, not a refusal
  if (said.outcome !== 'answer' && said.outcome !== 'mis') {
    out.refused = true;
    out.refusedKey = said.topic.id;
  }
  if (said.end) {
    out.refusedOut = true;
    out.end = true;
  }
  for (const id of said.suggest) if (!out.suggest.includes(id)) out.suggest.push(id);
}

/** Whether the graph knows a topic id (the generic topics and the act instances). */
export function isGraphTopic(ctx: SystemContext, id: string): boolean {
  return allTopics(ctx.content).some((t) => t.id === id);
}

/** Resolve a topic through the line-pack chain directly by slot name (ahead of PK-M1-19). */
function topicLine(
  ctx: SystemContext,
  npcRef: string,
  slot: string,
  history: LineHistory | undefined,
  extra: Record<string, TextParam | undefined> = {},
): TextParam | null {
  const dayIndex = calendarAt(ctx.tick).dayIndex;
  const vars: Record<string, TextParam | undefined> = { ...varsFor(ctx, npcRef), ...extra };
  // a line whose fill slot has no value now is void (7.9); {catch} may stay empty
  const unfillable = new Set(
    [...FILL_SLOTS].filter((f) => f !== 'catch' && (vars[f] === undefined || vars[f] === '')),
  );
  const act = ctx.flag('act');
  const r = selectLine(
    ctx.content,
    npcRef,
    slot,
    { holds: (w) => conditionHolds(ctx, w), dayIndex, unfillable },
    ctx.rng('dialogue.lines'),
    history,
    {
      ...speakerLayers(ctx, npcRef),
      // the act override comes first inside its act (7.3 step 1)
      act: typeof act === 'string' ? act : undefined,
      // the suppression windows of 7.7 (reactions 7 days), topics rotate instead
      suppressDays: history ? suppressionDays(slot) : 0,
      rotate: slot.startsWith('topic.'),
    },
  );
  if (!r) return null;
  if (history) recordLine(history, r.key, dayIndex);
  return lineText({ zh: r.entry.zh, key: r.key }, { ...vars, catch: '' });
}

function reactionLine(
  ctx: SystemContext,
  npcRef: string,
  slots: readonly string[],
  history: LineHistory | undefined,
  extra: Record<string, TextParam | undefined> = {},
): TextParam | null {
  for (const slot of slots) {
    const line = topicLine(ctx, npcRef, slot, history, extra);
    if (line) return line;
  }
  return null;
}

/**
 * Built-in fallback a response step names with an `@` token when its own topic slot has
 * no line yet (the `gen_*` topics are content still to be authored): `@intro` is the
 * persona's own small talk, `@rumor` is whatever the NPC has to tell. Neither reveals
 * anything the ledger has not unlocked.
 */
function builtinFallback(ctx: SystemContext, npcRef: string, token: string): TextParam | null {
  if (token === '@intro') return smallTalk(ctx, npcRef);
  if (token === '@rumor') {
    const told = tellPlayer(ctx, npcRef);
    return rumorLine(ctx, npcRef, told?.text ?? null);
  }
  return null;
}

const EVIDENCE_WEIGHT: Partial<Record<EvidenceKind, number>> = { rumor: 1 };

function applyR6(ctx: SystemContext, npcRef: string, intent: string, weight: number): void {
  if (weight <= 0) return;
  // one independence key per (npc, intent), not per tick: repeating the same unverified
  // boast is the same piece of hearsay said twice, so observe()'s independence decay
  // (full weight, then half, then a quarter) must see it as such, never as fresh
  // evidence each time (builtin_ai 6.4 row 40: words alone are weak and do not stack).
  const ind = `say:${npcRef}:${intent}`;
  observe(ctx, npcRef, 'player', {
    key: `say:${ctx.tick}:${npcRef}`,
    ind,
    apparent: 0,
    kinds: [{ kind: 'rumor', weight: EVIDENCE_WEIGHT.rumor ?? 1 }],
    direct: false,
    what: tr('sys.dialogue.intent.claim_evidence'),
  });
}

/**
 * True once per game day for a "<npcRef>:<intent>" pair (builtin_ai 5.5: a relation gain
 * from one intent toward one person counts at most once per game day); records the day on
 * first use so a second thanks today scores nothing further.
 */
function firstToday(ctx: SystemContext, npcRef: string, intent: string): boolean {
  const slice = ctx.world.slices.dialogue;
  // defensive default: a save written before this field existed has no intentRelDay at
  // all (no compatibility promise yet before M2, release_engineering.md 5.5), so this
  // must not throw on load instead of simply starting the per-day count fresh.
  slice.intentRelDay ??= {};
  const key = `${npcRef}:${intent}`;
  const day = calendarAt(ctx.tick).dayIndex;
  if (slice.intentRelDay[key] === day) return false;
  slice.intentRelDay[key] = day;
  return true;
}

function applyR7(
  ctx: SystemContext,
  npcRef: string,
  intent: string,
  step: Extract<ResponseStep, { code: 'R7' }>,
  persona: PersonaCard | undefined,
  rel: ReturnType<typeof relationOf>,
): void {
  if (step.daily && !firstToday(ctx, npcRef, intent)) return;
  const deltas: { like?: number; trust?: number; awe?: number } = {};
  let like = step.like;
  let trust = step.trust;
  for (const t of step.traits ?? []) {
    if (personaHasTrait(ctx, persona, t.trait)) {
      if (t.like !== undefined) like = t.like;
      if (t.trust !== undefined) trust = t.trust;
      break;
    }
  }
  if (step.restore !== undefined) {
    // restores this share of the offense's accumulated loss (builtin_ai 6.4 row 4): the
    // only ledger kept of "how much the offense cost" is the current negative like
    // itself, so a half restore moves it half the way back to neutral.
    if (rel.like < 0) like = (like ?? 0) + -rel.like * step.restore;
  }
  if (like !== undefined) deltas.like = like;
  if (trust !== undefined) deltas.trust = trust;
  if (step.awe !== undefined) deltas.awe = step.awe;
  if (Object.keys(deltas).length === 0) return;
  adjustRelation(ctx, npcRef, 'player', deltas, tr('sys.dialogue.intent.reason'));
}

/**
 * Carry out one intent's response table against live state, returning the line and the
 * flags another layer (the dialogue session, R5 and R8 consumers) acts on. R1 and R3 go
 * through the topic graph and its refusal table (builtin_ai 6.6); a topic the graph does
 * not know, or one with no line for this speaker, falls back to the step's slots. R4 offers
 * two topics instead (the caller turns `suggest` into options).
 */
export function respondTo(ctx: SystemContext, input: RespondInput): RespondOutcome {
  const { npcRef, result, ctx: rctx, history } = input;
  const persona = personaById(ctx.content, npcRef);
  const rel = relationOf(ctx.world.slices.npc, npcRef, 'player');
  const def: IntentDef | undefined = ctx.content.intentRules?.intents[result.main];
  const out: RespondOutcome = {
    line: '',
    end: false,
    entry: null,
    notify: [],
    codes: [],
    suggest: [],
  };
  const band = trustBand(ctx, npcRef);
  const part = dayPart(ctx);
  const subst = (s: string) => s.replace('{band}', band).replace('{part}', part);
  if (!def) {
    out.line =
      reactionLine(ctx, npcRef, ['react.confused'], history) ?? tr('sys.dialogue.intent.fallback');
    return out;
  }
  // R1 to R4 are alternative ways to say the line: the first one that finds a line wins,
  // and later R1 to R4 steps are skipped. R5 to R9 are world effects and run independently
  // of whether a line was already said, so every one of them fires every time its `if`
  // holds (R6 cognition evidence, R7 relation changes, R8 notifications, R9 session end).
  let spoke = false;
  for (const step of def.respond) {
    if (!holds(ctx, npcRef, step.if, persona, rel, result, rctx)) continue;
    if (step.code === 'R1') {
      if (spoke) continue;
      // the topics the step names, then (a question the classifier filed under another
      // kind) any topic the clause names; the 6.6 table decides answer or refusal
      const template = subst(step.topic);
      const graph = graphTopics(ctx, npcRef, template, result, input.topic);
      const named = template.includes('{') ? namedTopics(ctx, npcRef, result) : [];
      // the step's entity only modifies another ("遗迹里的神纹"): the head's topics first
      const kind = /\{(person|place|event|lore)\}/.exec(step.topic ?? '')?.[1];
      const clause = result.clauses[result.mainClause]?.clause;
      const headFirst =
        kind !== undefined &&
        clause !== undefined &&
        ctx.content.intentLexicon !== undefined &&
        onlyModifies(clause.text, clause.entities, kind, ctx.content.intentLexicon);
      const order = headFirst
        ? [...named.filter((t) => !graph.includes(t)), ...graph]
        : [...graph, ...named];
      // the place a "how do I get to" names (gen_directions points at it)
      const target = placeTarget(ctx, mainEntity(result));
      const said = sayFirst(ctx, npcRef, order, input.refusals, target);
      if (said) {
        tookTopic(out, said);
        out.codes.push('R1');
        spoke = true;
        continue;
      }
      // a topic the graph knows is never read straight from the packs: its gates (scope,
      // requires, tier, trust, the act window) stand even when it has no line now
      const resolved = subst(topicId(step.topic, result));
      const line =
        isGraphTopic(ctx, template) || isGraphTopic(ctx, resolved)
          ? null
          : topicLine(ctx, npcRef, `topic.${resolved}`, history);
      if (line) {
        out.line = line;
        out.codes.push('R1');
        spoke = true;
        continue;
      }
      if (step.else) {
        const fb =
          reactionLine(
            ctx,
            npcRef,
            step.else.filter((s) => !s.startsWith('@')),
            history,
          ) ??
          step.else
            .filter((s) => s.startsWith('@'))
            .map((s) => builtinFallback(ctx, npcRef, s))
            .find((l): l is TextParam => l !== null) ??
          null;
        if (fb) {
          out.line = fb;
          out.codes.push('R1');
          spoke = true;
        }
      }
      continue;
    }
    if (step.code === 'R2') {
      if (spoke) continue;
      if (step.use === 'small_talk') {
        out.line = smallTalk(ctx, npcRef);
        out.codes.push('R2');
        spoke = true;
        continue;
      }
      if (step.use === 'opinion') {
        out.line = opinion(ctx, npcRef);
        out.codes.push('R2');
        spoke = true;
        continue;
      }
      if (step.use === 'farewell') {
        const line = reactionLine(ctx, npcRef, ['farewell'], history);
        if (line) {
          out.line = line;
          out.codes.push('R2');
          spoke = true;
        }
        continue;
      }
      if (step.use === 'rumor') {
        const told = tellPlayer(ctx, npcRef);
        out.line = rumorLine(ctx, npcRef, told?.text ?? null);
        out.codes.push('R2');
        spoke = true;
        continue;
      }
      if (step.use === 'unbelief') {
        // a spoken boast with no witness (builtin_ai 1.7, 6.4 row 40): the immediate
        // skeptical retort, distinct from the unbelief.deny/explain/waver ladder
        // (builtin_ai 5.7, 7.5), which is a greeting-time state the belief machine
        // drives, not a reaction to this one utterance; R6 already carries the weak
        // evidence this claim is worth into that machine.
        const line = reactionLine(ctx, npcRef, ['react.nonsense'], history);
        if (line) {
          out.line = line;
          out.codes.push('R2');
          spoke = true;
        }
        continue;
      }
      const slots = (step.slots ?? []).map(subst);
      const line = reactionLine(ctx, npcRef, slots, history);
      if (line) {
        out.line = line;
        out.codes.push('R2');
        spoke = true;
      }
      continue;
    }
    if (step.code === 'R3') {
      if (spoke) continue;
      // the ledger refusal (6.6): the topic the clause touches goes through the refusal
      // table (an open topic is simply answered, row 1); a locked clue named with no topic
      // of its own is never confirmed (rows 5, 6); anything else is not known
      const said = sayFirst(ctx, npcRef, namedTopics(ctx, npcRef, result), input.refusals);
      if (said) {
        tookTopic(out, said);
      } else {
        const clues = lockedCluesIn(ctx, result.normalized);
        if (clues.length > 0) refuseClue(ctx, npcRef, clues, out, input.refusals, history);
        else {
          out.line =
            reactionLine(ctx, npcRef, ['react.unknown'], history) ??
            tr('sys.dialogue.intent.fallback');
          out.refused = true;
        }
      }
      out.codes.push('R3');
      spoke = true;
      continue;
    }
    if (step.code === 'R4') {
      // the redirect (6.6): two open topics as options, led in by the {topic_hint} line
      const suggest = redirectFor(ctx, npcRef, null);
      for (const id of suggest) if (!out.suggest.includes(id)) out.suggest.push(id);
      out.codes.push('R4');
      if (spoke) continue;
      const hint = suggest[0] ? topicById(ctx.content, suggest[0]) : undefined;
      out.line =
        reactionLine(ctx, npcRef, ['react.confused'], history, {
          topic_hint: hint ? topicTitle(ctx, hint) : undefined,
        }) ?? tr('sys.dialogue.intent.fallback');
      spoke = true;
      continue;
    }
    if (step.code === 'R5') {
      const e = mainEntity(result);
      out.entry = { id: step.entry, params: e ? { entity: e.id, kind: e.kind } : {} };
      out.codes.push('R5');
      continue;
    }
    if (step.code === 'R6') {
      applyR6(ctx, npcRef, result.main, step.weight);
      // a self-claim of coming from beyond is exposed only where someone credits it (6.4
      // row 41, 5.6 identity_guest); words alone never confirm anything (ledger rule 6)
      if (result.main === 'reveal_identity') guestClaim(ctx, npcRef);
      out.codes.push('R6');
      continue;
    }
    if (step.code === 'R7') {
      applyR7(ctx, npcRef, result.main, step, persona, rel);
      out.codes.push('R7');
      continue;
    }
    if (step.code === 'R8') {
      out.notify.push(step.notify);
      out.codes.push('R8');
      continue;
    }
    if (step.code === 'R9') {
      out.end = true;
      out.codes.push('R9');
    }
  }
  // the ledger guard (6.3 step 8 "台账防护", 6.6 rows 5 and 6): words that name a locked
  // clue are never confirmed, whatever the intent; a topic answer of its own stands
  if (!out.topic && def.group !== 'safety' && !out.codes.includes('R3')) {
    const clues = lockedCluesIn(ctx, result.normalized);
    if (clues.length > 0) {
      // unsure what was asked (below the threshold): rather not known than any reaction to
      // the truth, and the round goes to the audit as a suspected spoiler (6.6 last row)
      const unsure = result.main === 'unknown';
      refuseClue(ctx, npcRef, clues, out, input.refusals, history, unsure ? 'unknown' : undefined);
      if (unsure) {
        if (!out.notify.includes('audit')) out.notify.push('audit');
        out.audit = { reason: 'suspected_spoiler', clues: clues.map((c) => c.id) };
      }
      out.codes.push('R3');
    }
  }
  if (def.respond.some((step) => step.if === 'repeat_today')) {
    // from the second time on a day it counts as an offense (builtin_ai 6.4 row 9)
    if (repeatToday(ctx, npcRef, result.main)) out.offense = true;
    markSeenToday(ctx, npcRef, result.main);
  }
  if (out.line === '')
    out.line =
      reactionLine(ctx, npcRef, ['react.confused'], history) ?? tr('sys.dialogue.intent.fallback');
  // a scripted speaker with no written answer gives his written evasion (Ash in act 1:
  // "还不是时候", catalog_dialogue_lines_act1.md 0 item 4), never the kernel's ellipsis
  if (
    isScripted(ctx.content, npcRef, ctx.flag('act')) &&
    keyOfLine(out.line) === 'sys.dialogue.intent.fallback'
  )
    out.line = reactionLine(ctx, npcRef, ['react.evade'], history) ?? out.line;
  return out;
}

function keyOfLine(line: TextParam): string | undefined {
  return line && typeof line === 'object' && 'key' in line
    ? (line as { key: string }).key
    : undefined;
}

/** The player's spoken-word evidence weight, read by the belief summary (builtin_ai 6.5 R6). */
export function evidenceWeightOf(kind: EvidenceKind): number {
  return EVIDENCE_WEIGHT[kind] ?? 0;
}

export { relationBand };
