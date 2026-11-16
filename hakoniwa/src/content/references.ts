// The cross-table reference fields of the content (release_engineering.md 7.4 V2: every
// reference field, not only the ones a pack validator happens to check). Each entry names
// a table, a field path (./paths.ts) and the tables whose ids the value may name. The pack
// validators keep their own, richer checks; this table is the uniform floor the content
// validator V2 runs over everything, and the reverse index the reveal-ledger check uses
// to find where a row first becomes visible. Pure.
//
// Add a row here when a table gains a field that names another row. Conditional
// references (a field whose meaning depends on a sibling `type`) are left to the pack
// validators unless every value of the field is a reference.

import type { ContentMap } from '../core/contracts';
import { stringsAt } from './paths';

export interface RefPath {
  table: string;
  path: string;
  /** tables whose ids the value may name (any of them) */
  to: readonly string[];
}

const PERSON = ['npcs', 'companions', 'sceneSpeakers'] as const;
/** Who can speak a line: persons, scene speakers and the goddesses. */
const SPEAKER = [...PERSON, 'goddesses'] as const;

export const REF_PATHS: readonly RefPath[] = [
  { table: 'abilities', path: 'effects[].aura', to: ['auras'] },
  { table: 'abilities', path: 'effects[].monster', to: ['monsters'] },
  { table: 'abilities', path: 'requires.targetLacksAura', to: ['auras'] },
  { table: 'acts', path: 'entry.mapId', to: ['maps'] },
  { table: 'acts', path: 'introScene', to: ['scenes'] },
  { table: 'atlas_maps', path: 'province', to: ['slg_provinces'] },
  { table: 'atlas_maps', path: 'region', to: ['atlas_regions'] },
  { table: 'atlas_maps', path: 'scenario', to: ['battle_scenarios'] },
  { table: 'atlas_regions', path: 'parent', to: ['atlas_regions'] },
  { table: 'atlas_routes', path: 'from', to: ['atlas_maps'] },
  { table: 'atlas_routes', path: 'to', to: ['atlas_maps'] },
  { table: 'battle_scenarios', path: 'act', to: ['acts'] },
  {
    table: 'battle_scenarios',
    path: 'reinforcements[].regiments[].typeId',
    to: ['regiment_types'],
  },
  {
    table: 'battle_scenarios',
    path: 'reinforcements[].heroes[].abilities[]',
    to: ['hero_abilities'],
  },
  { table: 'battle_scenarios', path: 'teams.enemy.regiments[].typeId', to: ['regiment_types'] },
  { table: 'battle_scenarios', path: 'teams.enemy.heroes[].abilities[]', to: ['hero_abilities'] },
  { table: 'battle_scenarios', path: 'teams.player.regiments[].typeId', to: ['regiment_types'] },
  { table: 'battle_scenarios', path: 'teams.player.heroes[].abilities[]', to: ['hero_abilities'] },
  { table: 'city_buildings', path: 'unlock.buildings[]', to: ['city_buildings'] },
  { table: 'city_policies', path: 'exclusive[]', to: ['city_policies'] },
  { table: 'city_sites', path: 'mapId', to: ['maps'] },
  { table: 'city_sites', path: 'tradeMarket', to: ['markets'] },
  { table: 'classes', path: 'abilities[].id', to: ['abilities'] },
  { table: 'combatFixtures', path: 'mapId', to: ['maps'] },
  { table: 'companions', path: 'classId', to: ['classes'] },
  { table: 'companions', path: 'likes.items[]', to: ['items'] },
  { table: 'courtDefenses', path: 'goddess', to: ['goddesses'] },
  { table: 'directorMenu', path: 'maps[]', to: ['maps'] },
  { table: 'doors', path: 'effects[].abilities[]', to: ['abilities'] },
  { table: 'doors', path: 'effects[].aura', to: ['auras'] },
  { table: 'doors', path: 'effects[].itemId', to: ['items'] },
  { table: 'doors', path: 'keys[].companion', to: ['companions'] },
  { table: 'doors', path: 'keys[].doorId', to: ['doors'] },
  { table: 'doors', path: 'keys[].itemId', to: ['items'] },
  { table: 'doors', path: 'keys[].mapId', to: ['maps'] },
  { table: 'doors', path: 'keys[].of[].companion', to: ['companions'] },
  { table: 'doors', path: 'keys[].of[].itemId', to: ['items'] },
  { table: 'doors', path: 'keys[].where.mapId', to: ['maps'] },
  { table: 'evidence', path: 'item', to: ['items'] },
  { table: 'evidence', path: 'targets[].goddess', to: ['goddesses'] },
  { table: 'goddesses', path: 'menu[]', to: ['divineActions'] },
  { table: 'goddesses', path: 'token', to: ['items'] },
  { table: 'maps', path: 'exits[].toMap', to: ['maps'] },
  { table: 'maps', path: 'spawns[].ref', to: ['monsters'] },
  { table: 'maps', path: 'storyActs[]', to: ['acts'] },
  { table: 'markets', path: 'goods[].itemId', to: ['items'] },
  { table: 'markets', path: 'mapIds[]', to: ['maps'] },
  { table: 'markets', path: 'merchantRefs[]', to: ['npcs'] },
  { table: 'monsters', path: 'abilities[]', to: ['abilities'] },
  { table: 'monsters', path: 'classId', to: ['classes'] },
  { table: 'monsters', path: 'loot[].itemId', to: ['items'] },
  { table: 'monsters', path: 'mechanics.enrage.aura', to: ['auras'] },
  { table: 'monsters', path: 'mechanics.passives[]', to: ['auras'] },
  { table: 'monsters', path: 'mechanics.phases[].abilities[]', to: ['abilities'] },
  { table: 'monsters', path: 'mechanics.ramp.aura', to: ['auras'] },
  { table: 'monsters', path: 'mechanics.summon[].monster', to: ['monsters'] },
  { table: 'lore', path: 'knowers[]', to: [...SPEAKER, 'combatFixtures'] },
  { table: 'npcKnowledge', path: 'maps[]', to: ['maps'] },
  { table: 'npcResidents', path: 'class', to: ['cognitionClasses'] },
  { table: 'npcResidents', path: 'map', to: ['maps'] },
  { table: 'npcResidents', path: 'schedule', to: ['npcSchedules'] },
  { table: 'npcs', path: 'class', to: ['cognitionClasses'] },
  { table: 'npcs', path: 'goddess', to: ['goddesses'] },
  { table: 'npcs', path: 'map', to: ['maps'] },
  { table: 'npcs', path: 'schedule', to: ['npcSchedules'] },
  { table: 'quests', path: 'act', to: ['acts'] },
  { table: 'quests', path: 'giver', to: PERSON },
  { table: 'quests', path: 'turnIn', to: PERSON },
  { table: 'quests', path: 'onStart[].scene', to: ['scenes'] },
  { table: 'quests', path: 'onStart[].speaker', to: SPEAKER },
  { table: 'quests', path: 'rewards[].speaker', to: SPEAKER },
  { table: 'quests', path: 'stages[].onEnter[].speaker', to: SPEAKER },
  { table: 'quests', path: 'stages[].objectives[].ref', to: ['monsters', 'waves'] },
  { table: 'quests', path: 'rewards[].item', to: ['items'] },
  { table: 'quests', path: 'rewards[].scene', to: ['scenes'] },
  { table: 'quests', path: 'rewards[].goddess', to: ['goddesses'] },
  { table: 'quests', path: 'stages[].objectives[].mapId', to: ['maps'] },
  { table: 'quests', path: 'stages[].objectives[].npc', to: PERSON },
  { table: 'quests', path: 'stages[].objectives[].refs[]', to: ['monsters'] },
  { table: 'quests', path: 'stages[].objectives[].scenario', to: ['battle_scenarios'] },
  { table: 'quests', path: 'stages[].objectives[].scene', to: ['scenes'] },
  { table: 'quests', path: 'stages[].onComplete[].scene', to: ['scenes'] },
  { table: 'quests', path: 'stages[].onEnter[].scene', to: ['scenes'] },
  { table: 'quests', path: 'stages[].onEnter[].scenario', to: ['battle_scenarios'] },
  { table: 'quests', path: 'stages[].onEnter[].wave', to: ['waves'] },
  { table: 'scenes', path: 'act', to: ['acts'] },
  { table: 'scenes', path: 'mapId', to: ['maps'] },
  { table: 'scenes', path: 'nodes[].choices[].effects[].item', to: ['items'] },
  { table: 'scenes', path: 'nodes[].choices[].effects[].scene', to: ['scenes'] },
  { table: 'scenes', path: 'nodes[].choices[].effects[].speaker', to: SPEAKER },
  { table: 'scenes', path: 'nodes[].input.reply[].speaker', to: SPEAKER },
  { table: 'scenes', path: 'nodes[].court.goddess', to: ['goddesses'] },
  { table: 'scenes', path: 'nodes[].effects[].item', to: ['items'] },
  { table: 'scenes', path: 'nodes[].effects[].mapId', to: ['maps'] },
  { table: 'scenes', path: 'nodes[].input.agentId', to: ['goddesses'] },
  { table: 'scenes', path: 'onEnd[].act', to: ['acts'] },
  { table: 'scenes', path: 'onEnd[].scene', to: ['scenes'] },
  { table: 'scenes', path: 'then', to: ['scenes'] },
  { table: 'slg_links', path: 'a', to: ['slg_provinces'] },
  { table: 'slg_links', path: 'b', to: ['slg_provinces'] },
  { table: 'slg_nations', path: 'armies[].province', to: ['slg_provinces'] },
  { table: 'slg_nations', path: 'armies[].regiments[].typeId', to: ['regiment_types'] },
  { table: 'slg_nations', path: 'capital', to: ['slg_provinces'] },
  { table: 'slg_nations', path: 'goddess', to: ['goddesses'] },
  { table: 'slg_nations', path: 'recruits[]', to: ['regiment_types'] },
  { table: 'slg_provinces', path: 'capitalOf', to: ['slg_nations'] },
  { table: 'slg_provinces', path: 'owner', to: ['slg_nations'] },
  { table: 'trade_recipes', path: 'product', to: ['items'] },
  { table: 'trade_routes', path: 'a', to: ['markets'] },
  { table: 'trade_routes', path: 'b', to: ['markets'] },
  { table: 'waves', path: 'groups[].monster', to: ['monsters'] },
  { table: 'waves', path: 'mapId', to: ['maps'] },
  { table: 'worldStarts', path: 'mapId', to: ['maps'] },
];

