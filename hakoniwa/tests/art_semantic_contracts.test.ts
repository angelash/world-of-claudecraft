import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProcessed } from '../tools/assets/core/checks';
import { hexToPx } from '../tools/assets/core/color';
import {
  contentBox,
  createImg,
  crop,
  getPx,
  type Img,
  opaqueCount,
  resizeNearest,
  setPx,
} from '../tools/assets/core/image';
import { UI_PALETTE } from '../tools/assets/core/palettes';
import { processArt } from '../tools/assets/core/pipeline';
import { addOutline, makeSheet } from './art_fixtures';

const templates = JSON.parse(
  readFileSync(join(__dirname, '..', 'assets/prompts/templates.json'), 'utf8'),
).templates;

function rectangle(img: Img, x: number, y: number, w: number, h: number, hex: string) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) setPx(img, x + dx, y + dy, hexToPx(hex));
}

function projectile(id = 'art_vfx_school_arcane_projectile', wrongColor = false) {
  const frames = Array.from({ length: 4 }, (_, i) => {
    const img = createImg(32, 32);
    for (let y = 7; y < 25; y++) {
      for (let x = 8; x < 26; x++) {
        const d = Math.abs(x - 17) + Math.abs(y - 16);
        if (d > 9) continue;
        const color = d < 3 ? '#f8f8ff' : d < 6 ? '#42effa' : '#fa22fb';
        setPx(img, x, y, hexToPx(wrongColor ? '#00ff00' : color));
      }
    }
    rectangle(img, 4, 15, 2, 2, wrongColor ? '#00ff00' : '#fa22fb');
    setPx(img, 2, 16 + (i % 2), hexToPx(wrongColor ? '#00ff00' : '#fa22fb'));
    return img;
  });
  return processArt({
    id,
    template: 'vfx_projectile',
    templateDef: templates.vfx_projectile,
    src: makeSheet([frames], [32, 32], { block: 8, background: '#000000' }),
    sourceFile: `art/vfx/${id}.png`,
    sourceSha256: 'fixture',
    aigcLabel: 'none',
  });
}

function glyph(id: string, fill: string, accent?: string) {
  const logical = createImg(24, 24);
  // One body, two separate smaller symbols and transparent gaps exercise contour retention.
  rectangle(logical, 8, 11, 8, 8, fill);
  rectangle(logical, 5, 5, 3, 3, accent ?? fill);
  rectangle(logical, 16, 5, 3, 3, fill);
  addOutline(logical, hexToPx('#1c1a24'));
  return processArt({
    id,
    template: 'ico_ui',
    templateDef: templates.ico_ui,
    src: resizeNearest(logical, 384, 384),
    sourceFile: `art/icons/ui/${id}.png`,
    sourceSha256: 'fixture',
    aigcLabel: 'none',
  });
}

