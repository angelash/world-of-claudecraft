// Scenes pack: the divine court map (prologue and act 6), every written scene (the
// prologue, act transitions, the court, the endings), speakers, act 6 evidence and
// defenses, and the epilogue templates. Validates scene graphs and references.

import act1 from '../../../data/scenes/act1.json';
import act2to5 from '../../../data/scenes/acts2_5.json';
import court from '../../../data/scenes/court.json';
import defenses from '../../../data/scenes/defenses.json';
import endings from '../../../data/scenes/endings.json';
import epilogue from '../../../data/scenes/epilogue.json';
import evidence from '../../../data/scenes/evidence.json';
import lore from '../../../data/scenes/lore.json';
import loreItems from '../../../data/scenes/lore_items.json';
import maps from '../../../data/scenes/maps.json';
import prologue from '../../../data/scenes/prologue.json';
import speakers from '../../../data/scenes/speakers.json';
import trials from '../../../data/scenes/trials.json';
import type { ContentMap } from '../../core/contracts';
import { defaultRegistry } from '../../core/registry';
import type { ItemDef } from '../../systems/inventory/types';
import type { TrialDef } from '../../systems/scenes/trial';
import {
  type CourtDefenseDef,
  type EpilogueEntry,
  type EvidenceDef,
  SCENE_CHOICE_KEYS,
  type SceneDef,
  type SpeakerDef,
  STAGE_TRANSITIONS,
} from '../../systems/scenes/types';
import type { WorldStart } from '../../systems/world';
import type { MapDef } from '../../systems/world/types';
import type { ContentPack } from '../pack';
import { conditionProblems, effectProblems } from './quests';

/** The new game starts in the antechamber of the divine court (conventions 2). */
const worldStarts: WorldStart[] = [{ mapId: 'divine_court', x: 10.5, y: 13.5, priority: 10 }];

