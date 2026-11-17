// What a functional-role action does beyond moving the person (builtin_ai.md 4.2 and 4.3):
// a giver's request becomes the reason to approach the player, a healer treats the
// neediest patient, an informant picks up and checks rumors, a bard performs, a patron
// backs the player, a cleric holds the service, hears a confession and gives alms. Every
// change goes through the social systems' own ports (needs, relations, memory, rumor
// holdings). Deterministic: no draws here.

import type { SystemContext } from '../../../core/system';
import { tr } from '../../../core/text';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../../core/time';
import { findHolding, receive } from '../../cognition/rumor';
import { broadcast } from '../../cognition/spread';
import { pushTrack } from '../actions';
import { bumpNeed, ensureNeeds } from '../needs';
import { cardOf } from '../personas';
import { locationById, placeRef } from '../places';
import { adjustRelation } from '../relations';
import type { NpcState } from '../types';
import type { RoleEffect } from './library';
import { remember } from './memory_rules';
import { holdingsByHeat, namedHere } from './sense';
import { noteRecent, since, sortedNpcIds } from './state';

/** The neediest named NPC of the actor's map a healer would see first (the patient). */
export function patientOf(ctx: SystemContext, st: NpcState): NpcState | undefined {
  const slice = ctx.world.slices.npc;
  let best: NpcState | undefined;
  let worst = Number.POSITIVE_INFINITY;
  for (const id of sortedNpcIds(slice.npcs)) {
    const o = slice.npcs[id] as NpcState;
    if (o === st || o.resident || o.gone || o.mapId !== st.mapId) continue;
    const n = ensureNeeds(o.needs);
    const hurt = since(o, 'harmed', ctx.tick) <= TICKS_PER_GAME_DAY ? 0 : 100;
    const score = Math.min(n.energy, hurt);
    if (score < 25 && score < worst) {
      worst = score;
      best = o;
    }
  }
  return best;
}

function nameOf(ctx: SystemContext, id: string) {
  return cardOf(ctx.world.slices.npc, ctx.content, id)?.name ?? id;
}

