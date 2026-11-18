// Tide pack (PK-M1-52): the written tide nights (act1_borderstone.md 8; data/tide/nights.json),
// the monster tide waves of catalog_bestiary.md 7 (`mtide_` rows of the `waves` table,
// data/tide/waves.json, run by the combat wave runner), and the rules that turn a dungeon
// overflow or a full nest into a tide (data/tide/surges.json). The validator checks the
// night against the map, the people, the waves, the condition language and the variable
// registry: phases in time order with a boss gate before the surge, lines and posts that
// name real lines and phases, every variable the night writes or reads registered.

import nights from '../../../data/tide/nights.json';
import surges from '../../../data/tide/surges.json';
import waves from '../../../data/tide/waves.json';
import type { ContentMap } from '../../core/contracts';
import { defaultRegistry, FlagRegistry, registryData } from '../../core/registry';
import type { WaveDef } from '../../systems/combat/types';
import { referencedVars } from '../../systems/quests/conditions';
import { BOSS_LINE, PLAYER_LINE, postsIn, SURGE_LINE } from '../../systems/tide/rules';
import type { TideNightDef, TideSurgeDef } from '../../systems/tide/types';
import type { ContentPack, FieldSchema } from '../pack';
import { conditionProblems, effectProblems } from './quests';

const json = (key: string, label: string): FieldSchema => ({ key, label, type: 'json' });

function people(content: ContentMap): Set<string> | null {
  const npcs = (content.npcs ?? []).map((n) => n.id);
  const companions = ((content as { companions?: { id: string }[] }).companions ?? []).map(
    (c) => c.id,
  );
  return npcs.length > 0 ? new Set([...npcs, ...companions]) : null;
}

/** The night's own variable names and the conditions the registry walker does not read. */
function nightNames(n: TideNightDef): { names: string[]; conditions: string[] } {
  const names = [n.start, ...Object.values(n.vars)];
  if (n.striker) names.push(n.striker.revealed, n.striker.strike);
  if (n.striker?.ally) names.push(n.striker.ally.flag);
  if (n.mob) names.push(n.mob.var);
  for (const c of n.children ?? []) names.push(c.var);
  const conditions = [
    ...n.phases.map((p) => p.until),
    n.settle.slopeOrdered,
    n.exposedUnless,
    ...(n.children ?? []).flatMap((c) => [c.dies, c.diesLater]),
    ...n.actors.flatMap((a) => a.rows.map((r) => r.prosperityUnless)),
  ].filter((c): c is string => !!c);
  return { names, conditions };
}

