// V3 namespaces (release_engineering.md 7.4; content_bible.md 12.2 and 13): one id, one
// owner, and the prefix matches the table. Three checks:
// 1. an id carrying a registered prefix lives in a table that prefix may populate;
// 2. a table whose ids are all namespaced from the start keeps every id prefixed;
// 3. an id names at most one entity kind (the kinds of the content id guard,
//    src/content/entity_kinds.ts), except the shared place codes: maps, regions,
//    provinces, nations, settlement sites and markets reuse the place code (content_bible.md
//    12.2, "markets keep the data layer's city code"; a nation shares its region's code).
// Map tables follow the world map's ids: a dungeon's own sub-scene map takes the
// dungeon's `dg_` id (map_briefs.md 9.1), and the place names of MAP_PLACE_IDS read like
// another prefix without being that owner's entries.
// Ids that predate the namespace table are listed in ./namespace_legacy.json with the
// batch that will rename them; a listed id that no longer exists is a stale entry.

import { ENTITY_KINDS, entityIdIndex } from '../../../src/content/entity_kinds';
import legacyFile from './namespace_legacy.json';
import type { Finding, ValidationInput, Validator } from './types';

export interface Namespace {
  prefix: string;
  /** owner of the prefix (catalog file under docs/40_design/content/ or another document) */
  owner: string;
  /** content tables whose ids may carry the prefix (empty: no table yet, or never an id) */
  tables: readonly string[];
}

const ITEMS = ['items'];