/** Apply the side effect of a role action for `st` (called once the decision applies). */
export function applyRoleEffect(ctx: SystemContext, st: NpcState, effect: RoleEffect): void {
  const hour = calendarAt(ctx.tick).hour;
  const card = cardOf(ctx.world.slices.npc, ctx.content, st.id);
  if (!card) return;
  const here = placeRef(card.map, st.mapId, st.locId);
  switch (effect) {
    case 'request':
      // a request in hand: the giver now has a reason to walk up to the player (3.4)
      noteRecent(st, 'request', ctx.tick);
      pushTrack(st, hour, 'work_issue', here);
      return;
    case 'restock':
      pushTrack(st, hour, 'trade', here);
      return;
    case 'treat': {
      const patient = patientOf(ctx, st);
      if (!patient) return;
      const n = ensureNeeds(patient.needs);
      n.energy = Math.min(100, n.energy + 15);
      bumpNeed(patient.needs, 'peace', 5);
      adjustRelation(ctx, patient.id, st.id, { like: 2, trust: 1 }, tr('sys.npc.reason.treated'));
      remember(ctx, patient.id, 'helped', { who: nameOf(ctx, st.id) }, { about: st.id });
      noteRecent(patient, 'helped', ctx.tick);
      pushTrack(st, hour, 'help', here, nameOf(ctx, patient.id) as string, patient.id);
      return;
    }
    case 'collect': {
      const mine = new Set(holdingsByHeat(ctx, st.id).map((h) => h.rumor));
      const cog = ctx.world.slices.cognition;
      for (const o of namedHere(ctx, st)) {
        const h = holdingsByHeat(ctx, o.id).find((x) => !mine.has(x.rumor));
        const r = h ? cog.rumors[h.rumor] : undefined;
        if (!h || !r) continue;
        receive(
          ctx,
          st.id,
          {
            rumor: r,
            v: { ...h.v, details: [...h.v.details] },
            cred: Math.round(h.cred * 0.8 * 1000) / 1000,
            origin: h.origin,
            hops: h.hops + 1,
            fromId: o.id,
            fromName: nameOf(ctx, o.id),
          },
          st.mapId,
        );
        pushTrack(st, hour, 'gossip', here, nameOf(ctx, o.id) as string, o.id);
        return;
      }
      return;
    }
    case 'verify': {
      // check a half-believed rumor against an eyewitness of this map (4.4 "问目击者")
      const cog = ctx.world.slices.cognition;
      const doubtful = holdingsByHeat(ctx, st.id).find((h) => h.cred >= 0.3 && h.cred <= 0.7);
      if (!doubtful) return;
      for (const id of Object.keys(cog.holdings).sort()) {
        const o = ctx.world.slices.npc.npcs[id];
        if (!o || o.mapId !== st.mapId || id === st.id) continue;
        const seen = findHolding(cog, id, doubtful.rumor);
        if (seen?.from !== 'seen') continue;
        doubtful.v = { ...seen.v, details: [...seen.v.details] };
        doubtful.cred = 0.9;
        doubtful.believed = true;
        return;
      }
      return;
    }
    case 'perform': {
      // a song: the hottest tale gets hotter and everyone present hears the sung version
      const cog = ctx.world.slices.cognition;
      const best = holdingsByHeat(ctx, st.id)[0];
      const r = best ? cog.rumors[best.rumor] : undefined;
      if (!best || !r) return;
      r.heat = Math.min(1, Math.round((r.heat + 0.1) * 1000) / 1000);
      for (const o of namedHere(ctx, st)) {
        if (findHolding(cog, o.id, r.id)) continue;
        receive(
          ctx,
          o.id,
          {
            rumor: r,
            v: { ...best.v, details: [...best.v.details] },
            cred: 0.4,
            origin: `song:${st.id}`,
            hops: best.hops + 1,
            fromId: st.id,
            fromName: nameOf(ctx, st.id),
          },
          st.mapId,
        );
      }
      return;
    }
    case 'back':
      adjustRelation(ctx, st.id, 'player', { interest: 5, like: 2 }, tr('sys.npc.reason.backed'));
      return;
    case 'sermon':
      for (const o of namedHere(ctx, st)) {
        const n = ensureNeeds(o.needs);
        n.faith = Math.min(100, n.faith + 15);
        bumpNeed(o.needs, 'peace', 5);
      }
      return;
    case 'confession': {
      const loc = locationById(ctx.content, st.mapId, st.locId);
      if (loc?.kind !== 'church') return;
      const sinner = namedHere(ctx, st).find((o) => ensureNeeds(o.needs).peace < 40);
      if (!sinner) return;
      bumpNeed(sinner.needs, 'peace', 20);
      remember(ctx, sinner.id, 'helped', { who: nameOf(ctx, st.id) }, { about: st.id });
      // the sinner's track reads places from the sinner's own home map
      const home = cardOf(ctx.world.slices.npc, ctx.content, sinner.id)?.map ?? card.map;
      pushTrack(sinner, hour, 'pray', placeRef(home, sinner.mapId, sinner.locId));
      return;
    }
    case 'vespers':
      pushTrack(st, hour, 'pray', here);
      return;
    case 'broadcast':
      if (broadcast(ctx, st.id) > 0) pushTrack(st, hour, 'gossip', here);
      return;
    case 'alms': {
      const slice = ctx.world.slices.npc;
      for (const id of sortedNpcIds(slice.npcs)) {
        const o = slice.npcs[id] as NpcState;
        if (o === st || o.resident || o.gone || o.mapId !== st.mapId) continue;
        if (ensureNeeds(o.needs).money >= 30) continue;
        bumpNeed(o.needs, 'peace', 10);
        adjustRelation(ctx, o.id, st.id, { like: 2 }, tr('sys.npc.reason.alms'));
      }
      pushTrack(st, hour, 'help', here);
      return;
    }
  }
}
