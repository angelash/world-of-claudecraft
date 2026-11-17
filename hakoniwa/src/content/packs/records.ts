// Records pack (PK-M1-48): deeds and titles (catalog_deeds_titles.md), codex notes and
// letters (ux_and_onboarding.md 6.3.2, 6.3.8), and the records tunables. Data lives in
// data/records/. The validator holds the cosmetic rule (catalog 2.8): a deed or a title
// record has only the fields listed here, so none can carry a stat, an effect or a modifier.

import codex from '../../../data/records/codex.json';
import config from '../../../data/records/config.json';
import deeds from '../../../data/records/deeds.json';
import letters from '../../../data/records/letters.json';
import titles from '../../../data/records/titles.json';
import type { ContentMap } from '../../core/contracts';
import { checkCondition } from '../../systems/quests/conditions';
import {
  BOOK_STAGES,
  CODEX_SOURCES,
  CODEX_TABS,
  type CodexEntryDef,
  type CodexTab,
  DEED_CLASSES,
  type DeedDef,
  FAME_BANDS,
  GRADES,
  LETTER_SEALS,
  type LetterDef,
  type RecordsConfig,
  TITLE_FAMILIES,
  TITLE_KINDS,
  type TitleDef,
} from '../../systems/records/types';
import type { ContentPack } from '../pack';

/** Every field a deed may have: anything else would be power (catalog 2.8). */
const DEED_FIELDS = new Set([
  'id',
  'name',
  'desc',
  'cls',
  'act',
  'fame',
  'when',
  'stat',
  'held',
  'met',
  'manual',
  'hidden',
  'feat',
  'branch',
  'grade',
  'reward',
  'channels',
]);
const REWARD_FIELDS = new Set(['title', 'pillar']);
const TITLE_FIELDS = new Set([
  'id',
  'name',
  'kind',
  'family',
  'act',
  'grantedBy',
  'visibleTo',
  'loss',
  'grant',
  'lose',
]);

/** Tables naming the subjects of each codex tab (creatures have no table yet). */
const TAB_SUBJECTS: Readonly<Record<CodexTab, readonly string[]>> = {
  people: ['npcs', 'companions'],
  monsters: ['monsters'],
  creatures: [],
  items: ['items'],
  books: ['items'],
  collections: ['items'],
  memories: ['scenes'],
};

const STAT_KEY = /^(kills|kills\.[a-z0-9_]+|codex\.[a-z]+)$/;

function ids(content: ContentMap, tables: readonly string[]): Set<string> | null {
  const out = new Set<string>();
  let any = false;
  for (const t of tables) {
    const rows = (content as unknown as Record<string, unknown>)[t];
    if (!Array.isArray(rows)) continue;
    any = true;
    for (const r of rows) {
      const id = (r as { id?: unknown }).id;
      if (typeof id === 'string') out.add(id);
    }
  }
  return any ? out : null;
}

