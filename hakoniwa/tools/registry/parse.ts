// Parse the world-state registry document (docs/40_design/world_state_registry.md) into
// the data of data/registry/vars.json (section 9.1). Pure: the markdown text goes in, the
// registry data and a report of rows the parser had to skip come out. The tables of
// sections 2.8, 2.9, 6.2, 7 and 8 are the source; the document is the design source and
// the JSON is generated from it (section 9.2), so every rule here reads a table shape the
// document uses. Output order is stable (sorted) so a rerun on the same text is identical.
//
// tools/registry/build.ts writes the file; tests/registry.test.ts covers this module.

import type {
  ConversionDef,
  FamilyDef,
  FamilySlot,
  RegistryData,
  VarDef,
  VarKind,
  VarScope,
} from '../../src/core/registry/types';

export const DOC_PATH = 'docs/40_design/world_state_registry.md';

export interface ParseReport {
  /** Rows or cells the parser could not map, with the reason (shown by build.ts). */
  skipped: string[];
}

export interface ParseResult {
  data: RegistryData;
  report: ParseReport;
}

// ---------------------------------------------------------------------------
// Markdown helpers

interface Section {
  id: string;
  lines: string[];
}

interface Table {
  section: string;
  header: string[];
  rows: string[][];
}

const HEADING = /^(#{2,4}) (\d+(?:\.\d+)*)\.? /;

function splitSections(md: string): Section[] {
  const out: Section[] = [];
  let cur: Section = { id: '', lines: [] };
  for (const line of md.split(/\r?\n/)) {
    const m = HEADING.exec(line);
    if (m) {
      out.push(cur);
      cur = { id: m[2] as string, lines: [] };
      continue;
    }
    cur.lines.push(line);
  }
  out.push(cur);
  return out;
}

function cellsOf(line: string): string[] {
  const t = line.trim();
  return t
    .slice(1, t.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim());
}

function tablesOf(section: Section): Table[] {
  const out: Table[] = [];
  let cur: Table | null = null;
  for (const line of section.lines) {
    if (!line.trim().startsWith('|')) {
      cur = null;
      continue;
    }
    const cells = cellsOf(line);
    if (!cur) {
      cur = { section: section.id, header: cells, rows: [] };
      out.push(cur);
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    cur.rows.push(cells);
  }
  return out;
}

/** Backticked spans of a cell. */
export function codes(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
}

/** Drop full-width parentheticals (innermost first). */
function stripParens(text: string): string {
  let t = text;
  for (let i = 0; i < 4; i++) {
    const next = t.replace(/（[^（）]*）/g, '');
    if (next === t) break;
    t = next;
  }
  return t;
}

/** Expand `x1` 到 `x5` (same prefix, numeric tail) inside a cell into the listed codes. */
export function expandRanges(text: string): string[] {
  const out: string[] = [];
  const parts = text.split(/(`[^`]+`\s*到\s*`[^`]+`)/);
  for (const part of parts) {
    const m = /^`([^`]*?)(\d+)`\s*到\s*`([^`]*?)(\d+)`$/.exec(part);
    if (m && m[1] === m[3]) {
      const from = Number(m[2]);
      const to = Number(m[4]);
      const width = (m[2] as string).length;
      for (let n = from; n <= to && n - from < 200; n++) {
        out.push(`${m[1]}${String(n).padStart(width, '0')}`);
      }
      continue;
    }
    out.push(...codes(part));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Names, slots and domains

/** Placeholder words of the document mapped to slot names (and their key domain). */
const SLOT_NAMES: Record<string, string> = {
  人: 'npc',
  '人物 ID': 'npc',
  人物: 'npc',
  id: 'npc',
  司: 'goddess',
  神: 'goddess',
  受害者所属司: 'victim',
  施动者: 'actor',
  门: 'door',
  '门 ID': 'door',
  门目录代号: 'door_code',
  代号: 'door_code',
  物品: 'item',
  遗物: 'relic',
  编号: 'evidence',
  任务: 'quest',
  '现有 ID': 'quest',
  首领: 'boss',
  场景: 'scene',
  地图: 'map',
  地点: 'location',
  线: 'front',
  节点: 'node',
  幕: 'act',
  幕号: 'act_no',
  危机: 'crisis',
  防线: 'defense',
  迷宫: 'dungeon',
  迷宫或巢: 'dungeon',
  字段: 'field',
  波次: 'wave',
  剧本: 'scenario',
  国: 'nation',
  势力: 'faction',
  区域: 'region',
  地区: 'region',
  倾向: 'tendency',
  话题: 'topic',
  功能: 'feature',
  收藏: 'collection',
  事迹: 'deed',
  称号: 'title',
  传书: 'letter',
  称谓: 'term',
  试炼: 'trial',
  天启: 'revelation',
  请托: 'request',
  情报: 'intel',
  菜单项: 'menu_item',
  事件: 'event',
  病例: 'case',
  战: 'battle',
  钥: 'key',
  项: 'mod',
  种: 'chip',
  群体: 'group',
  组: 'combo',
  违约: 'breach',
  键: 'key',
  路: 'route',
  模板: 'template',
  属性: 'attr',
  出口: 'exit',
  N: 'n',
  n: 'n',
  规范名: 'name',
  名: 'name',
  值: 'value',
  街区: 'quarter',
  原物品: 'item',
};

/** Slots whose members come from content or a fixed list (RegistryData.keyDomains). */
const SLOT_DOMAINS: Record<string, string> = {
  npc: 'npc',
  goddess: 'goddess',
  victim: 'goddess',
  door: 'door',
  item: 'item',
  relic: 'item',
  evidence: 'evidence',
  quest: 'quest',
  boss: 'boss',
  scene: 'scene',
  map: 'map',
  front: 'front',
  node: 'ring_node',
  act: 'act',
  act_no: 'act_no',
  crisis: 'crisis',
  defense: 'defense',
  wave: 'wave',
  scenario: 'scenario',
  deed: 'deed',
  title: 'title',
  letter: 'letter',
};

export const KEY_DOMAINS: Record<string, string | string[]> = {
  npc: 'npcs#id|companions#id',
  goddess: 'goddesses#id',
  door: 'doors#id',
  item: 'items#id',
  evidence: 'evidence#id',
  quest: 'quests#id',
  boss: 'monsters#id',
  scene: 'scenes#id',
  map: 'maps#id',
  front: ['north', 'east', 'south', 'ring', 'rear'],
  ring_node: ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07'],
  act: ['act1', 'act2', 'act3', 'act4', 'act5', 'act6'],
  act_no: ['1', '2', '3', '4', '5', '6'],
  crisis: ['no_light', 'residue_tide', 'contract_halt', 'winter_famine', 'record_silence'],
  defense: ['fact', 'just', 'need'],
  wave: 'waves#id',
  scenario: 'battle_scenarios#id',
  deed: 'deeds#id',
  title: 'titles#id',
  letter: 'letters#id',
};

const GODDESSES = ['eluen', 'valda', 'merca', 'sylvie', 'moira'];

/** `trust.<人>` to `trust.<npc>`; unknown placeholder words become `slot`. */
export function normalizePattern(raw: string): string {
  return raw.replace(/<([^<>]+)>/g, (_m, w: string) => `<${SLOT_NAMES[w.trim()] ?? 'slot'}>`);
}

export function isPattern(name: string): boolean {
  return name.includes('<');
}

function slotNames(pattern: string): string[] {
  return [...pattern.matchAll(/<([^<>]+)>/g)].map((m) => m[1] as string);
}

/** A plausible variable name or pattern (not prose or a condition). */
function isNameToken(s: string): boolean {
  const n = normalizePattern(s);
  return /^[A-Za-z_<][A-Za-z0-9_.<>:-]*$/.test(n) && !/\s/.test(n);
}

export function actOf(name: string): number | null {
  if (name.startsWith('p_')) return 0;
  if (name.startsWith('ep_')) return 7;
  const m = /^a([1-6])_/.exec(name);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Cells: kind, range, values, default, writers, readers

const KIND_WORDS: [string, VarKind][] = [
  ['标记', 'flag'],
  ['布尔', 'bool'],
  ['整数', 'int'],
  ['小数', 'num'],
  ['枚举', 'enum'],
  ['集合', 'set'],
  ['文本', 'text'],
  ['时刻', 'tick'],
  ['按字段', 'any'],
  ['按属性', 'any'],
];

function kindOf(cell: string): { kind: VarKind; derived: boolean } | null {
  const derived = cell.includes('派生');
  for (const [w, k] of KIND_WORDS) if (cell.includes(w)) return { kind: k, derived };
  return null;
}

function num(s: string): number {
  return Number(s.replace(/,/g, ''));
}

function rangeOf(cell: string): { range: VarDef['range']; step: number | null } {
  const t = stripParens(cell);
  const step = /半分/.test(cell) ? 0.5 : null;
  const between = /(-?\d[\d,]*(?:\.\d+)?)\s*到\s*(-?\d[\d,]*(?:\.\d+)?)/.exec(t);
  if (between) return { range: [num(between[1] as string), num(between[2] as string)], step };
  const atLeast = /≥\s*(-?\d[\d,]*)/.exec(t) ?? /(-?\d[\d,]*)\s*(?:以上|起)/.exec(t);
  if (atLeast) return { range: [num(atLeast[1] as string), null], step };
  return { range: null, step };
}

function defaultOf(cell: string): { found: boolean; value: VarDef['default'] } {
  const m = /默认\s*([^；，。、]*)/.exec(cell);
  if (!m) return { found: false, value: null };
  const v = (m[1] as string).trim();
  if (v.startsWith('假')) return { found: true, value: false };
  if (v.startsWith('真')) return { found: true, value: true };
  const n = /^(-?\d+(?:\.\d+)?)/.exec(v);
  if (n) return { found: true, value: Number(n[1]) };
  const c = codes(v)[0];
  if (c !== undefined) return { found: true, value: c };
  return { found: true, value: null };
}

/** Enum values of a non-family cell (parentheticals dropped, ranges expanded). */
function valuesOf(cell: string): string[] {
  const noDefault = cell.replace(/默认[^；]*/g, '');
  return expandRanges(stripParens(noDefault)).filter((v) => /^[A-Za-z0-9_-]+$/.test(v));
}

/** Value aliases written inline as `（别名值 `x`）` after a value. */
function inlineValueAliases(cell: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of cell.matchAll(/`([^`]+)`（别名值 `([^`]+)`）/g))
    out[m[2] as string] = m[1] as string;
  return out;
}

const SYSTEMS = [
  'quests',
  'scenes',
  'doors',
  'combat',
  'city',
  'economy',
  'strategy',
  'goddess',
  'director',
  'npc',
  'cognition',
  'party',
  'warfare',
  'inventory',
  'world',
  'dialogue',
  'records',
  'disputes',
  'guild',
  'ailments',
];
const SYSTEM_ALIASES: Record<string, string> = {
  court: 'scenes',
  endings: 'quests',
  deeds: 'records',
  内核: 'core',
  内核日历: 'core',
  内核时钟: 'core',
  迷宫系统: 'world',
  事迹系统: 'records',
  证据系统: 'quests',
  队伍命令处理器: 'party',
};
const DATA_MARKERS = new Set([
  'q',
  's0',
  's1',
  's25',
  'sc',
  'se',
  'sep',
  'acts',
  'dr',
  'gd',
  'pc',
  'np',
  'lore',
  'terms',
]);
const CONTENT_WORDS =
  /任务|过场|场景|效果|节点|选项|序章|桥段|审判|输入|对话|请求方|菜单项|A\d-|P\d|N\d|GL-|cut_|题面|台账|幕开场|幕切换|开场|结算/;

function systemsIn(cell: string): string[] {
  const out = new Set<string>();
  for (const s of SYSTEMS) if (new RegExp(`(^|[^a-z_])${s}([^a-z_]|$)`).test(cell)) out.add(s);
  for (const [w, s] of Object.entries(SYSTEM_ALIASES)) if (cell.includes(w)) out.add(s);
  for (const m of cell.matchAll(/`([a-z_]+)` 的 `([a-z0-9_]+)` 计算/g)) {
    out.add(`compute:${m[2]}`);
  }
  for (const m of cell.matchAll(/compute ([a-z0-9_]+)/g)) out.add(`compute:${m[1]}`);
  return [...out];
}

function writersOf(cell: string, scope: VarScope): string[] {
  const out = new Set(systemsIn(cell));
  const marked = codes(cell).some((c) => DATA_MARKERS.has(c) || c.startsWith('cut_'));
  const worded = CONTENT_WORDS.test(cell);
  if (scope === 'mirror' || scope === 'signal') {
    if (marked || /效果|菜单项|过场|cut_/.test(cell)) out.add('content');
  } else if (scope === 'builtin') {
    if (marked) out.add('content');
  } else if (marked || worded || out.size === 0) {
    out.add('content');
  }
  return [...out].sort();
}

function readersOf(cell: string): string[] {
  const out = new Set(systemsIn(cell));
  const cs = codes(cell);
  if (
    cs.some((c) => DATA_MARKERS.has(c) || c.startsWith('cut_')) ||
    /任务|场景|过场|门钥|门/.test(cell)
  )
    out.add('content');
  if (cs.includes('lore') || /台账/.test(cell)) out.add('ledger');
  if (/题面|ai_prompt/.test(cell)) out.add('ai_prompt');
  if (/界面|显示|回廊/.test(cell)) out.add('ui');
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// Rows

interface Row {
  names: string[];
  aliasCell: string;
  kindCell: string;
  valueCell: string;
  writerCell: string;
  readerCell: string;
  noteCell: string;
  species: string;
  section: string;
}

function scopeOf(section: string, name: string, kind: VarKind, species: string): VarScope {
  if (species) {
    if (species.includes('信号')) return 'signal';
    if (species.includes('镜像')) return 'mirror';
    if (species.includes('族')) return 'family';
    if (species.includes('全局')) return 'global';
    if (species.includes('标记')) return actOf(name) === null ? 'global' : 'act_flag';
    if (species.includes('出口') || species.includes('段落'))
      return actOf(name) === null ? 'global' : 'act_exit';
  }
  if (section === '8.1') return 'builtin';
  if (section === '8.2') return 'global';
  if (section === '8.3') return 'act_flag';
  if (section === '8.4') return 'act_exit';
  if (section === '8.5') return 'family';
  if (section === '8.6') return 'mirror';
  if (section === '8.9') return 'signal';
  if (isPattern(name)) return 'family';
  if (actOf(name) !== null) return kind === 'flag' ? 'act_flag' : 'act_exit';
  return 'global';
}

const PLAYER_VISIBLE = [
  /^act$/,
  /^act_week$/,
  /^day$/,
  /^season$/,
  /^year$/,
  /^hour$/,
  /^player\.(level|name)$/,
  /^guild_rank$/,
  /^trust\./,
  /^rep\./,
  /^stance\./,
  /^fame\./,
  /^goddess\.<goddess>\.relation$/,
  /^feature\./,
  /^companion\./,
  /^quest\./,
  /^door\.<door>$/,
  /^door_state\./,
];

function visibilityOf(name: string): VarDef['visibility'] {
  return PLAYER_VISIBLE.some((re) => re.test(name)) ? 'player' : 'hidden';
}

function aiOf(row: Row): VarDef['ai'] {
  const all = `${row.readerCell} ${row.noteCell}`;
  if (/不进任何女神的题面|不进题面/.test(all)) return 'none';
  if (/题面|ai_prompt/.test(all)) return 'prompt';
  return 'ledger';
}

interface Collected {
  vars: Map<string, VarDef>;
  families: Map<string, FamilyDef>;
  aliasPairs: [string, string][];
  valueAliases: Record<string, Record<string, string>>;
  conversions: ConversionDef[];
  keyAliases: Record<string, Record<string, string>>;
  questIds: Record<string, string>;
  derives: Map<string, string>;
  computeOutputs: Map<string, Set<string>>;
  report: string[];
  /** Section 7.6 canonical values per variable (for cells that point there). */
  enumRows: Map<string, string[]>;
  /** Value sets that refer to another variable's values (`ending` 的值). */
  valueRefs: [string, string][];
  /** Plain names listed as aliases of a family (resolved through section 7). */
  memberAliases: [string, string][];
}

function baseDef(name: string, row: Row, kind: VarKind, scope: VarScope): VarDef {
  return {
    name,
    kind,
    scope,
    range: null,
    step: null,
    default:
      kind === 'flag' || kind === 'bool' ? false : kind === 'int' || kind === 'num' ? 0 : null,
    values: null,
    aliases: [],
    writers: writersOf(row.writerCell, scope),
    readers: readersOf(row.readerCell),
    derive: null,
    monotone: kind === 'flag',
    act: actOf(name),
    visibility: visibilityOf(name),
    ai: aiOf(row),
    label: `var.${name.replace(/<([^<>]+)>/g, '$1')}`,
    source: row.section,
  };
}

/** Split a family's key-and-value cell into slot keys, values and the range. */
function familyCell(
  def: FamilyDef,
  cell: string,
  report: string[],
): { values: string[] | null; valueAliases: Record<string, string> } {
  const valueAliases: Record<string, string> = {};
  let values: string[] | null = null;
  const perKeyValues = new Set<string>();
  const groups = stripParens(cell.replace(/默认[^；]*/g, ''))
    .split('；')
    .map((g) => g.trim())
    .filter(Boolean);
  const LABEL_SLOTS: Record<string, string> = { 违约编号: 'breach', 字段: 'field' };
  const labelSlot = (label: string): FamilySlot | undefined => {
    const slot = LABEL_SLOTS[label] ?? SLOT_NAMES[label];
    return def.slots.find((s) => s.name === slot) ?? def.slots.find((s) => s.keys === null);
  };
  /** A group that is only a list of codes (no prose around them). */
  const pure = (g: string): boolean =>
    g.replace(/`[^`]*`/g, '').replace(/[、s]|到/g, '') === '' && codes(g).length > 0;
  const pureCount = groups.filter((g) => pure(g)).length;
  let pureSeen = 0;
  for (const g of groups) {
    // `luchen`：`loyal`、`wavering` (per-key values)
    const perKey = /^`([^`]+)`：(.*)$/.exec(g);
    if (perKey) {
      const slot = def.slots[0];
      if (slot) slot.keys = [...(slot.keys ?? []), perKey[1] as string];
      for (const v of expandRanges(perKey[2] as string)) perKeyValues.add(v);
      continue;
    }
    const labelled = /^(值|键|人|国|势力|防线|幕|违约编号|字段)s*[：:]?s*(`.*)$/.exec(g);
    const label = labelled?.[1];
    const body = labelled ? (labelled[2] as string) : g;
    const listed = expandRanges(body).filter((v) => /^[A-Za-z0-9_-]+$/.test(v));
    if (label === '值') {
      values = listed;
      continue;
    }
    if (listed.length === 0) continue;
    if (label) {
      const slot = labelSlot(label);
      if (slot) slot.keys = listed;
      continue;
    }
    if (!pure(g)) continue;
    pureSeen++;
    // a list of a slot's fixed domain members names that slot's keys
    const fixed = def.slots.find((s) => {
      const dom = s.domain ? KEY_DOMAINS[s.domain] : undefined;
      return s.keys === null && Array.isArray(dom) && listed.every((x) => dom.includes(x));
    });
    if (fixed) {
      fixed.keys = listed;
      continue;
    }
    const open = def.slots.find((s) => s.keys === null && s.domain === null);
    const lastForValues = def.kind === 'enum' && values === null && pureSeen === pureCount;
    if (open && !lastForValues) open.keys = listed;
    else if (def.kind === 'enum' && values === null) values = listed;
    else {
      const first = def.slots.find(
        (s) => s.keys === null && s.domain !== null && !Array.isArray(KEY_DOMAINS[s.domain]),
      );
      if (first) first.keys = listed;
      else report.push(`${def.name}: unplaced key list ${listed.join(',')}`);
    }
  }
  if (perKeyValues.size > 0) values = [...perKeyValues];
  return { values, valueAliases };
}

function addRow(c: Collected, row: Row): void {
  const kindInfo = row.kindCell
    ? kindOf(row.kindCell)
    : { kind: 'flag' as VarKind, derived: false };
  const names = row.names.filter(isNameToken);
  if (names.length === 0) {
    c.report.push(`${row.section}: row without a name (${row.names.join(' ')})`);
    return;
  }
  // `npc.<人>.<属性>` and `dg.<迷宫>.<字段>` style umbrella rows
  const generic = row.kindCell.includes('按属性');
  let kind: VarKind = kindInfo?.kind ?? 'any';
  if (row.section === '8.3' && /类型是布尔/.test(row.readerCell + row.noteCell)) kind = 'bool';
  const derived = kindInfo?.derived === true || row.species.includes('派生');
  const aliasCodes = codes(row.aliasCell);
  const aliasNames = parseAliasCell(c, row.aliasCell);
  names.forEach((rawName, idx) => {
    const name = normalizePattern(rawName);
    const scope = scopeOf(row.section, name, kind, row.species);
    const def = baseDef(name, row, kind, scope);
    if (derived) def.derive = c.derives.get(name) ?? deriveFromCell(row.valueCell);
    const { range, step } = rangeOf(row.valueCell);
    if (kind === 'int' || kind === 'num' || kind === 'tick') {
      def.range = range;
      def.step = step;
    }
    const d = defaultOf(row.valueCell);
    if (d.found) def.default = d.value;
    // pairwise aliases when the name and alias cells list the same count
    if (names.length > 1 && aliasCodes.length === names.length) {
      def.aliases = [normalizePattern(aliasCodes[idx] as string)];
    } else if (names.length === 1) {
      def.aliases = aliasNames;
    }
    if (isPattern(name)) {
      if (generic) {
        // an umbrella row only contributes its alias rules (members are listed one by one)
        for (const a of def.aliases) c.aliasPairs.push([a, name]);
        return;
      }
      // A plain name in a family's alias cell names one member without saying which
      // (`eluen_awareness` for `goddess.<司>.gaze`): section 7 maps it to the member.
      for (const a of def.aliases.filter((x) => !isPattern(x))) c.memberAliases.push([a, name]);
      const fam: FamilyDef = {
        ...def,
        aliases: def.aliases.filter(isPattern),
        slots: slotNames(name).map((s) => ({
          name: s,
          domain: SLOT_DOMAINS[s] ?? null,
          keys: null,
        })),
      };
      const { values } = familyCell(fam, row.valueCell, c.report);
      if (kind === 'enum') fam.values = values;
      if (kind === 'int' || kind === 'num') {
        fam.range = range;
        fam.step = step;
      }
      for (const slot of fam.slots) {
        if (slot.domain === 'goddess' && slot.keys === null && /五位在任女神/.test(row.valueCell))
          slot.keys = [...GODDESSES];
      }
      const prev = c.families.get(name);
      c.families.set(name, prev ? mergeDefs(prev, fam) : fam);
    } else {
      if (kind === 'enum') {
        def.values = enumValues(c, name, row.valueCell);
        const inline = inlineValueAliases(row.valueCell);
        if (Object.keys(inline).length > 0)
          c.valueAliases[name] = { ...(c.valueAliases[name] ?? {}), ...inline };
      }
      const prev = c.vars.get(name);
      c.vars.set(name, prev ? mergeDefs(prev, def) : def);
    }
  });
}

function enumValues(c: Collected, name: string, cell: string): string[] | null {
  if (/第 7\.6 节/.test(cell)) {
    const listed = c.enumRows.get(name);
    if (listed) return listed;
  }
  if (/女神代号/.test(cell) && codes(cell).length === 0) return [...GODDESSES];
  const ref = /`([a-z_.]+)` 的值/.exec(cell);
  if (ref && codes(cell).length === 1) {
    c.valueRefs.push([name, ref[1] as string]);
    return null;
  }
  const v = valuesOf(cell);
  return v.length > 0 ? v : null;
}

function deriveFromCell(cell: string): string {
  const expr = codes(cell).find((s) => /[\s(]/.test(s));
  return expr ?? stripParens(cell).trim();
}

function mergeDefs<T extends VarDef>(a: T, b: T): T {
  return {
    ...a,
    aliases: [...new Set([...a.aliases, ...b.aliases])].sort(),
    writers: [...new Set([...a.writers, ...b.writers])].sort(),
    readers: [...new Set([...a.readers, ...b.readers])].sort(),
    values: a.values ?? b.values,
    range: a.range ?? b.range,
    derive: a.derive ?? b.derive,
  };
}

/**
 * Alias cell: plain names; `（换算）` marks a conversion alias (the formula comes from
 * section 7.3 or 7.4); `x 与 y 即 z` and `（即 z）` name aliases of another canonical
 * name; `x 即 y` inside a parenthetical is a key alias of a family.
 */
function parseAliasCell(c: Collected, cell: string): string[] {
  if (cell === '无' || cell === '') return [];
  const out: string[] = [];
  // clauses separated by ；
  for (const clause of cell.split('；')) {
    const ji = /^(.*?)\s*即\s*`([^`]+)`(.*)$/.exec(clause);
    if (ji && stripParens(clause).includes('即')) {
      // `a` 与 `b` 即 `c`: aliases of another canonical name
      for (const a of codes(ji[1] as string))
        c.aliasPairs.push([normalizePattern(a), normalizePattern(ji[2] as string)]);
      continue;
    }
    // key aliases inside a parenthetical: （`merchant_union` 即 `merchants_union`、...）
    for (const m of clause.matchAll(/`([^`]+)` 即 `([^`]+)`/g)) {
      const from = m[1] as string;
      const to = m[2] as string;
      if (/^[a-z_]+$/.test(from) && /^[a-z_]+$/.test(to)) {
        c.keyAliases.faction = { ...(c.keyAliases.faction ?? {}), [from]: to };
      } else {
        c.aliasPairs.push([normalizePattern(from), normalizePattern(to)]);
      }
    }
    const outside = clause.replace(/（[^（）]*）/g, (p) =>
      p.includes('换算') ? '' : p.replace(/`[^`]*`/g, ''),
    );
    for (const a of codes(outside)) if (isNameToken(a)) out.push(normalizePattern(a));
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Section 7 alias tables

const FORMULA = /^[^=，；（`]+?=\s*([^，；（]+)/;

/** `信任 = (关系 + 100) ÷ 2` as scale and offset (canonical = alias * scale + offset). */
export function parseConversion(text: string): { scale: number; offset: number } | null {
  const m = FORMULA.exec(text.trim());
  if (!m) return null;
  const rhs = (m[1] as string).replace(/×/g, '*').replace(/÷/g, '/').trim();
  const expr = rhs.replace(/[^\d\s+\-*/().]+/g, ' x ').replace(/\s+/g, ' ');
  if (!/x/.test(expr)) return null;
  const at = (x: number): number | null => evalArith(expr.replace(/x/g, `(${x})`));
  const y0 = at(0);
  const y1 = at(1);
  if (y0 === null || y1 === null) return null;
  return { scale: y1 - y0, offset: y0 };
}

/** A tiny + - * / ( ) evaluator for the conversion formulas. */
function evalArith(src: string): number | null {
  const toks = src.match(/\d+(?:\.\d+)?|[+\-*/()]/g);
  if (!toks) return null;
  let i = 0;
  const expr = (): number => {
    let v = term();
    while (toks[i] === '+' || toks[i] === '-') v = toks[i++] === '+' ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (toks[i] === '*' || toks[i] === '/') v = toks[i++] === '*' ? v * factor() : v / factor();
    return v;
  };
  const factor = (): number => {
    const t = toks[i++];
    if (t === '(') {
      const v = expr();
      i++;
      return v;
    }
    if (t === '-') return -factor();
    return Number(t);
  };
  const v = expr();
  return i === toks.length && Number.isFinite(v) ? v : null;
}

function aliasTables(c: Collected, sections: Section[]): void {
  for (const s of sections) {
    if (!/^7\.[1-8]$/.test(s.id)) continue;
    for (const t of tablesOf(s)) {
      if (s.id === '7.1') {
        for (const r of t.rows) personRow(c, r);
        continue;
      }
      if (s.id === '7.6') continue;
      for (const r of t.rows) {
        if (s.id === '7.7') {
          for (const a of codes(r[2] ?? ''))
            c.aliasPairs.push([normalizePattern(a), normalizePattern(codes(r[1] ?? '')[0] ?? '')]);
          continue;
        }
        const from = codes(r[0] ?? '').filter(isNameToken);
        const toCell = r[1] ?? '';
        // `照旧`: the written form is already canonical
        if (/^照旧/.test(toCell.trim())) continue;
        // a family written out as its member range (evidence.<编号> to evidence.E01 到 E36)
        if (from.length === 1 && isPattern(from[0] as string) && /`\s*到\s*`/.test(toCell))
          continue;
        let to = codes(toCell).filter(isNameToken);
        // the canonical name is the first clause; later clauses are remarks
        if (from.length === 1 && to.length > 1)
          to = codes(toCell.split('；')[0] as string).filter(isNameToken);
        const note = r[2] ?? '';
        if (from.length === 0 || to.length === 0) {
          // `bond.<人>.<N>` | 条件 `trust.<人> >= N`: a condition rewrite, not a name
          const cond = codes(r[1] ?? '').find((x) => /\s(>=|==)\s/.test(x));
          if (from.length === 1 && cond) {
            // the threshold N of the condition is the alias's <N> slot
            c.aliasPairs.push([
              normalizePattern(from[0] as string),
              normalizePattern(cond).replace(/\bN\b/, '<n>'),
            ]);
          } else if (from.length > 0) {
            c.report.push(`${s.id}: no canonical name for ${from.join(',')}`);
          }
          continue;
        }
        const pairs: [string, string][] =
          from.length === to.length
            ? from.map((f, i) => [f, to[i] as string])
            : to.length === 1
              ? from.map((f) => [f, to[0] as string])
              : [];
        if (pairs.length === 0) {
          c.report.push(`${s.id}: cannot pair ${from.join(',')} with ${to.join(',')}`);
          continue;
        }
        const conv = parseConversion(note);
        for (const [f, tname] of pairs) {
          if (f === tname) continue;
          const nf = normalizePattern(f);
          const nt = normalizePattern(tname);
          if (
            conv &&
            (s.id === '7.3' || s.id === '7.4') &&
            !(conv.scale === 1 && conv.offset === 0)
          ) {
            c.conversions.push({ from: nf, to: nt, scale: conv.scale, offset: conv.offset });
          } else {
            c.aliasPairs.push([nf, nt]);
          }
        }
      }
    }
  }
}

/** 7.1: person code aliases and the explicit `x 到 y` pairs of the note column. */
function personRow(c: Collected, r: string[]): void {
  const canon = codes(r[1] ?? '');
  const aliases = codes(r[2] ?? '');
  if (canon.length === 1) {
    for (const a of aliases)
      c.keyAliases.npc = { ...(c.keyAliases.npc ?? {}), [a]: canon[0] as string };
  }
  const note = r[3] ?? '';
  for (const clause of note.split('；')) {
    const m = /^(.*?)\s到\s`([^`]+)`/.exec(clause);
    if (!m) continue;
    for (const a of codes(m[1] as string))
      c.aliasPairs.push([normalizePattern(a), normalizePattern(m[2] as string)]);
  }
}

/** 7.6: canonical values and value aliases. */
function valueTable(
  c: Collected,
  sections: Section[],
  fixes: Record<string, Record<string, string>>,
): void {
  const s = sections.find((x) => x.id === '7.6');
  if (!s) return;
  for (const t of tablesOf(s)) {
    for (const r of t.rows) {
      const vars = codes(r[0] ?? '');
      const target = vars.map((v) => (v.endsWith('.*') ? v : v));
      const canonCell = r[1] ?? '';
      const aliasCell = r[2] ?? '';
      let canon = expandRanges(canonCell).filter((v) => /^[A-Za-z0-9_]+$/.test(v));
      if (/^布尔/.test(canonCell)) canon = ['true', 'false'];
      if (/女神代号/.test(canonCell)) canon = [...GODDESSES];
      const map = alignValueAliases(canon, aliasCell);
      for (const v of target) {
        const key = v.replace(/\.\*$/, '.*');
        if (canon.length > 0 && !/^布尔/.test(canonCell) && !/女神代号/.test(canonCell)) {
          c.enumRows.set(v, canon);
        }
        const fixed = fixes[key];
        const merged = { ...map, ...(fixed ?? {}) };
        if (Object.keys(merged).length > 0)
          c.valueAliases[key] = { ...(c.valueAliases[key] ?? {}), ...merged };
      }
      // `a4_alliance` 的 `broad`、`narrow`、`broken` 分别读作 `league`、`accord`、`broken`
      const readAs = /`([a-z0-9_]+)` 的 (.*?)分别读作(.*)$/.exec(aliasCell);
      if (readAs) {
        const from = codes(readAs[2] as string);
        const to = codes(readAs[3] as string);
        if (from.length === to.length) {
          for (const v of vars) {
            const m: Record<string, string> = {};
            from.forEach((f, i) => {
              if (f !== to[i]) m[f] = to[i] as string;
            });
            c.valueAliases[v] = { ...(c.valueAliases[v] ?? {}), ...m };
          }
        }
      }
    }
  }
}

/**
 * Align a 7.6 alias cell with the canonical values: `x 即 y` pairs; groups split by ；
 * matching the values one to one; otherwise the listed spellings one to one. Spellings
 * that cannot be aligned are left to the explicit fixes of build.ts.
 */
export function alignValueAliases(canon: string[], cell: string): Record<string, string> {
  const out: Record<string, string> = {};
  const head = cell.split(/；?`[a-z0-9_]+` 的 .*分别读作/)[0] as string;
  const groups = head
    .split('；')
    .map((g) => g.trim())
    .filter(Boolean);
  const isJi = groups.some((g) => g.includes('即'));
  if (isJi) {
    for (const g of groups) {
      const m = /^(.*)即\s*`([^`]+)`/.exec(g);
      if (!m) continue;
      for (const a of codes(m[1] as string)) out[a] = m[2] as string;
    }
    return out;
  }
  const items = (g: string): string[] => {
    const quoted = [...g.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
    if (quoted.length > 0) {
      const inner = /（(.*)）/.exec(g)?.[1] ?? g;
      return inner
        .split('、')
        .map((x) => x.trim().replace(/^"|"$/g, '').replace(/^`|`$/g, ''))
        .filter(Boolean);
    }
    return expandRanges(g).length > 0 &&
      !/[一-鿿]/.test(g.replace(/`[^`]*`/g, '').replace(/到/g, ''))
      ? expandRanges(g)
      : g
          .split('、')
          .map((x) => x.trim().replace(/^`|`$/g, ''))
          .filter(Boolean);
  };
  if (groups.length === canon.length && groups.length > 1) {
    groups.forEach((g, i) => {
      for (const a of items(g)) if (a !== canon[i]) out[a] = canon[i] as string;
    });
    return out;
  }
  const flat = groups.flatMap(items);
  if (flat.length === canon.length) {
    flat.forEach((a, i) => {
      if (a !== canon[i]) out[a] = canon[i] as string;
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sections 2.8, 2.9 and 6.2

function deriveTable(c: Collected, sections: Section[]): void {
  const s = sections.find((x) => x.id === '2.8');
  if (!s) return;
  for (const t of tablesOf(s)) {
    for (const r of t.rows) {
      const name = codes(r[0] ?? '')[0];
      if (!name) continue;
      const formula = codes(r[1] ?? '')[0] ?? stripParens(r[1] ?? '').trim();
      c.derives.set(normalizePattern(name), formula);
    }
  }
}

function computeTable(c: Collected, sections: Section[]): void {
  const s = sections.find((x) => x.id === '2.9');
  if (!s) return;
  for (const t of tablesOf(s)) {
    for (const r of t.rows) {
      const fn = codes(r[0] ?? '')[0];
      if (!fn) continue;
      for (const w of codes(r[2] ?? '')) {
        const name = normalizePattern(w.split(' ')[0] as string);
        if (!isNameToken(name)) continue;
        const set = c.computeOutputs.get(name) ?? new Set<string>();
        set.add(`compute:${fn}`);
        c.computeOutputs.set(name, set);
      }
    }
  }
}

function questTable(c: Collected, sections: Section[]): void {
  const s = sections.find((x) => x.id === '6.2');
  if (!s) return;
  for (const t of tablesOf(s)) {
    for (const r of t.rows) {
      const old = codes(r[0] ?? '');
      const neu = codes(r[2] ?? '');
      if (old.length === 1 && neu.length === 1 && !isPattern(neu[0] as string)) {
        c.questIds[old[0] as string] = neu[0] as string;
      } else {
        c.report.push(`6.2: ${old.join(' to ')} has no single data id (${neu.join(',')})`);
      }
    }
  }
  const tail = s.lines.join('\n');
  for (const m of tail.matchAll(/`quest\.([a-z0-9_]+)` 指向 `(q_[a-z0-9_]+)`/g)) {
    c.questIds[m[1] as string] = m[2] as string;
  }
}

/** 8.8.9: cutscenes are content; their writes and reads add content writers and readers. */
function cutsceneIndex(c: Collected, sections: Section[]): void {
  const s = sections.find((x) => x.id === '8.8.9');
  if (!s) return;
  for (const t of tablesOf(s)) {
    for (const r of t.rows) {
      for (const w of codes(r[1] ?? '')) touch(c, normalizePattern(w), 'writers');
      for (const w of codes(r[2] ?? '')) touch(c, normalizePattern(w), 'readers');
    }
  }
}

function touch(c: Collected, name: string, field: 'writers' | 'readers'): void {
  const def = c.vars.get(name) ?? c.families.get(name);
  if (def && !def[field].includes('content')) def[field] = [...def[field], 'content'].sort();
}

// ---------------------------------------------------------------------------
// Section 8 rows

function rowsOf(sections: Section[]): Row[] {
  const out: Row[] = [];
  for (const s of sections) {
    if (!/^8(\.\d+)*$/.test(s.id) || s.id === '8.8.9') continue;
    for (const t of tablesOf(s)) {
      const h = t.header;
      if (h[0] !== '规范名') continue;
      const col = (name: RegExp): number => h.findIndex((x) => name.test(x));
      const iAlias = col(/^别名$/);
      const iKind = col(/^类型$/);
      const iSpecies = col(/^种$/);
      const iValue = col(/范围|取值|键与取值/);
      const iWriter = col(/首次写入|写入者/);
      const iReader = col(/读取处|消费者/);
      const iNote = col(/^说明$/);
      for (const r of t.rows) {
        const cell = (i: number): string => (i >= 0 ? (r[i] ?? '') : '');
        out.push({
          names: codes(cell(0)),
          aliasCell: iAlias >= 0 ? cell(iAlias) : '无',
          kindCell: cell(iKind),
          valueCell: cell(iValue),
          writerCell: cell(iWriter),
          readerCell: cell(iReader),
          noteCell: cell(iNote),
          species: cell(iSpecies),
          section: s.id,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assembly

/** Value aliases the 7.6 table lists in an order the parser cannot align (build.ts). */
export type ValueAliasFixes = Record<string, Record<string, string>>;

export interface ParseOptions {
  /** 7.6 rows the parser cannot align, keyed like the table (build.ts). */
  valueAliasFixes?: ValueAliasFixes;
  /** Quest data ids section 6.2 leaves to the quest catalogues (build.ts). */
  questIds?: Record<string, string>;
}

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

function sortRecord<T>(r: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function tidy<T extends VarDef>(v: T): T {
  const sorted = (xs: string[]) => [...new Set(xs)].sort();
  const aliases = sorted(v.aliases.filter((x) => x !== v.name));
  return { ...v, aliases, writers: sorted(v.writers), readers: sorted(v.readers) };
}

export function parseRegistry(md: string, opts: ParseOptions = {}): ParseResult {
  const sections = splitSections(md);
  const c: Collected = {
    vars: new Map(),
    families: new Map(),
    aliasPairs: [],
    valueAliases: {},
    conversions: [],
    keyAliases: {},
    questIds: {},
    derives: new Map(),
    computeOutputs: new Map(),
    report: [],
    enumRows: new Map(),
    valueRefs: [],
    memberAliases: [],
  };
  deriveTable(c, sections);
  computeTable(c, sections);
  valueTable(c, sections, opts.valueAliasFixes ?? {});
  questTable(c, sections);
  for (const [from, to] of Object.entries(opts.questIds ?? {})) c.questIds[from] = to;
  aliasTables(c, sections);
  for (const row of rowsOf(sections)) addRow(c, row);
  cutsceneIndex(c, sections);

  // derived quantities of 2.8 that section 8 does not list (evidence_set, npc_deaths)
  for (const [name, formula] of c.derives) {
    if (c.vars.has(name) || c.families.has(name)) continue;
    const row: Row = {
      names: [name],
      aliasCell: '无',
      kindCell: '派生集合',
      valueCell: '',
      writerCell: '派生',
      readerCell: '',
      noteCell: '',
      species: '派生',
      section: '2.8',
    };
    const def = baseDef(name, row, 'set', actOf(name) === null ? 'global' : 'act_exit');
    def.derive = formula;
    def.writers = [];
    c.vars.set(name, def);
  }
  // compute outputs: the function is a writer (section 9.3 rule 8)
  for (const [name, fns] of c.computeOutputs) {
    const def = c.vars.get(name) ?? c.families.get(name) ?? memberFamily(c, name);
    if (def) def.writers = [...new Set([...def.writers, ...fns])].sort();
  }
  // enum values taken from another variable
  for (const [name, ref] of c.valueRefs) {
    const def = c.vars.get(name);
    const src = c.vars.get(ref);
    if (def && src?.values) def.values = [...src.values];
  }
  // alias pairs attach to their canonical names; pattern targets become spelling rules
  const patternAliases: { from: string; to: string }[] = [];
  for (const [alias, canon] of c.aliasPairs) {
    if (!alias || !canon || alias === canon) continue;
    const def = c.vars.get(canon) ?? c.families.get(canon);
    if (def) {
      if (!def.aliases.includes(alias)) def.aliases = [...def.aliases, alias];
    } else if (/\s/.test(canon)) {
      // condition rewrite (bond.<npc>.<n> to trust.<npc> >= <n>): kept on the family
      const fam = c.families.get(canon.split(' ')[0] as string);
      if (fam) fam.aliases = [...fam.aliases, `${alias}=${canon}`];
      else c.report.push(`alias ${alias}: condition target ${canon} not registered`);
    } else if (!isNameToken(canon)) {
      c.report.push(`alias ${alias}: target ${canon} is not a name`);
    } else if (isPattern(canon)) {
      patternAliases.push({ from: alias, to: canon });
    } else {
      const member = memberFamily(c, canon);
      if (member) member.aliases = [...member.aliases, `${alias}=${canon}`];
      else c.report.push(`alias ${alias}: target ${canon} is not registered`);
    }
  }
  // plain family aliases must be mapped to a member by section 7
  const mapped = new Set([...c.aliasPairs.map(([a]) => a), ...c.conversions.map((x) => x.from)]);
  for (const [alias, fam] of c.memberAliases) {
    if (!mapped.has(alias)) c.report.push(`alias ${alias} of ${fam}: no member named in section 7`);
  }
  for (const conv of c.conversions) {
    const probe = conv.to.replace(/<[^<>]+>/g, 'x');
    const def = c.vars.get(conv.to) ?? c.families.get(conv.to) ?? memberFamily(c, probe);
    if (!def) c.report.push(`conversion ${conv.from}: target ${conv.to} is not registered`);
  }
  const seenConv = new Set<string>();
  const conversions = c.conversions
    .filter((x) => {
      const k = `${x.from}>${x.to}`;
      if (seenConv.has(k)) return false;
      seenConv.add(k);
      return true;
    })
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const seenPattern = new Set<string>();
  const patterns = patternAliases
    .filter((x) => {
      const k = `${x.from}>${x.to}`;
      if (seenPattern.has(k)) return false;
      seenPattern.add(k);
      return true;
    })
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return {
    data: {
      version: 1,
      source: DOC_PATH,
      vars: [...c.vars.values()].map(tidy).sort(byName),
      families: [...c.families.values()].map(tidy).sort(byName),
      valueAliases: sortRecord(
        Object.fromEntries(Object.entries(c.valueAliases).map(([k, v]) => [k, sortRecord(v)])),
      ),
      conversions,
      patternAliases: patterns,
      keyAliases: sortRecord(
        Object.fromEntries(Object.entries(c.keyAliases).map(([k, v]) => [k, sortRecord(v)])),
      ),
      questIds: sortRecord(c.questIds),
      keyDomains: sortRecord(KEY_DOMAINS),
    },
    report: { skipped: [...new Set(c.report)].sort() },
  };
}

/** The family a concrete name belongs to (slots match single segments). */
function memberFamily(c: Collected, name: string): FamilyDef | undefined {
  for (const fam of c.families.values()) if (patternMatches(fam.name, name)) return fam;
  return undefined;
}

export function patternMatches(pattern: string, name: string): boolean {
  const re = new RegExp(
    `^${pattern
      .split(/<[^<>]+>/)
      .map((p) => p.replace(/[.+?^${}()|[\]\\*]/g, '\\$&'))
      .join('[A-Za-z0-9_-]+')}$`,
  );
  return re.test(name);
}

/** Stable JSON text of the registry (two-space indent, trailing newline). */
export function formatRegistry(data: RegistryData): string {
  return `${formatJson(data, 0, 0)}\n`;
}

const LINE_WIDTH = 100;

/**
 * JSON in the repository's Biome style (two-space indent, line width 100): objects one
 * member per line, arrays of scalars on one line when they fit, so formatting the
 * generated file changes nothing. `used` is the width already taken on the line.
 */
function formatJson(value: unknown, indent: number, used: number): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const pad = ' '.repeat(indent + 2);
  const end = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((x) => x === null || typeof x !== 'object')) {
      const inline = `[${value.map((x) => JSON.stringify(x)).join(', ')}]`;
      // the trailing comma of the member counts against the width
      if (used + inline.length + 1 <= LINE_WIDTH) return inline;
    }
    const items = value.map((x) => `${pad}${formatJson(x, indent + 2, pad.length)}`);
    return `[\n${items.join(',\n')}\n${end}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const lines = entries.map(([k, v]) => {
    const head = `${pad}${JSON.stringify(k)}: `;
    return `${head}${formatJson(v, indent + 2, head.length)}`;
  });
  return `{\n${lines.join(',\n')}\n${end}}`;
}
