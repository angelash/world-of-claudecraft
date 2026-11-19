// Dialogue system (phase 42): the player's conversation with one NPC. Opening a talk
// emits player.talked, collects dialogue.options_offered from other systems in the
// same tick, and adds the built-in options; NPC answers come from the npc.dialogue AI
// role with rule answers as fallback. Every line is a dialogue.line event.

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { commandText, type TextParam, tr } from '../../core/text';
import { calendarAt, TICKS_PER_GAME_HOUR } from '../../core/time';
import type { World } from '../../core/world';
import { tellPlayer } from '../cognition/rumor';
import { matchOnTalk } from '../cognition/sources';
import { noteOffense } from '../npc/brain';
import { addMemory } from '../npc/memory';
import { personaById } from '../npc/personas';
import { setConversing } from '../npc/ports';
import { adjustRelation } from '../npc/relations';
import { distance, getEntity, playerEntity } from '../world';
import {
  answerRequest,
  leadersPlan,
  offerRequest,
  REQUEST_NO,
  REQUEST_YES,
  requestDone,
} from './commissions';
import { attemptPersuasion, offerPersuasion, PERSUADE_OPTION } from './persuade';
import {
  chooseReaction,
  noteReaction,
  offerReactions,
  REACTION_OPTION_PREFIX,
} from './reaction_offers';
import './prologue/port';
import { answer, farewell, greetingLine, opinion, rumorLine, smallTalkLine } from './replies';
import {
  addOffered,
  BUILTIN_OPTIONS,
  builtinOptions,
  closeSession,
  KEEP_RANGE,
  npcSays,
  pushLine,
  requestReply,
  TALK_RANGE,
} from './session';
import {
  addSuggestions,
  BACK_OPTION,
  chooseTopic,
  closeTopicMenu,
  openTopicMenu,
  rootOptions,
  spendPatience,
  startPatience,
  TOPIC_OPTION_PREFIX,
  TOPICS_OPTION,
} from './topic_session';
import { introduce } from './topics/talk';
import type { DialogueSession, SessionOption } from './types';

export * from './templates';
export * from './topics';
export * from './types';
export { BUILTIN_OPTIONS, TALK_RANGE };

const MAX_TEXT = 200;
const IDLE_CLOSE = TICKS_PER_GAME_HOUR;

// ---------------------------------------------------------------------------
// Queries

export interface ConversationView {
  sessionId: string;
  npcId: string;
  npcRef: string;
  name: string;
  lines: {
    speakerId: string;
    speakerName: TextParam;
    text: TextParam;
    kind: string;
    tick: number;
  }[];
  options: SessionOption[];
  /** waiting for the NPC's answer (show "思考中" after a moment) */
  pending: boolean;
}

export function currentConversation(world: World): ConversationView | null {
  const s = world.slices.dialogue.session;
  if (!s) return null;
  return {
    sessionId: s.id,
    npcId: s.npcId,
    npcRef: s.npcRef,
    name: s.name,
    lines: s.lines.map((l) => ({ ...l })),
    options: s.options.map((o) => ({ ...o })),
    pending: s.pending,
  };
}

/** Whether the player could start talking to this entity right now (for UI prompts). */
export function canTalkTo(world: World, entityId: string): boolean {
  const p = playerEntity(world);
  const e = getEntity(world, entityId);
  if (!p || !e || e.kind !== 'npc' || !e.alive || e.hidden || !e.ref) return false;
  if (!world.slices.npc.npcs[e.ref]) return false;
  return e.mapId === p.mapId && distance(p, e) <= TALK_RANGE;
}

// ---------------------------------------------------------------------------

/** Count today's offenses the player gave a person (the third one ends the talk, 6.1). */
function countOffense(ctx: SystemContext, npcRef: string): void {
  const slice = ctx.world.slices.dialogue;
  slice.offenses ??= {};
  const day = calendarAt(ctx.tick).dayIndex;
  const prev = slice.offenses[npcRef];
  slice.offenses[npcRef] = { day, n: prev && prev.day === day ? prev.n + 1 : 1 };
}

function session(ctx: SystemContext): DialogueSession | null {
  return ctx.world.slices.dialogue.session;
}

