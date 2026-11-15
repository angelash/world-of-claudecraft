// Dialogue system (phase 42): the player's conversation with one NPC. Opening a talk
// emits player.talked, collects dialogue.options_offered from other systems in the
// same tick, and adds the built-in options; NPC answers come from the npc.dialogue AI
// role with rule answers as fallback. Every line is a dialogue.line event.

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { calendarAt, TICKS_PER_GAME_HOUR } from '../../core/time';
import type { World } from '../../core/world';
import { tellPlayer } from '../cognition/rumor';
import { addMemory } from '../npc/memory';
import { personaById } from '../npc/personas';
import { setConversing } from '../npc/ports';
import { adjustRelation } from '../npc/relations';
import { distance, getEntity, playerEntity } from '../world';
import { answer, farewell, greeting, opinion, rumorLine, smallTalk } from './replies';
import {
  addOffered,
  BUILTIN_OPTIONS,
  closeSession,
  KEEP_RANGE,
  npcSays,
  pushLine,
  requestReply,
  TALK_RANGE,
} from './session';
import type { DialogueSession, SessionOption } from './types';

export * from './templates';
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
  lines: { speakerId: string; speakerName: string; text: string; kind: string; tick: number }[];
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
    ctx.world.slices.dialogue = { session: null, chatDay: {}, met: {} };
  },

  tick(ctx) {
    if (ctx.tick % 20 !== 0) return;
    const s = session(ctx);
    if (!s) return;
    if (!stillInReach(ctx, s)) closeSession(ctx, 'walked_away');
    else if (!s.pending && ctx.tick - s.lastTick > IDLE_CLOSE) closeSession(ctx, 'idle');
  },

  on: {
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
        return reject('not_allowed', '只有玩家能发起交谈');
      const p = playerEntity(ctx.world);
      const e = getEntity(ctx.world, d.npcId);
      if (!p) return reject('no_player', '找不到玩家');
      if (!e) return reject('no_npc', '找不到这个人');
      const npcRef = e.ref;
      if (e.kind !== 'npc' || !npcRef || !ctx.world.slices.npc.npcs[npcRef])
        return reject('not_npc', '没法和它说话');
      if (!e.alive || e.hidden) return reject('gone', '对方不在这里');
      if (e.mapId !== p.mapId || distance(p, e) > TALK_RANGE)
        return reject('too_far', '离得太远了，走近些再说');
      const prev = session(ctx);
      if (prev?.npcId === e.id) return ok('已经在说话了');
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
        options: BUILTIN_OPTIONS.map((o) => ({ ...o })),
        pending: false,
      };
      slice.session = s;
      setConversing(ctx, npcRef, true);
      ctx.emit('dialogue.opened', { sessionId: s.id, npcId: e.id, npcRef });
      ctx.emit('player.talked', { npcId: e.id, npcRef });
      npcSays(ctx, s, greeting(ctx, npcRef, first));
      addMemory(ctx, npcRef, {
        text: first ? '那个新来的头一回来找我说话' : '那个新来的来找我说话',
        src: 'self',
        about: 'player',
        imp: first ? 0.4 : 0.15,
        tag: 'talk_player',
      });
      return ok();
    },

    'dialogue.say'(ctx, d, src) {
      if (src.type !== 'player' && src.type !== 'script')
        return reject('not_allowed', '只有玩家能这样说话');
      const s = session(ctx);
      if (!s) return reject('no_session', '现在没有在和谁说话');
      if (!stillInReach(ctx, s)) {
        closeSession(ctx, 'walked_away');
        return reject('too_far', '对方已经听不见了');
      }
      const text = typeof d.text === 'string' ? d.text.replace(/\s+/g, ' ').trim() : '';
      if (!text) return reject('empty', '要说点什么');
      if (text.length > MAX_TEXT)
        return reject('too_long', `一次说的话太长了（至多 ${MAX_TEXT} 字）`);
      s.rev += 1;
      pushLine(
        ctx,
        s,
        { speakerId: ctx.world.slices.world.playerId, speakerName: '你', text, kind: 'say' },
        s.npcId,
      );
      ctx.emit('player.said', { text, toId: s.npcId, mapId: s.mapId });
      addMemory(ctx, s.npcRef, {
        text: `对方对我说：「${text.slice(0, 60)}」`,
        src: 'heard',
        cred: 1,
        about: 'player',
        imp: 0.4,
        tag: 'player_said',
      });
      requestReply(
        ctx,
        s,
        'player_text',
        answer(ctx, s.npcRef, text),
        '回应对方刚才说的话。',
        text,
      );
      return ok();
    },

    'dialogue.choose'(ctx, d, src) {
      if (src.type !== 'player' && src.type !== 'script')
        return reject('not_allowed', '只有玩家能选择');
      const s = session(ctx);
      if (!s) return reject('no_session', '现在没有在和谁说话');
      const opt = s.options.find((o) => o.id === d.optionId);
      if (!opt) return reject('no_option', '没有这个选项');
      if (!stillInReach(ctx, s)) {
        closeSession(ctx, 'walked_away');
        return reject('too_far', '对方已经听不见了');
      }
      pushLine(
        ctx,
        s,
        {
          speakerId: ctx.world.slices.world.playerId,
          speakerName: '你',
          text: opt.label,
          kind: 'say',
        },
        s.npcId,
      );
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
          adjustRelation(ctx, s.npcRef, 'player', { like: 1.5, trust: 0.5 }, '和对方闲聊');
        }
        requestReply(ctx, s, 'small_talk', smallTalk(ctx, s.npcRef), '对方想和你闲聊几句。');
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
            ? `对方向你打听传闻，你决定把听来的这件事讲给他：${told.text}（这是听来的说法，不一定是真的。）`
            : '对方向你打听传闻，但你最近没听到什么。',
        );
        return ok();
      }
      if (opt.id === 'opinion') {
        requestReply(
          ctx,
          s,
          'opinion',
          opinion(ctx, s.npcRef),
          '对方问你怎么看他。照你嘴上的态度回答。',
        );
        return ok();
      }
      return reject('no_option', '没有这个选项');
    },

    'dialogue.close'(ctx) {
      if (!session(ctx)) return reject('no_session', '现在没有在和谁说话');
      closeSession(ctx, 'closed');
      return ok();
    },

    'dialogue.reply'(ctx, d, src) {
      if (src.type === 'player') return reject('not_allowed', '玩家不能替对方回答');
      const s = session(ctx);
      if (!s || s.id !== d.sessionId || s.npcId !== d.npcId)
        return reject('stale', '那场对话已经结束了');
      if (d.revision !== s.rev) return reject('stale', '对话已经往下走了');
      const text =
        typeof d.text === 'string' ? d.text.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
      if (!text) return reject('empty', '回答是空的');
      s.pending = false;
      npcSays(ctx, s, text);
      return ok();
    },
  },
};
