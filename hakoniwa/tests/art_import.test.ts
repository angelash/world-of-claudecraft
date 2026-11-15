// The art import pipeline (tools/assets/core/, art_pipeline.md 13): the PNG codec, every step
// on code-generated sample sheets (keying, cell search, pixel-grid recovery, palette
// quantization, binary alpha, outline, anchors, mirroring, metadata, validation), the paper-doll
// key colors with the life_a crate rule, the atlas packer and the contact sheet. The same source
// with the same import version must give byte-identical results.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAtlas, packMaxRects } from '../tools/assets/core/atlas';
import { locateCells } from '../tools/assets/core/cells';
import { checkProcessed, isSeam, reservedExempt, seamScore } from '../tools/assets/core/checks';
import { deltaE, hexToPx, labOf, lightness, pxToHex } from '../tools/assets/core/color';
import { contactIndex, contactSheet } from '../tools/assets/core/contact';
import {
  CRATE_WOOD,
  classifyKey,
  crateWoodLeaks,
  KEY_RAMP_COLORS,
  KEY_SLOTS,
  keySlotsFor,
} from '../tools/assets/core/doll_keys';
import {
  contentBox,
  createImg,
  crop,
  getPx,
  type Img,
  isOpaque,
  pack,
  setPx,
} from '../tools/assets/core/image';
import { keyBackground, MAGENTA_RADIUS } from '../tools/assets/core/keying';
import { IMPORT_VERSION } from '../tools/assets/core/meta';
import { OutlinePainter, outlineFrame } from '../tools/assets/core/outline';
import {
  CREATURE_PALETTE,
  RESERVED_SEMANTIC_HEX,
  stylePalette,
  UI_PALETTE,
} from '../tools/assets/core/palettes';
import { type ArtInput, type ArtResult, processArt } from '../tools/assets/core/pipeline';
import { estimateBlock, reduceMode } from '../tools/assets/core/pixel_grid';
import { decodePng, encodePalettePng, encodePng, readPngText } from '../tools/assets/core/png';
import { quantizeFrames } from '../tools/assets/core/quantize';
import { importSpecFor, isReference } from '../tools/assets/core/template_specs';
import { addOutline, BEAST, creatureFrame, humanoidFrame, lcg, makeSheet } from './art_fixtures';

const TEMPLATES = JSON.parse(
  readFileSync(join(__dirname, '..', 'assets', 'prompts', 'templates.json'), 'utf8'),
) as {
  styles: Record<string, { palette?: string[] }>;
  templates: Record<
    string,
    { kind: string; canvas?: string; final?: string; grid?: string; background?: string }
  >;
};

const MON_LAYOUT = [
  [0, 1, 2, 3, null, null],
  [0, 1, 2, 3, 4, 5],
  [0, 1, 2, 3, null, null],
  [0, 1, 2, 3, 4, 5],
];

function monSheet(
  opts: Partial<Parameters<typeof makeSheet>[2]> = {},
  dx: (r: number, c: number) => number = () => 0,
): Img {
  const cells = MON_LAYOUT.map((row, r) =>
    row.map((p, c) => (p === null ? null : creatureFrame(48, 43, BEAST, p, dx(r, c)))),
  );
  return makeSheet(cells, [48, 48], { block: 4, offset: [3, 2], noise: 3, fringe: true, ...opts });
}

let baseCache: { src: Img; res: ArtResult } | null = null;

/** The reference monster sheet and its import result, computed once for the read-only tests. */
function baseRun(): { src: Img; res: ArtResult } {
  if (!baseCache) {
    const src = monSheet();
    baseCache = { src, res: processArt(input('art_mon_test_r', 'mon_small', src)) };
  }
  return baseCache;
}

function input(id: string, template: string, src: Img, extra: Partial<ArtInput> = {}): ArtInput {
  return {
    id,
    template,
    templateDef: TEMPLATES.templates[template]!,
    src,
    sourceFile: `art/test/${id}.png`,
    sourceSha256: 'a'.repeat(64),
    aigcLabel: 'none',
    ...extra,
  };
}

function opaquePixels(img: Img): number[] {
  const out: number[] = [];
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! >= 128)
      out.push(pack(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, 255));
  }
  return out;
}

