// The art import pipeline (art_pipeline.md 13), steps 2 to 10 and 12 on one source image.
// Step 1 (registration) happens before, step 11 (atlas) and 13 (contact sheet) after, over many
// assets. Pure: bytes in, image and metadata out; the CLI does the file work. Deterministic:
// the same source and the same IMPORT_VERSION give byte-identical results.

import { type FrameInput, mirrorPlan, placeFrames } from './anchor';
import { locateCells } from './cells';
import { checkProcessed } from './checks';
import { crateWoodLeaks, keySlotsFor } from './doll_keys';
import { anchoredFrameMeta, buildAnims } from './frames';
import { type Box, blit, createImg, type Img, resizeNearest } from './image';
import { keyBackground } from './keying';
import { type ArtMeta, IMPORT_VERSION } from './meta';
import { OutlinePainter, outlineFrame } from './outline';
import {
  CREATURE_PALETTE,
  grayPalette,
  medianCut,
  type Palette,
  stylePalette,
  UI_PALETTE,
} from './palettes';
import {
  chooseRatio,
  estimateBlock,
  reduceMode,
  refineForHeight,
  type ScaleChoice,
  snapOrigin,
} from './pixel_grid';
import { quantizeFrames } from './quantize';
import { type Problem, problem } from './reasons';
import {
  type ImportSpec,
  importSpecFor,
  sheetDirection,
  type TemplateLike,
} from './template_specs';

export interface ArtInput {
  id: string;
  template: string;
  templateDef: TemplateLike;
  style?: string | null;
  /** The style pack's anchor colors (templates.json styles[style].palette). */
  styleAnchors?: readonly string[] | null;
  src: Img & { colorType?: number; bitDepth?: number };
  sourceFile: string;
  sourceSha256: string;
  aigcLabel: string;
  /** Prompt dependencies (an outfit strip names its mannequin strip, which fixes the body type). */
  deps?: readonly string[];
}

export interface ArtResult {
  img: Img | null;
  meta: ArtMeta;
  problems: Problem[];
  spec: ImportSpec;
  /** The fixed palette the result was quantized to (null for derived palettes). */
  palette: Palette | null;
}