function stillInReach(ctx: SystemContext, s: DialogueSession): boolean {
  const p = playerEntity(ctx.world);
  const e = getEntity(ctx.world, s.npcId);
  return !!p && !!e && e.alive && !e.hidden && e.mapId === p.mapId && distance(p, e) <= KEEP_RANGE;
}

export const system: GameSystem = {
  id: 'dialogue',
  order: 42,

  init(ctx) {
    ctx.world.slices.dialogue = { session: null, chatDay: {}, met: {}, intentRelDay: {} };
  },

  tick(ctx) {
    if (ctx.tick % 20 !== 0) return;
    const s = session(ctx);
    if (!s) return;
    if (!stillInReach(ctx, s)) closeSession(ctx, 'walked_away');
    else if (!s.pending && ctx.tick - s.lastTick > IDLE_CLOSE) closeSession(ctx, 'idle');
  },

  on: {
    'npc.reaction'(ctx, e) {
      // a reaction row toward the player: the next talks offer its options (5.6)
      if (e.data.subject === 'player') noteReaction(ctx, e.data.npcId, e.data.row);
    },
    'world.hour'(ctx) {
      // leaders and officials plan their postings once a week (9.6)
      leadersPlan(ctx);
    },
    'guild.commission_done'(ctx, e) {
      // a resident's request done: the relation and the memory follow (6.2 step 4)
      requestDone(ctx, e.data.postingId);
    },
    'dialogue.options_offered'(ctx, e) {
      const s = session(ctx);
      if (!s || e.data.npcId !== s.npcId || e.data.system === 'dialogue') return;
      addOffered(s, e.data.system, e.data.options);
    },
    'entity.died'(ctx, e) {
      const s = session(ctx);
      if (s && (e.data.id === s.npcId || e.data.id === ctx.world.slices.world.playerId))
        closeSession(ctx, 'died');
    },
    'world.map_changed'(ctx, e) {
      const s = session(ctx);
      if (s && (e.data.id === s.npcId || e.data.id === ctx.world.slices.world.playerId))
        closeSession(ctx, 'walked_away');
    },
  },

  commands: {
    'dialogue.talk'(ctx, d, src) {
      if (src.type !== 'player' && src.type !== 'script')
        return reject('not_allowed', tr('sys.dialogue.reject.not_allowed.talk'));
      const p = playerEntity(ctx.world);
      const e = getEntity(ctx.world, d.npcId);
      if (!p) return reject('no_player', tr('sys.dialogue.reject.no_player'));
      if (!e) return reject('no_npc', tr('sys.dialogue.reject.no_npc'));
      const npcRef = e.ref;
      if (e.kind !== 'npc' || !npcRef || !ctx.world.slices.npc.npcs[npcRef])
        return reject('not_npc', tr('sys.dialogue.reject.not_npc'));
      if (!e.alive || e.hidden) return reject('gone', tr('sys.dialogue.reject.gone'));
      if (e.mapId !== p.mapId || distance(p, e) > TALK_RANGE)
        return reject('too_far', tr('sys.dialogue.reject.too_far.talk'));
      const prev = session(ctx);
      if (prev?.npcId === e.id) return ok(tr('sys.dialogue.info.already_talking'));
      if (prev) closeSession(ctx, 'switched');
      const slice = ctx.world.slices.dialogue;
      const first = slice.met[npcRef] === undefined;
      if (first) slice.met[npcRef] = ctx.tick;
      const s: DialogueSession = {
        id: ctx.newId('talk'),
        npcId: e.id,
        npcRef,
        name: e.name,
        mapId: e.mapId,
        openedTick: ctx.tick,
        lastTick: ctx.tick,
        rev: 1,
        lines: [],
        options: builtinOptions(),
        pending: false,
        menu: 'root',
        patience: startPatience(ctx, npcRef),
      };
      slice.session = s;
      offerPersuasion(ctx, s);
      offerReactions(ctx, s);
      setConversing(ctx, npcRef, true);
      ctx.emit('dialogue.opened', { sessionId: s.id, npcId: e.id, npcRef });
      ctx.emit('player.talked', { npcId: e.id, npcRef });
      // face to face with someone who holds a hot rumor about the player (5.6 identity_matched)
      matchOnTalk(ctx, npcRef);
      const hello = greetingLine(ctx, npcRef, first);
      if (hello.recalled) s.recalled = true;
      npcSays(ctx, s, hello.text);
      addMemory(ctx, npcRef, {
        text: tr(
          first ? 'sys.dialogue.memory.player_first_talk' : 'sys.dialogue.memory.player_talk',
        ),
        short: tr('sys.npc.memory.short.talk_player'),
        src: 'self',
        about: 'player',
        imp: first ? 0.4 : 0.15,
        tag: 'talk_player',
      });
      return ok();
    },

    'dialogue.say'(ctx, d, src) {
      if (src.type !== 'player' && src.type !== 'script')
        return reject('not_allowed', tr('sys.dialogue.reject.not_allowed.say'));
      const s = session(ctx);
      if (!s) return reject('no_session', tr('sys.dialogue.reject.no_session'));
      if (!stillInReach(ctx, s)) {
        closeSession(ctx, 'walked_away');
        return reject('too_far', tr('sys.dialogue.reject.too_far.earshot'));
      }
      const text = typeof d.text === 'string' ? d.text.replace(/\s+/g, ' ').trim() : '';
      if (!text) return reject('empty', tr('sys.dialogue.reject.empty.say'));
      if (text.length > MAX_TEXT)
        return reject('too_long', tr('sys.dialogue.reject.too_long', { max: MAX_TEXT }));
      s.rev += 1;
      pushLine(
        ctx,
        s,
        {
          speakerId: ctx.world.slices.world.playerId,
          speakerName: tr('sys.dialogue.name.you'),
          text,
          kind: 'say',
        },
        s.npcId,
      );
      ctx.emit('player.said', { text, toId: s.npcId, mapId: s.mapId });
      addMemory(ctx, s.npcRef, {
        text: tr('sys.dialogue.memory.player_said', { text: text.slice(0, 60) }),
        src: 'heard',
        cred: 1,
        about: 'player',
        imp: 0.4,
        tag: 'player_said',
      });
      // the intent classifier runs in both the no-model and the model-bound path: it
      // decides the world consequences (relation, cognition, notifications) before the
      // reply is requested, so the model can only reword the line, never the outcome
      // (builtin_ai.md 6.3: "分类结果驱动关系与认知写入").
      s.refusals ??= {};
      const askedBefore = new Set(Object.keys(s.refusals));
      // the yes-or-no bonus holds only for the round right after the person asked (6.3)
      const asked = !!s.asked;
      s.asked = false;
      const answered = answer(ctx, s.npcRef, text, {
        afterQuestion: asked,
        topic: s.topic,
        refusals: s.refusals,
      });
      // the free text named people: their topics may now come up (catalog 3.3 "玩家问起其名")
      for (const e of answered.entities ?? []) if (e.kind === 'person') introduce(ctx, e.id);
      if (answered.topic) {
        s.topic = answered.topic;
        ctx.emit('dialogue.topic', {
          npcId: s.npcId,
          npcRef: s.npcRef,
          topicId: answered.topic,
          outcome: answered.refused ? 'refused' : 'answer',
        });
      }
      // the person's request (6.4 rows 30, 34) and the player's yes or no to it (rows 49, 50)
      if (answered.entry?.id === 'quest' && !s.question) offerRequest(ctx, s);
      if (
        (answered.entry?.id === 'answer_yes' || answered.entry?.id === 'answer_no') &&
        s.question?.kind === 'request'
      ) {
        const reply = answerRequest(ctx, s, answered.entry.id === 'answer_yes');
        if (reply) answered.line = reply;
      }
      // persuading someone the player has a persuade objective on is the attempt itself
      // (6.4 row 37): the kernel judges it by the objective's threshold
      let line = answered.line;
      let failedPersuasion = false;
      if (answered.intent === 'persuade' && rootOptions(s).some((o) => o.id === PERSUADE_OPTION)) {
        const tried = attemptPersuasion(ctx, s);
        line = tried.line;
        failedPersuasion = !tried.ok;
      }
      if (answered.suggest && answered.suggest.length > 0) addSuggestions(ctx, s, answered.suggest);
      // a wasted round costs patience (6.1): the intent's own cost, a refused topic asked
      // again, an offense; the person who has had enough says goodbye
      const def = ctx.content.intentRules?.intents[answered.intent];
      let cost = def?.valid ? 0 : -(def?.patience ?? 0);
      if (answered.refused && answered.refusedKey && askedBefore.has(answered.refusedKey))
        cost += 1;
      if (failedPersuasion) cost += 1;
      const spent = spendPatience(s, cost);
      // an insult or a threat angers the person at the player (builtin_ai.md 3.3, 6.1)
      if (answered.intent === 'insult' || answered.intent === 'threaten' || answered.offense) {
        noteOffense(ctx, s.npcRef, answered.intent === 'threaten');
        countOffense(ctx, s.npcRef);
      }
      for (const notify of answered.notify)
        ctx.emit('dialogue.notified', {
          npcId: s.npcId,
          npcRef: s.npcRef,
          notify,
          intent: answered.intent,
          ...(notify === 'audit' && answered.audit ? answered.audit : {}),
        });
      if (answered.end || spent) {
        // the intent (e.g. farewell), the third refusal of a topic or a spent patience ends
        // the talk: show the line straight away, like the explicit "bye" option does,
        // instead of routing it through the model-reply round trip, whose dialogue.reply
        // would arrive after the session (and its revision) this reply was requested
        // against is already gone (stale, dropped).
        npcSays(ctx, s, answered.end ? line : farewell(ctx, s.npcRef));
        closeSession(ctx, answered.refusedOut ? 'refused' : spent ? 'patience' : 'bye');
        return ok();
      }
      requestReply(ctx, s, 'player_text', line, tr('sys.dialogue.prompt.reply_player'), text);
      return ok();
    },

    'dialogue.choose'(ctx, d, src) {
      if (src.type !== 'player' && src.type !== 'script')
        return reject('not_allowed', tr('sys.dialogue.reject.not_allowed.choose'));
      const s = session(ctx);
      if (!s) return reject('no_session', tr('sys.dialogue.reject.no_session'));
      const opt = s.options.find((o) => o.id === d.optionId);
      if (!opt) return reject('no_option', tr('sys.dialogue.reject.no_option'));
      if (!stillInReach(ctx, s)) {
        closeSession(ctx, 'walked_away');
        return reject('too_far', tr('sys.dialogue.reject.too_far.earshot'));
      }
      // opening and leaving the topic menu only changes the options (6.1, 6.2)
      const own = opt.system === 'dialogue';
      if (own && opt.id === TOPICS_OPTION) {
        s.lastTick = ctx.tick;
        openTopicMenu(ctx, s);
        return ok();
      }
      if (own && opt.id === BACK_OPTION) {
        s.lastTick = ctx.tick;
        closeTopicMenu(s);
        return ok();
      }
      pushLine(
        ctx,
        s,
        {
          speakerId: ctx.world.slices.world.playerId,
          speakerName: tr('sys.dialogue.name.you'),
          text: opt.label,
          kind: 'say',
        },
        s.npcId,
      );
      if (own && (opt.id === REQUEST_YES || opt.id === REQUEST_NO)) {
        s.rev += 1;
        s.lastTick = ctx.tick;
        const reply = answerRequest(ctx, s, opt.id === REQUEST_YES);
        if (reply) requestReply(ctx, s, 'request', reply, tr('sys.dialogue.prompt.request'));
        return ok();
      }
      if (own && opt.id.startsWith(REACTION_OPTION_PREFIX)) {
        s.rev += 1;
        s.lastTick = ctx.tick;
        const chosen = chooseReaction(ctx, s, opt.id);
        if (!chosen) return reject('no_option', tr('sys.dialogue.reject.no_option'));
        if (chosen.refused) {
          // a payment the player cannot make: a note, not the person's line
          pushLine(ctx, s, {
            speakerId: s.npcId,
            speakerName: '',
            text: tr('sys.dialogue.reaction.no_money'),
            kind: 'narrate',
          });
          return ok();
        }
        if (chosen.request) offerRequest(ctx, s);
        if (chosen.line)
          requestReply(ctx, s, 'reaction', chosen.line, tr('sys.dialogue.prompt.reaction'));
        return ok();
      }
      if (own && opt.id === PERSUADE_OPTION) {
        s.rev += 1;
        s.lastTick = ctx.tick;
        const tried = attemptPersuasion(ctx, s);
        // a failed attempt is a wasted round (6.1)
        if (!tried.ok && spendPatience(s, 1)) {
          npcSays(ctx, s, tried.line);
          closeSession(ctx, 'patience');
          return ok();
        }
        requestReply(ctx, s, 'persuade', tried.line, tr('sys.dialogue.prompt.persuade'));
        return ok();
      }
      if (own && opt.id.startsWith(TOPIC_OPTION_PREFIX)) {
        s.rev += 1;
        const said = chooseTopic(ctx, s, opt.id.slice(TOPIC_OPTION_PREFIX.length));
        if (!said) return reject('no_option', tr('sys.dialogue.reject.no_option'));
        if (said.end) {
          npcSays(ctx, s, said.line);
          closeSession(ctx, 'refused');
        } else if (s.patience === 0) {
          // the line still goes out, then the person has had enough (6.1)
          npcSays(ctx, s, said.line);
          npcSays(ctx, s, farewell(ctx, s.npcRef));
          closeSession(ctx, 'patience');
        }
        return ok();
      }
      if (opt.system !== 'dialogue') {
        s.lastTick = ctx.tick;
        // an offered option is answered once; the offering system re-offers it on the next talk
        s.options = s.options.filter((o) => o.id !== opt.id);
        ctx.emit('dialogue.option_chosen', {
          npcId: s.npcId,
          system: opt.system,
          optionId: opt.id.slice(opt.system.length + 1),
        });
        return ok();
      }
      if (opt.id === 'bye') {
        npcSays(ctx, s, farewell(ctx, s.npcRef));
        closeSession(ctx, 'bye');
        return ok();
      }
      s.rev += 1;
      if (opt.id === 'chat') {
        const day = calendarAt(ctx.tick).dayIndex;
        const slice = ctx.world.slices.dialogue;
        if (slice.chatDay[s.npcRef] !== day && personaById(ctx.content, s.npcRef)) {
          slice.chatDay[s.npcRef] = day;
          adjustRelation(
            ctx,
            s.npcRef,
            'player',
            { like: 1.5, trust: 0.5 },
            tr('sys.dialogue.reason.chat'),
          );
        }
        const talk = smallTalkLine(ctx, s.npcRef);
        if (talk.recalled) s.recalled = true;
        requestReply(ctx, s, 'small_talk', talk.text, tr('sys.dialogue.prompt.small_talk'));
        return ok();
      }
      if (opt.id === 'rumors') {
        const told = tellPlayer(ctx, s.npcRef);
        requestReply(
          ctx,
          s,
          'tell_rumor',
          rumorLine(ctx, s.npcRef, told?.text ?? null),
          told
            ? tr('sys.dialogue.prompt.tell_rumor', { rumor: told.text })
            : tr('sys.dialogue.prompt.no_rumor'),
        );
        return ok();
      }
      if (opt.id === 'opinion') {
        requestReply(ctx, s, 'opinion', opinion(ctx, s.npcRef), tr('sys.dialogue.prompt.opinion'));
        return ok();
      }
      return reject('no_option', tr('sys.dialogue.reject.no_option'));
    },

    'dialogue.close'(ctx) {
      if (!session(ctx)) return reject('no_session', tr('sys.dialogue.reject.no_session'));
      closeSession(ctx, 'closed');
      return ok();
    },

    'dialogue.reply'(ctx, d, src) {
      if (src.type === 'player')
        return reject('not_allowed', tr('sys.dialogue.reject.not_allowed.reply'));
      const s = session(ctx);
      if (!s || s.id !== d.sessionId || s.npcId !== d.npcId)
        return reject('stale', tr('sys.dialogue.reject.stale.closed'));
      if (d.revision !== s.rev) return reject('stale', tr('sys.dialogue.reject.stale.moved_on'));
      // model words: a string, normalised, capped and kept as raw text; the rule fallback may
      // also be a TextRef, capped the same way
      const text = commandText(
        d.text,
        src.type === 'ai',
        (s) => s.replace(/\s+/g, ' ').trim().slice(0, 120),
        120,
      );
      if (!text) return reject('empty', tr('sys.dialogue.reject.empty.reply'));
      s.pending = false;
      npcSays(ctx, s, text);
      return ok();
    },
  },
};