/** Smallest mask difference between two frames over shifts of up to 2 pixels. */
function maskDiff(a: Img, b: Img): number {
  let best = Number.POSITIVE_INFINITY;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      let d = 0;
      for (let y = 0; y < a.h; y++)
        for (let x = 0; x < a.w; x++) if (isOpaque(a, x, y) !== isOpaque(b, x - dx, y - dy)) d++;
      best = Math.min(best, d);
    }
  }
  return best;
}

describe('png codec', () => {
  it('round-trips RGBA and keeps UTF-8 text chunks (the implicit AIGC label)', () => {
    const img = createImg(5, 3);
    const rnd = lcg(3);
    for (let i = 0; i < img.data.length; i++) img.data[i] = Math.floor(rnd() * 256);
    const label = '{"Label":"1","ContentProducer":"小九","ProduceID":"x-1"}';
    const bytes = encodePng(img, { AIGC: label });
    const back = decodePng(bytes);
    expect([back.w, back.h]).toEqual([5, 3]);
    expect([...back.data]).toEqual([...img.data]);
    expect(back.text.AIGC).toBe(label);
    expect(readPngText(bytes).AIGC).toBe(label);
  });

  it('decodes palette PNGs with transparency', () => {
    const idx = Uint8Array.from([0, 1, 2, 1, 0, 2]);
    const bytes = encodePalettePng(3, 2, idx, [
      [255, 0, 255, 255],
      [10, 20, 30, 255],
      [0, 0, 0, 0],
    ]);
    const img = decodePng(bytes);
    expect(img.colorType).toBe(3);
    expect(pxToHex(getPx(img, 1, 0))).toBe('#0a141e');
    expect(getPx(img, 2, 0) & 255).toBe(0);
    expect(pxToHex(getPx(img, 0, 0))).toBe('#ff00ff');
  });

  it('rejects corrupt chunks', () => {
    const bytes = encodePng(createImg(2, 2, 0xff0000ff));
    bytes[20] ^= 0xff;
    expect(() => decodePng(bytes)).toThrow(/CRC/);
  });
});

describe('palettes', () => {
  it('creature palette: 64 distinct colors, 32 per sheet, no pure black', () => {
    const hex = CREATURE_PALETTE.colors.map((c) => c.hex);
    expect(hex).toHaveLength(64);
    expect(new Set(hex).size).toBe(64);
    expect(hex).not.toContain('#000000');
    expect(CREATURE_PALETTE.maxPerImage).toBe(32);
    for (const r of RESERVED_SEMANTIC_HEX) expect(hex).toContain(r);
  });

  it('style-pack boards: anchors with one darker and one lighter step plus reserved colors', () => {
    for (const [id, s] of Object.entries(TEMPLATES.styles)) {
      if (!s.palette) continue;
      const p = stylePalette(id, s.palette);
      expect(p.colors.length).toBeLessThanOrEqual(48 + RESERVED_SEMANTIC_HEX.length);
      for (const a of s.palette) expect(p.colors.map((c) => c.hex)).toContain(a.toLowerCase());
      expect(p.colors.map((c) => c.hex)).not.toContain('#000000');
    }
    expect(UI_PALETTE.colors).toHaveLength(16);
  });
});

describe('import rules cover every template', () => {
  it('each image template has an import spec whose layout matches its grid', () => {
    for (const [id, t] of Object.entries(TEMPLATES.templates)) {
      if (t.kind !== 'image') continue;
      const spec = importSpecFor(id, t, `art_x_${id}`);
      expect(spec.cells.length, id).toBe(spec.grid[1]);
      expect(spec.cells[0]!.length, id).toBe(spec.grid[0]);
      if (isReference(t)) expect(spec.cls).toBe('reference');
      else expect(spec.final, id).not.toBeNull();
    }
  });

  it('humanoid bodies follow 1.3 and 3.2 (H 28 at (24, 44), HB at (24, 46))', () => {
    const t = TEMPLATES.templates.chr_idle!;
    expect(importSpecFor('chr_idle', t, 'art_chr_yeyu_idle').body).toEqual({
      target: 28,
      min: 27,
      max: 30,
    });
    expect(importSpecFor('chr_idle', t, 'art_doll_mannequin_hs_idle').body?.target).toBe(21);
    expect(importSpecFor('chr_idle', t, 'art_doll_mannequin_hb_idle').anchorPx).toEqual([24, 46]);
    expect(
      importSpecFor('mon_small', TEMPLATES.templates.mon_small!, 'art_mon_dian_rat_d').anchorPx,
    ).toEqual([24, 44]);
  });
});

