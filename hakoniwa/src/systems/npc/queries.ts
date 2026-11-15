// Read-only views for the client, the editor workbench and other systems. Secrets and
// hidden potential never appear here (the talent door reads potential via cognition).

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { getEntity } from '../world';
import { needBand } from './ai_context';
import { memoryLines } from './memory';
import { cardOf, npcEntityId, personaById, TIER_NAMES, tierOfLevel } from './personas';
import { locationById } from './places';
import { relationBand, relationOf } from './relations';
import { ACT_NAMES } from './schedule';
import type { Activity, GoneReason, MemoryEntry, NpcState, RelationDims, Tier } from './types';

export interface NpcView {
  id: string;
  entityId: string;
  name: string;
  race: string;
  age?: number;
  job: string;
  faction: string;
  intro: string;
  traits: string[];
  /** public power impression (tier name), not the record level */
  rank: string;
  mapId: string;
  tier: Tier;
  activity: Activity;
  activityName: string;
  note?: string;
  location: { id: string; name: string } | null;
  needs: { hunger: string; energy: string; social: string; faith: string };
  /** relation toward the player as a band, plus raw values for the workbench */
  relationBand: string;
  relation: RelationDims;
  plan: { day: number; source: string; note?: string; goal?: string } | null;
  gone: GoneReason | null;
  named: boolean;
}

export function npcState(world: World, id: string): NpcState | undefined {
  return world.slices.npc.npcs[id];
}

/** Persona id for an entity id (NPC entities carry ref = persona id). */
export function npcIdOfEntity(world: World, entityId: string): string | undefined {
  const ref = getEntity(world, entityId)?.ref;
  if (ref && world.slices.npc.npcs[ref]) return ref;
  return undefined;
}

export function npcView(world: World, content: ContentMap, id: string): NpcView | undefined {
  const slice = world.slices.npc;
  const st = slice.npcs[id];
  const card = cardOf(slice, content, id);
  if (!st || !card) return undefined;
  const p = card.persona;
  const loc = locationById(content, st.mapId, st.locId);
  const rel = relationOf(slice, id, 'player');
  return {
    id,
    entityId: npcEntityId(id),
    name: card.name,
    race: card.race,
    age: p?.age,
    job: p?.job ?? card.name,
    faction: card.faction,
    intro: p?.intro ?? '',
    traits: p?.traits ?? [],
    rank: TIER_NAMES[tierOfLevel(card.level)] ?? '',
    mapId: st.mapId,
    tier: st.tier,
    activity: st.activity,
    activityName: ACT_NAMES[st.activity],
    note: st.note,
    location: loc ? { id: loc.id, name: loc.name } : null,
    needs: {
      hunger: needBand(st.needs.hunger),
      energy: needBand(st.needs.energy),
      social: needBand(st.needs.social),
      faith: needBand(st.needs.faith),
    },
    relationBand: relationBand(rel),
    relation: { ...rel },
    plan: st.plan
      ? { day: st.plan.day, source: st.plan.source, note: st.plan.note, goal: st.plan.goal }
      : null,
    gone: st.gone,
    named: !st.resident,
  };
}

/** NPCs whose home map is mapId (present or not), sorted by id. */
export function npcsOnMap(world: World, content: ContentMap, mapId: string): NpcView[] {
  return Object.keys(world.slices.npc.npcs)
    .sort()
    .filter((id) => world.slices.npc.npcs[id]?.mapId === mapId)
    .map((id) => npcView(world, content, id))
    .filter((v): v is NpcView => !!v);
}

/** Memory entries (workbench and the act six "voices" interface). */
export function npcMemories(world: World, id: string, about?: string): MemoryEntry[] {
  const mind = world.slices.npc.minds[id];
  if (!mind) return [];
  return about ? mind.mem.filter((m) => m.about === about) : [...mind.mem];
}

export function npcMemoryLines(world: World, id: string, limit = 8): string[] {
  return memoryLines(world.slices.npc.minds[id], limit);
}

export function npcRelations(world: World, id: string): Record<string, RelationDims> {
  return { ...(world.slices.npc.minds[id]?.rel ?? {}) };
}

export function npcDiary(world: World, id: string) {
  return [...(world.slices.npc.npcs[id]?.diary ?? [])];
}

/** Display name for a persona or resident id (falls back to the id). */
export function npcName(world: World, content: ContentMap, id: string): string {
  if (id === 'player') return '你';
  return personaById(content, id)?.name ?? world.slices.npc.residents[id]?.name ?? id;
}