export function sceneProblems(scene: SceneDef, content: ContentMap): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const n of scene.nodes) {
    if (ids.has(n.id)) out.push(`scene ${scene.id}: duplicate node ${n.id}`);
    ids.add(n.id);
  }
  const has = (id: string | undefined) => id === undefined || id === '' || ids.has(id);
  if (!ids.has(scene.start)) out.push(`scene ${scene.id}: unknown start ${scene.start}`);
  if (scene.then && !content.scenes.some((s) => s.id === scene.then))
    out.push(`scene ${scene.id}: unknown then ${scene.then}`);
  out.push(...effectProblems(scene.onEnd, `scene ${scene.id} onEnd`, content));
  for (const n of scene.nodes) {
    const at = `scene ${scene.id} node ${n.id}`;
    if (!has(n.next)) out.push(`${at}: unknown next ${n.next}`);
    out.push(...effectProblems(n.effects, at, content));
    for (const l of n.lines ?? []) out.push(...conditionProblems(l.when, `${at} line`));
    for (const b of n.branch ?? []) {
      out.push(...conditionProblems(b.when, `${at} branch`));
      if (!ids.has(b.to)) out.push(`${at}: unknown branch target ${b.to}`);
    }
    for (const c of n.choices ?? []) {
      out.push(...conditionProblems(c.when, `${at} choice ${c.id}`));
      out.push(...effectProblems(c.effects, `${at} choice ${c.id}`, content));
      if (!has(c.to)) out.push(`${at}: choice ${c.id} -> unknown ${c.to}`);
      if (c.timeout !== undefined && !(Number.isFinite(c.timeout) && c.timeout >= 0))
        out.push(`${at}: choice ${c.id} timeout must be seconds >= 0`);
      if (c.key !== undefined && !(SCENE_CHOICE_KEYS as readonly string[]).includes(c.key))
        out.push(`${at}: choice ${c.id} key ${c.key} is not a keyed action`);
      // a hidden choice is picked by its key or its timeout; with neither nobody can reach it
      if (c.hidden && c.key === undefined && c.timeout === undefined)
        out.push(`${at}: hidden choice ${c.id} has neither a key nor a timeout`);
    }
    out.push(...stageTimingProblems(n, at));
    for (const d of n.stage ?? []) {
      if ((d.op === 'listen' || d.op === 'door') && !d.flag)
        out.push(`${at}: stage ${d.op} names no flag`);
      if (d.op === 'door' && !(Number.isInteger(d.cap) && d.cap >= 1))
        out.push(`${at}: stage door cap must be a whole number >= 1`);
    }
    if (n.input) {
      if (!ids.has(n.input.to)) out.push(`${at}: input -> unknown ${n.input.to}`);
      const tu = n.input.turns;
      if (
        tu &&
        !(
          Number.isInteger(tu.soft) &&
          Number.isInteger(tu.hard) &&
          tu.soft >= 1 &&
          tu.hard >= tu.soft
        )
      )
        out.push(`${at}: input turns need whole soft >= 1 and hard >= soft`);
      if (tu && !n.input.agentId) out.push(`${at}: input turns need an answerer (agentId)`);
      out.push(...briefProblems(n.input.improv, `${at} input`));
      for (const l of n.input.anchor ?? []) out.push(...conditionProblems(l.when, `${at} anchor`));
      for (const x of n.input.extract ?? [])
        if (!x.key || !x.values?.length) out.push(`${at}: input extract needs a key and values`);
      const cl = n.input.classify;
      if (cl) {
        if (cl.by !== undefined && n.input.agentId)
          out.push(`${at}: classify by only applies to an input with no answerer`);
        const target = scene.nodes.find((x) => x.id === cl.node);
        if (!target) out.push(`${at}: classify -> unknown node ${cl.node}`);
        for (const c of [...cl.choices, ...(cl.fallback !== undefined ? [cl.fallback] : [])]) {
          if (target && !(target.choices ?? []).some((x) => x.id === c))
            out.push(`${at}: classify choice ${c} missing`);
        }
      }
    }
    if (n.present && !content.trials?.some((x) => x.id === n.present?.trial))
      out.push(`${at}: present names unknown trial ${n.present.trial}`);
    for (const piece of content.trials?.find((x) => x.id === n.present?.trial)?.pieces ?? [])
      if (piece.to && !ids.has(piece.to))
        out.push(`${at}: trial piece ${piece.id} lands on unknown node ${piece.to}`);
    if (n.present && n.court) out.push(`${at}: a node presents at a trial or a court, not both`);
    if (n.present && n.input) out.push(`${at}: a present node cannot also take free input`);
    // after the last piece the node still needs a way out: a choice with no condition, or two
    // whose conditions cover each other (the trial's done and silent)
    if (n.present && !(n.choices ?? []).some((c) => !c.when) && (n.choices ?? []).length < 2)
      out.push(`${at}: a present node needs a choice that is always open, or a covering pair`);
    if (n.court) {
      if (!ids.has(n.court.to)) out.push(`${at}: court -> unknown ${n.court.to}`);
      if (!content.courtDefenses.some((d) => d.goddess === n.court?.goddess)) {
        out.push(`${at}: no defenses for ${n.court.goddess}`);
      }
    }
  }
  out.push(...sceneExtraProblems(scene, content));
  out.push(...triggerProblems(scene, content));
  for (const n of scene.nodes)
    out.push(...briefProblems(n.improv, `scene ${scene.id} node ${n.id} improv`));
  return out;
}

const BARK_TRIGGERS = ['wave_spawned', 'wave_cleared', 'boss_phase', 'boss_defeated'];

/** Stage timing (`at`, `when`) and the directives added for act 1 (PK-M1-34). */
function stageTimingProblems(n: SceneDef['nodes'][number], at: string): string[] {
  const out: string[] = [];
  const lines = n.lines?.length ?? 0;
  for (const d of n.stage ?? []) {
    if (d.at !== undefined && !(Number.isInteger(d.at) && d.at >= 0 && d.at <= lines))
      out.push(`${at}: stage ${d.op} at ${d.at} is not a line index (0 to ${lines})`);
    out.push(...conditionProblems(d.when, `${at} stage ${d.op}`));
    if (d.op === 'transition' && !(STAGE_TRANSITIONS as readonly string[]).includes(d.kind))
      out.push(`${at}: stage transition kind ${String(d.kind)} is unknown`);
    if (d.op === 'still' && !/^art_bg_cut_[a-z0-9_]+$/.test(d.id ?? ''))
      out.push(`${at}: stage still ${String(d.id)} is not an art_bg_cut_ id`);
  }
  return out;
}