describe('steps 2 to 4: keying, cells, pixel grid', () => {
  it('keys magenta and its fringe, keeps the subject', () => {
    const sheet = monSheet();
    const keyed = keyBackground(sheet, 'magenta', { checkEdges: true });
    expect(keyed.problems).toEqual([]);
    expect(keyed.fringeRemoved).toBeGreaterThan(0);
    // Neither the background nor the half-magenta fringe survives: every kept pixel is one of
    // the sprite's own colors (give or take the fixture's color noise).
    const magenta = labOf(0xff00ffff);
    const own = Object.values(BEAST).map((h) => labOf(hexToPx(h)));
    for (const px of opaquePixels(keyed.img)) {
      expect(deltaE(labOf(px), magenta)).toBeGreaterThan(MAGENTA_RADIUS);
      expect(Math.min(...own.map((c) => deltaE(c, labOf(px))))).toBeLessThan(0.03);
    }
  });

  it('detects the block size and phase, and mode downsampling recovers the drawn pixels', () => {
    const frame = creatureFrame(48, 43, BEAST, 0);
    const sheet = makeSheet([[frame]], [48, 48], {
      block: 5,
      offset: [2, 3],
      noise: 3,
      fringe: true,
    });
    const keyed = keyBackground(sheet, 'magenta', { checkEdges: false }).img;
    const b = estimateBlock(keyed);
    expect(b.size).toBe(5);
    expect([b.phaseX, b.phaseY]).toEqual([2, 3]);
    const back = reduceMode(keyed, 2, 3, 5, 5, 48, 48);
    let wrong = 0;
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) if (isOpaque(back, x, y) !== isOpaque(frame, x, y)) wrong++;
    expect(wrong).toBe(0);
  });

  it('a frame across a cell boundary or in a blank cell is reported as frames', () => {
    const t = TEMPLATES.templates.mon_small!;
    const spec = importSpecFor('mon_small', t, 'art_mon_x_d');
    const cells = MON_LAYOUT.map((row) =>
      row.map((p) => (p === null ? null : creatureFrame(48, 43, BEAST, p))),
    );
    cells[0]![4] = creatureFrame(48, 43, BEAST, 0); // a frame in a cell that must stay blank
    const sheet = keyBackground(makeSheet(cells, [48, 48], { block: 2 }), 'magenta', {
      checkEdges: false,
    }).img;
    const res = locateCells(sheet, spec.cells, { search: true });
    expect(res.problems.map((p) => p.code)).toContain('frames');
    expect(res.problems.some((p) => p.message.includes('(5,1)'))).toBe(true);
  });
});

