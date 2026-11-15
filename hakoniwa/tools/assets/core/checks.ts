// Step 12 (art_pipeline.md 13 and 6.6): validation of a processed sheet. The same checks run at
// import time on the fresh result and in `assets:check` on the committed files, so a processed
// file edited by hand is caught too. Each failure carries a review reason code (15.3); the text
// detector only raises a warning for the reviewer.

import { deltaE, labOf, lightness, pxToHex } from './color';
import { KEY_RAMP_COLORS, type KeySlot } from './doll_keys';
import { createImg, crop, getPx, type Img, isOpaque, setPx } from './image';
import type { ArtMeta } from './meta';
import { type Palette, RESERVED_SEMANTIC_HEX } from './palettes';
import { type Problem, problem } from './reasons';
import type { ImportSpec } from './template_specs';

/** Subjects (id words) and style packs that legitimately use the reserved semantic colors (1.4). */
const RESERVED_WORDS = new Set([
  'door',
  'doors',
  'dian',
  'divine',
  'eluen',
  'seal',
  'halo',
  'oracle',
]);
const RESERVED_STYLES = new Set(['door_corridor', 'divine_court']);

/**
 * Whether an asset may use the reserved colors freely: the door-corridor and divine-court packs,
 * or a subject word such as door or dian (the style pack's own words do not count, so a
 * sealed_ruins wall is checked like any other).
 */
export function reservedExempt(assetId: string, style: string | null | undefined): boolean {
  if (style && RESERVED_STYLES.has(style)) return true;
  const subject = style ? assetId.replace(`_${style}_`, '_') : assetId;
  return subject.split('_').some((w) => RESERVED_WORDS.has(w));
}

const RESERVED_SHARE_MAX = 0.03;

export interface CheckContext {
  spec: ImportSpec;
  /** Fixed palette of the asset (creature, style, ui, gray); null for derived or free palettes. */
  palette: Palette | null;
  assetId: string;
}

function framePx(img: Img): number[] {
  const out: number[] = [];
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! >= 128)
      out.push(
        ((img.data[i]! << 24) | (img.data[i + 1]! << 16) | (img.data[i + 2]! << 8) | 255) >>> 0,
      );
  }
  return out;
}

/**
 * Seam test of the 3x3 tiling (13 step 12). Two views of the wrap edge, each against the
 * texture's own inner boundaries (the mean of the three strongest, since a striped or bricked
 * texture has sharp inner edges too):
 * - pixel: the mean OKLab difference of neighbouring pixels across the edge (hard seams);
 * - band: the OKLab difference of the mean colors of the edge columns (or rows), which noise
 *   averages away, so a gradient that jumps back at the edge shows on a noisy texture as well.
 */
export function seamScore(
  img: Img,
  axis: 'x' | 'y',
): { wrap: number; interior: number; wrapBand: number; interiorBand: number } {
  const along = axis === 'x' ? img.h : img.w;
  const across = axis === 'x' ? img.w : img.h;
  const px = (a: number, b: number): number => (axis === 'x' ? getPx(img, a, b) : getPx(img, b, a));
  const edge = (a0: number, a1: number): number => {
    let s = 0;
    for (let k = 0; k < along; k++) s += deltaE(labOf(px(a0, k)), labOf(px(a1, k)));
    return along ? s / along : 0;
  };
  const means: [number, number, number][] = [];
  for (let a = 0; a < across; a++) {
    const m: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < along; k++) {
      const lab = labOf(px(a, k));
      m[0] += lab[0] / along;
      m[1] += lab[1] / along;
      m[2] += lab[2] / along;
    }
    means.push(m);
  }
  const top3 = (v: number[]): number => {
    const t = [...v].sort((p, q) => q - p).slice(0, 3);
    return t.length ? t.reduce((x, y) => x + y, 0) / t.length : 0;
  };
  const inner: number[] = [];
  const band: number[] = [];
  for (let a = 1; a < across; a++) {
    inner.push(edge(a - 1, a));
    band.push(deltaE(means[a - 1]!, means[a]!));
  }
  return {
    wrap: edge(across - 1, 0),
    interior: top3(inner),
    wrapBand: across > 0 ? deltaE(means[across - 1]!, means[0]!) : 0,
    interiorBand: top3(band),
  };
}

/** Whether a seam score fails: either view stands out from the texture's own boundaries. */
export function isSeam(s: ReturnType<typeof seamScore>): boolean {
  return s.wrap > 1.3 * s.interior + 0.03 || s.wrapBand > 1.5 * s.interiorBand + 0.02;
}