/** An improvisation brief: lists of words, no empty entries. */
function briefProblems(
  b: { meaningKeys?: string[]; forbidden?: string[] } | undefined,
  at: string,
) {
  const out: string[] = [];
  for (const [k, list] of [
    ['meaningKeys', b?.meaningKeys],
    ['forbidden', b?.forbidden],
  ] as const)
    if (list?.some((w) => typeof w !== 'string' || !w.trim()))
      out.push(`${at}: ${k} has an empty word`);
  return out;
}

/** An act-1 trial table (PK-M1-55): items exist, points are the trial's, a rebuttal per outcome. */
export function trialProblems(t: TrialDef, content: ContentMap): string[] {
  const out: string[] = [];
  const at = `trial ${t.id}`;
  if (!(Number.isInteger(t.clears) && t.clears >= 1 && t.clears <= t.points.length))
    out.push(`${at}: clears must be a whole number from 1 to the number of points`);
  const ids = new Set<string>();
  for (const p of t.pieces) {
    if (ids.has(p.id)) out.push(`${at}: duplicate piece ${p.id}`);
    ids.add(p.id);
    if (!content.items?.some((i) => i.id === p.item))
      out.push(`${at} piece ${p.id}: unknown item ${p.item}`);
    for (const x of p.targets)
      if (x.tribunal === t.id && !t.points.includes(x.point))
        out.push(`${at} piece ${p.id}: point ${x.point} is not one of the trial's`);
    for (const [point, flag] of Object.entries(p.writes ?? {}))
      if (!p.targets.some((x) => x.tribunal === t.id && x.point === point))
        out.push(`${at} piece ${p.id}: writes ${flag} for a point it does not prove`);
    out.push(...effectProblems(p.effects, `${at} piece ${p.id}`, content));
  }
  for (const on of ['wrong', 'forged'] as const)
    if (!t.rebuttals.some((r) => r.on === on)) out.push(`${at}: no rebuttal for ${on}`);
  const speakers = new Set([
    ...(content.goddesses ?? []).map((g) => g.id),
    ...(content.sceneSpeakers ?? []).map((s) => s.id),
    ...((content as unknown as { npcs?: { id: string }[] }).npcs ?? []).map((n) => n.id),
    'narrator',
  ]);
  for (const r of t.rebuttals) {
    out.push(...effectProblems(r.effects, `${at} rebuttal ${r.on}`, content));
    if (!speakers.has(r.speaker)) out.push(`${at} rebuttal ${r.on}: unknown speaker ${r.speaker}`);
  }
  for (const point of Object.keys(t.pointFlags ?? {}))
    if (!t.points.includes(point))
      out.push(`${at}: pointFlags names ${point}, not one of the trial's`);
  // the flags the trial writes are registry names (writes, pointFlags, countFlag)
  const registry = defaultRegistry();
  const names = [
    ...t.pieces.flatMap((p) => Object.values(p.writes ?? {})),
    ...Object.values(t.pointFlags ?? {}),
    ...(t.countFlag ? [t.countFlag] : []),
  ];
  for (const name of names)
    if (!registry.resolve(name)) out.push(`${at}: ${name} is not a registered variable`);
  return out;
}

