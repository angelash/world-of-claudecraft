// The AI asset prompt library (assets/prompts/README.md, docs/50_tech/art_pipeline.md).
// Every art and audio asset the game needs is one entry in assets/prompts/specs/*.json that
// names a template from templates.json (images) or templates_audio.json (audio). This tool
// validates the library and expands every entry into copy-ready prompts for the external
// generator, plus the expected-asset manifest the import pipeline checks against.
//
//   node tools/prompts/build.ts            write assets/prompts/out/
//   node tools/prompts/build.ts --check    validate and confirm out/ is current, write nothing
//   node tools/prompts/build.ts --validate validate only and print the counts (safe while others edit)
//
// The pure parts (validation, expansion, rendering) are unit tested in
// tests/prompts_library.test.ts.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface Bilingual {
  zh: string;
  en: string;
}

export interface StyleDef {
  name: string;
  zh: string;
  en: string;
  palette?: string[];
  /**
   * Creature-only anchor variant: the pack's colors and materials for a creature or figure,
   * with no scenery words, so a standee prompt does not paint a background
   * (art_pipeline.md 15.3, reason code background).
   */
  creature?: Bilingual;
}

/** Which anchor of a style fills {style}: the scene anchor (default) or the creature variant. */
export type StyleVariant = 'scene' | 'creature';
/** Humanoid body templates other than the standard H (art_pipeline.md 3.2; import bodyOf). */
export const BODY_TYPES = ['hs', 'hb'] as const;
export type BodyType = (typeof BODY_TYPES)[number];
/** Import anchor overrides an entry may declare (import AnchorKind). */
export const ANCHOR_OVERRIDES = ['flying'] as const;
export type AnchorOverride = (typeof ANCHOR_OVERRIDES)[number];
/**
 * Expression keys a bust_base entry may stand for as a character's eighth expression
 * (art_pipeline.md 3.6): the importer crops its head and shoulders into that key's cell.
 */
export const EXPR_KEYS = ['grin', 'cold', 'tender', 'pained'] as const;
export type ExprKey = (typeof EXPR_KEYS)[number];

export interface TemplateDef {
  kind: 'image' | 'audio';
  title: string;
  canvas?: string;
  final?: string;
  grid?: string;
  frames?: string;
  background?: string;
  duration?: string | number;
  loop?: boolean;
  sampleRate?: number;
  channels?: string;
  loudness?: string;
  truePeak?: string;
  outDir: string;
  ext: string;
  zh: string;
  en: string;
  /** true: append the file's global negative prompt; an object overrides it. */
  negative?: boolean | Bilingual;
  /** 'creature': {style} takes the style's creature variant (creature and figure standees). */
  styleVariant?: StyleVariant;
}

export interface TemplateFile {
  version: number;
  negative?: Bilingual;
  styles?: Record<string, StyleDef>;
  templates: Record<string, TemplateDef>;
}

export interface SpecItem {
  id: string;
  template: string;
  style?: string;
  subject: Bilingual;
  extra?: Bilingual;
  ref?: string;
  deps?: string[];
  milestone: string;
  notes?: string;
  /** Overrides the template's style variant (a rework moves one standee to 'creature'). */
  styleVariant?: StyleVariant;
  /** Humanoid body template of a character sheet that is not the standard H (chr_* only). */
  body?: BodyType;
  /** Import anchor override: 'flying' keeps the drawn height instead of the ground baseline. */
  anchor?: AnchorOverride;
  /** 1-based grid rows the sheet leaves empty; the importer treats their cells as blank. */
  blankRows?: number[];
  /** bust_base only: this image is the character's eighth expression with this key. */
  exprKey?: ExprKey;
}

export interface SpecFile {
  category: string;
  title: string;
  sources?: string[];
  items: SpecItem[];
}

/** Templates from every template file, each remembering the negative prompt it carries. */
export interface Library {
  styles: Record<string, StyleDef>;
  templates: Record<string, TemplateDef & { negativeText?: Bilingual; source: string }>;
}