describe('the 13 steps on a monster sheet (mon_small)', () => {
  const { res } = baseRun();
  const img = res.img!;

  it('passes every automatic check', () => {
    expect(res.problems.filter((p) => !p.warning)).toEqual([]);
  });

  it('outputs the in-game grid: 6x4 cells of 48x48, 20 drawn frames, left mirrored from right', () => {
    expect([img.w, img.h]).toEqual([288, 192]);
    const drawn = res.meta.frames.filter((f) => !f.flipX);
    expect(drawn).toHaveLength(20);
    expect(res.meta.directions).toEqual({
      drawn: ['right'],
      mirrored: [{ dir: 'left', from: 'right' }],
    });
    const left = res.meta.frames.filter((f) => f.flipX);
    expect(left).toHaveLength(20);
    expect(left.every((f) => f.dir === 'left' && f.ax === 47 - 24)).toBe(true);
    expect(res.meta.anims['idle/right']?.frames).toEqual([0, 1, 2, 3]);
    expect(res.meta.anims['death/right']).toMatchObject({ hold: true, ms: [100, 120, 140, 160] });
  });

  it('recovers the drawn silhouettes at 16 px per meter', () => {
    for (const f of res.meta.frames.filter((m) => !m.flipX)) {
      const out = crop(img, f.x, f.y, f.w, f.h);
      const source = creatureFrame(48, 43, BEAST, MON_LAYOUT[f.y / 48]![f.x / 48]!);
      expect(maskDiff(out, source)).toBe(0);
    }
  });

  it('quantizes into the creature palette with binary alpha, no pure black, at most 32 colors', () => {
    const allowed = new Set(CREATURE_PALETTE.colors.map((c) => c.px));
    const px = opaquePixels(img);
    expect(px.every((p) => allowed.has(p))).toBe(true);
    expect(px.some((p) => p >>> 8 === 0)).toBe(false);
    for (let i = 3; i < img.data.length; i += 4) expect([0, 255]).toContain(img.data[i]);
    expect(new Set(px).size).toBeLessThanOrEqual(32);
    expect(res.meta.swatch.every((h) => CREATURE_PALETTE.colors.some((c) => c.hex === h))).toBe(
      true,
    );
  });

  it('puts every foot on the anchor row (24, 44)', () => {
    for (const f of res.meta.frames.filter((m) => !m.flipX && m.anim === 'idle')) {
      const box = contentBox(crop(img, f.x, f.y, f.w, f.h))!;
      expect(box.y + box.h - 1).toBe(44);
      expect([f.ax, f.ay]).toEqual([24, 44]);
    }
  });

  it('records the metadata of step 10', () => {
    expect(res.meta).toMatchObject({
      id: 'art_mon_test_r',
      kind: 'art',
      template: 'mon_small',
      importVersion: IMPORT_VERSION,
      size: [288, 192],
      cell: [48, 48],
      palette: 'creature',
    });
    expect(res.meta.processing.block).toMatchObject({ size: 4, phase: [3, 2] });
    expect(res.meta.processing.scale).toMatchObject({ ratio: 4, blockAligned: true });
  });

  it('is deterministic: same source, same import version, same bytes', () => {
    const again = processArt(input('art_mon_test_r', 'mon_small', monSheet()));
    expect(Buffer.from(encodePng(again.img!)).equals(Buffer.from(encodePng(img)))).toBe(true);
    expect(JSON.stringify(again.meta)).toBe(JSON.stringify(res.meta));
  });
});

describe('rework reasons from the pipeline', () => {
  it('frame jitter over 2 px in an in-place animation is frames', () => {
    const shifts = [0, 4, -3, 2];
    const res = processArt(
      input(
        'art_mon_test_d',
        'mon_small',
        monSheet({}, (r, c) => (r === 0 ? (shifts[c] ?? 0) : 0)),
      ),
    );
    expect(res.problems.find((p) => p.check === 'frame_jitter')?.code).toBe('frames');
  });

  it('a humanoid far taller than the template is scale', () => {
    const cells = [0, 1, 2].map(() =>
      [0, 1, 2, 3].map(() =>
        humanoidFrame(40, 45, { body: '#2e4a88', head: '#e0ad84', outline: '#1c2850' }),
      ),
    );
    const res = processArt(
      input('art_chr_test_idle', 'chr_idle', makeSheet(cells, [48, 48], { block: 5 })),
    );
    expect(res.problems.map((p) => p.code)).toContain('scale');
  });

  it('a humanoid within 25% is rescaled to the 28 px body', () => {
    const cells = [0, 1, 2].map(() =>
      [0, 1, 2, 3].map(() =>
        humanoidFrame(33, 45, { body: '#2e4a88', head: '#e0ad84', outline: '#1c2850' }),
      ),
    );
    const res = processArt(
      input('art_chr_test_idle', 'chr_idle', makeSheet(cells, [48, 48], { block: 5 })),
    );
    expect(res.problems.filter((p) => !p.warning)).toEqual([]);
    expect(res.meta.processing.bodyHeight).toBeGreaterThanOrEqual(27);
    expect(res.meta.processing.bodyHeight).toBeLessThanOrEqual(30);
    expect(res.meta.processing.scale).toHaveProperty('refinedFrom');
  });

  it('colors far from the palette are palette', () => {
    const neon = { ...BEAST, body: '#00ff00', shade: '#00ffff', light: '#ffff00' };
    const cells = MON_LAYOUT.map((row) =>
      row.map((p) => (p === null ? null : creatureFrame(48, 43, neon, p))),
    );
    const res = processArt(
      input('art_mon_test_d', 'mon_small', makeSheet(cells, [48, 48], { block: 4 })),
    );
    expect(res.problems.find((p) => p.check === 'quant_error')?.code).toBe('palette');
  });

  it('scenery instead of a magenta background is background', () => {
    const scene = createImg(1536, 1024, hexToPx('#3e6e38'));
    const res = processArt(input('art_mon_test_d', 'mon_small', scene));
    expect(res.problems.map((p) => p.code)).toContain('background');
  });
});