/** Self-requests of a scene: a condition, and a known place. */
function triggerProblems(scene: SceneDef, content: ContentMap): string[] {
  const out: string[] = [];
  for (const [i, t] of (scene.triggers ?? []).entries()) {
    const at = `scene ${scene.id} trigger ${i}`;
    if (!t.when) out.push(`${at}: has no condition`);
    out.push(...conditionProblems(t.when, at));
    if (t.location && !t.mapId) out.push(`${at}: a location needs its map`);
    if (t.mapId) {
      const map = content.maps?.find((m) => m.id === t.mapId);
      if (!map) out.push(`${at}: unknown map ${t.mapId}`);
      else if (t.location && !map.locations.some((l) => l.id === t.location))
        out.push(`${at}: unknown location ${t.location} on ${t.mapId}`);
    }
  }
  return out;
}

/** Segments, combat barks and the restart offer (catalog_cutscenes.md 13.6). */
function sceneExtraProblems(scene: SceneDef, content: ContentMap): string[] {
  const out: string[] = [];
  const at = `scene ${scene.id}`;
  if (scene.keepPosition !== undefined && typeof scene.keepPosition !== 'boolean')
    out.push(`${at}: keepPosition must be boolean`);
  if (scene.keepPosition === true) {
    if (!scene.mapId || !scene.location) out.push(`${at}: keepPosition needs a map and location`);
    else {
      const map = content.maps?.find((m) => m.id === scene.mapId);
      if (!map) out.push(`${at}: keepPosition names unknown map ${scene.mapId}`);
      else if (!map.locations.some((l) => l.id === scene.location))
        out.push(`${at}: keepPosition names unknown location ${scene.location} on ${scene.mapId}`);
    }
  }
  const marked = new Set(scene.nodes.flatMap((n) => (n.segment ? [n.segment] : [])));
  const segIds = new Set<string>();
  for (const s of scene.segments ?? []) {
    if (segIds.has(s.id)) out.push(`${at}: duplicate segment ${s.id}`);
    segIds.add(s.id);
    if (!marked.has(s.id)) out.push(`${at}: segment ${s.id} has no marker node`);
  }
  const barkIds = new Set<string>();
  for (const b of scene.barks ?? []) {
    const bat = `${at} bark ${b.id}`;
    if (barkIds.has(b.id)) out.push(`${at}: duplicate bark ${b.id}`);
    barkIds.add(b.id);
    if (!BARK_TRIGGERS.includes(b.on)) out.push(`${bat}: unknown trigger ${String(b.on)}`);
    const wave = b.on === 'wave_spawned' || b.on === 'wave_cleared';
    const table = wave ? content.waves : content.monsters;
    if (!b.ref) out.push(`${bat}: names no ${wave ? 'wave' : 'boss'}`);
    else if (Array.isArray(table) && !table.some((r) => r.id === b.ref))
      out.push(`${bat}: unknown ${wave ? 'wave' : 'boss'} ${b.ref}`);
    if (!b.lines?.length) out.push(`${bat}: has no lines`);
    if (b.phase !== undefined && b.on !== 'boss_phase')
      out.push(`${bat}: phase only applies to boss_phase`);
    out.push(...conditionProblems(b.when, bat));
    for (const l of b.lines ?? []) out.push(...conditionProblems(l.when, `${bat} line`));
  }
  const r = scene.restart;
  if (r) {
    if (!content.scenes.some((s) => s.id === r.scene))
      out.push(`${at}: restart -> unknown scene ${r.scene}`);
    if (!r.clear?.length) out.push(`${at}: restart clears no flags`);
    if (r.until && !marked.has(r.until))
      out.push(`${at}: restart until unknown segment ${r.until}`);
    for (const item of r.take ?? [])
      if (!content.items?.some((i) => i.id === item))
        out.push(`${at}: restart takes unknown item ${item}`);
  }
  return out;
}

