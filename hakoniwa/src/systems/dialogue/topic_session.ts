// The topic menu inside a conversation (builtin_ai.md 6.1 "话题展开为话题菜单", 6.2, 6.6):
// the built-in option `topics` swaps the option list for the menu (at most six topics and
// a way back), a topic option says it (or refuses it, offering two others), and the
// person's patience (6.1) runs down on wasted rounds until they take their leave.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { personaById } from '../npc/personas';
import { relationOf } from '../npc/relations';
import { offerRequest } from './commissions/session';
import { personaHasTrait } from './intent/respond';
import { npcSays, requestReply } from './session';
import { topicById } from './topics/graph';
import { sayTopic, type TopicSaid, topicMenu, topicTitle } from './topics/talk';
import type { DialogueSession, SessionOption } from './types';

export const TOPICS_OPTION = 'topics';
export const BACK_OPTION = 'back';
export const TOPIC_OPTION_PREFIX = 'topic:';
/** Patience of a talk (6.1): 4 + floor(like / 25), one more for an outgoing person. */
export const BASE_PATIENCE = 4;
export const MIN_PATIENCE = 1;

/** The patience a person brings to a new talk with the player (6.1). */
export function startPatience(ctx: SystemContext, npcRef: string): number {
  const like = relationOf(ctx.world.slices.npc, npcRef, 'player').like;
  const outgoing = personaHasTrait(ctx, personaById(ctx.content, npcRef), 'outgoing') ? 1 : 0;
  return Math.max(MIN_PATIENCE, BASE_PATIENCE + Math.floor(like / 25) + outgoing);
}

function topicOption(
  ctx: SystemContext,
  s: DialogueSession,
  id: string,
  evade: boolean,
): SessionOption {
  const t = topicById(ctx.content, id);
  const heard = !!ctx.world.slices.dialogue.topics?.[s.npcRef]?.[id];
  let hint: TextParam | undefined;
  if (evade) hint = tr('sys.dialogue.topic.hint_distant');
  else if (!heard) hint = tr('sys.dialogue.topic.hint_new');
  else if (ctx.world.slices.dialogue.topics?.[s.npcRef]?.[id]?.done)
    hint = tr('sys.dialogue.topic.hint_talked');
  return {
    id: `${TOPIC_OPTION_PREFIX}${id}`,
    label: t ? topicTitle(ctx, t) : id,
    hint,
    system: 'dialogue',
  };
}

/** The topic menu as options (6.2): the ranked topics and the way back. */
export function topicOptions(ctx: SystemContext, s: DialogueSession): SessionOption[] {
  const out = topicMenu(ctx, s.npcRef).map((e) => topicOption(ctx, s, e.topic.id, e.evade));
  out.push({ id: BACK_OPTION, label: tr('sys.dialogue.option.back'), system: 'dialogue' });
  return out;
}

export function openTopicMenu(ctx: SystemContext, s: DialogueSession): void {
  if (s.menu !== 'topics') s.root = s.options;
  s.menu = 'topics';
  s.options = topicOptions(ctx, s);
}

export function closeTopicMenu(s: DialogueSession): void {
  if (s.menu === 'topics' && s.root) s.options = s.root;
  s.menu = 'root';
  s.root = undefined;
}

/** The option list other systems' offers go to (the main list, also while the menu shows). */
export function rootOptions(s: DialogueSession): SessionOption[] {
  return s.menu === 'topics' && s.root ? s.root : s.options;
}

/** Offer topics the person suggested (a redirect, 6.6) as options of the shown list. */
export function addSuggestions(
  ctx: SystemContext,
  s: DialogueSession,
  ids: readonly string[],
): void {
  // the last redirect's suggestions give way to the new ones (the list does not grow)
  s.options = s.options.filter(
    (o) => !(o.id.startsWith(TOPIC_OPTION_PREFIX) && isSuggestion(o.hint)),
  );
  for (const id of ids) {
    const optId = `${TOPIC_OPTION_PREFIX}${id}`;
    if (s.options.some((o) => o.id === optId)) continue;
    const at = Math.max(0, s.options.length - 1);
    s.options.splice(at, 0, {
      ...topicOption(ctx, s, id, false),
      hint: tr('sys.dialogue.topic.hint_suggested'),
    });
  }
}

function isSuggestion(hint: TextParam | undefined): boolean {
  return (
    !!hint &&
    typeof hint === 'object' &&
    'key' in hint &&
    hint.key === 'sys.dialogue.topic.hint_suggested'
  );
}

/**
 * A wasted round costs patience (6.1): a misunderstanding, a refused topic asked again, an
 * offense. Returns true when the person has had enough (the caller ends the talk).
 */
export function spendPatience(s: DialogueSession, amount: number): boolean {
  if (amount <= 0 || s.patience === undefined) return false;
  s.patience = Math.max(0, s.patience - amount);
  return s.patience === 0;
}

/** The person had enough: a farewell line and the talk ends (6.1). */
export function outOfPatience(ctx: SystemContext, s: DialogueSession, line: TextParam): void {
  npcSays(ctx, s, line);
}

/**
 * Talk about a topic chosen from the menu or a suggestion: the answer or the refusal goes
 * out as the NPC's reply (the model may reword it), the menu refreshes, a refused topic
 * asked again costs patience. Returns the outcome for the caller (an ended talk).
 */
export function chooseTopic(
  ctx: SystemContext,
  s: DialogueSession,
  topicId: string,
): TopicSaid | null {
  s.refusals ??= {};
  const before = s.refusals[topicId] ?? 0;
  const said = sayTopic(ctx, s.npcRef, topicId, { refusals: s.refusals });
  if (!said) return null;
  s.topic = topicId;
  if (said.recalled) s.recalled = true;
  ctx.emit('dialogue.topic', {
    npcId: s.npcId,
    npcRef: s.npcRef,
    topicId,
    // a sincere misdirection is the person's answer (6.6)
    outcome: said.outcome === 'answer' || said.outcome === 'mis' ? 'answer' : 'refused',
  });
  if (said.end) return said;
  if (said.outcome !== 'answer' && said.outcome !== 'mis' && before > 0 && spendPatience(s, 1))
    return said; // the person has had enough: the caller says the line and the farewell
  if (s.menu === 'topics') s.options = topicOptions(ctx, s);
  else s.options = s.options.filter((o) => o.id !== `${TOPIC_OPTION_PREFIX}${topicId}`);
  if (said.suggest.length > 0) addSuggestions(ctx, s, said.suggest);
  // the person's trouble may be a request (quests_and_events.md 6.2 step 3)
  if (topicId === 'gen_trouble' && said.outcome === 'answer' && !s.question) offerRequest(ctx, s);
  const t = topicById(ctx.content, topicId);
  const topic = t ? topicTitle(ctx, t) : topicId;
  requestReply(
    ctx,
    s,
    'topic',
    said.line,
    said.outcome === 'answer' || said.outcome === 'mis'
      ? tr('sys.dialogue.prompt.topic', { topic })
      : tr('sys.dialogue.prompt.topic_refused', { topic }),
  );
  return said;
}
