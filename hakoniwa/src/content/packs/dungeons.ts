// Dungeons pack (PK-M1-50): the runtime's tuning (data/dungeons/config.json: the forms by
// pressure and their party caps, activity, left items, collapse, nest growth;
// catalog_dungeons_bosses.md 1.1 to 1.4 and catalog_bestiary.md 2.8), the dungeon records
// `dg_` (data/dungeons/dungeons.json) and the nest records `nest_` (data/dungeons/nests.json).
// The validator holds the runtime's assumptions: floors on known maps and locations, at
// most one whole-map floor per map, the arrival on the dungeon's own floor and the gate
// outside it, a starting pressure inside the form's band, dispositions that parse and a
// destroy only where a core boss guards the core, nest ids after their lord, nests only
// where the sediment is at least level two, and mirror names the registry accepts.

import config from '../../../data/dungeons/config.json';
import dungeons from '../../../data/dungeons/dungeons.json';
import nests from '../../../data/dungeons/nests.json';
import type { ContentMap } from '../../core/contracts';
import { NAME_MAX } from '../../core/registry/registry';
import { entryFloor, floorAt, formBand, placeCentre } from '../../systems/dungeons/layout';
import {
  CHOICES,
  type ChoiceTable,
  DUNGEON_FORMS,
  type DungeonConfig,
  type DungeonDef,
  type NestDef,
  type PlaceRef,
  SEDIMENT_SOURCES,
} from '../../systems/dungeons/types';
import { sedimentAt } from '../../systems/world/sediment';
import type { ContentPack } from '../pack';
import { conditionProblems, effectProblems } from './quests';

/** An id segment of a registry name (`dg.<id>.<field>`). */
const SEGMENT = /^[a-z][a-z0-9_]*$/;
/** The longest mirror field, for the name length check. */
const LONGEST_FIELD = 'collapsed';
const LEVEL_MAX = 60;
const PARTY_MAX = 9;

