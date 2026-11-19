// Party system, phase 25 (companions_and_party.md): companions, the servant, retainers and
// the beast companion. A thin coordinator: the roster (roster.ts) spawns a companion beside
// the player when companion.<id>.recruited turns true and keeps the rest of the roster out
// of the world; the brain (ai.ts) runs the six-layer behaviour tree under the stance and
// the tactical orders (commands.ts); experience (growth.ts), bonds (bond.ts), the story's
// red lines, departures and personal lines (story.ts), going down and grave injury
// (wounds.ts), the ironman switch (ironman.ts), beasts and retainers (pets.ts), temporary
// companions (temps.ts), sediment exposure (exposure.ts) and mounts (mounts.ts) are their
// own modules; so are the built-in AI's per-fight tactics (tactics.ts), the avoid layer
// (danger.ts), party chatter (banter.ts) and the care of the hurt (care.ts) (PK-M1-21).

import type { ContentMap } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { unitOf } from '../combat';
import { referencedVars } from '../quests/conditions';
import { getEntity, teleportEntity } from '../world';
import { type Profile, tickMember } from './ai';
import { onRelation, raise, setBanterGate, tickBanter } from './banter';
import { addKillBond, applyBondFlags } from './bond';
import { noteTreated, onInjuryFlag, onRecovered, onSlept, onWounded, tickCare } from './care';
import { commands } from './commands';
import { companionDef, partyConfig } from './config';
import { enrolBodies, onCrystalDue } from './exposure';
import { installFeedingGate, onFedItem } from './feeding';
import { onCompanionKillXp, onPlayerXp } from './growth';
import { ironmanWritten } from './ironman';
import { mountItemChanged } from './mounts';
import { onBag, syncPets } from './pets';
import { bodyFor, bringIn, fieldMembers, join, leave, sortedMembers, stateOf } from './roster';
import { checkPresence, seenRedLines, settleStory } from './story';
import { noteDown, noteRescue, rescueTarget, tickFight } from './tactics';
import { onQuestStage, onTalked, releaseTemp, settleTemps } from './temps';
import type { Member } from './types';
import {
  noteHit,
  onDefeat,
  onDown,
  partyFighting,
  slotNear,
  snapHealth,
  tickClocks,
} from './wounds';

// Effect executors are installed for both fresh games and direct save resumes.
installFeedingGate();

export { banterState } from './banter';
export { banterMetric } from './banter_metric';
export * from './bond';
export { DEFAULT_PARTY_CONFIG, partyConfig, slotsFor } from './config';
export { catchUpFactor, levelCap } from './growth';
export { ironmanOn } from './ironman';
export { activeMount, mountStops, rideDayKm } from './mounts';
export { bagKeeper, pactCandidates, petLevel } from './pets';
export { recruitable, slotsUsed } from './roster';
export type * from './types';
export * from './view';

const RECRUIT = /^companion\.([a-z0-9_]+)\.recruited$/;

/** Variables the red lines, departures, returns and presence records read (per content set). */
const storyVars = new WeakMap<ContentMap, { story: Set<string>; presence: Set<string> }>();
function storyKeys(content: ContentMap): { story: Set<string>; presence: Set<string> } {
  let s = storyVars.get(content);
  if (!s) {
    const story = new Set<string>();
    const presence = new Set<string>();
    for (const def of content.companions ?? []) {
      for (const r of def.redLines ?? []) for (const v of referencedVars(r.when)) story.add(v);
      for (const l of def.leaves ?? []) {
        for (const v of referencedVars(l.when)) story.add(v);
        if (l.back) for (const v of referencedVars(l.back.when)) story.add(v);
      }
      for (const p of def.presence ?? []) for (const v of referencedVars(p.when)) presence.add(v);
    }
    s = { story, presence };
    storyVars.set(content, s);
  }
  return s;
}

function profileOf(ctx: SystemContext, m: Member): Profile | undefined {
  if (m.pet) return { id: m.id, role: 'melee' };
  return companionDef(ctx.content, m.id);
}