export interface Entry {
  id: string;
  category: string;
  template: string;
  kind: 'image' | 'audio';
  file: string;
  milestone: string;
  canvas?: string;
  final?: string;
  grid?: string;
  frames?: string;
  background?: string;
  duration?: string | number;
  loop?: boolean;
  sampleRate?: number;
  channels?: string;
  loudness?: string;
  truePeak?: string;
  style?: string;
  ref?: string;
  deps: string[];
  notes?: string;
  body?: BodyType;
  anchor?: AnchorOverride;
  blankRows?: number[];
  exprKey?: ExprKey;
  zh: string;
  en: string;
  negativeZh: string;
  negativeEn: string;
  /** First 12 hex digits of sha256 over the prompts; the asset manifest records it per file. */
  promptHash: string;
}

export const MILESTONES = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'] as const;
const ID_RE = /^(art|mus|amb|sfx)_[a-z0-9]+(_[a-z0-9]+)*$/;
// The repo's forbidden characters (hakoniwa/CLAUDE.md): en, em and horizontal-bar dashes,
// the U+2600 to U+27BF symbol blocks, and emoji.
const FORBIDDEN_RE = /[\u2013\u2014\u2015\u2600-\u27BF]|\p{Extended_Pictographic}/u;
// Words that must never reach a generator prompt (house rule: no other works, studios or
// trademarks; the rendering technique is described, not named).
const BANNED_WORDS = ['HD-2D', 'HD2D'];

export function buildLibrary(files: { name: string; data: TemplateFile }[]): {
  library: Library;
  problems: string[];
} {
  const problems: string[] = [];
  const library: Library = { styles: {}, templates: {} };
  for (const { name, data } of files) {
    for (const [id, s] of Object.entries(data.styles ?? {})) {
      if (library.styles[id]) problems.push(`${name}: style ${id} is defined twice`);
      library.styles[id] = s;
    }
    for (const [id, t] of Object.entries(data.templates ?? {})) {
      if (library.templates[id]) problems.push(`${name}: template ${id} is defined twice`);
      const negativeText =
        t.negative === true
          ? data.negative
          : typeof t.negative === 'object'
            ? t.negative
            : undefined;
      library.templates[id] = { ...t, negativeText, source: name };
    }
  }
  return { library, problems };
}

function textProblems(where: string, value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (FORBIDDEN_RE.test(value)) out.push(`${where}: forbidden character`);
    for (const w of BANNED_WORDS) if (value.includes(w)) out.push(`${where}: banned word ${w}`);
    return;
  }
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) textProblems(`${where}[${i}]`, v, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) textProblems(`${where}.${k}`, v, out);
  }
}

/** The anchor variant an entry uses: its own, else its template's, else the scene anchor. */
export function styleVariantOf(
  item: Pick<SpecItem, 'styleVariant'>,
  t?: Pick<TemplateDef, 'styleVariant'>,
): StyleVariant {
  return item.styleVariant ?? t?.styleVariant ?? 'scene';
}

function gridRows(t: Pick<TemplateDef, 'grid'> | undefined): number {
  const m = /^(\d+)x(\d+)$/.exec((t?.grid ?? '1x1').trim());
  return m ? Number(m[2]) : 1;
}

