// NPC-to-NPC small talk: residents at the same place now and then talk. The kernel
// decides who talks and the relational effects; the line is a rule template or, for
// L1 speakers, the npc.dialogue model's wording. Rumor exchange happens in cognition,
// which subscribes to npc.conversed.

import { systemSource } from '../../core';
import type { AnyCommand } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { calendarAt } from '../../core/time';
import { pickLine } from '../dialogue/templates';
import { currentWeather, getEntity } from '../world';
import type { LocationDef } from '../world/types';
import { moveInto, pushTrack } from './actions';
import { baseContext } from './ai_context';
import { CHAT_BASE, CHAT_COOLDOWN, CHAT_DEADLINE, SAY_AI_COOLDOWN } from './constants';
import { addMemory } from './memory';
import { cardOf, personaById } from './personas';
import { inside, locationById } from './places';
import { adjustRelation, relationBand, relationOf } from './relations';
import type { Activity, NpcState } from './types';

const CHATTY: ReadonlySet<Activity> = new Set<Activity>(['chat', 'eat', 'shop', 'wander', 'work']);
const SOCIAL_KINDS = new Set(['tavern', 'market', 'plaza', 'well', 'creek', 'safe', 'slum']);

function eligible(ctx: SystemContext, st: NpcState, loc: LocationDef | undefined): boolean {
  if (st.gone || st.talking || !loc || !CHATTY.has(st.activity)) return false;
  if (ctx.tick - st.lastChatTick < CHAT_COOLDOWN) return false;
  if (st.activity === 'work' && !SOCIAL_KINDS.has(loc.kind) && loc.kind !== 'guild') return false;
  const e = getEntity(ctx.world, st.entityId);
  return !!e && e.mapId === st.mapId && inside(loc, e.x, e.y, 1);
}

/** Roll chats across every map (called on the chat cadence). */
export function runChats(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  const rng = ctx.rng('npc.chat');
  const groups = new Map<string, { loc: LocationDef; members: NpcState[] }>();
  for (const id of Object.keys(slice.npcs).sort()) {
    const st = slice.npcs[id] as NpcState;
    if (!st.locId) continue;
    const loc = locationById(ctx.content, st.mapId, st.locId);
    if (!eligible(ctx, st, loc)) continue;
    const key = `${st.mapId}/${st.locId}`;
    let g = groups.get(key);
    if (!g) {
      g = { loc: loc as LocationDef, members: [] };
      groups.set(key, g);
    }
    g.members.push(st);
  }
  for (const key of [...groups.keys()].sort()) {
    const g = groups.get(key) as { loc: LocationDef; members: NpcState[] };
    if (g.members.length < 2) continue;
    const list = rng.shuffle([...g.members]);
    for (let i = 0; i + 1 < list.length; i += 2) {
      const a = list[i] as NpcState;
      const b = list[i + 1] as NpcState;
      let p = CHAT_BASE;
      if (a.activity === 'chat' || b.activity === 'chat') p *= 1.6;
      if (SOCIAL_KINDS.has(g.loc.kind)) p *= 1.3;
      if (a.needs.social < 40 || b.needs.social < 40) p *= 1.3;
      if (relationOf(slice, a.id, b.id).like < -20) p *= 0.4;
      if (rng.chance(Math.min(0.95, p))) converse(ctx, a, b, g.loc);
    }
  }
  strollVisible(ctx);
}