describe('step 7: outline', () => {
  it('strips a dark contour and redraws one darker pixel, deep on the bottom and right, never black', () => {
    const fill = hexToPx('#a2764a');
    const sq = createImg(10, 10);
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) setPx(sq, x, y, fill);
    addOutline(sq, hexToPx('#2b2220'));
    const out = outlineFrame(sq, new OutlinePainter(CREATURE_PALETTE.colors), 'standee', false);
    expect(out.stripped).toBeGreaterThan(0);
    const img = out.img;
    const top = getPx(img, 5, 2); // padded by one pixel: the old ring at y=1 became y=2
    const bottom = getPx(img, 5, 9);
    expect(top).not.toBe(fill);
    expect(lightness(top)).toBeLessThan(lightness(fill));
    expect(lightness(bottom)).toBeLessThan(lightness(top));
    for (const p of opaquePixels(img)) expect(p >>> 8).not.toBe(0);
    // Exactly one ring: the pixel inside the outline is fill again.
    expect(getPx(img, 5, 3)).toBe(fill);
  });
});

describe('paper-doll key colors', () => {
  const outfit = keySlotsFor('chr_life_a', 'art_doll_res_farmer_life_a')!;

  it('outfit strips use the five outfit slots; the gray mannequin is not keyed', () => {
    expect(outfit).toEqual(['primary', 'secondary', 'leather', 'metal', 'accent']);
    expect(keySlotsFor('chr_idle', 'art_doll_mannequin_h_idle')).toBeNull();
    expect(keySlotsFor('doll_head', 'art_doll_hair_braid')).toEqual(['hair', 'skin', 'metal']);
    expect(keySlotsFor('chr_idle', 'art_chr_yeyu_idle')).toBeNull();
  });

  it('classifies the key families and every canonical ramp color back into its slot', () => {
    expect(classifyKey(labOf(hexToPx('#d02020')))).toBe('primary');
    expect(classifyKey(labOf(hexToPx('#2040c0')))).toBe('secondary');
    expect(classifyKey(labOf(hexToPx('#6b4226')))).toBe('leather');
    expect(classifyKey(labOf(hexToPx('#808080')))).toBe('metal');
    expect(classifyKey(labOf(hexToPx('#30a040')))).toBe('accent');
    expect(classifyKey(labOf(hexToPx('#f0d820')))).toBe('hair');
    expect(classifyKey(labOf(hexToPx('#ecd0b0')))).toBe('skin');
    for (const s of KEY_SLOTS)
      for (const c of KEY_RAMP_COLORS[s]) expect(classifyKey(c.lab), c.hex).toBe(s);
  });

  it('the life_a crate wood #b48a58 never falls into the leather slot', () => {
    expect(classifyKey(labOf(hexToPx(CRATE_WOOD)), outfit)).toBeNull();
    const crate = createImg(8, 8, hexToPx(CRATE_WOOD));
    expect(crateWoodLeaks(crate, outfit)).toBe(0);
    // A strip with a red tunic, a leather belt and the crate: belt keyed, crate fixed.
    const cells = [0, 1, 2].map(() =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((c) =>
        humanoidFrame(28, 43, {
          body: '#c02424',
          head: '#9a9a9a',
          outline: '#401010',
          extra: c >= 6 ? [CRATE_WOOD, -6, 24, 12, 7] : ['#6b4226', -5, 33, 10, 2],
        }),
      ),
    );
    const res = processArt(
      input('art_doll_res_farmer_life_a', 'chr_life_a', makeSheet(cells, [48, 48], { block: 3 })),
    );
    expect(res.problems.find((p) => p.check === 'crate_wood')).toBeUndefined();
    expect(res.meta.processing.crateWoodLeaks).toBe(0);
    const slots = Object.values(res.meta.slots).map((s) => s.slot);
    expect(slots).toContain('primary');
    expect(slots).toContain('leather');
    // The crate pixels are creature-palette wood, not a leather ramp color.
    const leather = new Set(KEY_RAMP_COLORS.leather.map((c) => c.px));
    const carry = res.meta.frames.find((f) => f.anim === 'carry' && !f.flipX)!;
    const frame = crop(res.img!, carry.x, carry.y, carry.w, carry.h);
    const crateish = opaquePixels(frame).filter(
      (p) => Math.abs(lightness(p) - lightness(hexToPx(CRATE_WOOD))) < 0.05 && !leather.has(p),
    );
    expect(crateish.length).toBeGreaterThan(20);
  });
});