export function validateRecords(content: ContentMap): string[] {
  const problems: string[] = [];
  const cond = (where: string, expr: string | undefined) => {
    if (expr === undefined) return;
    const err = checkCondition(expr);
    if (err) problems.push(`${where}: ${err}`);
  };
  const act = (where: string, a: unknown) => {
    if (typeof a !== 'number' || !Number.isInteger(a) || a < 0 || a > 7)
      problems.push(`${where}: act out of range`);
  };
  const items = ids(content, ['items']);
  const persons = ids(content, ['npcs', 'companions']);
  const monsters = ids(content, ['monsters']);
  const titleIds = new Set((content.titles ?? []).map((t) => t.id));

  for (const d of (content.deeds ?? []) as DeedDef[]) {
    const at = `deed ${d.id}`;
    for (const k of Object.keys(d))
      if (!DEED_FIELDS.has(k))
        problems.push(`${at}: field ${k} is not a deed field (deeds are cosmetic)`);
    if (!DEED_CLASSES.includes(d.cls)) problems.push(`${at}: bad class ${d.cls}`);
    else if (!d.id.startsWith(`deed_${d.cls}_`))
      problems.push(`${at}: id does not start with deed_${d.cls}_`);
    if (!FAME_BANDS.includes(d.fame)) problems.push(`${at}: fame ${d.fame} is not a band`);
    if (d.feat && d.fame !== 0) problems.push(`${at}: a feat has fame 0`);
    act(at, d.act);
    if (!d.manual && !d.when && !d.stat && !d.held && !d.met)
      problems.push(`${at}: no trigger (when, stat, held, met or manual)`);
    cond(`${at} when`, d.when);
    cond(`${at} branch`, d.branch?.when);
    if (d.branch && typeof d.branch.when !== 'string') problems.push(`${at}: branch without when`);
    if (d.grade !== undefined && !GRADES.includes(d.grade)) problems.push(`${at}: bad grade`);
    if (d.stat) {
      if (!STAT_KEY.test(d.stat.key)) problems.push(`${at}: unknown stat ${d.stat.key}`);
      else if (d.stat.key.startsWith('kills.') && monsters && !monsters.has(d.stat.key.slice(6)))
        problems.push(`${at}: unknown monster ${d.stat.key.slice(6)}`);
      else if (
        d.stat.key.startsWith('codex.') &&
        !CODEX_TABS.includes(d.stat.key.slice(6) as CodexTab)
      )
        problems.push(`${at}: unknown codex tab ${d.stat.key.slice(6)}`);
      if (!Number.isInteger(d.stat.min) || d.stat.min < 1) problems.push(`${at}: stat min below 1`);
    }
    for (const i of d.held ?? [])
      if (items && !items.has(i)) problems.push(`${at}: unknown item ${i}`);
    for (const p of d.met ?? [])
      if (persons && !persons.has(p)) problems.push(`${at}: unknown person ${p}`);
    if (d.reward) {
      for (const k of Object.keys(d.reward))
        if (!REWARD_FIELDS.has(k)) problems.push(`${at}: reward ${k} is not a deed reward`);
      if (d.reward.title && !titleIds.has(d.reward.title))
        problems.push(`${at}: unknown title ${d.reward.title}`);
    }
  }

  for (const t of (content.titles ?? []) as TitleDef[]) {
    const at = `title ${t.id}`;
    for (const k of Object.keys(t))
      if (!TITLE_FIELDS.has(k))
        problems.push(`${at}: field ${k} is not a title field (titles are cosmetic)`);
    if (!TITLE_KINDS.includes(t.kind)) problems.push(`${at}: bad kind ${t.kind}`);
    if (!TITLE_FAMILIES.includes(t.family)) problems.push(`${at}: bad family ${t.family}`);
    else if (!t.id.startsWith(`title_${t.family}_`))
      problems.push(`${at}: id does not start with title_${t.family}_`);
    act(at, t.act);
    cond(`${at} grant`, t.grant?.when);
    cond(`${at} lose`, t.lose?.when);
  }

  for (const e of (content.codexEntries ?? []) as CodexEntryDef[]) {
    const at = `codex ${e.id}`;
    if (!e.id.startsWith('cdx_')) problems.push(`${at}: id does not start with cdx_`);
    if (!CODEX_TABS.includes(e.tab)) {
      problems.push(`${at}: bad tab ${e.tab}`);
      continue;
    }
    if (!CODEX_SOURCES.includes(e.source)) problems.push(`${at}: bad source ${e.source}`);
    const subjects = ids(content, TAB_SUBJECTS[e.tab]);
    if (!e.subject) problems.push(`${at}: no subject`);
    else if (subjects && !subjects.has(e.subject))
      problems.push(`${at}: unknown ${e.tab} subject ${e.subject}`);
    act(at, e.act);
    cond(`${at} when`, e.when);
  }

  for (const l of (content.letters ?? []) as LetterDef[]) {
    const at = `letter ${l.id}`;
    if (!l.id.startsWith('ltr_')) problems.push(`${at}: id does not start with ltr_`);
    act(at, l.act);
    if (!LETTER_SEALS.includes(l.seal)) problems.push(`${at}: bad seal ${l.seal}`);
    if (!!l.sender === !!l.senderName) problems.push(`${at}: needs one of sender and senderName`);
    if (l.sender && persons && !persons.has(l.sender))
      problems.push(`${at}: unknown sender ${l.sender}`);
    if (!l.deliver || typeof l.deliver.when !== 'string') problems.push(`${at}: no deliver.when`);
    else cond(`${at} deliver`, l.deliver.when);
    if ((l.transitHours ?? 0) < 0) problems.push(`${at}: negative transit`);
    if (!Array.isArray(l.body) || l.body.length === 0) problems.push(`${at}: empty body`);
    const seen = new Set<string>();
    for (const p of l.body ?? []) {
      if (!p.id || seen.has(p.id)) problems.push(`${at}: paragraph id ${p.id} missing or repeated`);
      seen.add(p.id);
      cond(`${at} body ${p.id}`, p.when);
    }
    const replies = new Set<string>();
    for (const r of l.replies ?? []) {
      if (!r.id || replies.has(r.id)) problems.push(`${at}: reply id ${r.id} missing or repeated`);
      replies.add(r.id);
      cond(`${at} reply ${r.id}`, r.when);
    }
    for (const a of l.attachments ?? []) {
      if (items && !items.has(a.item)) problems.push(`${at}: unknown item ${a.item}`);
      if (a.count !== undefined && (!Number.isInteger(a.count) || a.count < 1))
        problems.push(`${at}: attachment count below 1`);
    }
  }

  const cfg = content.recordsConfig;
  if (cfg) {
    cond('recordsConfig pillar.requires', cfg.pillar.requires);
    if (cfg.pillar.tiers.length === 0) problems.push('recordsConfig: no pillar tier');
    for (const t of cfg.pillar.tiers) {
      if (!Number.isInteger(t.slots) || t.slots < 1)
        problems.push('recordsConfig: pillar slots below 1');
      cond('recordsConfig pillar tier', t.when);
    }
    for (const s of cfg.stages) {
      if (!BOOK_STAGES.includes(s.stage)) problems.push(`recordsConfig: bad stage ${s.stage}`);
      if (!Number.isInteger(s.fromAct) || s.fromAct < 0 || s.fromAct > 7)
        problems.push(`recordsConfig: stage ${s.stage} fromAct out of range`);
    }
    if (!cfg.stages.some((s) => s.fromAct === 0))
      problems.push('recordsConfig: no stage from act 0');
  }
  return problems;
}