/** The namespace table of content_bible.md 12.2 (prefixes with an underscore). */
export const NAMESPACES: readonly Namespace[] = [
  { prefix: 'tpl_', owner: 'catalog_characters_lotha.md', tables: ['npcResidents'] },
  { prefix: 'nm_', owner: 'catalog_bestiary.md', tables: ITEMS },
  { prefix: 'mtide_', owner: 'catalog_bestiary.md', tables: ['waves'] },
  // a dungeon's sub-scene map carries the dungeon id (map_briefs.md 9.1, A5-2 dg_old_mine)
  {
    prefix: 'dg_',
    owner: 'catalog_dungeons_bosses.md',
    tables: ['maps', 'atlas_maps', 'dungeons'],
  },
  { prefix: 'nest_', owner: 'catalog_bestiary.md', tables: ['nests'] },
  { prefix: 'trial_', owner: 'catalog_dungeons_bosses.md', tables: [] },
  { prefix: 'afx_', owner: 'catalog_dungeons_bosses.md', tables: [] },
  { prefix: 'eq_', owner: 'catalog_equipment.md', tables: ITEMS },
  { prefix: 'set_', owner: 'catalog_equipment.md', tables: ['itemSets'] },
  { prefix: 'ench_', owner: 'catalog_equipment.md', tables: ['enchants'] },
  { prefix: 'cs_', owner: 'catalog_consumables_magitools.md', tables: ITEMS },
  { prefix: 'mt_', owner: 'catalog_consumables_magitools.md', tables: ITEMS },
  { prefix: 'mat_', owner: 'catalog_gathering_crafting.md', tables: ITEMS },
  { prefix: 'part_', owner: 'catalog_gathering_crafting.md', tables: ITEMS },
  { prefix: 'src_', owner: 'catalog_gathering_crafting.md', tables: ITEMS },
  { prefix: 'node_', owner: 'catalog_gathering_crafting.md', tables: [] },
  { prefix: 'rcp_', owner: 'catalog_gathering_crafting.md', tables: ['trade_recipes'] },
  { prefix: 'tg_', owner: 'catalog_trade_goods.md', tables: ITEMS },
  { prefix: 'rl_', owner: 'catalog_relics_lore.md', tables: ITEMS },
  { prefix: 'lb_', owner: 'catalog_relics_lore.md', tables: ITEMS },
  { prefix: 'ky_', owner: 'catalog_relics_lore.md', tables: ITEMS },
  { prefix: 'col_', owner: 'catalog_relics_lore.md', tables: ITEMS },
  { prefix: 'evi_', owner: 'catalog_relics_lore.md', tables: ITEMS },
  { prefix: 'pet_', owner: 'catalog_creatures_mounts.md', tables: [] },
  { prefix: 'mnt_', owner: 'catalog_creatures_mounts.md', tables: ITEMS },
  // a contract fiend's combat template is a monster template plus the pet behaviour
  // (combat_and_classes.md 6.5.8 and 12.3; catalog_abilities_talents.md 4.5)
  { prefix: 'fiend_', owner: 'catalog_creatures_mounts.md', tables: ['monsters'] },
  { prefix: 'stock_', owner: 'catalog_creatures_mounts.md', tables: [] },
  { prefix: 'door_', owner: 'catalog_doors.md', tables: ['doors'] },
  { prefix: 'deed_', owner: 'catalog_deeds_titles.md', tables: ['deeds'] },
  { prefix: 'title_', owner: 'catalog_deeds_titles.md', tables: ['titles'] },
  { prefix: 'cdx_', owner: 'catalog_relics_lore.md (codex notes)', tables: ['codexEntries'] },
  {
    prefix: 'ltr_',
    owner: 'catalog_quests_acts1_3.md, catalog_quests_acts4_6.md (letters)',
    tables: ['letters'],
  },
  // a dispute chain's runner record carries its chain quest's id (PK-M1-46)
  {
    prefix: 'q_',
    owner: 'catalog_quests_acts1_3.md, catalog_quests_acts4_6.md',
    tables: ['quests', 'disputes'],
  },
  // dynamic events; the director's events are also its menu items (PK-M1-47)
  {
    prefix: 'ev_',
    owner: 'catalog_quests_acts1_3.md, catalog_quests_acts4_6.md',
    tables: ['dynamicEvents', 'directorMenu'],
  },
  {
    prefix: 'cmm_',
    owner: 'catalog_quests_acts1_3.md, catalog_quests_acts4_6.md',
    tables: ['commissions'],
  },
  { prefix: 'sk_', owner: 'catalog_abilities_talents.md', tables: ['abilities'] },
  { prefix: 'tal_', owner: 'catalog_abilities_talents.md', tables: [] },
  { prefix: 'aur_', owner: 'catalog_abilities_talents.md', tables: ['auras'] },
  { prefix: 'bld_', owner: 'catalog_buildings_city.md', tables: ['city_buildings'] },
  { prefix: 'pol_', owner: 'catalog_buildings_city.md', tables: ['city_policies'] },
  { prefix: 'off_', owner: 'catalog_buildings_city.md', tables: ['city_officials'] },
  { prefix: 'unit_', owner: 'catalog_warfare_strategy.md', tables: ['regiment_types'] },
  { prefix: 'bat_', owner: 'catalog_warfare_strategy.md', tables: ['battle_scenarios'] },
  { prefix: 'cty_', owner: 'catalog_warfare_strategy.md', tables: ['slg_provinces'] },
  { prefix: 'nev_', owner: 'catalog_warfare_strategy.md', tables: [] },
  { prefix: 'div_', owner: 'catalog_goddess_interventions.md', tables: ['divineActions'] },
  { prefix: 'trl_', owner: 'catalog_goddess_interventions.md', tables: [] },
  { prefix: 'ln_', owner: 'catalog_dialogue_lines.md', tables: ['linePacks'] },
  { prefix: 'bark_', owner: 'catalog_dialogue_lines.md', tables: ['linePacks'] },
  { prefix: 'self_', owner: 'catalog_dialogue_lines.md (topics)', tables: [] },
  { prefix: 'place_', owner: 'catalog_dialogue_lines.md (topics)', tables: [] },
  { prefix: 'person_', owner: 'catalog_dialogue_lines.md (topics)', tables: [] },
  { prefix: 'event_', owner: 'catalog_dialogue_lines.md (topics)', tables: [] },
  { prefix: 'lore_', owner: 'catalog_dialogue_lines.md (topics)', tables: [] },
  { prefix: 'faith_', owner: 'catalog_dialogue_lines.md (topics)', tables: [] },
  { prefix: 'danger_', owner: 'catalog_dialogue_lines.md (topics)', tables: [] },
  { prefix: 'quest_', owner: 'catalog_dialogue_lines.md (topics)', tables: [] },
  { prefix: 'secret_', owner: 'catalog_dialogue_lines.md (topics)', tables: [] },
  { prefix: 'gen_', owner: 'builtin_ai.md (general topics)', tables: [] },
  { prefix: 'cut_', owner: 'catalog_cutscenes.md', tables: ['scenes'] },
  { prefix: 'tut_', owner: 'ux_and_onboarding.md', tables: [] },
  { prefix: 'ui_', owner: 'ux_and_onboarding.md', tables: [] },
  { prefix: 'mus_', owner: 'audio_direction.md (asset ids, never a content row id)', tables: [] },
  { prefix: 'amb_', owner: 'audio_direction.md (asset ids, never a content row id)', tables: [] },
  { prefix: 'sfx_', owner: 'audio_direction.md (asset ids, never a content row id)', tables: [] },
  { prefix: 'art_', owner: 'art_pipeline.md (asset ids, never a content row id)', tables: [] },
];