/** Densest 8x8 window of thin high-contrast strokes (letters and digits look like this). */
export function strokeDensity(img: Img): number {
  const stroke = new Uint8Array(img.w * img.h);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (!isOpaque(img, x, y)) continue;
      const l = lightness(getPx(img, x, y));
      const lx = isOpaque(img, x - 1, y) && isOpaque(img, x + 1, y);
      const ly = isOpaque(img, x, y - 1) && isOpaque(img, x, y + 1);
      const thinX =
        lx &&
        Math.abs(l - lightness(getPx(img, x - 1, y))) > 0.25 &&
        Math.abs(l - lightness(getPx(img, x + 1, y))) > 0.25;
      const thinY =
        ly &&
        Math.abs(l - lightness(getPx(img, x, y - 1))) > 0.25 &&
        Math.abs(l - lightness(getPx(img, x, y + 1))) > 0.25;
      if (thinX || thinY) stroke[y * img.w + x] = 1;
    }
  }
  let best = 0;
  for (let y = 0; y + 8 <= img.h; y += 4) {
    for (let x = 0; x + 8 <= img.w; x += 4) {
      let n = 0;
      for (let dy = 0; dy < 8; dy++)
        for (let dx = 0; dx < 8; dx++) n += stroke[(y + dy) * img.w + x + dx]!;
      best = Math.max(best, n / 64);
    }
  }
  return best;
}

/**
 * Outline shape of one frame: share of rim pixels darker than the fill behind them, and of
 * doubled rims. Rims in front of fills darker than OKLab L 0.22 are not counted: no palette
 * color is darker there without being pure black, so their outline may equal the fill.
 */
export function outlineStats(
  img: Img,
  minFillL = 0.22,
): { rim: number; darker: number; doubled: number } {
  const ring = (x: number, y: number): boolean =>
    isOpaque(img, x, y) &&
    (!isOpaque(img, x - 1, y) ||
      !isOpaque(img, x + 1, y) ||
      !isOpaque(img, x, y - 1) ||
      !isOpaque(img, x, y + 1));
  let rim = 0;
  let darker = 0;
  let doubled = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (!ring(x, y)) continue;
      const l = lightness(getPx(img, x, y));
      let innerL = -1;
      let innerPx = 0;
      for (const [dx, dy] of [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (isOpaque(img, nx, ny) && !ring(nx, ny)) {
          innerPx = getPx(img, nx, ny);
          innerL = lightness(innerPx);
          break;
        }
      }
      if (innerL < minFillL) continue;
      rim++;
      if (l < innerL - 0.02) darker++;
      // A second outline ring: the pixel behind the rim is an equally dark outline color.
      else if (innerPx === getPx(img, x, y) && l < 0.35) doubled++;
    }
  }
  return { rim, darker, doubled };
}

