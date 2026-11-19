// Doors pack: the Thousand Doors (power_system.md 9.9 canon doors plus the prologue's
// past-life doors), the door-rank curve and the feature readers' numbers and places. Data
// lives in data/doors/doors.json, data/doors/rank_curve.json (written by
// tools/doors/rank_curve.ts) and data/doors/readers.json. The validator carries the eight
// content rules of thousand_doors.md 21.6 besides the reference checks, and the door card's
// fields (danger band, opening cost, key links) and the readers' record (PK-M1-56).

import doors from '../../../data/doors/doors.json';
import rankCurveData from '../../../data/doors/rank_curve.json';
import readersData from '../../../data/doors/readers.json';
import type { ContentMap } from '../../core/contracts';
import { defaultRegistry } from '../../core/registry';
import { rankCurve } from '../../systems/doors/rank';
import {
  COUNTABLE_EVENTS,
  DANGER_BANDS,
  type DoorCategory,
  type DoorDef,
  type DoorReaders,
  EXCLUSIVE_MODES,
  KEY_TYPES,
  type KeyCond,
  SEAL_TIERS,
  TENDENCIES,
  WINGS,
  type WingId,
} from '../../systems/doors/types';
import { checkCondition, referencedVars } from '../../systems/quests/conditions';
import type { ContentPack } from '../pack';

const CATEGORIES: DoorCategory[] = [
  'origin',
  'insight',
  'vocation',
  'school',
  'craft',
  'bond',
  'passage',
  'domain',
  'truth',
  'forbidden',
  'last',
];

/** Which wings a door category may open in (thousand_doors.md 2.2). */
export const CATEGORY_WINGS: Readonly<Record<DoorCategory, readonly WingId[]>> = {
  origin: ['hall_front'],
  insight: ['mirror', 'steles'],
  vocation: ['vocations'],
  school: ['schools'],
  craft: ['crossing', 'crafts', 'six_chairs'],
  bond: ['knots'],
  passage: ['paths'],
  domain: ['court'],
  truth: ['grey'],
  // the abyss door opens in the corner of the vocations and the draft (2.2)
  forbidden: ['draft', 'vocations'],
  last: ['end'],
};

/** Exclusion modes reserved to one group (21.6 rule 7). */
const MODE_GROUP: Readonly<Partial<Record<string, string>>> = { freeze: 'X7', rack: 'X13' };

export const pack: ContentPack = {
  id: 'doors',
  tables: {
    doors: doors as unknown as DoorDef[],
    door_rank_curve: rankCurveData as unknown as { thresholds: number[] },
    door_readers: readersData as unknown as DoorReaders,
  },
  schemas: [
    {
      table: 'doors',
      label: '千门',
      file: 'doors/doors.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true, help: '旗标 door.<ID> 记录已开' },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'code', label: '正典代号', type: 'string' },
        { key: 'category', label: '类别', type: 'enum', options: CATEGORIES },
        { key: 'act', label: '幕次', type: 'number', min: 0, max: 7 },
        { key: 'segment', label: '主廊段', type: 'number', min: 1, max: 7, required: true },
        { key: 'wing', label: '翼', type: 'enum', options: [...WINGS], required: true },
        { key: 'hall', label: '段尾之厅', type: 'boolean' },
        { key: 'main', label: '主线门', type: 'boolean' },
        { key: 'tendency', label: '序章倾向', type: 'enum', options: [...TENDENCIES] },
        { key: 'hint', label: '门缝句', type: 'text' },
        { key: 'desc', label: '门后', type: 'text' },
        {
          key: 'keys',
          label: '钥',
          type: 'json',
          help: 'deed、count、flag、trial、item、trust、bond、taught、choice、visit、dungeon、rank、know、time、door、cond；组合 all、any（need）、seq、alt（替钥，when）；可带 link（去哪里找的任务 ID）',
        },
        { key: 'reveal', label: '显影条件', type: 'json' },
        {
          key: 'effects',
          label: '效果',
          type: 'json',
          help: 'abilities、stats、pool、passive、feature、flag、item、door（随本门一起开的门）',
        },
        { key: 'exclusive', label: '互斥（group、mode、act、until、source）', type: 'json' },
        { key: 'seal', label: '松动档', type: 'enum', options: [...SEAL_TIERS], required: true },
        { key: 'forbidden', label: '禁门', type: 'boolean' },
        {
          key: 'dangerBand',
          label: '危险档',
          type: 'enum',
          options: [...DANGER_BANDS],
          required: true,
          help: '门目录 1.7：无、低、中、高、极',
        },
        { key: 'openCost', label: '开门代价（blockage、fatigue、act）', type: 'json' },
        {
          key: 'unrest',
          label: '遗迹躁动规则',
          type: 'enum',
          options: ['default', 'none', 'ruins'],
        },
        { key: 'rankValue', label: '门阶值', type: 'number', min: 0, max: 2, required: true },
        {
          key: 'jam',
          label: '会否失灵',
          type: 'enum',
          options: ['combat', 'never'],
          required: true,
        },
        { key: 'closable', label: '可关闭', type: 'boolean' },
        { key: 'auto', label: '钥齐即开', type: 'boolean' },
        { key: 'autoAfter', label: '可开后自行打开（秒）', type: 'number', min: 0 },
      ],
    },
  ],
  validate: validateDoors,
};