const CLASSES = [...DEED_CLASSES] as string[];

export const pack: ContentPack = {
  id: 'records',
  tables: {
    deeds: deeds as unknown as DeedDef[],
    titles: titles as unknown as TitleDef[],
    codexEntries: codex as unknown as CodexEntryDef[],
    letters: letters as unknown as LetterDef[],
    recordsConfig: config as unknown as RecordsConfig,
  },
  schemas: [
    {
      table: 'deeds',
      label: '事迹',
      file: 'records/deeds.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true, help: '旗标 deed.<ID> 记录已得' },
        { key: 'name', label: '名', type: 'string', required: true },
        { key: 'desc', label: '做了什么', type: 'text' },
        { key: 'cls', label: '类', type: 'enum', options: CLASSES, required: true },
        { key: 'act', label: '最早的幕', type: 'number', min: 0, max: 7, required: true },
        { key: 'fame', label: '名望', type: 'number', min: 0, max: 50, required: true },
        { key: 'when', label: '触发条件', type: 'string', help: '注册表条件表达式' },
        {
          key: 'stat',
          label: '计数触发',
          type: 'json',
          help: 'key：kills、kills.<魔物>、codex.<页>；min',
        },
        { key: 'held', label: '曾持有的物品', type: 'json' },
        { key: 'met', label: '见过的人物', type: 'json' },
        { key: 'manual', label: '在结算点显式授予', type: 'boolean' },
        { key: 'hidden', label: '隐藏', type: 'boolean' },
        { key: 'feat', label: '壮举', type: 'boolean' },
        { key: 'branch', label: '分支关闭的条件', type: 'json', help: '{ when }' },
        { key: 'grade', label: '入册等级', type: 'enum', options: [...GRADES] },
        { key: 'reward', label: '奖励', type: 'json', help: 'title、pillar（记事柱一格）' },
        { key: 'channels', label: '价值通道', type: 'json' },
      ],
    },
    {
      table: 'titles',
      label: '称号',
      file: 'records/titles.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        {
          key: 'id',
          label: 'ID',
          type: 'string',
          required: true,
          help: '旗标 title.<ID> 记录已得',
        },
        { key: 'name', label: '称号', type: 'string', required: true },
        { key: 'kind', label: '档', type: 'enum', options: [...TITLE_KINDS], required: true },
        { key: 'family', label: '族', type: 'enum', options: [...TITLE_FAMILIES], required: true },
        { key: 'act', label: '最早的幕', type: 'number', min: 0, max: 7, required: true },
        { key: 'grantedBy', label: '授予', type: 'string', required: true },
        { key: 'visibleTo', label: '谁看得见', type: 'string', required: true },
        { key: 'loss', label: '如何失去', type: 'string', required: true },
        { key: 'grant', label: '授予条件', type: 'json', help: '{ when }' },
        { key: 'lose', label: '失去条件', type: 'json', help: '{ when }' },
      ],
    },
    {
      table: 'codexEntries',
      label: '图鉴条目',
      file: 'records/codex.json',
      idField: 'id',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'tab', label: '页', type: 'enum', options: [...CODEX_TABS], required: true },
        { key: 'subject', label: '对象', type: 'string', required: true },
        { key: 'source', label: '来源', type: 'enum', options: [...CODEX_SOURCES], required: true },
        { key: 'text', label: '内容', type: 'text', required: true },
        { key: 'when', label: '条件', type: 'string' },
        { key: 'act', label: '最早的幕', type: 'number', min: 0, max: 7, required: true },
      ],
    },
    {
      table: 'letters',
      label: '传书',
      file: 'records/letters.json',
      idField: 'id',
      nameField: 'subject',
      fields: [
        {
          key: 'id',
          label: 'ID',
          type: 'string',
          required: true,
          help: '旗标 letter.<ID> 记录状态',
        },
        { key: 'act', label: '幕', type: 'number', min: 0, max: 7, required: true },
        { key: 'sender', label: '寄件人', type: 'string' },
        { key: 'senderName', label: '寄件人（非人物）', type: 'string' },
        { key: 'seal', label: '印记', type: 'enum', options: [...LETTER_SEALS], required: true },
        { key: 'subject', label: '标题', type: 'string', required: true },
        { key: 'deliver', label: '寄出条件', type: 'json', help: '{ when }' },
        { key: 'transitHours', label: '路上（游戏小时）', type: 'number', min: 0 },
        { key: 'body', label: '正文段落', type: 'json', help: '[{ id, text, when }]' },
        { key: 'attachments', label: '附件', type: 'json' },
        { key: 'replies', label: '回信选项', type: 'json' },
      ],
    },
  ],
  validate: validateRecords,
};