/** Problems of one written night against the content. */
export function nightProblems(n: TideNightDef, content: ContentMap): string[] {
  const at = `tide night ${n.id}`;
  const out: string[] = [];
  const data = (content as { registry?: ReturnType<typeof registryData> }).registry;
  const registry = !data || data === registryData() ? defaultRegistry() : new FlagRegistry(data);
  const { names, conditions } = nightNames(n);
  for (const name of names)
    if (!registry.isCanonical(name))
      out.push(`${at}: variable ${name} is not registered under that spelling`);
  for (const c of conditions)
    for (const v of referencedVars(c))
      if (!registry.isRegistered(v)) out.push(`${at}: ${v} in "${c}" is not registered`);
  const map = content.maps?.find((m) => m.id === n.mapId);
  const places = map ? new Set(map.locations.map((l) => l.id)) : null;
  const waveIds = new Set((content.waves ?? []).map((w) => w.id));
  const who = people(content);
  if (!content.acts?.some((a) => a.id === n.act)) out.push(`${at}: unknown act ${n.act}`);
  if (content.maps && !map) out.push(`${at}: unknown map ${n.mapId}`);
  const place = (id: string, where: string) => {
    if (places && !places.has(id)) out.push(`${where}: map ${n.mapId} has no location ${id}`);
  };
  const person = (id: string, where: string) => {
    if (who && !who.has(id)) out.push(`${where}: unknown person ${id}`);
  };
  // phases: in time order, one boss gate, the surge after it, dawn last
  const phaseIds = new Set<string>();
  let lastHour = -1;
  for (const [i, ph] of n.phases.entries()) {
    const pat = `${at} phase ${ph.id}`;
    if (phaseIds.has(ph.id)) out.push(`${pat}: duplicate id`);
    phaseIds.add(ph.id);
    if (!(ph.hour >= lastHour)) out.push(`${pat}: hour ${ph.hour} before the phase before it`);
    lastHour = ph.hour;
    if (ph.stage !== i) out.push(`${pat}: stage ${ph.stage} is not its place ${i}`);
    out.push(...conditionProblems(ph.until, `${pat} until`));
    for (const w of ph.waves ?? []) {
      if (!waveIds.has(w.wave)) out.push(`${pat}: unknown wave ${w.wave}`);
      out.push(...conditionProblems(w.when, `${pat} wave ${w.wave}`));
    }
    if (ph.seek) place(ph.seek.place, `${pat} seek`);
    if (ph.surge && !n.phases.slice(0, i).some((p) => p.until))
      out.push(`${pat}: the surge comes before any boss gate`);
  }
  if (n.phases.length < 2) out.push(`${at}: needs at least a start and a dawn`);
  const last = n.phases[n.phases.length - 1];
  if (last?.settle || last?.waves?.length) out.push(`${at}: dawn must neither settle nor spawn`);
  // lines
  const lineIds = new Set<string>();
  for (const l of n.lines) {
    const lat = `${at} line ${l.id}`;
    if (lineIds.has(l.id)) out.push(`${lat}: duplicate id`);
    lineIds.add(l.id);
    place(l.location, lat);
    for (const b of l.behind ?? []) place(b, lat);
    for (const p of Object.keys(l.pressure ?? {}))
      if (!phaseIds.has(p)) out.push(`${lat}: pressure for unknown phase ${p}`);
    if (l.surgeWave && !waveIds.has(l.surgeWave)) out.push(`${lat}: unknown wave ${l.surgeWave}`);
    if (l.face && l.front) out.push(`${lat}: a line is a face or a front, not both`);
  }
  if (!n.lines.some((l) => l.face)) out.push(`${at}: no face for the surge`);
  for (const m of n.mods ?? []) {
    if (!lineIds.has(m.line)) out.push(`${at} mod: unknown line ${m.line}`);
    for (const p of m.phases ?? []) if (!phaseIds.has(p)) out.push(`${at} mod: unknown phase ${p}`);
    out.push(...conditionProblems(m.when, `${at} mod ${m.line}`));
  }
  // actors and rows
  const lineOk = (id: string) => lineIds.has(id) || id === PLAYER_LINE || id === BOSS_LINE;
  const actorIds = new Set<string>();
  for (const a of n.actors) {
    const aat = `${at} actor ${a.id}`;
    if (actorIds.has(a.id)) out.push(`${aat}: duplicate id`);
    actorIds.add(a.id);
    for (const p of a.npcs ?? []) person(p, aat);
    const rowIds = new Set<string>();
    for (const r of a.rows) {
      const rat = `${aat} row ${r.id}`;
      if (rowIds.has(r.id)) out.push(`${rat}: duplicate id`);
      rowIds.add(r.id);
      if (!r.label) out.push(`${rat}: no label`);
      out.push(...conditionProblems(r.when, `${rat} when`));
      out.push(...conditionProblems(r.prosperityUnless, `${rat} prosperityUnless`));
      for (const ph of Object.keys(r.posts ?? {})) {
        if (!phaseIds.has(ph)) out.push(`${rat}: post in unknown phase ${ph}`);
        for (const post of postsIn(r, ph))
          if (post.line && !lineOk(post.line))
            out.push(`${rat}: post on unknown line ${post.line}`);
      }
      for (const m of r.pressure ?? []) {
        if (!phaseIds.has(m.phase)) out.push(`${rat}: pressure in unknown phase ${m.phase}`);
        if (!lineIds.has(m.line) && m.line !== SURGE_LINE)
          out.push(`${rat}: pressure on unknown line ${m.line}`);
      }
      const f = r.fate;
      if (f?.diesAtGap && !phaseIds.has(f.diesAtGap.phase))
        out.push(`${rat}: fate in unknown phase ${f.diesAtGap.phase}`);
      if (f?.diesWhen) {
        if (!phaseIds.has(f.diesWhen.phase))
          out.push(`${rat}: fate in unknown phase ${f.diesWhen.phase}`);
        out.push(...conditionProblems(f.diesWhen.when, `${rat} fate`));
      }
      if (f?.deathRoll && !(f.deathRoll.chance >= 0 && f.deathRoll.chance <= 1))
        out.push(`${rat}: death roll chance outside 0 to 1`);
      if (r.casualty !== undefined && !(r.casualty > 0))
        out.push(`${rat}: casualty factor must be positive`);
      if (r.fate && (a.npcs ?? []).length === 0) out.push(`${rat}: a fate needs a named person`);
    }
  }
  // the rest
  const s = n.settle;
  for (const p of [...s.protected, ...s.ownLines, ...s.trust.leftChildren.npcs])
    person(p, `${at} settle`);
  out.push(...conditionProblems(s.trust.leftChildren.when, `${at} settle trust`));
  out.push(...conditionProblems(s.slopeOrdered, `${at} settle slopeOrdered`));
  if (!lineIds.has(s.slopeInside.line))
    out.push(`${at} settle: unknown line ${s.slopeInside.line}`);
  if (!phaseIds.has(s.slopeInside.phase))
    out.push(`${at} settle: unknown phase ${s.slopeInside.phase}`);
  const band = s.survival[s.survival.length - 1];
  if (!band || band.max !== undefined)
    out.push(`${at} settle: the last survival band needs no max`);
  for (const c of [s.injury.chance, s.death.chance])
    if (!(c >= 0 && c <= 1)) out.push(`${at} settle: a chance outside 0 to 1`);
  if (n.striker) {
    person(n.striker.npc, `${at} striker`);
    out.push(...conditionProblems(n.striker.ally?.when, `${at} striker ally`));
  }
  if (n.mob) {
    const outs = n.mob.outcomes;
    if (outs.length === 0 || outs[outs.length - 1]?.when)
      out.push(`${at} mob: the last outcome must be unconditional`);
    for (const o of outs) out.push(...conditionProblems(o.when, `${at} mob ${o.value}`));
    for (const [v, eff] of Object.entries(n.mob.effects ?? {})) {
      if (!outs.some((o) => o.value === v)) out.push(`${at} mob: effects for unknown outcome ${v}`);
      out.push(...effectProblems(eff, `${at} mob ${v}`, content));
    }
  }
  if (n.escalation) {
    person(n.escalation.npc, `${at} escalation`);
    out.push(...conditionProblems(n.escalation.when, `${at} escalation`));
  }
  for (const c of n.children ?? []) {
    out.push(...conditionProblems(c.dies, `${at} child ${c.var}`));
    out.push(...conditionProblems(c.diesLater, `${at} child ${c.var} later`));
    out.push(...conditionProblems(c.healthy?.when, `${at} child ${c.var} healthy`));
  }
  for (const c of n.childrenAt ?? []) out.push(...conditionProblems(c.when, `${at} childrenAt`));
  const versions = n.credit.versions;
  if (versions.length === 0) out.push(`${at} credit: no version`);
  for (const v of versions) {
    out.push(...conditionProblems(v.when, `${at} credit ${v.id}`));
    for (const t of v.tellers) person(t, `${at} credit ${v.id}`);
  }
  for (const l of n.credit.lines) if (!lineOk(l)) out.push(`${at} credit: unknown line ${l}`);
  return out;
}