/** The fixed palette an asset is quantized to, or null when the palette is derived per image. */
export function paletteFor(
  spec: ImportSpec,
  style: string | null | undefined,
  anchors: readonly string[] | null | undefined,
): Palette | null {
  switch (spec.palette) {
    case 'creature':
      return CREATURE_PALETTE;
    case 'ui':
      return UI_PALETTE;
    case 'gray':
      return grayPalette(8);
    case 'style':
      return style && anchors && anchors.length > 0 ? stylePalette(style, anchors) : null;
    default:
      return null;
  }
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function processArt(input: ArtInput): ArtResult {
  const spec = importSpecFor(input.template, input.templateDef, input.id, input.deps ?? []);
  const problems: Problem[] = [];
  const processing: Record<string, unknown> = {};
  const baseMeta = (): ArtMeta => ({
    id: input.id,
    kind: 'art',
    template: input.template,
    style: input.style ?? null,
    importVersion: IMPORT_VERSION,
    source: {
      file: input.sourceFile,
      sha256: input.sourceSha256,
      w: input.src.w,
      h: input.src.h,
      colorType: input.src.colorType ?? 6,
      bitDepth: input.src.bitDepth ?? 8,
    },
    aigcLabel: input.aigcLabel,
    size: [0, 0],
    cell: spec.final ?? [0, 0],
    grid: spec.grid,
    palette: 'none',
    swatch: [],
    slots: {},
    frames: [],
    anims: {},
    directions: { drawn: [], mirrored: [] },
    processing,
    problems,
  });
  if (spec.cls === 'reference') {
    processing.reference = true;
    return { img: null, meta: baseMeta(), problems, spec, palette: null };
  }
  // Canvas proportion: generators may use the nearest supported size, but not another shape.
  const want = spec.canvas[0] / spec.canvas[1];
  const got = input.src.w / input.src.h;
  if (Math.abs(got / want - 1) > 0.15) {
    problems.push(
      problem(
        'frames',
        'canvas_ratio',
        `canvas ${input.src.w}x${input.src.h} is not the template's ${spec.canvas[0]}x${spec.canvas[1]} shape`,
      ),
    );
  }
  const [fw, fh] = spec.pixelGrid ?? spec.final!;
  // Step 2: key the background.
  const keyed = keyBackground(input.src, spec.keying, { checkEdges: !spec.fullBleed });
  problems.push(...keyed.problems);
  processing.keying = {
    mode: spec.keying,
    opaque: Number(keyed.opaqueFraction.toFixed(4)),
    fringeRemoved: keyed.fringeRemoved,
  };
  // Step 3: locate the cells.
  const cellRes = locateCells(keyed.img, spec.cells, { search: !spec.fullBleed });
  problems.push(...cellRes.problems);
  const cells = cellRes.cells.flat();
  // Step 4: effective pixel grid and scale.
  const block = estimateBlock(keyed.img);
  const cellW = keyed.img.w / spec.grid[0];
  const cellH = keyed.img.h / spec.grid[1];
  let choice: ScaleChoice = chooseRatio(cellW / fw, block);
  if (spec.body && !spec.fullBleed) {
    const heights = cells
      .filter((c) => c.content && spec.standing.includes(c.def.anim))
      .map((c) => c.content!.h);
    if (heights.length > 0) {
      const refined = refineForHeight(choice, median(heights), spec.body, block);
      if (refined) choice = refined;
      else {
        problems.push(
          problem(
            'scale',
            'body_height',
            `body height ${Math.round(median(heights) / choice.ratio)} px is far outside ${spec.body.min} to ${spec.body.max}`,
          ),
        );
      }
    }
  }
  processing.block = {
    size: block.size,
    phase: [block.phaseX, block.phaseY],
    score: Number(block.score.toFixed(3)),
  };
  processing.scale = {
    ratio: Number(choice.ratio.toFixed(4)),
    blockAligned: choice.blockAligned,
    ...(choice.refinedFrom ? { refinedFrom: Number(choice.refinedFrom.toFixed(4)) } : {}),
  };
  const frameInputs: FrameInput[] = [];
  for (const cell of cells) {
    if (cell.def.need === 'blank') continue;
    if (spec.fullBleed) {
      // Whole cell to the in-game size; snap to the block grid when the ratio matches it.
      const rx = cell.w / fw;
      const ry = cell.h / fh;
      const aligned =
        block.size >= 2 &&
        Math.abs(rx / block.size - 1) < 0.02 &&
        Math.abs(ry / block.size - 1) < 0.02;
      const ox = aligned ? snapOrigin(cell.x, block.phaseX, block.size) : cell.x;
      const oy = aligned ? snapOrigin(cell.y, block.phaseY, block.size) : cell.y;
      const img = reduceMode(
        keyed.img,
        ox,
        oy,
        aligned ? block.size : rx,
        aligned ? block.size : ry,
        fw,
        fh,
      );
      frameInputs.push({ col: cell.col, row: cell.row, def: cell.def, img, rel: [0, 0] });
      continue;
    }
    if (!cell.content) continue;
    const c: Box = cell.content;
    const r = choice.ratio;
    const ox = choice.blockAligned ? snapOrigin(c.x, block.phaseX, block.size) : c.x;
    const oy = choice.blockAligned ? snapOrigin(c.y, block.phaseY, block.size) : c.y;
    const w = Math.max(1, Math.ceil((c.x + c.w - ox) / r));
    const h = Math.max(1, Math.ceil((c.y + c.h - oy) / r));
    const img = reduceMode(keyed.img, ox, oy, r, r, w, h);
    const rel: [number, number] = [Math.round((ox - cell.x) / r), Math.round((oy - cell.y) / r)];
    frameInputs.push({ col: cell.col, row: cell.row, def: cell.def, img, rel });
  }
  // Size checks at game resolution.
  const contentH = frameInputs
    .filter((f) => spec.standing.includes(f.def.anim))
    .map((f) => f.img.h);
  if (spec.body && contentH.length > 0) {
    const h = median(contentH);
    processing.bodyHeight = h;
    const reported = problems.some((p) => p.check === 'body_height');
    if (!reported && (h < spec.body.min || h > spec.body.max)) {
      problems.push(
        problem(
          'scale',
          'body_height',
          `body height ${h} px, the template allows ${spec.body.min} to ${spec.body.max}`,
        ),
      );
    }
  }
  if (spec.sizeRange && frameInputs.length > 0) {
    const size = median(frameInputs.map((f) => Math.max(f.img.w, f.img.h)));
    processing.bodySize = size;
    if (size < spec.sizeRange[0] || size > spec.sizeRange[1]) {
      problems.push(
        problem(
          'scale',
          'body_size',
          `creature size ${size} px, the template allows ${spec.sizeRange[0]} to ${spec.sizeRange[1]}`,
        ),
      );
    }
  }
  // Steps 5 and 6: quantize and binarize.
  let palette = paletteFor(spec, input.style, input.styleAnchors);
  if (spec.palette === 'style' && !palette) {
    problems.push(
      problem(
        'palette',
        'style_pack',
        `no style pack palette for "${input.style ?? ''}"; quantized to the creature palette`,
      ),
    );
    palette = CREATURE_PALETTE;
  }
  let quantPalette = palette;
  if (spec.palette === 'vfx')
    quantPalette = medianCut(mergeFrames(frameInputs.map((f) => f.img)), 6, 'vfx', 0.06);
  if (spec.palette === 'two')
    quantPalette = medianCut(mergeFrames(frameInputs.map((f) => f.img)), 2, 'two');
  const keySlots = keySlotsFor(input.template, input.id);
  if (keySlots && input.template === 'chr_life_a') {
    const leaks = frameInputs.reduce((n, f) => n + crateWoodLeaks(f.img, keySlots), 0);
    processing.crateWoodLeaks = leaks;
    if (leaks > 0)
      problems.push(
        problem(
          'palette',
          'crate_wood',
          `${leaks} crate-wood pixels (#b48a58) would become recolorable leather`,
        ),
      );
  }
  const quant = quantizeFrames(
    frameInputs.map((f) => f.img),
    quantPalette,
    { dither: spec.dither, maxColors: spec.maxColors, keySlots },
  );
  processing.quantError = Number(quant.meanError.toFixed(4));
  processing.folded = quant.folded;
  if (quant.meanError > 0.07) {
    problems.push(
      problem(
        'palette',
        'quant_error',
        `mean quantization error ${quant.meanError.toFixed(3)} (over 0.07): colors far from the palette`,
      ),
    );
  }
  // Step 7: outline.
  const painter = new OutlinePainter(quantPalette?.colors ?? []);
  let stripped = 0;
  let added = 0;
  const outlined: FrameInput[] = frameInputs.map((f, i) => {
    const res = outlineFrame(quant.frames[i]!, painter, spec.outline, !!spec.big);
    stripped += res.stripped;
    added += res.added;
    return { ...f, img: res.img, rel: res.padded ? [f.rel[0] - 1, f.rel[1] - 1] : f.rel };
  });
  processing.outline = { policy: spec.outline, stripped, added };
  // Outline colors may push the sheet over its color cap: fold again (identity mapping otherwise).
  let finalFrames = outlined;
  let swatch = quant.swatch;
  let slots = quant.slots;
  if (spec.outline !== 'none' && quantPalette) {
    const again = quantizeFrames(
      outlined.map((f) => f.img),
      quantPalette,
      { maxColors: spec.maxColors, keySlots, classify: false },
    );
    finalFrames = outlined.map((f, i) => ({ ...f, img: again.frames[i]! }));
    swatch = again.swatch;
    // The outline adds each slot's darkest level: the slot map must cover it too.
    slots = again.slots;
  }
  // Steps 8 and 9: anchor, align, mirror plan.
  const sheetDir = spec.dirAxis === 'sheet' ? sheetDirection(input.id) : 'front';
  const work = spec.pixelGrid ? { ...spec, final: spec.pixelGrid } : spec;
  const placed = placeFrames(finalFrames, work);
  problems.push(...placed.problems);
  processing.jitter = Number(placed.jitter.toFixed(2));
  const directions = mirrorPlan(spec, sheetDir);
  // Compose the sheet.
  let sheet = createImg(spec.grid[0] * fw, spec.grid[1] * fh);
  for (const f of placed.frames) blit(sheet, f.cell, f.col * fw, f.row * fh);
  const frames = anchoredFrameMeta(placed.frames, [fw, fh], sheetDir, directions.mirrored);
  if (spec.pixelGrid && spec.upscale) {
    sheet = resizeNearest(sheet, sheet.w * spec.upscale, sheet.h * spec.upscale);
    for (const f of frames) {
      f.x *= spec.upscale;
      f.y *= spec.upscale;
      f.w *= spec.upscale;
      f.h *= spec.upscale;
    }
  }
  const meta = baseMeta();
  meta.size = [sheet.w, sheet.h];
  meta.cell = spec.pixelGrid && spec.upscale ? [fw * spec.upscale, fh * spec.upscale] : [fw, fh];
  meta.palette = quantPalette?.id ?? 'none';
  meta.swatch = swatch;
  meta.slots = slots;
  meta.frames = frames;
  meta.anims = buildAnims(frames, spec);
  meta.directions = directions;
  // Step 12: validation of the result.
  problems.push(
    ...checkProcessed(sheet, meta, {
      spec,
      palette: spec.palette === 'vfx' || spec.palette === 'two' ? null : palette,
      assetId: input.id,
    }),
  );
  meta.problems = dedupe(problems);
  return { img: sheet, meta, problems: meta.problems, spec, palette };
}

function dedupe(ps: Problem[]): Problem[] {
  const seen = new Set<string>();
  return ps.filter((p) => {
    const k = `${p.code}|${p.check}|${p.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function mergeFrames(frames: Img[]): Img {
  const w = frames.reduce((s, f) => s + f.w, 0);
  const h = frames.reduce((m, f) => Math.max(m, f.h), 0);
  const out = createImg(Math.max(1, w), Math.max(1, h));
  let x = 0;
  for (const f of frames) {
    blit(out, f, x, 0);
    x += f.w;
  }
  return out;
}