function walk(keys: readonly KeyCond[], visit: (k: KeyCond) => void): void {
  for (const k of keys) {
    visit(k);
    if (k.type === 'all' || k.type === 'any' || k.type === 'seq' || k.type === 'alt')
      walk(k.of, visit);
  }
}

/** Keys a door cannot open without (top level, through `all` and `seq`; not under any, alt). */
function requiredKeys(keys: readonly KeyCond[], out: KeyCond[] = []): KeyCond[] {
  for (const k of keys) {
    if (k.type === 'all' || k.type === 'seq') requiredKeys(k.of, out);
    else out.push(k);
  }
  return out;
}

/** The single person a key leans on (trust, a trust flag, one mentor), if any. */
function singlePerson(k: KeyCond): string | null {
  if (k.type === 'trust') return k.npc === '*' ? null : k.npc;
  if (k.type === 'taught') return k.mentors.length === 1 ? (k.mentors[0] ?? null) : null;
  if (k.type === 'flag') return /^trust\.([A-Za-z0-9_]+)$/.exec(k.key)?.[1] ?? null;
  return null;
}

/** Variable names a key reads by name (rule 2). */
function namesRead(k: KeyCond): string[] {
  switch (k.type) {
    case 'flag':
    case 'choice':
    case 'know':
      return [k.key];
    case 'time':
      return k.key ? [k.key] : [];
    case 'cond':
      return checkCondition(k.expr) === null ? referencedVars(k.expr) : [];
    case 'alt':
      return k.when && checkCondition(k.when) === null ? referencedVars(k.when) : [];
    case 'deed':
      return [`deed.${k.deed}`];
    case 'trust':
      return k.npc === '*' ? [] : [`trust.${k.npc}`];
    case 'taught':
      return k.mentors.map((m) => `taught.${k.door}.${m}`);
    case 'dungeon':
      return [`dg.${k.dungeon}.cleared`];
    case 'trial':
      return k.trial ? [`trial_done.${k.trial}`] : [`trial_wins.${k.goddess ?? ''}`];
    default:
      return [];
  }
}

/** The player-visible texts of a door: name, crack line, description, key labels. */
function visibleTexts(door: DoorDef): string[] {
  const out = [door.name, door.hint, door.desc];
  walk(door.keys, (k) => out.push(k.label));
  if (door.reveal) walk(door.reveal, (k) => out.push(k.label));
  return out.filter((s): s is string => typeof s === 'string');
}

/** Names that may not show before act 6 (D-023): every hidden goddess name and its parts. */
function forbiddenNames(content: ContentMap): string[] {
  const out = new Set<string>();
  for (const g of content.goddesses ?? []) {
    const rec = g as { hiddenName?: string; name?: string; fullName?: string };
    if (!rec.hiddenName) continue;
    for (const n of [rec.name, rec.fullName]) {
      if (!n) continue;
      out.add(n);
      for (const part of n.split('·')) if (part.length >= 2) out.add(part);
    }
  }
  return [...out];
}

