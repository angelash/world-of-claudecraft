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
}

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
  zh: string;
  en: string;
  negativeZh: string;
  negativeEn: string;
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

export function expand(library: Library, spec: SpecFile, item: SpecItem): Entry {
  const t = library.templates[item.template];
  if (!t) throw new Error(`unknown template ${item.template}`);
  const style = item.style ? library.styles[item.style] : undefined;
  const zh = fill(t.zh, {
    subject: item.subject.zh,
    style: style?.zh ?? '',
    extra: item.extra?.zh ?? '',
  });
  const en = fill(t.en, {
    subject: item.subject.en,
    style: style?.en ?? '',
    extra: item.extra?.en ?? '',
  });
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
    zh,
    en,
    negativeZh: t.negativeText?.zh ?? '',
    negativeEn: t.negativeText?.en ?? '',
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
    const meta = [`里程碑 ${e.milestone}`];
    if (e.style) meta.push(`风格 ${e.style}`);
    if (e.ref) meta.push(`对应内容 \`${e.ref}\``);
    if (e.deps.length) meta.push(`先生成 ${e.deps.map((d) => `\`${d}\``).join('、')}`);
    lines.push(`- ${meta.join('；')}`);
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
  ref?: string;
}

export function manifestOf(entries: Entry[]): ManifestRow[] {
  return entries.map((e) => ({
    id: e.id,
    category: e.category,
    kind: e.kind,
    file: e.file,
    milestone: e.milestone,
    template: e.template,
    ...(e.ref ? { ref: e.ref } : {}),
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