/** The structured fields of an entry: styleVariant, and body, anchor, blankRows and exprKey for the importer. */
function importFieldProblems(
  where: string,
  item: SpecItem,
  t: TemplateDef | undefined,
  library: Library,
): string[] {
  const out: string[] = [];
  if (
    item.styleVariant !== undefined &&
    item.styleVariant !== 'scene' &&
    item.styleVariant !== 'creature'
  )
    out.push(`${where}: styleVariant must be scene or creature`);
  const style = item.style ? library.styles[item.style] : undefined;
  if (style && styleVariantOf(item, t) === 'creature') {
    if (!style.creature?.zh?.trim() || !style.creature?.en?.trim())
      out.push(`${where}: style ${item.style} has no creature anchor variant (zh and en)`);
  }
  const imageInGame = t?.kind === 'image' && (t.final ?? '').trim() !== 'ref';
  if (item.body !== undefined) {
    if (!(BODY_TYPES as readonly string[]).includes(item.body))
      out.push(`${where}: body must be one of ${BODY_TYPES.join(', ')}`);
    if (!item.template.startsWith('chr_'))
      out.push(`${where}: body applies to chr_* templates only`);
  }
  if (item.anchor !== undefined) {
    if (!(ANCHOR_OVERRIDES as readonly string[]).includes(item.anchor))
      out.push(`${where}: anchor must be one of ${ANCHOR_OVERRIDES.join(', ')}`);
    if (t && !imageInGame) out.push(`${where}: anchor needs an in-game image template`);
  }
  if (item.blankRows !== undefined) {
    const rows = gridRows(t);
    if (!Array.isArray(item.blankRows) || item.blankRows.length === 0) {
      out.push(`${where}: blankRows must be a non-empty list of row numbers`);
    } else {
      for (const r of item.blankRows) {
        if (!Number.isInteger(r) || r < 1 || r > rows)
          out.push(`${where}: blankRows ${r} is outside the template's rows 1 to ${rows}`);
      }
      if (new Set(item.blankRows).size !== item.blankRows.length)
        out.push(`${where}: blankRows lists a row twice`);
      if (item.blankRows.length >= rows) out.push(`${where}: blankRows leaves no row to draw`);
    }
    if (t && !imageInGame) out.push(`${where}: blankRows needs an in-game image template`);
  }
  if (item.exprKey !== undefined) {
    if (!(EXPR_KEYS as readonly string[]).includes(item.exprKey))
      out.push(`${where}: exprKey must be one of ${EXPR_KEYS.join(', ')}`);
    if (item.template !== 'bust_base') out.push(`${where}: exprKey applies to bust_base only`);
  }
  return out;
}

export function validateLibrary(
  library: Library,
  specs: { name: string; data: SpecFile }[],
): string[] {
  const problems: string[] = [];
  for (const [id, t] of Object.entries(library.templates)) {
    const where = `template ${id}`;
    textProblems(where, t, problems);
    if (t.kind !== 'image' && t.kind !== 'audio')
      problems.push(`${where}: kind must be image or audio`);
    if (!t.outDir || !t.ext) problems.push(`${where}: outDir and ext are required`);
    if (!t.zh?.includes('{subject}') || !t.en?.includes('{subject}'))
      problems.push(`${where}: zh and en must both contain {subject}`);
    if (t.kind === 'image' && (!t.canvas || !t.final))
      problems.push(`${where}: image templates need canvas and final sizes`);
    if (t.kind === 'audio' && t.duration === undefined)
      problems.push(`${where}: audio templates need a duration`);
    if (t.styleVariant !== undefined && t.styleVariant !== 'scene' && t.styleVariant !== 'creature')
      problems.push(`${where}: styleVariant must be scene or creature`);
  }
  for (const [id, s] of Object.entries(library.styles)) textProblems(`style ${id}`, s, problems);

  const seen = new Map<string, string>();
  for (const { name, data } of specs) {
    if (!data.category || !data.title || !Array.isArray(data.items)) {
      problems.push(`${name}: category, title and items are required`);
      continue;
    }
    for (const item of data.items) {
      const where = `${name}: ${item.id ?? '(no id)'}`;
      textProblems(where, item, problems);
      if (!item.id || !ID_RE.test(item.id)) problems.push(`${where}: id must match ${ID_RE}`);
      const prev = seen.get(item.id);
      if (prev) problems.push(`${where}: id also used in ${prev}`);
      seen.set(item.id, name);
      const t = library.templates[item.template];
      if (!t) problems.push(`${where}: unknown template ${item.template}`);
      if (item.style && !library.styles[item.style])
        problems.push(`${where}: unknown style ${item.style}`);
      if (!item.subject?.zh?.trim() || !item.subject?.en?.trim())
        problems.push(`${where}: subject needs both zh and en`);
      if (!(MILESTONES as readonly string[]).includes(item.milestone))
        problems.push(`${where}: milestone must be one of ${MILESTONES.join(', ')}`);
      problems.push(...importFieldProblems(where, item, t, library));
    }
  }
  for (const { name, data } of specs) {
    for (const item of data.items ?? []) {
      for (const d of item.deps ?? [])
        if (!seen.has(d)) problems.push(`${name}: ${item.id}: unknown dependency ${d}`);
    }
  }
  return problems;
}

