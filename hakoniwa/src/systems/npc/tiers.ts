// Tiered reasoning (D-009, npc_society_ai.md 1.3): a relevance score per named NPC
// and the L1 to L4 assignment with the L1 cap and the temporary dialogue slots.

import type { SystemContext } from '../../core/system';
import { distance, getEntity, mapById, mapStoryActs, playerEntity } from '../world';
import { CORE_RADIUS, L1_CAP, L1_DIALOGUE_SLOTS, L1_SCORE, L2_SCORE } from './constants';
import { personaById } from './personas';
import type { NpcState, Tier } from './types';

/** Maps directly connected by an exit (for the "adjacent region" proximity term). */
function adjacent(ctx: SystemContext, a: string, b: string): boolean {
  const ma = mapById(ctx.content, a);
  const mb = mapById(ctx.content, b);
  return !!(ma?.exits.some((x) => x.toMap === b) || mb?.exits.some((x) => x.toMap === a));
}

/**
 * Story weight counts in its own act (the card's acts, else the story acts its home map
 * declares, MapDef.storyActs); with no act flag set, only on the player's map.
 */
function plotWeight(ctx: SystemContext, st: NpcState, playerMap: string): number {
  const p = personaById(ctx.content, st.id);
  if (!p) return 0;
  const weight = p.plot ?? (p.core ? 1 : 0);
  const act = ctx.flag('act');
  const acts = p.acts ?? mapStoryActs(ctx.content, p.map);
  const active = typeof act === 'string' && act ? acts.includes(act) : st.mapId === playerMap;
  return active ? weight : 0;
}

/**
 * S = 50 plot + 30 named-by-quest + 20 relation strength + 15 heat + 10 proximity
 * (design 1.3; the "hot rumor about the player" term arrives through heat).
 */
export function relevanceScore(ctx: SystemContext, st: NpcState): number {
  if (st.resident) return 0;
  const slice = ctx.world.slices.npc;
  const named = ctx.flag(`ai.focus.${st.id}`) ? 1 : 0;
  const r = slice.minds[st.id]?.rel.player;
  const relStrength = r
    ? Math.min(1, (Math.abs(r.like) + Math.abs(r.trust - 50) + r.awe + Math.abs(r.interest)) / 160)
    : 0;
  const player = playerEntity(ctx.world);
  const plot = plotWeight(ctx, st, player?.mapId ?? '');
  let prox = 0;
  if (player) {
    if (player.mapId === st.mapId) prox = 1;
    else if (adjacent(ctx, player.mapId, st.mapId)) prox = 0.5;
  }
  return 50 * plot + 30 * named + 20 * relStrength + 15 * Math.min(1, st.heat) + 10 * prox;
}

/** Recompute every NPC's tier; emits npc.tier_changed for changes. */
export function recomputeTiers(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  const player = playerEntity(ctx.world);
  const playerMap = player?.mapId ?? '';
  const ids = Object.keys(slice.npcs).sort();
  const next = new Map<string, Tier>();
  const l1: { id: string; s: number }[] = [];
  for (const id of ids) {
    const st = slice.npcs[id] as NpcState;
    if (st.resident) {
      next.set(id, 4);
      continue;
    }
    if (st.gone) {
      next.set(id, 3);
      continue;
    }
    if (st.talking) {
      next.set(id, 1);
      continue;
    }
    const s = relevanceScore(ctx, st);
    const p = personaById(ctx.content, id);
    // named by a quest or a written beat (flag ai.focus.<id>): L1 on stage, L2 offstage
    const named = !!ctx.flag(`ai.focus.${id}`);
    let t: Tier;
    if (st.mapId === playerMap) {
      const e = getEntity(ctx.world, st.entityId);
      const near = !!(e && player && distance(e, player) <= CORE_RADIUS);
      t = (p?.core && near) || named || s >= L1_SCORE ? 1 : 2;
    } else {
      t = named || s >= L2_SCORE ? 2 : 3;
    }
    if (t === 1) l1.push({ id, s });
    next.set(id, t);
  }
  // conversation partners hold the temporary dialogue slots; the rest share the L1 cap
  const talking = ids.filter((id) => slice.npcs[id]?.talking).length;
  const cap = Math.max(0, L1_CAP - Math.max(0, talking - L1_DIALOGUE_SLOTS));
  l1.sort((a, b) => b.s - a.s || a.id.localeCompare(b.id));
  for (const extra of l1.slice(cap)) next.set(extra.id, 2);
  slice.playerMap = playerMap;
  for (const id of ids) {
    const st = slice.npcs[id] as NpcState;
    const t = next.get(id) ?? st.tier;
    if (t !== st.tier) {
      const from = st.tier;
      st.tier = t;
      if (!st.resident) ctx.emit('npc.tier_changed', { npcId: id, from, to: t });
    }
  }
}