/** The readers' record (data/doors/readers.json): numbers in range, places and names real. */
export function validateReaders(
  content: ContentMap,
  registry: ReturnType<typeof defaultRegistry> = defaultRegistry(),
): string[] {
  const out: string[] = [];
  const r = content.door_readers;
  if (!r) return out;
  const features = new Set<string>();
  for (const d of content.doors ?? [])
    for (const f of d.effects) if (f.type === 'feature') features.add(f.feature);
  const named = (what: string, feature: string | undefined) => {
    if (!feature || !features.has(feature))
      out.push(`door readers ${what}: feature ${String(feature)} is given by no door`);
  };
  if (r.priceBand) {
    named('priceBand', r.priceBand.feature);
    if (!(r.priceBand.spread > 0 && r.priceBand.spread < 1))
      out.push('door readers priceBand: spread not between 0 and 1');
  }
  if (r.nightSight) {
    named('nightSight', r.nightSight.feature);
    if (!(r.nightSight.radius > 0)) out.push('door readers nightSight: radius not above 0');
  }
  if (r.rumorSource) named('rumorSource', r.rumorSource.feature);
  const p = r.springPurify;
  if (p) {
    named('springPurify', p.feature);
    if (!p.amount || !Number.isFinite(p.amount)) out.push('door readers springPurify: no amount');
    if (p.places.length === 0) out.push('door readers springPurify: no place');
    // as with visit keys, a map outside the loaded packs is not judged here
    const maps = new Map((content.maps ?? []).map((m) => [m.id, m]));
    for (const place of p.places) {
      const map = maps.get(place.mapId);
      if (map && !map.locations.some((l) => l.id === place.location))
        out.push(`door readers springPurify: map ${place.mapId} has no ${place.location}`);
    }
    for (const name of [p.var, p.weekFlag])
      if (!registry.resolve(name)) out.push(`door readers springPurify: unregistered ${name}`);
    if (p.when && checkCondition(p.when) !== null)
      out.push(`door readers springPurify: condition does not parse: ${p.when}`);
  }
  return out;
}