describe('textures and effects', () => {
  const lothar = TEMPLATES.styles.lothar_plain!.palette!;

  function tile(seamless: boolean): Img {
    // A 64x64 texture at 16 px per meter: stripes that wrap, or a dark-to-light ramp that jumps
    // back at the edge (the typical generator seam).
    const a = hexToPx(lothar[1]!);
    const b = hexToPx(lothar[2]!);
    const ramp = [lothar[0]!, lothar[1]!, lothar[2]!, lothar[3]!, lothar[6]!].map(hexToPx);
    const t = createImg(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if (seamless) setPx(t, x, y, ((x >> 3) + (y >> 4)) % 2 ? b : a);
        else setPx(t, x, y, ramp[Math.min(4, Math.floor(x / 13))]!);
      }
    }
    return makeSheet([[t]], [64, 64], { block: 16, background: '#000000' });
  }

  it('a wrapping ground tile passes; a ramp across the tile fails seam', () => {
    const ok = processArt(
      input('art_tile_lothar_plain_grass_09', 'tile_ground', tile(true), {
        style: 'lothar_plain',
        styleAnchors: lothar,
      }),
    );
    expect(ok.problems.filter((p) => !p.warning)).toEqual([]);
    expect([ok.img!.w, ok.img!.h]).toEqual([64, 64]);
    const bad = processArt(
      input('art_tile_lothar_plain_grass_09', 'tile_ground', tile(false), {
        style: 'lothar_plain',
        styleAnchors: lothar,
      }),
    );
    expect(bad.problems.find((p) => p.check === 'seamless')?.code).toBe('seam');
  });

  it('an effect whose last frame stays bright fails frames', () => {
    const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const f = createImg(32, 32);
      const r = i === 7 ? 12 : 4 + i;
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++)
          if ((x - 16) ** 2 + (y - 16) ** 2 < r * r) setPx(f, x, y, hexToPx('#ffb040'));
      return f;
    });
    const sheet = makeSheet([frames.slice(0, 4), frames.slice(4)], [32, 32], {
      block: 8,
      background: '#000000',
    });
    const res = processArt(input('art_vfx_test_burst', 'vfx_small', sheet));
    expect(res.problems.find((p) => p.check === 'vfx_fade')?.code).toBe('frames');
  });
});

describe('step 12 on a hand-edited result', () => {
  it('reports wrong size, stray colors, pure black and half alpha', () => {
    const { res } = baseRun();
    const img = createImg(res.img!.w + 2, res.img!.h);
    for (let y = 0; y < res.img!.h; y++)
      for (let x = 0; x < res.img!.w; x++) setPx(img, x, y, getPx(res.img!, x, y));
    setPx(img, 20, 30, 0x000000ff);
    setPx(img, 21, 30, 0x12345680);
    const probs = checkProcessed(img, res.meta, {
      spec: res.spec,
      palette: res.palette,
      assetId: 'art_mon_test_r',
    });
    const checks = probs.map((p) => p.check);
    expect(checks).toEqual(
      expect.arrayContaining(['size', 'pure_black', 'alpha_binary', 'palette_membership']),
    );
  });
});

describe('quantization', () => {
  it('folds the least used colors until the sheet fits its cap', () => {
    const img = createImg(40, 1);
    for (const [i, c] of CREATURE_PALETTE.colors.slice(0, 40).entries()) setPx(img, i, 0, c.px);
    const q = quantizeFrames([img], CREATURE_PALETTE, { maxColors: 32 });
    expect(new Set(opaquePixels(q.frames[0]!)).size).toBe(32);
    expect(q.folded).toBe(8);
  });
});

