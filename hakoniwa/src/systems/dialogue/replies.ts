// Rule replies (the no-model voice of a conversation): greeting, small talk, "what do
// you think of me", rumors and answers to free text. They read the NPC's persona voice,
// its belief about the player (public stance) and its relation toward the player.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { calendarAt } from '../../core/time';
import { beliefRaw } from '../cognition/queries';
import type { BeliefState } from '../cognition/types';
import { holdingOf } from '../inventory';
import { angryAtPlayer, moodOf } from '../npc/brain/mood';
import { takeOpener } from '../npc/brain/reactions';
import { personaById } from '../npc/personas';
import { locationById } from '../npc/places';
import { relationOf } from '../npc/relations';
import type { PersonaCard } from '../npc/types';
import { currentWeather, entitiesNear, getEntity } from '../world';
import { classifyIntent } from './intent/classify';
import { respondTo } from './intent/respond';
import type { EntityHit, IntentId } from './intent/types';
import { newLineHistory } from './lines/history';
import { dayPartOf, trustBandOf } from './lines/trust';
import type { TrustBand } from './lines/types';
import { diaryPhrase, memoryPhrase, speak } from './speak';
import { pickLine } from './templates';

export interface ReplyVars {
  player: TextParam;
  place: TextParam;
  [k: string]: TextParam;
}

/** How the NPC addresses the player right now (Cassian turns cold: the persona's form to "sir"). */
export function addressOf(ctx: SystemContext, npcRef: string): TextParam {
  const p = personaById(ctx.content, npcRef);
  if (!p) return tr('sys.dialogue.address.you');
  const b = beliefRaw(ctx.world, npcRef, 'player');
  if (p.class === 'clergy' && b && (b.explanation === 'sorcery' || b.state === 'hostile'))
    return tr('sys.dialogue.address.sir');
  if (b?.state === 'worship') return tr('sys.dialogue.address.lord');
  return p.voice.address;
}

export function varsFor(ctx: SystemContext, npcRef: string): ReplyVars {
  const st = ctx.world.slices.npc.npcs[npcRef];
  const loc = st ? locationById(ctx.content, st.mapId, st.locId) : undefined;
  return { player: addressOf(ctx, npcRef), place: loc?.name ?? tr('sys.dialogue.place.here') };
}

function line(
  ctx: SystemContext,
  key: string,
  npcRef: string,
  extra: Record<string, TextParam> = {},
): TextParam {
  const p = personaById(ctx.content, npcRef);
  const text = pickLine(
    ctx.content,
    key,
    { ...varsFor(ctx, npcRef), ...extra },
    ctx.rng('dialogue.lines'),
    p,
  );
  return text || '……';
}

function persona(ctx: SystemContext, npcRef: string): PersonaCard | undefined {
  return personaById(ctx.content, npcRef);
}

export function greeting(ctx: SystemContext, npcRef: string, first: boolean): TextParam {
  return greetingLine(ctx, npcRef, first).text;
}

/** The trust band of a person toward the player now (builtin_ai.md 7.4). */
export function trustBand(ctx: SystemContext, npcRef: string): TrustBand {
  const rel = relationOf(ctx.world.slices.npc, npcRef, 'player');
  const st = ctx.world.slices.npc.npcs[npcRef];
  return trustBandOf({
    like: rel.like,
    trust: rel.trust,
    angryAtPlayer: !!st && angryAtPlayer(st, ctx.tick),
    belief: beliefRaw(ctx.world, npcRef, 'player')?.state,
    companion: !!ctx.flag(`companion.${npcRef}.recruited`),
  });
}

/** Someone else stands close enough to hear (builtin_ai.md 5.7: public versus private). */
function overheard(ctx: SystemContext, npcRef: string): boolean {
  const st = ctx.world.slices.npc.npcs[npcRef];
  const e = st ? getEntity(ctx.world, st.entityId) : undefined;
  if (!e) return false;
  return (
    entitiesNear(ctx.world, e.mapId, e.x, e.y, 4, (x) => x.kind === 'npc' && x.id !== e.id).length >
    0
  );
}

/** The greeting slot of a person's stance toward the player (5.7 and 7.4). */
function stanceSlot(state: BeliefState | undefined, explanation: string | null): string | null {
  switch (state) {
    case 'doubt':
      return 'unbelief.deny';
    case 'explaining':
      return explanation ? `unbelief.explain.${explanation}` : 'unbelief.explain';
    case 'wavering':
      return 'unbelief.waver';
    case 'worship':
    case 'hostile':
    case 'exploit':
    case 'depend':
      return `react.belief_${state}`;
    default:
      return null;
  }
}