/** Problems of one surge rule against the content. */
export function surgeProblems(r: TideSurgeDef, content: ContentMap): string[] {
  const at = `tide surge ${r.id}`;
  const out: string[] = [];
  const maps = new Set((content.maps ?? []).map((m) => m.id));
  const waveIds = new Set((content.waves ?? []).map((w) => w.id));
  if (maps.size > 0 && !maps.has(r.toMap)) out.push(`${at}: unknown map ${r.toMap}`);
  for (const m of r.fromMaps ?? [])
    if (maps.size > 0 && !maps.has(m)) out.push(`${at}: unknown map ${m}`);
  if (r.on === 'nest_full' && !(r.fromMaps ?? []).length)
    out.push(`${at}: a nest rule needs fromMaps`);
  if (r.waves.length === 0) out.push(`${at}: no wave`);
  for (const w of r.waves) {
    if (!waveIds.has(w)) out.push(`${at}: unknown wave ${w}`);
    const def = content.waves?.find((x) => x.id === w);
    if (def && def.mapId !== r.toMap) out.push(`${at}: wave ${w} is not on ${r.toMap}`);
  }
  if (!(r.cooldownDays >= 0)) out.push(`${at}: cooldown must not be negative`);
  out.push(...conditionProblems(r.when, `${at} when`));
  return out;
}

