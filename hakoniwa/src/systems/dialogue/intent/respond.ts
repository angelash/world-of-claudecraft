// Response strategies (builtin_ai.md 6.5, 18) that turn a classified intent into the
// NPC's line and its world consequences: R1 reads a topic slot (the topic graph itself is
// PK-M1-19; until then this resolves the topic id straight through the line-pack chain, so
// the same slot names keep working once the graph lands), R2 a reaction or built-in reply,
// R3 a ledger refusal stand-in, R4 a redirect stub, R5 a system-entry marker another system
// reads off the result, R6 cognition evidence, R7 a relation change, R8 a notification
// flag, R9 ends the session. Conditions named by `if` are evaluated here, not in data,
// because they read live NPC and relation state the content layer cannot see.

import type { SystemContext } from '../../../core/system';
import { type TextParam, tr } from '../../../core/text';
import { calendarAt } from '../../../core/time';
import { observe } from '../../cognition/belief';
import { tellPlayer } from '../../cognition/rumor';
import type { EvidenceKind } from '../../cognition/types';
import { moodOf } from '../../npc/brain/mood';
import { personaById } from '../../npc/personas';
import { adjustRelation, relationBand, relationOf } from '../../npc/relations';
import type { PersonaCard } from '../../npc/types';
import { conditionHolds } from '../../quests/effects';
import { lineText } from '../lines/fill';
import { suppressionDays } from '../lines/grammar';
import { type LineHistory, recordLine } from '../lines/history';
import { selectLine } from '../lines/select';
import { dayPartOf } from '../lines/trust';
import { opinion, rumorLine, smallTalk, trustBand, varsFor } from '../replies';
import { speakerLayers } from '../speak';
import type { ClassifyContext, ClassifyResult, EntityHit, IntentDef, ResponseStep } from './types';

export interface RespondInput {
  npcRef: string;
  text: string;
  result: ClassifyResult;
  ctx: ClassifyContext;
  /** this NPC's reaction-slot repetition ledger toward the player, when the caller keeps one */
  history?: LineHistory;
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

/** Resolve a topic through the line-pack chain directly by slot name (ahead of PK-M1-19). */
function topicLine(
  ctx: SystemContext,
  npcRef: string,
  slot: string,
  history: LineHistory | undefined,
): TextParam | null {
  const dayIndex = calendarAt(ctx.tick).dayIndex;
  const r = selectLine(
    ctx.content,
    npcRef,
    slot,
    { holds: (w) => conditionHolds(ctx, w), dayIndex },
    ctx.rng('dialogue.lines'),
    history,
    {
      ...speakerLayers(ctx, npcRef),
      // the suppression windows of 7.7 (reactions 7 days), topics rotate instead
      suppressDays: history ? suppressionDays(slot) : 0,
      rotate: slot.startsWith('topic.'),
    },
  );
  if (!r) return null;
  if (history) recordLine(history, r.key, dayIndex);
  return lineText({ zh: r.entry.zh, key: r.key }, { ...varsFor(ctx, npcRef), catch: '' });
}

function reactionLine(
  ctx: SystemContext,
  npcRef: string,
  slots: readonly string[],
  history: LineHistory | undefined,
): TextParam | null {
  for (const slot of slots) {
    const line = topicLine(ctx, npcRef, slot, history);
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
 * flags another layer (the dialogue session, R5 and R8 consumers) acts on. R3 and R4 are
 * stand-ins until the reveal-ledger refusal table and the topic graph (PK-M1-19) land: R3
 * answers "unknown" and R4 ends with a plain redirect prompt, both of which already keep
 * the ledger safe (nothing unlocked is said) and never block the session.
 */
export function respondTo(ctx: SystemContext, input: RespondInput): RespondOutcome {
  const { npcRef, result, ctx: rctx, history } = input;
  const persona = personaById(ctx.content, npcRef);
  const rel = relationOf(ctx.world.slices.npc, npcRef, 'player');
  const def: IntentDef | undefined = ctx.content.intentRules?.intents[result.main];
  const out: RespondOutcome = { line: '', end: false, entry: null, notify: [], codes: [] };
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
      const slot = `topic.${subst(topicId(step.topic, result))}`;
      const line = topicLine(ctx, npcRef, slot, history);
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
      out.line =
        reactionLine(ctx, npcRef, ['react.unknown'], history) ?? tr('sys.dialogue.intent.fallback');
      out.codes.push('R3');
      spoke = true;
      continue;
    }
    if (step.code === 'R4') {
      if (spoke) continue;
      out.line =
        reactionLine(ctx, npcRef, ['react.confused'], history) ??
        tr('sys.dialogue.intent.fallback');
      out.codes.push('R4');
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
  if (def.respond.some((step) => step.if === 'repeat_today')) {
    // from the second time on a day it counts as an offense (builtin_ai 6.4 row 9)
    if (repeatToday(ctx, npcRef, result.main)) out.offense = true;
    markSeenToday(ctx, npcRef, result.main);
  }
  if (out.line === '')
    out.line =
      reactionLine(ctx, npcRef, ['react.confused'], history) ?? tr('sys.dialogue.intent.fallback');
  return out;
}

/** The player's spoken-word evidence weight, read by the belief summary (builtin_ai 6.5 R6). */
export function evidenceWeightOf(kind: EvidenceKind): number {
  return EVIDENCE_WEIGHT[kind] ?? 0;
}

export { relationBand };