describe('step 11 atlas and step 13 contact sheet', () => {
  it('MaxRects packs without overlap inside the page with a 1 px gap, spilling to new pages', () => {
    const rnd = lcg(11);
    const items = Array.from({ length: 300 }, (_, i) => ({
      key: `k${i}`,
      w: 8 + Math.floor(rnd() * 120),
      h: 8 + Math.floor(rnd() * 120),
    }));
    const res = packMaxRects(items, 512, 512, 1);
    expect(res.pages.length).toBeGreaterThan(1);
    const byKey = new Map(items.map((i) => [i.key, i]));
    const placed = res.placements.map((p) => ({ ...p, ...byKey.get(p.key)! }));
    expect(placed).toHaveLength(items.length);
    for (const a of placed) {
      expect(a.x + a.w).toBeLessThanOrEqual(512);
      expect(a.y + a.h).toBeLessThanOrEqual(512);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        if (a.page !== b.page) continue;
        const apart =
          a.x + a.w + 1 <= b.x ||
          b.x + b.w + 1 <= a.x ||
          a.y + a.h + 1 <= b.y ||
          b.y + b.h + 1 <= a.y;
        expect(apart, `${a.key} and ${b.key}`).toBe(true);
      }
    }
  });

  it('builds atlas pages whose frames hold the processed pixels; mirrored frames share them', () => {
    const { res } = baseRun();
    const atlas = buildAtlas([{ meta: res.meta, img: res.img! }]);
    expect(atlas.pages.map((p) => [p.group, p.w])).toEqual([['actors', 2048]]);
    const frames = atlas.frames.art_mon_test_r!;
    expect(frames).toHaveLength(res.meta.frames.length);
    const page = atlas.pages[0]!.img;
    for (const f of frames.filter((x) => !x.flipX)) {
      for (let y = 0; y < f.h; y += 7)
        for (let x = 0; x < f.w; x += 5)
          expect(getPx(page, f.px + x, f.py + y)).toBe(getPx(res.img!, f.x + x, f.y + y));
    }
    const left = frames.find((f) => f.flipX)!;
    const right = frames.find((f) => !f.flipX && f.x === left.x && f.y === left.y)!;
    expect([left.px, left.py]).toEqual([right.px, right.py]);
  });

  it('contact sheet shows source and result rows; the index links the HD-2D preview', () => {
    const { res } = baseRun();
    const sheet = contactSheet([
      { id: res.meta.id, source: baseRun().src, processed: res.img, problems: res.problems },
    ]);
    expect(sheet.w).toBeGreaterThan(res.img!.w * 3);
    expect(sheet.h).toBeGreaterThanOrEqual(res.img!.h * 3);
    const md = contactIndex(
      [{ id: 'art_mon_test_r', source: baseRun().src, processed: res.img, problems: [] }],
      '联系表',
    );
    expect(md).toContain('`art_mon_test_r`');
    expect(md).toContain('/editor.html#asset=art_mon_test_r');
  });
});