/**
 * The opening line of a conversation (builtin_ai.md 5.7 and 7.4): a line kept from a
 * transition seen offscreen goes first, once; a person in one of the "do not believe"
 * stances greets with it (the public stance when others listen, the private one alone);
 * otherwise the greeting of the trust band and the time of day, which may recall a memory
 * of the player or a recent diary entry. Residents keep the template greetings.
 */
export function greetingLine(
  ctx: SystemContext,
  npcRef: string,
  first: boolean,
): { text: TextParam; recalled: boolean } {
  const st = ctx.world.slices.npc.npcs[npcRef];
  if (st?.activity === 'sleep') return { text: line(ctx, 'greet.sleep', npcRef), recalled: false };
  const p = persona(ctx, npcRef);
  // the line kept for this talk goes first, even at a first meeting (5.7)
  const opener = p && st ? takeOpener(ctx, npcRef) : null;
  if (opener && st) {
    const said = speak(ctx, {
      speaker: npcRef,
      slot: opener,
      vars: varsFor(ctx, npcRef),
      mood: moodOf(st, ctx.tick),
    });
    if (said) return { text: said.text, recalled: said.recalled };
  }
  if (first) return { text: line(ctx, 'greet.first', npcRef), recalled: false };
  if (!p || !st) return { text: legacyGreeting(ctx, npcRef), recalled: false };
  const vars = varsFor(ctx, npcRef);
  const mood = moodOf(st, ctx.tick);
  const b = beliefRaw(ctx.world, npcRef, 'player');
  const state = overheard(ctx, npcRef) ? b?.publicState : b?.state;
  const slot =
    stanceSlot(state, b?.explanation ?? null) ??
    `greet.${trustBand(ctx, npcRef)}.${dayPartOf(calendarAt(ctx.tick).hour)}`;
  const said = speak(ctx, { speaker: npcRef, slot, vars, mood });
  if (said) return { text: said.text, recalled: said.recalled };
  return { text: legacyGreeting(ctx, npcRef), recalled: false };
}

/** The template greeting of the rule voice before the line packs (residents, gaps). */
function legacyGreeting(ctx: SystemContext, npcRef: string): TextParam {
  const b = beliefRaw(ctx.world, npcRef, 'player');
  const rel = relationOf(ctx.world.slices.npc, npcRef, 'player');
  const state = b?.publicState ?? 'unaware';
  if (rel.like <= -15 && (state === 'unaware' || state === 'doubt'))
    return line(ctx, 'greet.cold', npcRef);
  return line(ctx, state === 'unaware' ? 'greet' : `greet.${state}`, npcRef);
}

export function smallTalk(ctx: SystemContext, npcRef: string): TextParam {
  return smallTalkLine(ctx, npcRef).text;
}

/** The share of small talk that brings up a remembered moment when there is one (5.3). */
export const RECALL_CHANCE = 0.4;

/**
 * Small talk (builtin_ai.md 5.3 "回忆进对话"): a named person who remembers something of the
 * player (or wrote a diary entry these days) brings it up now and then; otherwise the
 * template small talk of their state, the weather or their activity.
 */
export function smallTalkLine(
  ctx: SystemContext,
  npcRef: string,
): { text: TextParam; recalled: boolean } {
  const st = ctx.world.slices.npc.npcs[npcRef];
  if (st && persona(ctx, npcRef) && st.activity !== 'sleep') {
    const mem = memoryPhrase(ctx, npcRef);
    const diary = mem ? undefined : diaryPhrase(ctx, npcRef);
    if ((mem || diary) && ctx.rng(`dialogue.lines.${npcRef}`).chance(RECALL_CHANCE)) {
      const said = speak(ctx, {
        speaker: npcRef,
        slot: mem ? 'mem.recall' : 'diary.recall',
        vars: varsFor(ctx, npcRef),
        mood: moodOf(st, ctx.tick),
      });
      if (said) return { text: said.text, recalled: said.recalled };
    }
  }
  return { text: legacySmallTalk(ctx, npcRef), recalled: false };
}