/** Tables whose every id carries one of their prefixes (from the start, or renumbered). */
export const STRICT_TABLES: Readonly<Record<string, readonly string[]>> = {
  quests: ['q_'],
  // own ability and aura numbering (D-071, RE-27; catalog_abilities_talents.md 2 and 3)
  abilities: ['sk_'],
  auras: ['aur_'],
  linePacks: ['ln_', 'bark_'],
  deeds: ['deed_'],
  titles: ['title_'],
  codexEntries: ['cdx_'],
  letters: ['ltr_'],
  itemSets: ['set_'],
  enchants: ['ench_'],
  dungeons: ['dg_'],
  nests: ['nest_'],
};

/**
 * Map ids of the world map (world_map.md 4.1) that begin like another owner's prefix but
 * name a place, not that owner's entry: X3 the corridor of a thousand doors is no door.
 * They may stand in the map tables only.
 */
export const MAP_PLACE_IDS: readonly string[] = ['door_corridor'];
const MAP_TABLES: readonly string[] = ['maps', 'atlas_maps'];

/** Entity kinds that legitimately share one id: the place codes. */
export const SHARED_KINDS: readonly (readonly string[])[] = [
  ['map', 'region', 'province', 'nation', 'site', 'market'],
  // a dungeon and its own sub-scene map (map_briefs.md 9.1)
  ['map', 'dungeon'],
];

export interface LegacyEntry {
  table: string;
  id: string;
  reason: string;
}

export const LEGACY: readonly LegacyEntry[] = (legacyFile as { entries: LegacyEntry[] }).entries;

/** The namespace of an id (longest registered prefix), or undefined. */
export function namespaceOf(
  id: string,
  table: readonly Namespace[] = NAMESPACES,
): Namespace | undefined {
  let best: Namespace | undefined;
  for (const ns of table)
    if (id.startsWith(ns.prefix) && (!best || ns.prefix.length > best.prefix.length)) best = ns;
  return best;
}

function sharedOk(kinds: ReadonlySet<string>): boolean {
  return SHARED_KINDS.some((family) => [...kinds].every((k) => family.includes(k)));
}

export function namespaceFindings(
  input: Pick<ValidationInput, 'content'>,
  opts: {
    namespaces?: readonly Namespace[];
    legacy?: readonly LegacyEntry[];
    strict?: Readonly<Record<string, readonly string[]>>;
  } = {},
): Finding[] {
  const namespaces = opts.namespaces ?? NAMESPACES;
  const legacy = opts.legacy ?? LEGACY;
  const strict = opts.strict ?? STRICT_TABLES;
  const isLegacy = (table: string, id: string) =>
    legacy.some((l) => l.table === table && l.id === id);
  const out: Finding[] = [];
  const seenLegacy = new Set<string>();
  for (const [table, value] of Object.entries(
    input.content as unknown as Record<string, unknown>,
  )) {
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      const id = (row as { id?: unknown } | null)?.id;
      if (typeof id !== 'string' || id === '') continue;
      if (isLegacy(table, id)) {
        seenLegacy.add(`${table}\n${id}`);
        continue;
      }
      const ns = namespaceOf(id, namespaces);
      const place = MAP_TABLES.includes(table) && MAP_PLACE_IDS.includes(id);
      if (ns && !ns.tables.includes(table) && !place) {
        out.push({
          level: 'error',
          message: `${table}:${id}: prefix ${ns.prefix} belongs to ${ns.owner} (${ns.tables.length ? `tables ${ns.tables.join(', ')}` : 'no content table'}), not to ${table}`,
          table,
          row: id,
        });
      }
      const need = strict[table];
      if (need && !need.some((p) => id.startsWith(p)))
        out.push({
          level: 'error',
          message: `${table}:${id}: every ${table} id carries ${need.join(' or ')}`,
          table,
          row: id,
        });
    }
  }
  for (const l of legacy)
    if (!seenLegacy.has(`${l.table}\n${l.id}`))
      out.push({
        level: 'error',
        message: `namespace_legacy.json: ${l.table}:${l.id} no longer exists (remove the stale entry)`,
        table: l.table,
        row: l.id,
      });
  const index = entityIdIndex(input.content, ENTITY_KINDS);
  for (const [id, kinds] of index.kinds) {
    if (kinds.size < 2 || sharedOk(kinds)) continue;
    out.push({
      level: 'error',
      message: `${id}: one id names several kinds (${[...kinds].sort().join(', ')}); one id, one owner`,
      row: id,
    });
  }
  return out;
}

export const namespaceValidator: Validator = {
  id: 'V3',
  title: 'namespaces',
  run: (input) => namespaceFindings(input),
};