/** Fill {subject}, {style} and {extra}, then tidy the separators a missing part leaves. */
export function fill(template: string, vars: Record<string, string>): string {
  const raw = template.replace(/\{(subject|style|extra)\}/g, (_, k: string) => vars[k] ?? '');
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[，,]\s*[，,]+/g, (m) => (m.includes('，') ? '，' : ','))
    .replace(/\s+([，,。.;；])/g, '$1')
    .replace(/[，,]+([。.])/g, '$1')
    .replace(/([。.])(\s*[。.])+/g, '$1')
    .replace(/^[\s，,。.]+|[\s，,]+$/g, '')
    .trim();
}

export function promptHashOf(e: Pick<Entry, 'zh' | 'en' | 'negativeZh' | 'negativeEn'>): string {
  const text = [e.zh, e.en, e.negativeZh, e.negativeEn].join(String.fromCharCode(10));
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

export function expand(library: Library, spec: SpecFile, item: SpecItem): Entry {
  const t = library.templates[item.template];
  if (!t) throw new Error(`unknown template ${item.template}`);
  const style = item.style ? library.styles[item.style] : undefined;
  const styleAnchor =
    style && styleVariantOf(item, t) === 'creature' && style.creature ? style.creature : style;
  const zh = fill(t.zh, {
    subject: item.subject.zh,
    style: styleAnchor?.zh ?? '',
    extra: item.extra?.zh ?? '',
  });
  const en = fill(t.en, {
    subject: item.subject.en,
    style: styleAnchor?.en ?? '',
    extra: item.extra?.en ?? '',
  });
  const negativeZh = t.negativeText?.zh ?? '';
  const negativeEn = t.negativeText?.en ?? '';
  return {
    id: item.id,
    category: spec.category,
    template: item.template,
    kind: t.kind,
    file: `${t.outDir}/${item.id}.${t.ext}`,
    milestone: item.milestone,
    canvas: t.canvas,
    final: t.final,
    grid: t.grid,
    frames: t.frames,
    background: t.background,
    duration: t.duration,
    loop: t.loop,
    sampleRate: t.sampleRate,
    channels: t.channels,
    loudness: t.loudness,
    truePeak: t.truePeak,
    style: item.style,
    ref: item.ref,
    deps: item.deps ?? [],
    notes: item.notes,
    ...(item.body ? { body: item.body } : {}),
    ...(item.anchor ? { anchor: item.anchor } : {}),
    ...(item.blankRows ? { blankRows: [...item.blankRows] } : {}),
    ...(item.exprKey ? { exprKey: item.exprKey } : {}),
    zh,
    en,
    negativeZh,
    negativeEn,
    promptHash: promptHashOf({ zh, en, negativeZh, negativeEn }),
  };
}

/** Dependencies before dependents, otherwise in spec order (stable). */
export function orderByDeps(entries: Entry[]): Entry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const done = new Set<string>();
  const out: Entry[] = [];
  const visit = (e: Entry, stack: Set<string>): void => {
    if (done.has(e.id) || stack.has(e.id)) return;
    stack.add(e.id);
    for (const d of e.deps) {
      const dep = byId.get(d);
      if (dep) visit(dep, stack);
    }
    stack.delete(e.id);
    done.add(e.id);
    out.push(e);
  };
  for (const e of entries) visit(e, new Set());
  return out;
}

function specLine(e: Entry): string {
  if (e.kind === 'audio') {
    const parts = [e.duration === 'loop' ? '可无缝循环' : `时长 ${e.duration} 秒`];
    if (e.loop) parts.push('循环');
    if (e.sampleRate) parts.push(`${e.sampleRate} Hz`);
    if (e.channels) parts.push(e.channels);
    if (e.loudness) parts.push(`响度 ${e.loudness}`);
    if (e.truePeak) parts.push(`真峰值 ${e.truePeak}`);
    return parts.join('，');
  }
  const parts = [`画布 ${e.canvas}`, `入游戏 ${e.final}`];
  if (e.grid) parts.push(`帧格 ${e.grid}${e.frames ? `（${e.frames}）` : ''}`);
  if (e.background) parts.push(`背景 ${e.background}`);
  return parts.join('，');
}