/**
 * Scene line speakers: every line names a speaker row unless it carries its own `name`
 * label (a scene-local speaker such as a passer-by).
 */
export function danglingLineSpeakers(content: ContentMap): RefUse[] {
  const ids = idSets(content);
  const known = (v: string) => SPEAKER.some((t) => ids.get(t)?.has(v));
  const out: RefUse[] = [];
  for (const row of rowsOf(content, 'scenes')) {
    const nodes = (row as { nodes?: unknown }).nodes;
    if (!Array.isArray(nodes)) continue;
    nodes.forEach((n, i) => {
      const lines = (n as { lines?: unknown } | null)?.lines;
      if (!Array.isArray(lines)) return;
      lines.forEach((l, j) => {
        const line = l as { speaker?: unknown; name?: unknown } | null;
        if (typeof line?.speaker !== 'string' || line.speaker === '') return;
        if (typeof line.name === 'string' && line.name !== '') return;
        if (known(line.speaker)) return;
        out.push({
          table: 'scenes',
          row: rowId(row),
          path: `nodes[${i}].lines[${j}].speaker`,
          value: line.speaker,
          to: SPEAKER,
        });
      });
    });
  }
  return out;
}

/** One reference found in the content. */
export interface RefUse {
  table: string;
  /** id of the row holding the reference ('' when the row has none) */
  row: string;
  /** concrete path inside the row */
  path: string;
  value: string;
  to: readonly string[];
}