describe('body types, dark subjects, key art, back parts and noisy seams', () => {
  const doll = (height: number, baseline: number) =>
    [0, 1, 2].map(() =>
      [0, 1, 2, 3].map(() =>
        humanoidFrame(height, baseline, { body: '#c02424', head: '#9a9a9a', outline: '#401010' }),
      ),
    );

  it('an outfit strip takes the small body of the mannequin it is drawn over', () => {
    const src = makeSheet(doll(21, 43), [48, 48], { block: 5 });
    const small = processArt(
      input('art_doll_res_child_idle', 'chr_idle', src, {
        deps: ['art_doll_mannequin_hs_idle', 'art_doll_res_child_ref'],
      }),
    );
    expect(small.problems.filter((p) => !p.warning)).toEqual([]);
    expect(small.spec.body).toEqual({ target: 21, min: 20, max: 22 });
    expect(small.meta.processing.scale).not.toHaveProperty('refinedFrom');
    // Without the dependency the same strip is read as an H body and fails its height.
    const asH = processArt(input('art_doll_res_child_idle', 'chr_idle', src));
    expect(asH.problems.find((p) => p.check === 'body_height')?.code).toBe('scale');
  });

  it('a large body anchors at (24, 46)', () => {
    const res = processArt(
      input(
        'art_doll_mannequin_hb_idle',
        'chr_idle',
        makeSheet(doll(34, 45), [48, 48], { block: 5 }),
      ),
    );
    expect(res.problems.filter((p) => !p.warning)).toEqual([]);
    const f = res.meta.frames.find((m) => !m.flipX)!;
    expect([f.ax, f.ay]).toEqual([24, 46]);
    const box = contentBox(crop(res.img!, f.x, f.y, f.w, f.h))!;
    expect(box.y + box.h - 1).toBe(46);
  });

  it('a creature drawn in near-black passes the outline check', () => {
    const dark = {
      body: '#2e2434',
      shade: '#26262e',
      light: '#46464e',
      dark: '#1a1420',
      outline: '#1a1420',
    };
    const cells = MON_LAYOUT.map((row) =>
      row.map((p) => (p === null ? null : creatureFrame(48, 43, dark, p))),
    );
    const res = processArt(
      input('art_mon_test_d', 'mon_small', makeSheet(cells, [48, 48], { block: 4 })),
    );
    expect(res.problems.filter((p) => p.check === 'outline_single')).toEqual([]);
  });

  it('key art is checked on its pixel grid, before the integer upscale', () => {
    const emblem = createImg(256, 256);
    for (let y = 40; y < 216; y++)
      for (let x = 40; x < 216; x++)
        if ((x - 128) ** 2 + (y - 128) ** 2 < 80 ** 2) setPx(emblem, x, y, hexToPx('#b89a52'));
    addOutline(emblem, hexToPx('#3c2818'));
    const res = processArt(
      input('art_key_emblem_test', 'key_emblem', makeSheet([[emblem]], [256, 256], { block: 4 })),
    );
    expect([res.img!.w, res.img!.h]).toEqual([512, 512]);
    expect(res.problems.filter((p) => !p.warning)).toEqual([]);
  });

  it('a back attachment keeps its place in the body frame', () => {
    const cape = (dx: number) => {
      const f = createImg(48, 48);
      for (let y = 17; y <= 36; y++)
        for (let x = 18 + dx; x <= 30 + dx; x++) setPx(f, x, y, hexToPx('#c02424'));
      addOutline(f, hexToPx('#401010'));
      return f;
    };
    const res = processArt(
      input(
        'art_doll_back_cape',
        'doll_back',
        makeSheet(
          [
            [cape(0), cape(1), cape(0)],
            [cape(0), cape(1), cape(0)],
          ],
          [48, 48],
          { block: 4 },
        ),
      ),
    );
    const f = res.meta.frames.find((m) => !m.flipX)!;
    const box = contentBox(crop(res.img!, f.x, f.y, f.w, f.h))!;
    expect([box.y, box.y + box.h - 1]).toEqual([16, 37]);
    expect([f.ax, f.ay]).toEqual([24, 44]);
  });

  it('a gradient that jumps back at the edge of a noisy texture is a seam', () => {
    const lothar = TEMPLATES.styles.lothar_plain!.palette!;
    const greens = [lothar[0]!, lothar[1]!, lothar[2]!, lothar[3]!].map(hexToPx);
    const rnd = lcg(5);
    const t = createImg(64, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++)
        setPx(t, x, y, greens[Math.min(3, Math.floor(x / 16 + rnd() * 1.5))]!);
    const s = seamScore(t, 'x');
    expect(isSeam(s)).toBe(true);
    expect(s.wrapBand).toBeGreaterThan(s.interiorBand);
    const tiled = createImg(64, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) setPx(tiled, x, y, greens[Math.floor(rnd() * 4)]!);
    expect(isSeam(seamScore(tiled, 'x'))).toBe(false);
  });

  it('only door, dian and divine subjects (and their packs) may spend the reserved colors', () => {
    expect(reservedExempt('art_bld_sealed_ruins_wall_arch', 'sealed_ruins')).toBe(false);
    expect(reservedExempt('art_prop_lothar_plain_outdoor_bench', 'lothar_plain')).toBe(false);
    expect(reservedExempt('art_prop_sealed_ruins_door_frame', 'sealed_ruins')).toBe(true);
    expect(reservedExempt('art_tile_door_corridor_floor_01', 'door_corridor')).toBe(true);
    expect(reservedExempt('art_prop_ash_waste_dian_crystal', 'ash_waste')).toBe(true);
  });
});