/** Two residents talk: needs, relations, memory, track, the line, and npc.conversed. */
export function converse(ctx: SystemContext, a: NpcState, b: NpcState, loc: LocationDef): void {
  const slice = ctx.world.slices.npc;
  const hour = calendarAt(ctx.tick).hour;
  const visible = a.mapId === slice.playerMap;
  a.lastChatTick = ctx.tick;
  b.lastChatTick = ctx.tick;
  a.needs.social = Math.min(100, a.needs.social + 8);
  b.needs.social = Math.min(100, b.needs.social + 8);
  const cardA = cardOf(slice, ctx.content, a.id);
  const cardB = cardOf(slice, ctx.content, b.id);
  if (!cardA || !cardB) return;
  const knewA = !!slice.minds[a.id]?.rel[b.id];
  const knewB = !!slice.minds[b.id]?.rel[a.id];
  const sour = relationOf(slice, a.id, b.id).like < -30;
  const kind = sour ? 'quarrel' : 'chat';
  adjustRelation(
    ctx,
    a.id,
    b.id,
    sour ? { like: -2 } : { like: 1, trust: 0.5 },
    sour ? tr('sys.npc.reason.quarrel') : tr('sys.npc.reason.chat'),
  );
  adjustRelation(
    ctx,
    b.id,
    a.id,
    sour ? { like: -2 } : { like: 1, trust: 0.5 },
    sour ? tr('sys.npc.reason.quarrel') : tr('sys.npc.reason.chat'),
  );
  pushTrack(a, hour, knewA ? kind : 'meet', loc.id, cardB.name);
  pushTrack(b, hour, knewB ? kind : 'meet', loc.id, cardA.name);
  addMemory(ctx, a.id, {
    text: tr(sour ? 'sys.npc.memory.quarrel' : 'sys.npc.memory.chat', {
      place: loc.name,
      other: cardB.name,
    }),
    src: 'self',
    about: b.id,
    imp: sour ? 0.35 : 0.12,
  });
  addMemory(ctx, b.id, {
    text: tr(sour ? 'sys.npc.memory.quarrel' : 'sys.npc.memory.chat', {
      place: loc.name,
      other: cardA.name,
    }),
    src: 'self',
    about: a.id,
    imp: sour ? 0.35 : 0.12,
  });
  ctx.emit('npc.conversed', {
    a: a.id,
    b: b.id,
    mapId: a.mapId,
    locationId: loc.id,
    locationKind: loc.kind,
    visible,
  });
  if (visible) speak(ctx, a, b, loc, sour);
}

/** The visible line: rule template, or a model request with that template as fallback (L1). */
function speak(ctx: SystemContext, a: NpcState, b: NpcState, loc: LocationDef, sour: boolean) {
  const slice = ctx.world.slices.npc;
  const pa = personaById(ctx.content, a.id);
  const cardB = cardOf(slice, ctx.content, b.id);
  if (!cardB) return;
  // quiet people (spread below 0.4: Noi, Toma, Hock) talk, but rarely out loud
  if (pa && (pa.spread ?? 1) < 0.4) return;
  const rng = ctx.rng('npc.lines');
  const weather = currentWeather(ctx.world);
  const topic = sour
    ? 'banter.sour'
    : a.needs.hunger < 40
      ? 'banter.hungry'
      : a.needs.energy < 35
        ? 'banter.tired'
        : rng.chance(0.4)
          ? `banter.weather.${weather}`
          : `banter.${a.activity}`;
  const vars = { other: cardB.name, place: loc.name };
  const text = pickLine(ctx.content, topic, vars, rng, pa);
  if (!text) return;
  a.sayRev += 1;
  const data = { npcId: a.id, toId: b.id, text, revision: a.sayRev };
  if (pa && a.tier === 1 && ctx.tick - a.lastSayTick >= SAY_AI_COOLDOWN) {
    a.lastSayTick = ctx.tick;
    const fallback: AnyCommand[] = [{ kind: 'npc.say', data, source: systemSource('npc') }];
    ctx.ai.request({
      agentId: a.id,
      role: 'npc.dialogue',
      purpose: 'npc_chat',
      revision: a.sayRev,
      context: baseContext(
        ctx.content,
        pa,
        slice.minds[a.id],
        (k) => ctx.flag(k),
        tr('sys.npc.prompt.chat_situation', {
          place: loc.name,
          other: cardB.name,
          band: relationBand(relationOf(slice, a.id, b.id)),
        }),
        {
          'npc.say': tr('sys.npc.prompt.chat_command', {
            npcId: a.id,
            toId: b.id,
            rev: a.sayRev,
          }),
        },
        { suggested: text },
      ),
      allowed: ['npc.say'],
      fallback,
      deadlineTicks: CHAT_DEADLINE,
      priority: 1,
    });
    return;
  }
  ctx.dispatch('npc.say', data, systemSource('npc'));
}

/** Idle residents on the player's map drift to another spot of their place (looks alive). */
function strollVisible(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  if (!slice.playerMap) return;
  const rng = ctx.rng('npc.stroll');
  for (const id of Object.keys(slice.npcs).sort()) {
    const st = slice.npcs[id] as NpcState;
    if (st.gone || st.talking || st.mapId !== slice.playerMap) continue;
    if (st.activity !== 'wander' && st.activity !== 'chat' && st.activity !== 'shop') continue;
    const e = getEntity(ctx.world, st.entityId);
    if (!e || e.move) continue;
    if (!rng.chance(0.25)) continue;
    const loc = locationById(ctx.content, st.mapId, st.locId);
    if (loc) moveInto(ctx, st, loc, true);
  }
}