export function checkProcessed(sheet: Img, meta: ArtMeta, ctx: CheckContext): Problem[] {
  let img = sheet;
  const { spec } = ctx;
  const out: Problem[] = [];
  const [cw, ch] = spec.final ?? [img.w, img.h];
  const keyArt = spec.cls === 'key_art';
  const expectW = keyArt ? cw : spec.grid[0] * cw;
  const expectH = keyArt ? ch : spec.grid[1] * ch;
  if (img.w !== expectW || img.h !== expectH) {
    out.push(
      problem('scale', 'size', `processed size ${img.w}x${img.h}, expected ${expectW}x${expectH}`),
    );
  }
  const drawn = meta.frames.filter((f) => !f.flipX);
  const req = spec.cells.flat().filter((c) => c.need === 'req').length;
  const opt = spec.cells.flat().filter((c) => c.need === 'opt').length;
  if (drawn.length < req || drawn.length > req + opt) {
    out.push(
      problem(
        'frames',
        'frame_count',
        `${drawn.length} frames, the ${spec.grid[0]}x${spec.grid[1]} grid needs ${req}${opt ? ` to ${req + opt}` : ''}`,
      ),
    );
  }
  // Key art is processed at its pixel grid and upscaled by an integer factor: check the grid.
  let drawnFrames = drawn;
  if (spec.upscale && spec.upscale > 1 && img.w === expectW && img.h === expectH) {
    const u = spec.upscale;
    const grid = createImg(Math.floor(img.w / u), Math.floor(img.h / u));
    for (let y = 0; y < grid.h; y++)
      for (let x = 0; x < grid.w; x++) setPx(grid, x, y, getPx(img, x * u, y * u));
    img = grid;
    drawnFrames = drawn.map((f) => ({
      ...f,
      x: f.x / u,
      y: f.y / u,
      w: f.w / u,
      h: f.h / u,
      ax: f.ax === null ? null : Math.floor(f.ax / u),
      ay: f.ay === null ? null : Math.floor(f.ay / u),
    }));
  }
  // Pixel rules over the whole sheet.
  let nonBinary = 0;
  let black = 0;
  const colors = new Map<number, number>();
  let opaque = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3]!;
    if (a !== 0 && a !== 255) nonBinary++;
    if (a < 128) continue;
    opaque++;
    const px =
      ((img.data[i]! << 24) | (img.data[i + 1]! << 16) | (img.data[i + 2]! << 8) | 255) >>> 0;
    if (px >>> 8 === 0) black++;
    colors.set(px, (colors.get(px) ?? 0) + 1);
  }
  if (nonBinary > 0)
    out.push(problem('quality', 'alpha_binary', `${nonBinary} pixels are half transparent`));
  if (black > 0) out.push(problem('palette', 'pure_black', `${black} pixels are pure black`));
  const keyPx = new Set<number>();
  for (const slot of Object.keys(KEY_RAMP_COLORS) as KeySlot[])
    for (const c of KEY_RAMP_COLORS[slot]) keyPx.add(c.px);
  if (ctx.palette) {
    const allowed = new Set(ctx.palette.colors.map((c) => c.px));
    const stray = [...colors.keys()].filter(
      (px) => !allowed.has(px) && !(Object.keys(meta.slots).length > 0 && keyPx.has(px)),
    );
    if (stray.length > 0) {
      out.push(
        problem(
          'palette',
          'palette_membership',
          `${stray.length} color(s) outside the ${ctx.palette.id} palette (${stray.slice(0, 4).map(pxToHex).join(', ')})`,
        ),
      );
    }
  } else if (spec.palette === 'vfx' || spec.palette === 'two') {
    const limit = spec.palette === 'vfx' ? 6 : 2;
    if (colors.size > limit)
      out.push(
        problem(
          'palette',
          'color_cap',
          `${colors.size} colors, the ${spec.palette} ramp allows ${limit}`,
        ),
      );
  }
  const nonKey = [...colors.keys()].filter(
    (px) => !(Object.keys(meta.slots).length > 0 && keyPx.has(px)),
  ).length;
  if (spec.maxColors !== undefined && nonKey > spec.maxColors) {
    out.push(
      problem('palette', 'color_cap', `${nonKey} colors, at most ${spec.maxColors} per sheet`),
    );
  }
  if (spec.palette === 'style' && !reservedExempt(ctx.assetId, meta.style) && opaque > 0) {
    const reserved = new Set(
      RESERVED_SEMANTIC_HEX.map((h) => Number.parseInt(`${h.slice(1)}ff`, 16) >>> 0),
    );
    let n = 0;
    for (const [px, c] of colors) if (reserved.has(px)) n += c;
    if (n / opaque > RESERVED_SHARE_MAX) {
      out.push(
        problem(
          'palette',
          'reserved_share',
          `reserved semantic colors cover ${((n / opaque) * 100).toFixed(1)}% (over ${RESERVED_SHARE_MAX * 100}%)`,
        ),
      );
    }
  }
  // Per-frame rules.
  let emptyFrames = 0;
  let badAnchors = 0;
  let missingOutline = 0;
  let doubleOutline = 0;
  const brightness: number[] = [];
  for (const f of drawnFrames) {
    const frame = crop(img, f.x, f.y, f.w, f.h);
    const pixels = framePx(frame);
    if (pixels.length === 0 && !spec.fullBleed) emptyFrames++;
    if (f.ax !== null && f.ay !== null && (f.ax < 0 || f.ay < 0 || f.ax >= f.w || f.ay >= f.h))
      badAnchors++;
    if (spec.outline !== 'none' && pixels.length > 0) {
      const s = outlineStats(frame);
      if (s.rim > 0 && s.darker / s.rim < 0.6) missingOutline++;
      if (s.rim > 0 && s.doubled / s.rim > 0.5) doubleOutline++;
    }
    brightness.push(pixels.reduce((sum, px) => sum + lightness(px), 0));
  }
  if (emptyFrames > 0)
    out.push(problem('frames', 'empty_frame', `${emptyFrames} frame(s) are empty`));
  if (badAnchors > 0)
    out.push(problem('frames', 'anchor_bounds', `${badAnchors} anchor(s) lie outside their frame`));
  if (missingOutline > 0)
    out.push(
      problem(
        'quality',
        'outline_single',
        `${missingOutline} frame(s) lack a darker 1-pixel outline`,
      ),
    );
  if (doubleOutline > 0)
    out.push(
      problem('quality', 'outline_single', `${doubleOutline} frame(s) have a doubled outline`),
    );
  if (spec.fadeLastFrame && brightness.length > 1) {
    const peak = Math.max(...brightness);
    const last = brightness[brightness.length - 1]!;
    if (peak > 0 && last > 0.25 * peak) {
      out.push(
        problem(
          'frames',
          'vfx_fade',
          `last frame keeps ${((last / peak) * 100).toFixed(0)}% of the peak brightness (should fade out)`,
        ),
      );
    }
  }
  if (spec.seamless) {
    const axes: ('x' | 'y')[] = spec.seamless === 'both' ? ['x', 'y'] : ['x'];
    for (const f of drawnFrames) {
      const frame = crop(img, f.x, f.y, f.w, f.h);
      for (const axis of axes) {
        const s = seamScore(frame, axis);
        if (isSeam(s)) {
          out.push(
            problem(
              'seam',
              'seamless',
              `${f.anim}: ${axis === 'x' ? 'left and right' : 'top and bottom'} edges do not tile (edge ${s.wrap.toFixed(3)} vs ${s.interior.toFixed(3)})`,
            ),
          );
        }
      }
    }
  }
  const density = strokeDensity(img);
  if (density > 0.4) {
    out.push(
      problem(
        'text',
        'text_suspect',
        `dense thin high-contrast strokes (${(density * 100).toFixed(0)}% of an 8x8 window): check for text`,
        true,
      ),
    );
  }
  return out;
}