type Tables = Record<string, unknown>;

function rowsOf(content: ContentMap, table: string): unknown[] {
  const v = (content as unknown as Tables)[table];
  return Array.isArray(v) ? v : [];
}

function rowId(row: unknown): string {
  const id = (row as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : '';
}

/** Ids of each table (string `id` fields of array tables). */
export function idSets(content: ContentMap): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [table, value] of Object.entries(content as unknown as Tables)) {
    if (!Array.isArray(value)) continue;
    const set = new Set<string>();
    for (const r of value) {
      const id = rowId(r);
      if (id) set.add(id);
    }
    out.set(table, set);
  }
  return out;
}

/** Every reference value in the content, per REF_PATHS. Empty strings are skipped. */
export function collectRefs(content: ContentMap, paths: readonly RefPath[] = REF_PATHS): RefUse[] {
  const out: RefUse[] = [];
  for (const p of paths) {
    for (const row of rowsOf(content, p.table)) {
      for (const { path, value } of stringsAt(row, p.path)) {
        if (value === '') continue;
        out.push({ table: p.table, row: rowId(row), path, value, to: p.to });
      }
    }
  }
  return out;
}

/** References whose value is no id of any target table (only tables present are judged). */
export function danglingRefs(content: ContentMap, paths: readonly RefPath[] = REF_PATHS): RefUse[] {
  const ids = idSets(content);
  return collectRefs(content, paths).filter((u) => {
    const present = u.to.filter((t) => ids.has(t));
    if (present.length === 0) return false;
    return !present.some((t) => ids.get(t)?.has(u.value));
  });
}