function recruited(ctx: SystemContext, id: string): void {
  const have = ctx.world.slices.party.members[id];
  if (have?.temp) releaseTemp(ctx, have);
  const m = join(ctx, id);
  const def = companionDef(ctx.content, id);
  if (!m || !def) return;
  seenRedLines(ctx, def, m);
  applyBondFlags(ctx, def, m);
}

/** The player moved to another map: the party comes along (waiting and guarding stay). */
function followPlayer(ctx: SystemContext): void {
  const p = getEntity(ctx.world, ctx.world.slices.world.playerId);
  if (!p) return;
  if (partyFighting(ctx)) onDefeat(ctx);
  fieldMembers(ctx.world).forEach((m, i) => {
    if (m.temp || stateOf(m) === 'waiting' || m.pet?.guarding) return;
    if (unitOf(ctx.world, m.entityId)?.downed) return;
    const s = slotNear(p, i + 1);
    teleportEntity(ctx, m.entityId, p.mapId, s.x, s.y);
  });
}

export const system: GameSystem = {
  id: 'party',
  order: 25,

  init(ctx) {
    ctx.world.slices.party = { members: {} };
    for (const def of ctx.content.companions ?? []) {
      if (ctx.flag(`companion.${def.id}.recruited`)) recruited(ctx, def.id);
    }
  },

  tick(ctx) {
    // members whose old body was still being removed when they came back (roster.ts)
    for (const m of sortedMembers(ctx.world)) {
      if (!m.pendingIn) continue;
      const body = bodyFor(ctx, m);
      if (body) bringIn(ctx, m, body);
    }
    tickFight(ctx);
    snapHealth(ctx);
    const list = fieldMembers(ctx.world);
    list.forEach((m, i) => {
      if ((ctx.tick + i) % 5 !== 0) return;
      const prof = profileOf(ctx, m);
      if (prof) tickMember(ctx, prof, m, i + 1, list);
    });
    if (ctx.tick % 20 === 0) {
      tickClocks(ctx);
      settleTemps(ctx);
      tickCare(ctx);
      tickBanter(ctx);
    }
  },

  commands,

  on: {
    'item.used'(ctx, ev) {
      onFedItem(ctx, ev.data);
    },
    'flag.changed'(ctx, ev) {
      const key = ev.data.key;
      const hit = RECRUIT.exec(key);
      if (hit) {
        const id = hit[1] as string;
        if (ev.data.value) recruited(ctx, id);
        else if (!ctx.world.slices.party.members[id]?.temp) leave(ctx, id);
        return;
      }
      if (key === 'ironman') {
        ironmanWritten(ctx, ev.data.value);
        return;
      }
      if (key === 'door_rank') syncPets(ctx);
      onInjuryFlag(ctx, key, ev.data.value);
      const keys = storyKeys(ctx.content);
      if (keys.presence.has(key)) checkPresence(ctx);
      for (const m of sortedMembers(ctx.world)) {
        if (m.temp || m.pet) continue;
        const def = companionDef(ctx.content, m.id);
        if (def?.bondFlags?.some((b) => b.flag === key)) applyBondFlags(ctx, def, m);
      }
      if (keys.story.has(key)) settleStory(ctx);
    },
    'world.day'(ctx) {
      // conditions on the calendar terms (day, season) are not flags: check once a day
      settleStory(ctx);
    },
    'world.hour'(ctx) {
      enrolBodies(ctx);
    },
    'player.level_up'(ctx) {
      syncPets(ctx);
    },
    'world.map_changed'(ctx, ev) {
      if (ev.data.id === ctx.world.slices.world.playerId) followPlayer(ctx);
    },
    'entity.died'(ctx, ev) {
      if (ev.data.id === ctx.world.slices.world.playerId) {
        onDefeat(ctx);
        return;
      }
      for (const m of fieldMembers(ctx.world)) {
        if (m.entityId !== ev.data.id || m.temp) continue;
        noteDown(ctx);
        onDown(ctx, m);
      }
    },
    'combat.damage'(ctx, ev) {
      if (ev.data.amount <= 0) return;
      for (const m of fieldMembers(ctx.world))
        if (m.entityId === ev.data.targetId) noteHit(ctx, m, ev.data.amount);
    },
    'combat.kill'(ctx, ev) {
      if (ev.data.killerSide !== 'ally' || ev.data.side === 'ally') return;
      const range = partyConfig(ctx.content).bondKill.range;
      const p = getEntity(ctx.world, ctx.world.slices.world.playerId);
      for (const m of fieldMembers(ctx.world)) {
        if (m.temp || m.pet) continue;
        const e = getEntity(ctx.world, m.entityId);
        if (!e?.alive || !p || e.mapId !== ev.data.mapId) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) > range) continue;
        addKillBond(ctx, m, ev.data.rank);
      }
    },
    'combat.xp'(ctx, ev) {
      const d = ev.data;
      if (d.entityId === ctx.world.slices.world.playerId) {
        onPlayerXp(ctx, d.amount, d.reason);
        return;
      }
      if (typeof d.reason !== 'string' || !d.reason.startsWith('kill:')) return;
      for (const m of fieldMembers(ctx.world))
        if (m.entityId === d.entityId) onCompanionKillXp(ctx, m, d.amount, d.level);
    },
    'combat.level_up'(ctx, ev) {
      for (const m of fieldMembers(ctx.world))
        if (m.entityId === ev.data.entityId && m.pet?.kind === 'half') syncPets(ctx);
    },
    'combat.bag'(ctx, ev) {
      onBag(ctx, ev.data.bagId, ev.data.op);
    },
    'combat.heal'(ctx, ev) {
      const hit = rescueTarget(ctx, ev.data.targetId, ev.data.amount);
      if (!hit) return;
      // a heal at full health still treats the wound (10.1); a companion's own leech does not;
      // only a real heal is a rescue
      if (ev.data.sourceId !== ev.data.targetId) noteTreated(ctx, hit.m);
      if (ev.data.amount > 0 && ev.data.sourceId === ctx.world.slices.world.playerId)
        noteRescue(ctx, hit.m, hit.before);
    },
    'party.wounded'(ctx, ev) {
      onWounded(ctx, ev.data.companionId);
    },
    'party.recovered'(ctx, ev) {
      onRecovered(ctx, ev.data.companionId);
    },
    'time.skipped'(ctx, ev) {
      if (ev.data.kind === 'sleep' && ev.data.outcome === 'done') onSlept(ctx, ev.data.hours);
    },
    'feat.performed'(ctx, ev) {
      if (ev.data.actorId === ctx.world.slices.world.playerId)
        raise(ctx, 'event', `feat.${ev.data.kind}`);
    },
    'act.changed'(ctx) {
      raise(ctx, 'act');
    },
    'npc.relation_changed'(ctx, ev) {
      onRelation(ctx, ev.data.from, ev.data.to);
    },
    'dialogue.opened'(ctx) {
      setBanterGate(ctx, 'talk', true);
    },
    'dialogue.closed'(ctx) {
      setBanterGate(ctx, 'talk', false);
    },
    'scene.started'(ctx) {
      setBanterGate(ctx, 'scene', true);
    },
    'scene.ended'(ctx) {
      setBanterGate(ctx, 'scene', false);
    },
    'ailments.crystal_due'(ctx, ev) {
      onCrystalDue(ctx, ev.data.entityId);
    },
    'quest.stage'(ctx, ev) {
      onQuestStage(ctx, ev.data.questId, ev.data.stage);
    },
    'player.talked'(ctx, ev) {
      if (ev.data.npcRef) onTalked(ctx, ev.data.npcRef);
    },
    'inventory.changed'(ctx, ev) {
      if (ev.data.delta < 0) mountItemChanged(ctx, ev.data.ownerId, ev.data.itemId);
    },
  },
};