/** The import fields of an entry in words for the generator (empty when it has none). */
function importFieldsLine(e: Pick<Entry, 'body' | 'anchor' | 'blankRows' | 'exprKey'>): string {
  const parts: string[] = [];
  if (e.body) parts.push(`体型 ${e.body.toUpperCase()}`);
  if (e.anchor === 'flying') parts.push('飞行锚点（保留画出的高度，不对齐地面基线）');
  if (e.blankRows?.length) parts.push(`第 ${e.blankRows.join('、')} 行留空`);
  if (e.exprKey) parts.push(`第八种表情 ${e.exprKey}（裁出头肩作该键的差分格）`);
  return parts.join('；');
}

export function renderMarkdown(
  title: string,
  intro: string,
  entries: Entry[],
  library: Library,
): string {
  const lines: string[] = [`# ${title}`, '', intro, '', `条目数：${entries.length}`, ''];
  for (const e of entries) {
    const t = library.templates[e.template];
    lines.push(`## ${e.id}`, '');
    lines.push(`- 文件：\`${e.file}\``);
    lines.push(`- 模板：${e.template}（${t?.title ?? ''}）；${specLine(e)}`);
    const meta = [`里程碑 ${e.milestone}`, `提示词指纹 ${e.promptHash}`];
    if (e.style) meta.push(`风格 ${e.style}`);
    if (e.ref) meta.push(`对应内容 \`${e.ref}\``);
    if (e.deps.length) meta.push(`先生成 ${e.deps.map((d) => `\`${d}\``).join('、')}`);
    lines.push(`- ${meta.join('；')}`);
    const importLine = importFieldsLine(e);
    if (importLine) lines.push(`- 导入：${importLine}`);
    if (e.notes) lines.push(`- 说明：${e.notes}`);
    lines.push(
      '',
      '中文提示词：',
      '',
      '```text',
      e.zh,
      '```',
      '',
      'English prompt:',
      '',
      '```text',
      e.en,
      '```',
      '',
    );
    if (e.negativeZh || e.negativeEn) {
      lines.push(
        '反向提示词：',
        '',
        '```text',
        [e.negativeZh, e.negativeEn].filter(Boolean).join('\n'),
        '```',
        '',
      );
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function renderCsv(entries: Entry[]): string {
  const head = [
    'id',
    'category',
    'milestone',
    'template',
    'file',
    'canvas',
    'final',
    'grid_or_duration',
    'prompt_zh',
    'prompt_en',
    'negative_zh',
    'negative_en',
    'deps',
    'notes',
    'prompt_hash',
  ];
  const rows = entries.map((e) =>
    [
      e.id,
      e.category,
      e.milestone,
      e.template,
      e.file,
      e.canvas,
      e.final,
      e.kind === 'audio' ? e.duration : e.grid,
      e.zh,
      e.en,
      e.negativeZh,
      e.negativeEn,
      e.deps.join(' '),
      e.notes,
      e.promptHash,
    ]
      .map(csvCell)
      .join(','),
  );
  // BOM so spreadsheet tools open the Chinese text as UTF-8.
  return `\uFEFF${[head.join(','), ...rows].join('\n')}\n`;
}

export interface ManifestRow {
  id: string;
  category: string;
  kind: 'image' | 'audio';
  file: string;
  milestone: string;
  template: string;
  promptHash: string;
  ref?: string;
  /** Import fields (present only when the entry declares them). */
  body?: BodyType;
  anchor?: AnchorOverride;
  blankRows?: number[];
  exprKey?: ExprKey;
}

export function manifestOf(entries: Entry[]): ManifestRow[] {
  return entries.map((e) => ({
    id: e.id,
    category: e.category,
    kind: e.kind,
    file: e.file,
    milestone: e.milestone,
    template: e.template,
    promptHash: e.promptHash,
    ...(e.ref ? { ref: e.ref } : {}),
    ...(e.body ? { body: e.body } : {}),
    ...(e.anchor ? { anchor: e.anchor } : {}),
    ...(e.blankRows ? { blankRows: e.blankRows } : {}),
    ...(e.exprKey ? { exprKey: e.exprKey } : {}),
  }));
}

export interface BuildOutput {
  problems: string[];
  files: Map<string, string>;
  counts: { category: string; total: number; byMilestone: Record<string, number> }[];
}

/** Read the library from disk and render every output file in memory. */
export function buildAll(root: string): BuildOutput {
  const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
  const templateFiles = ['templates.json', 'templates_audio.json']
    .filter((n) => existsSync(join(root, n)))
    .map((n) => ({ name: n, data: read<TemplateFile>(join(root, n)) }));
  const { library, problems } = buildLibrary(templateFiles);
  const specDir = join(root, 'specs');
  const specs = existsSync(specDir)
    ? readdirSync(specDir)
        .filter((n) => n.endsWith('.json'))
        .sort()
        .map((n) => ({ name: `specs/${n}`, data: read<SpecFile>(join(specDir, n)) }))
    : [];
  problems.push(...validateLibrary(library, specs));
  const files = new Map<string, string>();
  const counts: BuildOutput['counts'] = [];
  if (problems.length > 0) return { problems, files, counts };

  const all: Entry[] = [];
  for (const { data } of specs) {
    const entries = orderByDeps(data.items.map((it) => expand(library, data, it)));
    all.push(...entries);
    const intro = `由 \`tools/prompts/build.ts\` 从 \`specs/${data.category}.json\` 生成，不要手改。来源：${(data.sources ?? []).map((s) => `\`${s}\``).join('、') || '无'}。`;
    files.set(`${data.category}.md`, renderMarkdown(data.title, intro, entries, library));
    files.set(`${data.category}.csv`, renderCsv(entries));
    const byMilestone: Record<string, number> = {};
    for (const e of entries) byMilestone[e.milestone] = (byMilestone[e.milestone] ?? 0) + 1;
    counts.push({ category: data.category, total: entries.length, byMilestone });
  }
  for (const m of MILESTONES) {
    const batch = orderByDeps(all.filter((e) => e.milestone === m));
    if (batch.length === 0) continue;
    const intro = `里程碑 ${m} 需要的全部素材，依赖在前，可以按顺序整批生成。由 \`tools/prompts/build.ts\` 生成，不要手改。`;
    files.set(`milestones/${m}.md`, renderMarkdown(`${m} 生成批次`, intro, batch, library));
  }
  files.set('manifest.json', `${JSON.stringify(manifestOf(all), null, 2)}\n`);
  files.set('summary.md', renderSummary(counts));
  return { problems, files, counts };
}

