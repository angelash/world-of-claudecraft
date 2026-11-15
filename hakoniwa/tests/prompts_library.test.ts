// The AI asset prompt library (tools/prompts/build.ts): validation catches every class of
// broken entry, expansion fills templates and keeps dependencies first, the outputs carry
// the fields the generator and the import pipeline need, and the committed library is
// valid. The expanded out/ folder is generated locally (npm run prompts) and not committed.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAll,
  buildLibrary,
  expand,
  fill,
  manifestOf,
  orderByDeps,
  renderCsv,
  type SpecFile,
  type TemplateFile,
  validateLibrary,
} from '../tools/prompts/build';

const EM_DASH = String.fromCharCode(0x2014);

const templates: TemplateFile = {
  version: 1,
  negative: { zh: '文字，水印', en: 'text, watermark' },
  styles: {
    ash: { name: '灰烬荒原', zh: '灰褐色调', en: 'ashen brown palette', palette: ['#5a4a3a'] },
  },
  templates: {
    mon: {
      kind: 'image',
      title: '魔物立牌',
      canvas: '1024x1024',
      final: '48x48',
      grid: '4x3',
      frames: '行：待机、行走、攻击',
      background: 'transparent',
      outDir: 'art/monsters',
      ext: 'png',
      zh: '像素魔物，{subject}，{style}，{extra}',
      en: 'pixel monster, {subject}, {style}, {extra}',
      negative: true,
    },
  },
};
const audio: TemplateFile = {
  version: 1,
  templates: {
    sfx: {
      kind: 'audio',
      title: '音效',
      duration: 1,
      outDir: 'audio/sfx',
      ext: 'ogg',
      zh: '音效：{subject}',
      en: 'sound effect: {subject}',
    },
  },
};

function spec(items: SpecFile['items']): SpecFile {
  return { category: 'monsters', title: '魔物', sources: ['x.md'], items };
}
const rat = {
  id: 'art_mon_ash_rat',
  template: 'mon',
  style: 'ash',
  subject: { zh: '灰色大鼠', en: 'grey giant rat' },
  milestone: 'M1',
};

describe('library validation', () => {
  const { library, problems } = buildLibrary([
    { name: 'templates.json', data: templates },
    { name: 'templates_audio.json', data: audio },
  ]);

  it('merges image and audio templates with their own negatives', () => {
    expect(problems).toEqual([]);
    expect(library.templates.mon?.negativeText?.en).toBe('text, watermark');
    expect(library.templates.sfx?.negativeText).toBeUndefined();
  });

  it('accepts a well-formed entry', () => {
    expect(validateLibrary(library, [{ name: 'specs/m.json', data: spec([rat]) }])).toEqual([]);
  });

  it('flags each kind of broken entry', () => {
    const broken = spec([
      rat,
      { ...rat },
      { ...rat, id: 'Bad-Id' },
      { ...rat, id: 'art_mon_b', template: 'nope' },
      { ...rat, id: 'art_mon_c', style: 'nope' },
      { ...rat, id: 'art_mon_d', subject: { zh: '', en: 'x' } },
      { ...rat, id: 'art_mon_e', milestone: 'M9' },
      { ...rat, id: 'art_mon_f', deps: ['art_missing'] },
      { ...rat, id: 'art_mon_g', subject: { zh: `灰鼠${EM_DASH}大`, en: 'x' } },
      { ...rat, id: 'art_mon_h', subject: { zh: '鼠', en: 'an HD-2D rat' } },
    ]);
    const out = validateLibrary(library, [{ name: 'specs/m.json', data: broken }]).join('\n');
    expect(out).toContain('id also used');
    expect(out).toContain('Bad-Id: id must match');
    expect(out).toContain('unknown template nope');
    expect(out).toContain('unknown style nope');
    expect(out).toContain('art_mon_d: subject needs both zh and en');
    expect(out).toContain('art_mon_e: milestone must be one of');
    expect(out).toContain('unknown dependency art_missing');
    expect(out).toContain('art_mon_g.subject.zh: forbidden character');
    expect(out).toContain('banned word HD-2D');
  });

  it('rejects templates without sizes, durations or the subject slot', () => {
    const { library: lib } = buildLibrary([
      {
        name: 't.json',
        data: {
          version: 1,
          templates: {
            a: {
              kind: 'image',
              title: 'a',
              outDir: 'x',
              ext: 'png',
              zh: '{subject}',
              en: '{subject}',
            },
            b: {
              kind: 'audio',
              title: 'b',
              outDir: 'x',
              ext: 'ogg',
              zh: '{subject}',
              en: '{subject}',
            },
            c: {
              kind: 'image',
              title: 'c',
              canvas: '1',
              final: '1',
              outDir: 'x',
              ext: 'png',
              zh: '无',
              en: 'x',
            },
          },
        },
      },
    ]);
    const out = validateLibrary(lib, []).join('\n');
    expect(out).toContain('template a: image templates need canvas and final sizes');
    expect(out).toContain('template b: audio templates need a duration');
    expect(out).toContain('template c: zh and en must both contain {subject}');
  });

  it('reports a style or template defined in two files', () => {
    const { problems: dup } = buildLibrary([
      { name: 'a.json', data: templates },
      { name: 'b.json', data: templates },
    ]);
    expect(dup.join('\n')).toContain('style ash is defined twice');
    expect(dup.join('\n')).toContain('template mon is defined twice');
  });
});

