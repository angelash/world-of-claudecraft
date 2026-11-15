// Persona lookup and the uniform "card" view over named personas and generated L4
// residents. Pure functions over content and the npc slice.

import type { ContentMap } from '../../core/contracts';
import type { Appearance } from '../world/types';
import type {
  NeedWeights,
  NpcSlice,
  PersonaCard,
  ResidentCard,
  ScheduleSegment,
  SocialClass,
} from './types';

const indexCache = new WeakMap<object, Map<string, PersonaCard>>();

export function personaIndex(content: Pick<ContentMap, 'npcs'>): Map<string, PersonaCard> {
  let idx = indexCache.get(content);
  if (!idx) {
    idx = new Map((content.npcs ?? []).map((p) => [p.id, p]));
    indexCache.set(content, idx);
  }
  return idx;
}

export function personaById(
  content: Pick<ContentMap, 'npcs'>,
  id: string,
): PersonaCard | undefined {
  return personaIndex(content).get(id);
}

/** Entity id of the NPC entity spawned for a persona or resident. */
export function npcEntityId(personaId: string): string {
  return `npc_${personaId}`;
}

/** Power tier 0..6 from a record level (power_system.md 3.1). */
export function tierOfLevel(level: number): number {
  if (level <= 9) return 0;
  if (level <= 19) return 1;
  if (level <= 34) return 2;
  if (level <= 49) return 3;
  if (level <= 59) return 4;
  if (level <= 60) return 5;
  return 6;
}

export const TIER_NAMES = ['凡阶·初', '凡阶·熟', '精英阶', '英雄阶', '传说阶', '神话阶', '超越'];

/** Fields shared by persona cards and resident cards. */
export interface CardView {
  id: string;
  name: string;
  map: string;
  home: string;
  work: string;
  schedule: string | ScheduleSegment[];
  class: SocialClass;
  race: string;
  level: number;
  tags: string[];
  faction: string;
  appearance: Appearance;
  needs: NeedWeights;
  persona?: PersonaCard;
  resident?: ResidentCard;
}

export function cardOf(
  slice: NpcSlice,
  content: Pick<ContentMap, 'npcs'>,
  id: string,
): CardView | undefined {
  const p = personaById(content, id);
  if (p) {
    return {
      id: p.id,
      name: p.name,
      map: p.map,
      home: p.home,
      work: p.work,
      schedule: p.schedule,
      class: p.class,
      race: p.race,
      level: p.level,
      tags: p.tags,
      faction: p.faction,
      appearance: p.appearance,
      needs: p.needs ?? {},
      persona: p,
    };
  }
  const r = slice.residents[id];
  if (!r) return undefined;
  return {
    id: r.id,
    name: r.name,
    map: r.map,
    home: r.home,
    work: r.work,
    schedule: r.schedule,
    class: r.class,
    race: r.race,
    level: r.level,
    tags: r.tags,
    faction: r.faction,
    appearance: r.appearance,
    needs: {},
    resident: r,
  };
}

/** Entity tags per implementation_conventions.md 5. */
export function entityTagsFor(card: CardView): string[] {
  const tags = [
    'npc',
    'friendly',
    `lvl:${card.level}`,
    `tier:${tierOfLevel(card.level)}`,
    `faction:${card.faction}`,
    card.resident ? 'resident' : 'named',
  ];
  for (const t of card.tags) if (!tags.includes(t)) tags.push(t);
  return tags;
}

/** World flag that mirrors this persona's trust toward the player. */
export function trustFlagKey(p: PersonaCard): string {
  return p.trustKey ?? `trust.${p.id}`;
}