export function renderSummary(counts: BuildOutput['counts']): string {
  const lines = [
    '# 提示词库总览',
    '',
    '由 `tools/prompts/build.ts` 生成，不要手改。按类别与里程碑统计条目数。',
    '',
    `| 类别 | 合计 | ${MILESTONES.join(' | ')} |`,
    `| --- | --- | ${MILESTONES.map(() => '---').join(' | ')} |`,
  ];
  const total: Record<string, number> = {};
  let grand = 0;
  for (const c of counts) {
    grand += c.total;
    for (const m of MILESTONES) total[m] = (total[m] ?? 0) + (c.byMilestone[m] ?? 0);
    lines.push(
      `| ${c.category} | ${c.total} | ${MILESTONES.map((m) => c.byMilestone[m] ?? 0).join(' | ')} |`,
    );
  }
  lines.push(`| 合计 | ${grand} | ${MILESTONES.map((m) => total[m] ?? 0).join(' | ')} |`);
  return `${lines.join('\n')}\n`;
}

function main(): number {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '..', '..', 'assets', 'prompts');
  const outDir = join(root, 'out');
  const check = process.argv.includes('--check');
  const { problems, files, counts } = buildAll(root);
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(`${problems.length} problem(s) in the prompt library`);
    return 1;
  }
  if (process.argv.includes('--validate')) {
    console.log(renderSummary(counts));
    return 0;
  }
  if (check) {
    const stale = [...files].filter(([rel, text]) => {
      const p = join(outDir, rel);
      return !existsSync(p) || readFileSync(p, 'utf8') !== text;
    });
    if (stale.length > 0) {
      console.error(`out/ is stale (${stale.length} file(s)); run: npm run prompts`);
      return 1;
    }
    console.log(`prompt library ok: ${counts.reduce((n, c) => n + c.total, 0)} entries`);
    return 0;
  }
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  for (const [rel, text] of files) {
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  console.log(renderSummary(counts));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