describe('exact ID frozen semantic colors through processArt', () => {
  it('keeps white cores, cyan inner halos and pink outer halos in all four arcane frames', () => {
    const result = projectile();
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.spec.maxColors).toBe(4);
    expect(result.meta.frames).toHaveLength(4);
    expect(Object.values(result.meta.anims)[0]?.loop).toBe(true);
    expect(result.meta.swatch.length).toBeLessThanOrEqual(4);
    for (const f of result.meta.frames) {
      const frame = crop(result.img!, f.x, f.y, f.w, f.h);
      const colors = new Set<number>();
      for (let y = 0; y < frame.h; y++)
        for (let x = 0; x < frame.w; x++) colors.add(getPx(frame, x, y));
      for (const hex of ['#ffffff', '#00ffff', '#fa22fb']) expect(colors).toContain(hexToPx(hex));
    }
  });

  it('preserves the projectile silhouette, detached trail dots and per-frame bounds', () => {
    const result = projectile();
    const ordinary = projectile('art_vfx_school_holy_projectile');
    expect(result.meta.frames).toEqual(ordinary.meta.frames);
    for (const f of result.meta.frames) {
      const a = crop(result.img!, f.x, f.y, f.w, f.h);
      const b = crop(ordinary.img!, f.x, f.y, f.w, f.h);
      expect(contentBox(a)).toEqual(contentBox(b));
      expect(opaqueCount(a)).toBe(opaqueCount(b));
      for (let i = 3; i < a.data.length; i += 4) expect(a.data[i]).toBe(b.data[i]);
    }
  });

  it('still rejects a source far from the frozen arcane colors at the 0.07 threshold', () => {
    const result = projectile(undefined, true);
    expect(Number(result.meta.processing.quantError)).toBeGreaterThan(0.07);
    expect(result.problems.some((p) => p.check === 'quant_error' && !p.warning)).toBe(true);
  });

  it('still hard-fails a five-color edited projectile, even within the generic six-color VFX cap', () => {
    const result = projectile();
    const edited = { ...result.img!, data: result.img!.data.slice() };
    ['#030203', '#fa22fb', '#00ffff', '#ffffff', '#ff0000'].forEach((hex, i) => {
      setPx(edited, 12 + i, 16, hexToPx(hex));
    });
    expect(
      checkProcessed(edited, result.meta, {
        spec: result.spec,
        palette: result.palette,
        assetId: result.meta.id,
      }).some((p) => p.check === 'color_cap' && !p.warning),
    ).toBe(true);
  });

  it.each([
    ['art_ico_div_emblem_merca', '#e0a832'],
    ['art_ico_div_emblem_valda', '#8a1424'],
    ['art_ico_sys_ai_builtin', '#2c706c'],
  ])(
    'keeps the frozen fill of %s with only one or two fill colors and its dark contour',
    (id, fill) => {
      const result = glyph(id!, fill!);
      expect(result.problems.filter((p) => !p.warning)).toEqual([]);
      expect(result.meta.swatch).toContain(fill);
      expect(result.meta.swatch).toContain('#1c1a24');
      expect(result.meta.swatch.length).toBeLessThanOrEqual(3);
      expect(result.meta.swatch).not.toContain('#f0d890');
      const ordinary = glyph('art_ico_sys_fixture', fill!);
      expect(result.meta.frames).toEqual(ordinary.meta.frames);
      for (let i = 3; i < result.img!.data.length; i += 4) {
        expect(result.img!.data[i]).toBe(ordinary.img!.data[i]);
      }
    },
  );

  it('preserves the teal highlight using an existing canonical teal ramp', () => {
    const result = glyph('art_ico_sys_ai_builtin', '#2c706c', '#5aaa9e');
    expect(result.meta.swatch).toEqual(expect.arrayContaining(['#2c706c', '#5aaa9e']));
    expect(result.meta.swatch.length).toBeLessThanOrEqual(3);
    expect(result.meta.swatch).not.toContain('#58cce6');
  });

  it('does not turn unrelated emblem, AI or ordinary UI IDs into semantic palette exceptions', () => {
    for (const id of ['art_ico_div_emblem_other', 'art_ico_sys_ai_other', 'art_ico_sys_fixture']) {
      const result = glyph(id, '#e0a832');
      expect(result.meta.swatch.every((hex) => UI_PALETTE.colors.some((c) => c.hex === hex))).toBe(
        true,
      );
      expect(result.meta.swatch).not.toContain('#e0a832');
    }
  });

  it('pins the pixels of an unrelated holy projectile and a generic UI glyph', () => {
    const rgba = (img: Img) => createHash('sha256').update(img.data).digest('hex');
    expect([
      rgba(projectile('art_vfx_school_holy_projectile').img!),
      rgba(glyph('art_ico_sys_fixture', '#e0a832').img!),
    ]).toEqual([
      '76bd674519870bde039e21371120caa6c384e1401a1c082269c0bdb88eaf277d',
      'f9a9d9d7687b1ccf5664226e527caa22f1ec79dd63ebceb34b5a87dd41fa3bdb',
    ]);
  });

  it('keeps missing-outline failures hard for the crimson emblem', () => {
    const result = glyph('art_ico_div_emblem_valda', '#8a1424');
    const edited = createImg(24, 24);
    rectangle(edited, 8, 8, 8, 8, '#8a1424');
    expect(
      checkProcessed(edited, result.meta, {
        spec: result.spec,
        palette: result.palette,
        assetId: result.meta.id,
      }).some((p) => p.check === 'outline_single' && !p.warning),
    ).toBe(true);
  });

  it('keeps real color-distance rejection for a wrong UI fill', () => {
    const result = glyph('art_ico_div_emblem_merca', '#00ffff');
    expect(result.problems.some((p) => p.check === 'quant_error' && !p.warning)).toBe(true);
  });
});