describe('expansion and rendering', () => {
  const { library } = buildLibrary([
    { name: 'templates.json', data: templates },
    { name: 'templates_audio.json', data: audio },
  ]);

  it('fills placeholders and tidies the separators an empty part leaves', () => {
    expect(
      fill('像素魔物，{subject}，{style}，{extra}', { subject: '灰鼠', style: '', extra: '' }),
    ).toBe('像素魔物，灰鼠');
    expect(
      fill('a, {subject}, {style}, {extra}', { subject: 'rat', style: 'ash', extra: '' }),
    ).toBe('a, rat, ash');
  });

  it('expands an entry into a target file with prompts and negatives', () => {
    const e = expand(library, spec([rat]), rat);
    expect(e.file).toBe('art/monsters/art_mon_ash_rat.png');
    expect(e.zh).toBe('像素魔物，灰色大鼠，灰褐色调');
    expect(e.en).toBe('pixel monster, grey giant rat, ashen brown palette');
    expect(e.negativeEn).toBe('text, watermark');
    expect(e.final).toBe('48x48');
  });

  it('orders dependencies before dependents and keeps spec order otherwise', () => {
    const items = [
      { ...rat, id: 'art_mon_b', deps: ['art_mon_c'] },
      { ...rat, id: 'art_mon_a' },
      { ...rat, id: 'art_mon_c' },
    ];
    const s = spec(items);
    const order = orderByDeps(items.map((it) => expand(library, s, it))).map((e) => e.id);
    expect(order).toEqual(['art_mon_c', 'art_mon_b', 'art_mon_a']);
  });

  it('writes CSV cells that survive commas, quotes and newlines', () => {
    const e = expand(library, spec([rat]), { ...rat, notes: 'a, "b"\nc' });
    const csv = renderCsv([e]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"a, ""b""\nc"');
    expect(csv.split('\n')[0]).toContain('prompt_zh');
  });

  it('lists every expected asset in the manifest', () => {
    const e = expand(library, spec([rat]), { ...rat, ref: 'ash_rat' });
    expect(manifestOf([e])).toEqual([
      {
        id: 'art_mon_ash_rat',
        category: 'monsters',
        kind: 'image',
        file: 'art/monsters/art_mon_ash_rat.png',
        milestone: 'M1',
        template: 'mon',
        ref: 'ash_rat',
      },
    ]);
  });
});

describe('the committed library', () => {
  const root = resolve(__dirname, '..', 'assets', 'prompts');

  it('has no problems and expands every art and audio category', () => {
    expect(existsSync(join(root, 'templates.json'))).toBe(true);
    expect(existsSync(join(root, 'templates_audio.json'))).toBe(true);
    const { problems, files, counts } = buildAll(root);
    expect(problems).toEqual([]);
    expect(files.has('manifest.json')).toBe(true);
    expect(files.has('milestones/M1.md')).toBe(true);
    const categories = counts.map((c) => c.category);
    for (const c of [
      'characters',
      'monsters',
      'bosses',
      'doll',
      'tiles',
      'props',
      'vfx',
      'audio_sfx',
    ]) {
      expect(categories, `missing category ${c}`).toContain(c);
    }
    for (const c of counts) expect(c.total, `empty category ${c.category}`).toBeGreaterThan(0);
  });
});