export function validateDoors(content: ContentMap): string[] {
  const problems: string[] = [];
  const all = content.doors ?? [];
  const doorIds = new Set(all.map((d) => d.id));
  const abilityIds = new Set((content.abilities ?? []).map((a) => a.id));
  const auraIds = new Set((content.auras ?? []).map((a) => a.id));
  const items = new Map((content.items ?? []).map((i) => [i.id, i]));
  const companionIds = new Set((content.companions ?? []).map((c) => c.id));
  const maps = new Map((content.maps ?? []).map((m) => [m.id, m]));
  const stocked = new Set<string>();
  for (const m of (content as { markets?: { goods?: { itemId: string }[] }[] }).markets ?? [])
    for (const g of m.goods ?? []) stocked.add(g.itemId);
  const branchDeeds = new Set(
    ((content as { deeds?: { id: string; branch?: boolean }[] }).deeds ?? [])
      .filter((d) => d.branch)
      .map((d) => d.id),
  );
  const registry = defaultRegistry();
  const hidden = forbiddenNames(content);
  const questList = (content as { quests?: { id: string }[] }).quests;
  const questIds = questList ? new Set(questList.map((q) => q.id)) : null;

  const checkKeys = (door: DoorDef, keys: readonly KeyCond[]) => {
    walk(keys, (k) => {
      if (!k.label) problems.push(`door ${door.id}: key without label`);
      if (!(KEY_TYPES as readonly string[]).includes(k.type))
        problems.push(`door ${door.id}: unknown key type ${String(k.type)}`);
      // the door card's "where to find" names a quest of the content
      if (k.link !== undefined && questIds && !questIds.has(k.link))
        problems.push(`door ${door.id}: key link ${k.link} is no quest`);
      switch (k.type) {
        case 'item':
          if (!items.has(k.itemId)) problems.push(`door ${door.id}: unknown item ${k.itemId}`);
          // rule 4: money cannot buy a door
          else if (
            k.itemId.startsWith('tg_') ||
            items.get(k.itemId)?.kind === 'goods' ||
            stocked.has(k.itemId)
          )
            problems.push(`door ${door.id}: item key ${k.itemId} is a trade good or shop stock`);
          break;
        case 'door':
          if (!doorIds.has(k.doorId)) problems.push(`door ${door.id}: unknown door ${k.doorId}`);
          break;
        case 'bond':
          if (!companionIds.has(k.companion))
            problems.push(`door ${door.id}: unknown companion ${k.companion}`);
          break;
        case 'count':
          if (k.count < 1) problems.push(`door ${door.id}: count below 1`);
          if (!(COUNTABLE_EVENTS as readonly string[]).includes(k.event))
            problems.push(
              `door ${door.id}: count key on ${k.event}, an event doors does not count`,
            );
          if (k.sum !== undefined && !/^[a-z][A-Za-z0-9_]*$/.test(k.sum))
            problems.push(`door ${door.id}: count sum field ${k.sum} is no field name`);
          break;
        case 'visit':
          if (k.location) {
            const map = maps.get(k.mapId);
            if (map && !map.locations.some((l) => l.id === k.location))
              problems.push(`door ${door.id}: map ${k.mapId} has no location ${k.location}`);
          }
          break;
        case 'rank':
          if (k.min < 1 || k.min > 99) problems.push(`door ${door.id}: rank key out of 1 to 99`);
          break;
        case 'cond':
          if (checkCondition(k.expr) !== null)
            problems.push(`door ${door.id}: cond key does not parse: ${k.expr}`);
          break;
        case 'any':
          if ((k.need ?? 1) > k.of.length)
            problems.push(`door ${door.id}: any needs more than it lists`);
          break;
        case 'alt':
          if (k.of.length < 2) problems.push(`door ${door.id}: alt without a substitute`);
          if (k.when && checkCondition(k.when) !== null)
            problems.push(`door ${door.id}: alt condition does not parse: ${k.when}`);
          break;
        case 'all':
        case 'seq':
          if (k.of.length === 0) problems.push(`door ${door.id}: ${k.type} lists no key`);
          break;
        default:
          break;
      }
      // rule 2: every variable a key reads by name is registered (D-076)
      for (const name of namesRead(k))
        if (!registry.resolve(name))
          problems.push(`door ${door.id}: key reads unregistered variable ${name}`);
      // rule 5: no rank key on a story or main-line door
      if (k.type === 'rank' && (door.auto || door.main))
        problems.push(`door ${door.id}: rank key on a story or main-line door`);
    });
  };

  const groups = new Map<string, DoorDef[]>();
  for (const door of all) {
    if (!CATEGORIES.includes(door.category)) problems.push(`door ${door.id}: bad category`);
    if (door.act < 0 || door.act > 7) problems.push(`door ${door.id}: act out of range`);
    if (door.keys.length === 0) problems.push(`door ${door.id}: no keys`);
    // rule 1: segment, wing, seal and jam filled; the wing fits the category
    if (!Number.isInteger(door.segment) || door.segment < 1 || door.segment > 7)
      problems.push(`door ${door.id}: segment missing or out of 1 to 7`);
    if (!(WINGS as readonly string[]).includes(door.wing))
      problems.push(`door ${door.id}: wing missing or unknown`);
    else if (!CATEGORY_WINGS[door.category]?.includes(door.wing))
      problems.push(`door ${door.id}: wing ${door.wing} does not fit category ${door.category}`);
    if (!(SEAL_TIERS as readonly string[]).includes(door.seal))
      problems.push(`door ${door.id}: seal tier missing or unknown`);
    if (door.jam !== 'combat' && door.jam !== 'never')
      problems.push(`door ${door.id}: jam missing or unknown`);
    if (![0, 1, 2].includes(door.rankValue))
      problems.push(`door ${door.id}: rank value not 0, 1 or 2`);
    if (typeof door.closable !== 'boolean') problems.push(`door ${door.id}: closable missing`);
    if (door.category === 'forbidden' && !door.forbidden)
      problems.push(`door ${door.id}: a forbidden-category door without the forbidden weight`);
    if (door.tendency && !(TENDENCIES as readonly string[]).includes(door.tendency))
      problems.push(`door ${door.id}: unknown tendency ${door.tendency}`);
    // the danger band of catalog_doors.md 1.7 (the corridor's cracks, ux 9.2)
    if (!door.dangerBand || !(DANGER_BANDS as readonly string[]).includes(door.dangerBand))
      problems.push(`door ${door.id}: danger band missing or unknown`);
    for (const [k, v] of Object.entries(door.openCost ?? {})) {
      const n = typeof v === 'number' ? v : Number.NaN;
      const ok = k === 'act' ? Number.isInteger(n) && n >= 0 && n <= 7 : n >= 0 && n <= 100;
      if ((k !== 'blockage' && k !== 'fatigue' && k !== 'act') || !ok)
        problems.push(`door ${door.id}: open cost ${k} out of range or unknown`);
    }
    // a link shows on a top-level key only (the corridor view maps keys by position)
    for (const k of door.keys)
      if ('of' in k)
        walk(k.of, (sub) => {
          if (sub.link !== undefined) problems.push(`door ${door.id}: link on a nested key`);
        });
    checkKeys(door, door.keys);
    if (door.reveal) checkKeys(door, door.reveal);
    // rule 3: a door that hangs on one person, or on a branch deed, has a substitute
    for (const k of requiredKeys(door.keys)) {
      const person = singlePerson(k);
      if (person) problems.push(`door ${door.id}: key on ${person} alone has no alt substitute`);
      if (k.type === 'deed' && branchDeeds.has(k.deed))
        problems.push(`door ${door.id}: branch deed ${k.deed} has no alt substitute`);
    }
    // rule 6: no hidden goddess name before act 6 (D-023)
    if (door.act < 6) {
      for (const text of visibleTexts(door))
        for (const n of hidden)
          if (text.includes(n)) problems.push(`door ${door.id}: visible text names ${n} (D-023)`);
    }
    // rule 7: exclusion entries well formed
    for (const e of door.exclusive ?? []) {
      if (!e.group) problems.push(`door ${door.id}: exclusion without group`);
      if (!(EXCLUSIVE_MODES as readonly string[]).includes(e.mode))
        problems.push(`door ${door.id}: exclusion mode ${String(e.mode)} unknown`);
      const only = MODE_GROUP[e.mode];
      if (only && e.group !== only)
        problems.push(`door ${door.id}: mode ${e.mode} belongs to group ${only} only`);
      if (e.mode === 'actLock' && e.act === undefined)
        problems.push(`door ${door.id}: actLock without act`);
      const list = groups.get(e.group) ?? [];
      list.push(door);
      groups.set(e.group, list);
    }
    for (const f of door.effects) {
      if (f.type === 'abilities') {
        for (const a of f.abilities)
          if (!abilityIds.has(a)) problems.push(`door ${door.id}: unknown ability ${a}`);
      }
      if (f.type === 'passive' && !auraIds.has(f.aura))
        problems.push(`door ${door.id}: unknown aura ${f.aura}`);
      if (f.type === 'item' && !items.has(f.itemId))
        problems.push(`door ${door.id}: unknown item ${f.itemId}`);
      if (f.type === 'door') {
        const target = all.find((d) => d.id === f.doorId);
        if (!target || f.doorId === door.id)
          problems.push(`door ${door.id}: door effect on unknown or own door ${f.doorId}`);
        else if (target.effects.some((e) => e.type === 'door'))
          problems.push(`door ${door.id}: door effect on ${f.doorId}, which gives a door itself`);
      }
    }
  }
  problems.push(...validateReaders(content, registry));
  for (const [group, members] of groups)
    if (members.length < 2) problems.push(`exclusion group ${group}: only one door`);
  // rule 8: the rank curve file is the formula's
  const curve = content.door_rank_curve?.thresholds;
  if (curve) {
    const want = rankCurve();
    if (curve.length !== want.length) problems.push('door rank curve: not 99 ranks');
    want.forEach((p, i) => {
      if (curve[i] !== p)
        problems.push(`door rank curve: rank ${i + 1} needs ${p}, the file says ${curve[i]}`);
    });
  }
  return problems;
}