export const pack: ContentPack = {
  id: 'scenes',
  tables: {
    maps: maps as unknown as MapDef[],
    worldStarts,
    scenes: [
      ...prologue,
      ...act1,
      ...lore,
      ...act2to5,
      ...court,
      ...endings,
    ] as unknown as SceneDef[],
    // the lore items of the history's in-game documents (history.md 12; PK-M1-34)
    items: loreItems as unknown as ItemDef[],
    sceneSpeakers: speakers as unknown as SpeakerDef[],
    evidence: evidence as unknown as EvidenceDef[],
    courtDefenses: defenses as unknown as CourtDefenseDef[],
    epilogue: epilogue as unknown as EpilogueEntry[],
    trials: trials as unknown as TrialDef[],
  },
  schemas: [
    {
      table: 'scenes',
      label: '场景',
      file: 'scenes/act1.json',
      idField: 'id',
      nameField: 'title',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'title', label: '标题', type: 'string' },
        { key: 'act', label: '幕', type: 'string' },
        { key: 'mapId', label: '地图', type: 'ref', refTable: 'maps' },
        { key: 'location', label: '地点', type: 'string' },
        { key: 'keepPosition', label: '保留入场站位', type: 'boolean' },
        { key: 'start', label: '起始节点', type: 'string' },
        { key: 'nodes', label: '节点', type: 'json' },
        { key: 'onEnd', label: '结束时效果', type: 'json' },
        { key: 'then', label: '接着播放', type: 'ref', refTable: 'scenes' },
      ],
    },
    {
      table: 'sceneSpeakers',
      label: '说话者',
      file: 'scenes/speakers.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '显示名', type: 'string' },
        {
          key: 'kind',
          label: '默认类型',
          type: 'enum',
          options: ['say', 'think', 'narrate', 'divine'],
        },
        { key: 'revealedName', label: '正名后', type: 'string' },
        { key: 'revealWhen', label: '正名条件', type: 'string' },
      ],
    },
    {
      table: 'evidence',
      label: '第六幕证据',
      file: 'scenes/evidence.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: '编号', type: 'string', required: true },
        { key: 'item', label: '物品', type: 'ref', refTable: 'items' },
        { key: 'name', label: '名称', type: 'string' },
        { key: 'targets', label: '对象、防线与强度', type: 'json' },
        { key: 'presentText', label: '出示时的说明', type: 'text' },
      ],
    },
    {
      table: 'courtDefenses',
      label: '女神的防线',
      file: 'scenes/defenses.json',
      idField: 'goddess',
      fields: [
        { key: 'goddess', label: '女神', type: 'ref', refTable: 'goddesses' },
        { key: 'thickness', label: '厚度', type: 'json' },
        { key: 'broken', label: '击破时的台词', type: 'json' },
        { key: 'deflect', label: '未命中时', type: 'text' },
        { key: 'verdictLines', label: '终审台词', type: 'json' },
        { key: 'askBack', label: '回问', type: 'json' },
      ],
    },
    {
      table: 'epilogue',
      label: '后日谈模板',
      file: 'scenes/epilogue.json',
      idField: 'id',
      nameField: 'subject',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        {
          key: 'layer',
          label: '层',
          type: 'enum',
          options: ['gods', 'races', 'nations', 'kingdom', 'city', 'town', 'companions', 'player'],
        },
        { key: 'subject', label: '题', type: 'string' },
        { key: 'endings', label: '结局', type: 'list' },
        { key: 'when', label: '条件', type: 'string' },
        { key: 'year', label: '时（年）', type: 'number', min: 0, max: 100 },
        { key: 'text', label: '录', type: 'text' },
        { key: 'required', label: '必写', type: 'boolean' },
        { key: 'weight', label: '显著度', type: 'number' },
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    for (const s of content.scenes) problems.push(...sceneProblems(s, content));
    for (const e of content.evidence) {
      if (!content.items.some((i) => i.id === e.item))
        problems.push(`evidence ${e.id}: unknown item ${e.item}`);
    }
    for (const e of content.epilogue)
      problems.push(...conditionProblems(e.when, `epilogue ${e.id}`));
    const trialIds = new Set<string>();
    for (const tr of content.trials ?? []) {
      if (trialIds.has(tr.id)) problems.push(`trial ${tr.id}: duplicate id`);
      trialIds.add(tr.id);
      problems.push(...trialProblems(tr, content));
    }
    for (const s of content.sceneSpeakers)
      problems.push(...conditionProblems(s.revealWhen, `speaker ${s.id}`));
    return problems;
  },
};