const isInt = (v: unknown, min = Number.MIN_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Problems of the runtime's tuning. */
export function configProblems(cfg: DungeonConfig | undefined): string[] {
  if (!cfg) return ['dungeonConfig: missing'];
  if (!Array.isArray(cfg.forms) || !cfg.activity || !cfg.paged || !cfg.nest)
    return ['dungeonConfig: needs forms, activity, paged and nest'];
  const out: string[] = [];
  const at = 'dungeonConfig';
  const ids = cfg.forms.map((f) => f.id);
  if (ids.length !== DUNGEON_FORMS.length || !DUNGEON_FORMS.every((f) => ids.includes(f)))
    out.push(`${at}: forms must be ${DUNGEON_FORMS.join(', ')}, once each`);
  let floor = -1;
  for (const f of cfg.forms) {
    if (!isInt(f.minPressure, 0) || f.minPressure <= floor)
      out.push(`${at}: form ${f.id} pressure floors must rise from 0`);
    else floor = f.minPressure;
    if (!isInt(f.party, 0) || f.party > PARTY_MAX)
      out.push(`${at}: form ${f.id} party must be 0 to ${PARTY_MAX}`);
  }
  const a = cfg.activity;
  if (!isNum(a.max) || !isNum(a.active) || !(a.active > 0 && a.active < a.max))
    out.push(`${at}: activity needs 0 < active < max`);
  if (!isNum(a.afterOverflow) || a.afterOverflow < 0 || a.afterOverflow >= a.active)
    out.push(`${at}: afterOverflow must lie below the active threshold`);
  if (!isNum(a.pagedDeath) || a.pagedDeath < 0) out.push(`${at}: pagedDeath must not be negative`);
  if (!isNum(a.coreKill) || a.coreKill > 0) out.push(`${at}: coreKill must not be positive`);
  if (!isNum(a.ritual) || a.ritual < 0) out.push(`${at}: ritual must not be negative`);
  if (!isNum(a.idleNurture) || a.idleNurture < 0)
    out.push(`${at}: idleNurture must not be negative`);
  if (!Array.isArray(cfg.paged.kinds) || !Array.isArray(cfg.paged.families))
    out.push(`${at}: paged needs kinds and families lists`);
  if (!isNum(cfg.nurtureGrowth) || cfg.nurtureGrowth < 0)
    out.push(`${at}: nurtureGrowth must not be negative`);
  if (!isInt(cfg.leftItemDays, 1)) out.push(`${at}: leftItemDays must be a whole day count`);
  const [lo, hi] = Array.isArray(cfg.collapseDays) ? cfg.collapseDays : [];
  if (!isInt(lo, 1) || !isInt(hi, lo)) out.push(`${at}: collapseDays must be a band of days`);
  const n = cfg.nest;
  if (!isInt(n.stageDays, 1)) out.push(`${at}: nest.stageDays must be a whole day count`);
  if (!isInt(n.minSediment, 0) || !isInt(n.fullSediment, n.minSediment) || n.fullSediment > 6)
    out.push(`${at}: nest sediment needs 0 <= minSediment <= fullSediment <= 6`);
  if (!isInt(n.fullStage, 2) || !isInt(n.maxStage, n.fullStage + 1))
    out.push(`${at}: nest stages need 1 < fullStage < maxStage`);
  if (!isInt(n.nurtureStage, 1) || n.nurtureStage >= n.maxStage)
    out.push(`${at}: nest.nurtureStage must lie below maxStage`);
  if (!isInt(n.destroyDays, 1)) out.push(`${at}: nest.destroyDays must be a whole day count`);
  if (!isInt(n.lordStage, 1) || n.lordStage >= n.maxStage)
    out.push(`${at}: nest.lordStage must lie below maxStage`);
  if (!isNum(n.clearMargin) || n.clearMargin < 0)
    out.push(`${at}: nest.clearMargin must not be negative`);
  return out;
}

function placeProblems(p: PlaceRef | undefined, at: string, content: ContentMap): string[] {
  if (!p) return [`${at}: missing`];
  const map = content.maps.find((m) => m.id === p.mapId);
  if (!map) return [`${at}: unknown map ${p.mapId}`];
  if (!map.locations.some((l) => l.id === p.location))
    return [`${at}: map ${p.mapId} has no location ${p.location}`];
  return [];
}

function choiceProblems(
  choices: ChoiceTable | undefined,
  at: string,
  content: ContentMap,
): string[] {
  const out: string[] = [];
  for (const [k, c] of Object.entries(choices ?? {})) {
    const cat = `${at} choice ${k}`;
    if (!(CHOICES as readonly string[]).includes(k)) {
      out.push(`${cat}: unknown choice`);
      continue;
    }
    if (!c) continue;
    out.push(...conditionProblems(c.when, `${cat} when`));
    const d = c.days;
    if (d !== undefined) {
      const ok = typeof d === 'number' ? isNum(d) && d >= 0 : isInt(d[0], 0) && isInt(d[1], d[0]);
      if (!ok) out.push(`${cat}: days must be a day count or a band low to high`);
      if (k === 'nurture') out.push(`${cat}: nurture takes hold at once (no days)`);
    } else if (k === 'purify') out.push(`${cat}: a purification ritual needs its days`);
    out.push(...effectProblems(c.start, `${cat} start`, content));
    out.push(...effectProblems(c.effects, `${cat} effects`, content));
  }
  return out;
}

function nameProblems(id: string, prefix: string, at: string): string[] {
  const out: string[] = [];
  if (!id.startsWith(prefix)) out.push(`${at}: id must start with ${prefix}`);
  if (!SEGMENT.test(id)) out.push(`${at}: id is not a lowercase name segment`);
  const longest = `dg.${id}.${LONGEST_FIELD}`;
  if (longest.length > NAME_MAX) out.push(`${at}: ${longest} is longer than ${NAME_MAX}`);
  return out;
}

const monsterKnown = (content: ContentMap, id: string) =>
  (content.monsters ?? []).some((m) => m.id === id);
const actKnown = (content: ContentMap, id: string) => (content.acts ?? []).some((a) => a.id === id);

/** Problems of one dungeon record against the content. */
export function dungeonProblems(d: DungeonDef, content: ContentMap): string[] {
  const at = `dungeon ${d.id}`;
  const cfg = content.dungeonConfig;
  const out: string[] = [...nameProblems(d.id, 'dg_', at)];
  if (!d.name) out.push(`${at}: no name`);
  if (!actKnown(content, d.act)) out.push(`${at}: unknown act ${d.act}`);
  if (!(DUNGEON_FORMS as readonly string[]).includes(d.form)) out.push(`${at}: unknown form`);
  else if (cfg && d.pressure !== undefined) {
    const band = formBand(cfg, d.form);
    if (!isNum(d.pressure) || !band || d.pressure < band[0] || d.pressure > band[1])
      out.push(`${at}: pressure ${d.pressure} outside the ${d.form} band`);
  }
  if (cfg && d.activity !== undefined && !(isNum(d.activity) && d.activity >= 0))
    out.push(`${at}: activity must not be negative`);
  if (cfg && d.activity !== undefined && d.activity >= cfg.activity.max)
    out.push(`${at}: activity must start below ${cfg.activity.max}`);
  const [lo, hi] = d.level ?? [];
  if (!isInt(lo, 1) || !isInt(hi, lo) || hi > LEVEL_MAX)
    out.push(`${at}: level must be a band 1 to ${LEVEL_MAX}, low to high`);
  if (d.source !== undefined && !(SEDIMENT_SOURCES as readonly string[]).includes(d.source))
    out.push(`${at}: unknown source ${d.source}`);
  if (d.party !== undefined && (!isInt(d.party, 0) || d.party > PARTY_MAX))
    out.push(`${at}: party must be 0 to ${PARTY_MAX}`);
  out.push(...placeProblems(d.gate, `${at} gate`, content));
  out.push(...placeProblems(d.entry, `${at} entry`, content));
  if (!Array.isArray(d.floors) || d.floors.length === 0) out.push(`${at}: no floors`);
  const ids = new Set<string>();
  for (const f of d.floors ?? []) {
    const fat = `${at} floor ${f.id}`;
    if (!SEGMENT.test(f.id ?? '')) out.push(`${fat}: id is not a lowercase name segment`);
    if (ids.has(f.id)) out.push(`${fat}: listed twice`);
    ids.add(f.id);
    if (!isInt(f.depth, 0)) out.push(`${fat}: depth must be a whole number from 0`);
    const map = content.maps.find((m) => m.id === f.mapId);
    if (!map) out.push(`${fat}: unknown map ${f.mapId}`);
    else if (f.area && !map.locations.some((l) => l.id === f.area))
      out.push(`${fat}: map ${f.mapId} has no location ${f.area}`);
    if (f.boss && !monsterKnown(content, f.boss)) out.push(`${fat}: unknown boss ${f.boss}`);
  }
  if (out.length === 0) {
    if (!entryFloor(content, d)) out.push(`${at}: the entry place lies on none of its floors`);
    const gate = placeCentre(content, d.gate);
    const inside = !!gate && !!floorAt(content, d.gate.mapId, gate.x, gate.y, (x) => x.id === d.id);
    if (inside) out.push(`${at}: the gate lies inside the dungeon`);
  }
  if (d.coreBoss !== undefined && !monsterKnown(content, d.coreBoss))
    out.push(`${at}: unknown core boss ${d.coreBoss}`);
  if (d.overflowDays !== undefined && !isInt(d.overflowDays, 1))
    out.push(`${at}: overflowDays must be a whole day count`);
  if (d.overflowTo !== undefined && !content.maps.some((m) => m.id === d.overflowTo))
    out.push(`${at}: unknown overflow map ${d.overflowTo}`);
  if (d.choices?.destroy && !d.coreBoss)
    out.push(`${at}: destroy needs a core boss (who breaks the core)`);
  out.push(...choiceProblems(d.choices, at, content));
  return out;
}

/** Problems of one nest record against the content. */
export function nestProblems(n: NestDef, content: ContentMap): string[] {
  const at = `nest ${n.id}`;
  const cfg = content.dungeonConfig;
  const out: string[] = [...nameProblems(n.id, 'nest_', at)];
  if (n.lord && n.id !== `nest_${n.lord}`) out.push(`${at}: a nest with a lord is nest_${n.lord}`);
  if (!n.name) out.push(`${at}: no name`);
  if (!actKnown(content, n.act)) out.push(`${at}: unknown act ${n.act}`);
  for (const [k, id] of [
    ['lord', n.lord],
    ['head', n.head],
  ] as const)
    if (id !== undefined && !monsterKnown(content, id)) out.push(`${at}: unknown ${k} ${id}`);
  const place = placeProblems({ mapId: n.mapId, location: n.location }, `${at} place`, content);
  out.push(...place);
  if (cfg && n.stage !== undefined && (!isInt(n.stage, 1) || n.stage >= cfg.nest.maxStage))
    out.push(`${at}: stage must be 1 to ${cfg.nest.maxStage - 1}`);
  out.push(...conditionProblems(n.when, `${at} when`));
  if (n.becomes !== undefined) {
    const d = (content.dungeons ?? []).find((x) => x.id === n.becomes);
    if (!d) out.push(`${at}: unknown dungeon ${n.becomes}`);
    else if (d.form !== 'shallow') out.push(`${at}: becomes ${d.id}, which is not shallow`);
  }
  if (cfg && place.length === 0) {
    const map = content.maps.find((m) => m.id === n.mapId);
    const l = map?.locations.find((x) => x.id === n.location);
    if (map && l && sedimentAt(map, l.x + l.w / 2, l.y + l.h / 2) < cfg.nest.minSediment)
      out.push(`${at}: sediment below ${cfg.nest.minSediment} at the nest (catalog_bestiary 2.8)`);
  }
  out.push(...choiceProblems(n.choices, at, content));
  return out;
}

/** Problems shared by the records: one whole-map floor per map, unique nest becomings. */
function crossProblems(content: ContentMap): string[] {
  const out: string[] = [];
  const whole = new Map<string, string>();
  for (const d of content.dungeons ?? [])
    for (const f of d.floors ?? []) {
      if (f.area) continue;
      const other = whole.get(f.mapId);
      if (other) out.push(`map ${f.mapId}: whole-map floor of both ${other} and ${d.id}`);
      else whole.set(f.mapId, d.id);
    }
  const becomes = new Map<string, string>();
  for (const n of content.nests ?? []) {
    if (!n.becomes) continue;
    const other = becomes.get(n.becomes);
    if (other) out.push(`dungeon ${n.becomes}: becomes from both ${other} and ${n.id}`);
    else becomes.set(n.becomes, n.id);
  }
  return out;
}

export function validateDungeons(content: ContentMap): string[] {
  const out = [...configProblems(content.dungeonConfig)];
  for (const d of content.dungeons ?? []) out.push(...dungeonProblems(d, content));
  for (const n of content.nests ?? []) out.push(...nestProblems(n, content));
  out.push(...crossProblems(content));
  return out;
}

export const pack: ContentPack = {
  id: 'dungeons',
  tables: {
    dungeonConfig: config as unknown as DungeonConfig,
    dungeons: dungeons as unknown as DungeonDef[],
    nests: nests as unknown as NestDef[],
  },
  validate: validateDungeons,
};