export const pack: ContentPack = {
  id: 'tide',
  tables: {
    tideNights: nights as unknown as TideNightDef[],
    tideSurges: surges as unknown as TideSurgeDef[],
    waves: waves as unknown as WaveDef[],
  },
  schemas: [
    {
      table: 'tideNights',
      label: '兽潮之夜（写定）',
      file: 'tide/nights.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string' },
        { key: 'act', label: '幕', type: 'string' },
        { key: 'mapId', label: '地图', type: 'ref', refTable: 'maps' },
        { key: 'start', label: '开始旗标', type: 'string' },
        json('vars', '写入与读取的变量'),
        json('phases', '阶段'),
        json('lines', '防线'),
        json('mods', '备战修正'),
        json('actors', 'NPC 行动判定表'),
        json('striker', '玛莎出手'),
        json('mob', '暴民'),
        json('settle', '结算常数'),
        json('escalation', '纷争升级的伤亡'),
        json('children', '孩子的生死'),
        json('childrenAt', '孩子的去处'),
        json('credit', '归功'),
      ],
    },
    {
      table: 'tideSurges',
      label: '溢出与满巢转魔物潮',
      file: 'tide/surges.json',
      idField: 'id',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'on', label: '触发', type: 'enum', options: ['overflow', 'nest_full'] },
        { key: 'toMap', label: '目标聚落地图', type: 'ref', refTable: 'maps' },
        { key: 'fromMaps', label: '澱巢所在地图', type: 'list' },
        { key: 'waves', label: '魔物潮波次', type: 'list' },
        { key: 'region', label: '冷却地区', type: 'string' },
        { key: 'cooldownDays', label: '冷却日数', type: 'number', min: 0 },
        { key: 'when', label: '条件', type: 'string' },
      ],
    },
    {
      table: 'waves',
      label: '魔物潮波次（mtide_）',
      file: 'tide/waves.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        {
          key: 'id',
          label: 'ID',
          type: 'string',
          required: true,
          help: '旗标 combat.wave.<ID> 设为 go 时生成',
        },
        { key: 'name', label: '名称', type: 'string' },
        { key: 'mapId', label: '地图', type: 'ref', refTable: 'maps' },
        { key: 'at', label: '出现地点', type: 'string' },
        { key: 'target', label: '目标地点', type: 'string' },
        { key: 'radius', label: '散布半径', type: 'number', min: 0 },
        { key: 'endOnFlag', label: '结束旗标', type: 'string' },
        json('groups', '魔物组合'),
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    for (const n of content.tideNights ?? []) problems.push(...nightProblems(n, content));
    for (const r of content.tideSurges ?? []) problems.push(...surgeProblems(r, content));
    for (const w of waves as unknown as WaveDef[])
      if (!w.id.startsWith('mtide_')) problems.push(`tide wave ${w.id}: not an mtide_ id`);
    return problems;
  },
};