function legacySmallTalk(ctx: SystemContext, npcRef: string): TextParam {
  const st = ctx.world.slices.npc.npcs[npcRef];
  if (!st) return line(ctx, 'chat', npcRef);
  if (st.activity === 'sleep') return line(ctx, 'chat.sleep', npcRef);
  if (st.needs.hunger < 35) return line(ctx, 'chat.hungry', npcRef);
  if (st.needs.energy < 30) return line(ctx, 'chat.tired', npcRef);
  if (persona(ctx, npcRef) && holdingOf(ctx.world, st.entityId).money < 20)
    return line(ctx, 'chat.poor', npcRef);
  if (ctx.rng('dialogue.lines').chance(0.35))
    return line(ctx, `chat.weather.${currentWeather(ctx.world)}`, npcRef);
  return line(ctx, `chat.${st.activity}`, npcRef);
}

/** "What do you think of me": the public stance, worded by state and explanation. */
export function opinion(ctx: SystemContext, npcRef: string): TextParam {
  const b = beliefRaw(ctx.world, npcRef, 'player');
  if (!b) return line(ctx, 'opinion.unaware', npcRef);
  const state = b.publicState;
  if (state === 'explaining')
    return line(ctx, `opinion.explaining.${b.explanation ?? 'luck'}`, npcRef);
  return line(ctx, `opinion.${state}`, npcRef);
}

export function rumorLine(ctx: SystemContext, npcRef: string, rumor: TextParam | null): TextParam {
  return rumor ? line(ctx, 'rumor.tell', npcRef, { rumor }) : line(ctx, 'rumor.none', npcRef);
}

export function farewell(ctx: SystemContext, npcRef: string): TextParam {
  return line(ctx, 'bye', npcRef);
}

/**
 * Rule answer to free text (builtin_ai.md 6.3 to 6.5; PK-M0-26): classifies the player's
 * words into one of the 52 intents and carries out its response table (relation changes,
 * cognition evidence, notifications; R5 system entries and R9 session end are reported
 * back for the caller to act on). The classification and its world effects run the same
 * way with or without a model (builtin_ai 6.3: "分类器在两档都运行"); only the line's
 * wording may later be replaced by the model.
 */
export function answer(
  ctx: SystemContext,
  npcRef: string,
  text: string,
  talk: AnswerContext = {},
): AnswerResult {
  // a hidden goddess name counts as the forbidden word only until its own reveal flag
  // holds (builtin_ai 1.7); without this reader every mention stays forbidden forever,
  // even after the name is public. The open talk sets the context bonuses (6.3): a
  // pending question favours yes and no, a topic being discussed favours clarify.
  const rctx = { afterQuestion: !!talk.afterQuestion, inTopic: !!talk.topic };
  const result = classifyIntent(text, ctx.content, { ...rctx, flag: (key) => ctx.flag(key) });
  // the per-speaker repetition ledger toward the player (builtin_ai 7.7, 18), kept in the
  // dialogue slice so the suppression windows survive save and load
  const slice = ctx.world.slices.dialogue;
  slice.lines ??= {};
  const history = slice.lines[npcRef] ?? newLineHistory();
  slice.lines[npcRef] = history;
  const outcome = respondTo(ctx, {
    npcRef,
    text,
    result,
    ctx: rctx,
    history,
    topic: talk.topic,
    refusals: talk.refusals,
  });
  return {
    line: outcome.line,
    intent: result.main,
    end: outcome.end,
    entry: outcome.entry,
    notify: outcome.notify,
    offense: !!outcome.offense,
    suggest: outcome.suggest,
    topic: outcome.topic,
    refused: !!outcome.refused,
    refusedKey: outcome.refusedKey,
    refusedOut: !!outcome.refusedOut,
    entities: result.entities,
  };
}

/** The open talk around a free-text line (builtin_ai 6.3 context, 6.6 anti-loop). */
export interface AnswerContext {
  /** the person's last line asked a yes-or-no question */
  afterQuestion?: boolean;
  /** the topic being discussed */
  topic?: string;
  /** refusals per topic in this talk */
  refusals?: Record<string, number>;
}

export interface AnswerResult {
  line: TextParam;
  intent: IntentId;
  end: boolean;
  entry: { id: string; params: Record<string, string> } | null;
  notify: string[];
  /** a repeat the rules count as an offense (a second advance on a day, 6.4 row 9) */
  offense?: boolean;
  /** topics offered instead (R4 and refusals, 6.6) */
  suggest?: string[];
  /** the topic answered or refused */
  topic?: string;
  /** a topic or clue was refused this round */
  refused?: boolean;
  /** the refused topic id or clue:<lore id> */
  refusedKey?: string;
  /** the third refusal of one topic in this talk ended it */
  refusedOut?: boolean;
  /** the entities the classifier found (people named to the player) */
  entities?: EntityHit[];
}
