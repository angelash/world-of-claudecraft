// The asset resolver (src/client/assets/; art_pipeline.md 2.1, 3.1, 3.5, 3.6, 6.4 and 6.5):
// approved processed art resolves with its frame metadata, everything else (review, rework,
// rejected, retired, unlisted, reference sheets, records without processed metadata, the
// ?art=procedural switch) keeps the procedural placeholder. Frame metadata in these tests is
// built with the import pipeline's own frame code (tools/assets/core/frames.ts), so the
// resolver reads exactly what `npm run assets:import` writes. The last block proves that
// with no art installed, or only unapproved art, the renderers draw the first-round picture.

import { afterEach, describe, expect, it } from 'vitest';
import manifestJson from '../assets/manifest.json';
import templatesJson from '../assets/prompts/templates.json';
import { assetSpriteFrame, cropMatrix, framePixels } from '../src/client/assets/frames';
import { forceProcedural, loadAssets } from '../src/client/assets/loader';
import { AssetResolver, type AssetSource, variantId } from '../src/client/assets/resolver';
import {
  buildFrame,
  frameKey,
  installAssets,
  portraitPixels,
  resetAssets,
} from '../src/client/assets/runtime';
import {
  activeArt,
  bustSource,
  dollPlan,
  portraitSource,
  spriteSource,
} from '../src/client/assets/sprite_source';
import {
  type AssetMeta,
  type AssetRecord,
  metaPathOf,
  processedPathOf,
} from '../src/client/assets/types';
import { generateFrame, spriteKey } from '../src/client/sprites/generate';
import { lookFromAppearance, lookFromEntity } from '../src/client/sprites/look';
import {
  createMatrix,
  matrixHash,
  mirrorX,
  type PixelMatrix,
  setPixel,
} from '../src/client/sprites/pixels';
import { buildContent } from '../src/content';
import type { Appearance } from '../src/systems/world/types';
import { ART_ALIASES } from '../tools/assets/core/aliases';
import { mirrorPlan, type PlacedFrame } from '../tools/assets/core/anchor';
import { anchoredFrameMeta, buildAnims } from '../tools/assets/core/frames';
import type { ManifestRecord } from '../tools/assets/core/manifest';
import * as toolMeta from '../tools/assets/core/meta';
import {
  frameCells,
  importSpecFor,
  isReference,
  sheetDirection,
  type TemplateLike,
} from '../tools/assets/core/template_specs';
import baseline from './fixtures/procedural_baseline.json';
import { entityDigest } from './procedural_digest';

const TEMPLATES = (templatesJson as unknown as { templates: Record<string, TemplateLike> })
  .templates;

/** Processed metadata for an id on a template, as the import pipeline lays it out. */
function metaFor(id: string, template: string): AssetMeta {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`no template ${template}`);
  const spec = importSpecFor(template, t, id);
  const sheetDir = spec.dirAxis === 'sheet' ? sheetDirection(id) : 'front';
  const placed = frameCells(spec).map(
    (c) =>
      ({
        ...c,
        anchor: spec.anchorPx ?? null,
        footprint: 1,
      }) as unknown as PlacedFrame,
  );
  const cell = (spec.final ?? [16, 16]) as [number, number];
  const directions = mirrorPlan(spec, sheetDir);
  const frames = anchoredFrameMeta(placed, cell, sheetDir, directions.mirrored);
  return {
    id,
    template,
    style: null,
    size: [cell[0] * spec.grid[0], cell[1] * spec.grid[1]],
    cell,
    grid: spec.grid,
    frames,
    anims: buildAnims(frames, spec),
    directions,
    swatch: [],
    processing: isReference(t) ? { reference: true } : {},
  };
}

const record = (
  id: string,
  template: string,
  status: AssetRecord['status'] = 'approved',
): AssetRecord => ({ id, kind: 'art', file: `art/test/${id}.png`, template, status });

/** An in-memory art source: records plus the metadata the import would have written. */
function source(
  recs: AssetRecord[],
  opts: { withoutMeta?: string[]; procedural?: boolean } = {},
): AssetSource {
  const metas = new Map(
    recs
      .filter((r) => r.kind === 'art' && !opts.withoutMeta?.includes(r.id))
      .map((r) => [r.id, metaFor(r.id, r.template)] as const),
  );
  return {
    records: recs,
    meta: (r) => metas.get(r.id),
    aliases: ART_ALIASES,
    procedural: opts.procedural,
  };
}

const RAT = ['d', 'r', 'u'].map((d) => record(`art_mon_dian_rat_${d}`, 'mon_small'));
const YEYU = [
  record('art_chr_yeyu_idle', 'chr_idle'),
  record('art_chr_yeyu_walk', 'chr_walk'),
  record('art_chr_yeyu_hit', 'chr_hit'),
  record('art_chr_yeyu_run', 'chr_run', 'review'),
];
const COLORS = ['#6b6359', '#4a443d', '#c9a9a0', '#2a2622'];
const ratLook = () =>
  lookFromEntity({
    appearance: { base: 'rat', colors: COLORS, scale: 0.5 },
    kind: 'monster',
    ref: 'dian_rat',
  });
const yeyuLook = (extra: Partial<Appearance> = {}) =>
  lookFromAppearance({ base: 'human', colors: COLORS, sheet: 'art_chr_yeyu', ...extra });

afterEach(() => resetAssets());

describe('asset resolver: manifest status and lookup', () => {
  const r = new AssetResolver(
    source(
      [
        ...RAT,
        record('art_mon_grey_wolf', 'mon_medium', 'review'),
        record('art_mon_edge_spider_d', 'mon_multileg', 'rework'),
        record('art_mon_burrow_worm_d', 'mon_serpentine', 'rejected'),
        record('art_mon_old_rat_d', 'mon_small', 'retired'),
        record('art_chr_yeyu_ref', 'chr_turnaround'),
        record('art_mon_raven_flock_d', 'mon_flying'),
        {
          id: 'sfx_hit',
          kind: 'audio',
          file: 'audio/sfx/sfx_hit.ogg',
          template: 'sfx_hit',
          status: 'approved',
        },
      ],
      { withoutMeta: ['art_mon_raven_flock_d'] },
    ),
  );

  it('resolves an approved id with its metadata and processed image', () => {
    const hit = r.lookup('art_mon_dian_rat_d');
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    expect(hit.meta.template).toBe('mon_small');
    expect(hit.image).toBe('processed/test/art_mon_dian_rat_d.png');
    expect(hit.meta.cell).toEqual([48, 48]);
    expect(r.size).toBe(3);
  });

  it('keeps the placeholder for every status but approved, and says why', () => {
    expect(r.lookup('art_mon_grey_wolf')).toEqual({
      ok: false,
      id: 'art_mon_grey_wolf',
      reason: 'review',
    });
    expect(r.lookup('art_mon_edge_spider_d')).toMatchObject({ ok: false, reason: 'rework' });
    expect(r.lookup('art_mon_burrow_worm_d')).toMatchObject({ ok: false, reason: 'rejected' });
    expect(r.lookup('art_mon_old_rat_d')).toMatchObject({ ok: false, reason: 'retired' });
    expect(r.lookup('art_mon_nobody_d')).toMatchObject({ ok: false, reason: 'missing' });
    expect(r.has('art_mon_grey_wolf')).toBe(false);
  });

  it('never draws reference sheets, audio, or approved art the import has not processed', () => {
    expect(r.lookup('art_chr_yeyu_ref')).toMatchObject({ ok: false, reason: 'reference' });
    expect(r.lookup('sfx_hit')).toMatchObject({ ok: false, reason: 'not_art' });
    expect(r.lookup('art_mon_raven_flock_d')).toMatchObject({ ok: false, reason: 'no_meta' });
  });

  it('forces the placeholder everywhere when asked to (?art=procedural)', () => {
    const p = new AssetResolver(source(RAT, { procedural: true }));
    expect(p.size).toBe(0);
    expect(p.lookup('art_mon_dian_rat_d')).toMatchObject({ ok: false, reason: 'procedural' });
    expect(p.frame('art_mon_dian_rat_d', 'idle', 'down', 0)).toBeNull();
  });

  it('names variants: direction sheets, numbered and named variants', () => {
    expect(variantId('art_mon_dian_rat', 'down')).toBe('art_mon_dian_rat_d');
    expect(variantId('art_mon_dian_rat', 'right')).toBe('art_mon_dian_rat_r');
    expect(variantId('art_mon_dian_rat', 'left')).toBe('art_mon_dian_rat_r');
    expect(variantId('art_mon_dian_rat', 'up')).toBe('art_mon_dian_rat_u');
    expect(variantId('art_mon_dian_dreg', 'front')).toBe('art_mon_dian_dreg');
    expect(variantId('art_tile_lothar_plain_grass', 2)).toBe('art_tile_lothar_plain_grass_02');
    expect(variantId('art_chr_faceless', 'crowned')).toBe('art_chr_faceless_crowned');
    expect(r.lookup('art_mon_dian_rat', 'up')).toMatchObject({
      ok: true,
      id: 'art_mon_dian_rat_u',
    });
    expect(r.lookup('art_mon_grey_wolf', 'down')).toMatchObject({ ok: false, reason: 'missing' });
    expect(r.first(['art_mon_grey_wolf', 'art_mon_dian_rat_d'])).toMatchObject({ ok: true });
    expect(r.first(['art_mon_grey_wolf', 'art_mon_x'])).toMatchObject({ reason: 'review' });
  });

  it('maps alias subjects to the art they share (tools/assets/core/aliases.ts)', () => {
    expect(r.subject('dian_wolf')).toBe('grey_wolf');
    expect(r.subject('dian_boar')).toBe('forest_boar');
    expect(r.subject('dian_rat')).toBe('dian_rat');
  });
});

describe('asset resolver: frames, mirroring and anchors', () => {
  const r = new AssetResolver(source([...RAT, ...YEYU]));

  it('reads frames by animation, direction and number, holding the last frame', () => {
    const f = r.frame('art_mon_dian_rat_d', 'move', 'down', 2);
    expect(f).toMatchObject({ flipX: false, ax: 24, ay: 44 });
    expect(f?.frame).toMatchObject({ anim: 'move', dir: 'down', i: 2, x: 96, y: 48, w: 48, h: 48 });
    const last = r.frame('art_mon_dian_rat_d', 'death', 'down', 99);
    expect(last?.frame.i).toBe(3);
    expect(r.frame('art_mon_dian_rat_d', 'fly', 'down', 0)).toBeNull();
    expect(r.frameCount('art_mon_dian_rat_d', 'move', 'down')).toBe(6);
  });

  it('draws left-facing frames as the right-facing rectangle flipped, anchor mirrored', () => {
    const right = r.frame('art_mon_dian_rat_r', 'idle', 'right', 1);
    const left = r.frame('art_mon_dian_rat_r', 'idle', 'left', 1);
    expect(right?.flipX).toBe(false);
    expect(left?.flipX).toBe(true);
    expect([left?.frame.x, left?.frame.y]).toEqual([right?.frame.x, right?.frame.y]);
    expect(left?.ax).toBe(48 - 1 - (right?.ax ?? 0));
    // strips: the import records mirrored left rows, read the same way
    const sl = r.frame('art_chr_yeyu_walk', 'walk', 'left', 3);
    const sr = r.frame('art_chr_yeyu_walk', 'walk', 'right', 3);
    expect(sl?.flipX).toBe(true);
    expect(sl?.frame.y).toBe(sr?.frame.y);
  });

  it('mirrors a right-facing frame when the metadata lists no left frame', () => {
    const meta = metaFor('art_mon_dian_rat_r', 'mon_small');
    meta.frames = meta.frames.filter((f) => f.dir !== 'left');
    for (const k of Object.keys(meta.anims)) if (k.endsWith('/left')) delete meta.anims[k];
    const rr = new AssetResolver({
      records: [RAT[1] as AssetRecord],
      meta: () => meta,
    });
    const left = rr.frame('art_mon_dian_rat_r', 'attack', 'left', 0);
    expect(left?.flipX).toBe(true);
    expect(left?.ax).toBe(48 - 1 - 24);
  });

  it('cuts a frame out of the decoded sheet, mirrored when flipped', () => {
    const sheet = createMatrix(6 * 48, 4 * 48);
    // a two-pixel body standing on the anchor of the second idle frame, right of centre
    setPixel(sheet, 48 + 30, 40, 0x336699);
    setPixel(sheet, 48 + 30, 44, 0x336699);
    const f = r.frame('art_mon_dian_rat_r', 'idle', 'right', 1);
    const l = r.frame('art_mon_dian_rat_r', 'idle', 'left', 1);
    if (!f || !l) throw new Error('frames');
    const px = framePixels(sheet, f);
    expect(matrixHash(px)).toBe(matrixHash(cropMatrix(sheet, 48, 0, 48, 48)));
    expect(matrixHash(framePixels(sheet, l))).toBe(matrixHash(mirrorX(px)));
    const look = ratLook();
    const sf = assetSpriteFrame(sheet, f, look, 'idle', 1);
    expect([sf.anchorX, sf.anchorY, sf.height, sf.lift]).toEqual([24, 44, 4, 0]);
    expect(assetSpriteFrame(sheet, l, look, 'idle', 1).anchorX).toBe(23);
    expect(sf.glow).toBeUndefined();
  });

  it('keeps the placeholder effects on art: translucency, death fade, hit flash, glow', () => {
    const sheet = createMatrix(6 * 48, 4 * 48);
    for (let y = 30; y <= 44; y++)
      for (let x = 0; x < sheet.w; x += 48) setPixel(sheet, x + 24, y, 0x406080);
    const f = r.frame('art_mon_dian_rat_d', 'idle', 'down', 0);
    if (!f) throw new Error('frame');
    const alphaOf = (m: PixelMatrix) => m.rgba[(44 * m.w + 24) * 4 + 3];
    const rgbOf = (m: PixelMatrix) => [
      ...m.rgba.slice((44 * m.w + 24) * 4, (44 * m.w + 24) * 4 + 3),
    ];
    const spirit = lookFromEntity({
      appearance: { base: 'spirit', colors: COLORS },
      kind: 'monster',
      ref: 's',
    });
    const slime = lookFromEntity({
      appearance: { base: 'slime', colors: COLORS },
      kind: 'monster',
      ref: 's',
    });
    expect(alphaOf(assetSpriteFrame(sheet, f, ratLook(), 'idle', 0).matrix)).toBe(255);
    expect(alphaOf(assetSpriteFrame(sheet, f, spirit, 'idle', 0).matrix)).toBe(215);
    expect(alphaOf(assetSpriteFrame(sheet, f, slime, 'idle', 0).matrix)).toBe(235);
    expect(alphaOf(assetSpriteFrame(sheet, f, spirit, 'death', 3).matrix)).toBe(
      Math.round(215 * (1 - 3 * 0.22)),
    );
    const hit = assetSpriteFrame(sheet, f, ratLook(), 'hit', 0).matrix;
    const block = assetSpriteFrame(sheet, f, ratLook(), 'block', 0).matrix;
    expect(rgbOf(block)).toEqual([0x40, 0x60, 0x80]);
    expect(rgbOf(hit)).toEqual([0x40, 0x60, 0x80].map((v) => Math.round(v + (255 - v) * 0.55)));
    expect(assetSpriteFrame(sheet, f, spirit, 'idle', 0).glow?.radius).toBe(16);
    // the decoded sheet itself is never changed
    expect(sheet.rgba[(44 * sheet.w + 24) * 4 + 3]).toBe(255);
  });
});

describe('sprite source: sheet, then doll, then placeholder', () => {
  it('stays procedural without art or without references, at no cost', () => {
    const look = ratLook();
    expect(spriteSource(AssetResolver.empty(), look, 'idle', 'down', 0)).toEqual({
      kind: 'procedural',
      reason: 'no_art',
    });
    const r = new AssetResolver(source(RAT));
    const villager = lookFromAppearance({ base: 'human', colors: COLORS });
    expect(spriteSource(r, villager, 'idle', 'down', 0)).toMatchObject({ reason: 'no_reference' });
  });

  it('takes the direction sheets of a creature by its content id, mirroring the left', () => {
    const r = new AssetResolver(source(RAT));
    const look = ratLook();
    const down = spriteSource(r, look, 'walk', 'down', 1);
    expect(down.kind).toBe('sheet');
    if (down.kind !== 'sheet') return;
    expect(down.frame.assetId).toBe('art_mon_dian_rat_d');
    expect(down.frame.frame.anim).toBe('move');
    const left = spriteSource(r, look, 'attack', 'left', 2);
    expect(left.kind === 'sheet' && left.frame.assetId).toBe('art_mon_dian_rat_r');
    expect(left.kind === 'sheet' && left.frame.flipX).toBe(true);
    const up = spriteSource(r, look, 'death', 'up', 3);
    expect(
      up.kind === 'sheet' && [up.frame.assetId, up.frame.frame.anim, up.frame.frame.i],
    ).toEqual(['art_mon_dian_rat_u', 'death', 3]);
    // poses without a creature row play the idle row
    const cast = spriteSource(r, look, 'cast', 'down', 0);
    expect(cast.kind === 'sheet' && cast.frame.frame.anim).toBe('idle');
  });

  it('needs every direction sheet approved before a creature switches to art', () => {
    const partial = new AssetResolver(
      source([
        RAT[0] as AssetRecord,
        RAT[1] as AssetRecord,
        record('art_mon_dian_rat_u', 'mon_small', 'review'),
      ]),
    );
    expect(spriteSource(partial, ratLook(), 'idle', 'down', 0)).toMatchObject({
      kind: 'procedural',
      reason: 'not_approved',
    });
  });

  it('shows the lone _d sheet of a creature without a facing in every direction, unmirrored', () => {
    const r = new AssetResolver(source([record('art_mon_dian_dreg_d', 'mon_amorphous')]));
    const dreg = lookFromEntity({
      appearance: { base: 'slime', colors: COLORS },
      kind: 'monster',
      ref: 'dian_dreg',
    });
    for (const dir of ['down', 'right', 'up', 'left'] as const) {
      const s = spriteSource(r, dreg, 'walk', dir, 2);
      expect(
        s.kind === 'sheet' && [s.frame.assetId, s.frame.frame.dir, s.frame.flipX],
        dir,
      ).toEqual(['art_mon_dian_dreg_d', 'down', false]);
    }
    // a creature whose other direction sheets are listed but not approved waits for them
    const waiting = new AssetResolver(
      source([
        record('art_mon_dian_dreg_d', 'mon_amorphous'),
        record('art_mon_dian_dreg_r', 'mon_amorphous', 'review'),
      ]),
    );
    expect(spriteSource(waiting, dreg, 'idle', 'down', 0).kind).toBe('procedural');
  });

  it('keeps an alias subject on the placeholder until the swatch recolour exists', () => {
    const r = new AssetResolver(
      source(['d', 'r', 'u'].map((d) => record(`art_mon_grey_wolf_${d}`, 'mon_medium'))),
    );
    const wolf = (ref: string) =>
      lookFromEntity({ appearance: { base: 'wolf', colors: COLORS }, kind: 'monster', ref });
    expect(spriteSource(r, wolf('dian_wolf'), 'walk', 'up', 0)).toEqual({
      kind: 'procedural',
      reason: 'alias_recolour',
    });
    const grey = spriteSource(r, wolf('grey_wolf'), 'walk', 'up', 0);
    expect(grey.kind === 'sheet' && grey.frame.assetId).toBe('art_mon_grey_wolf_u');
  });

  it('plays the six-frame idle and eight-frame attacks of a boss sheet', () => {
    const r = new AssetResolver(
      source(['d', 'r', 'u'].map((d) => record(`art_boss_rat_king_${d}`, 'boss_sheet'))),
    );
    const king = lookFromEntity({
      appearance: { base: 'rat', colors: COLORS, scale: 1.9 },
      kind: 'monster',
      ref: 'rat_king',
    });
    const at = (anim: Parameters<typeof spriteSource>[2], f: number) => {
      const s = spriteSource(r, king, anim, 'right', f);
      return s.kind === 'sheet' ? [s.frame.assetId, s.frame.frame.anim, s.frame.frame.i] : null;
    };
    expect(at('attack', 0)).toEqual(['art_boss_rat_king_r', 'attack_a', 0]);
    expect(at('attack', 3)).toEqual(['art_boss_rat_king_r', 'attack_a', 7]);
    expect(at('cast_release', 1)).toEqual(['art_boss_rat_king_r', 'special', 2]);
    expect(at('death', 3)).toEqual(['art_boss_rat_king_r', 'death', 5]);
    expect(at('idle', 2)).toEqual(['art_boss_rat_king_r', 'idle', 2]);
  });

  it('plays the strips of a main character, borrowing approved strips for the rest', () => {
    const r = new AssetResolver(source(YEYU));
    const look = yeyuLook();
    const walk = spriteSource(r, look, 'walk', 'right', 4);
    expect(
      walk.kind === 'sheet' && [walk.frame.assetId, walk.frame.frame.anim, walk.frame.frame.i],
    ).toEqual(['art_chr_yeyu_walk', 'walk', 4]);
    // the run strip is still in review: run walks instead
    const run = spriteSource(r, look, 'run', 'down', 5);
    expect(run.kind === 'sheet' && run.frame.assetId).toBe('art_chr_yeyu_walk');
    // block reads the hit strip's block row; melee has no strip and idles
    const block = spriteSource(r, look, 'block', 'up', 1);
    expect(block.kind === 'sheet' && [block.frame.assetId, block.frame.frame.anim]).toEqual([
      'art_chr_yeyu_hit',
      'block',
    ]);
    const melee = spriteSource(r, look, 'attack', 'down', 2);
    expect(melee.kind === 'sheet' && melee.frame.assetId).toBe('art_chr_yeyu_idle');
    // an emote turns to the camera: its front-only frames play whatever the facing
    const withEmote = new AssetResolver(
      source([...YEYU, record('art_chr_yeyu_emote', 'chr_emote')]),
    );
    const wave = spriteSource(withEmote, look, 'wave', 'up', 1);
    expect(
      wave.kind === 'sheet' && [wave.frame.assetId, wave.frame.frame.anim, wave.frame.frame.dir],
    ).toEqual(['art_chr_yeyu_emote', 'wave', 'down']);
    // without an approved idle strip the sheet does not count at all
    const noIdle = new AssetResolver(source(YEYU.filter((x) => !x.id.endsWith('_idle'))));
    expect(spriteSource(noIdle, look, 'walk', 'down', 0).kind).toBe('procedural');
  });

  it('switches to the sheet of a state variant while its condition holds', () => {
    const r = new AssetResolver(
      source([...YEYU, record('art_chr_luchen_cloakless_idle', 'chr_idle')]),
    );
    const look = yeyuLook({
      variants: { 'act >= act5': { sheet: 'art_chr_luchen_cloakless', portrait: 'art_por_x' } },
    });
    expect(activeArt(look.art, 'act >= act5')?.sheet).toBe('art_chr_luchen_cloakless');
    expect(activeArt(look.art, 'unknown')?.sheet).toBe('art_chr_yeyu');
    const v = spriteSource(r, look, 'idle', 'down', 0, 'act >= act5');
    expect(v.kind === 'sheet' && v.frame.assetId).toBe('art_chr_luchen_cloakless_idle');
    const base = spriteSource(r, look, 'idle', 'down', 0);
    expect(base.kind === 'sheet' && base.frame.assetId).toBe('art_chr_yeyu_idle');
  });

  it('plans paper-doll layers but keeps the placeholder until the compositor exists', () => {
    const r = new AssetResolver(
      source([
        record('art_doll_gear_garb_idle', 'chr_idle'),
        record('art_doll_head_base_h', 'doll_head'),
        record('art_doll_held_dagger_low', 'doll_held'),
        record('art_doll_back_cape_short', 'doll_back', 'review'),
      ]),
    );
    const recipe = {
      body: 'h' as const,
      outfit: 'art_doll_gear_garb',
      head: 'art_doll_head_base_h',
      mainHand: 'art_doll_held_dagger_low',
    };
    const plan = dollPlan(r, recipe, 'idle', 'left', 1);
    expect(plan.ready).toBe(true);
    expect(plan.layers.map((l) => [l.layer, l.assetId])).toEqual([
      ['outfit', 'art_doll_gear_garb_idle'],
      ['head', 'art_doll_head_base_h'],
      ['mainHand', 'art_doll_held_dagger_low'],
    ]);
    expect(plan.layers[0]?.frame?.flipX).toBe(true);
    // the head part draws a real left column, never a mirror (3.5), with its back row
    expect(plan.layers[1]?.frame).toMatchObject({
      flipX: false,
      frame: { dir: 'left', anim: 'front' },
    });
    expect(plan.layers[1]?.back).toMatchObject({
      flipX: false,
      frame: { dir: 'left', anim: 'back' },
    });
    expect(plan.layers[2]?.back).toBeUndefined();
    expect(
      dollPlan(r, { ...recipe, back: 'art_doll_back_cape_short' }, 'idle', 'down', 0).ready,
    ).toBe(false);
    const look = lookFromAppearance({ base: 'human', colors: COLORS, doll: recipe });
    expect(spriteSource(r, look, 'idle', 'down', 0)).toMatchObject({
      kind: 'procedural',
      reason: 'doll_compositor',
    });
  });
});

describe('portraits and busts', () => {
  const r = new AssetResolver(
    source([
      record('art_por_oola', 'por_npc'),
      record('art_bust_yeyu', 'bust_base'),
      record('art_bust_yeyu_expr', 'bust_expr'),
      record('art_por_shiya', 'por_main', 'rework'),
    ]),
  );

  it('picks the expression cell, the neutral one when the sheet lacks it, else the crop', () => {
    const oola = lookFromAppearance({ base: 'human', colors: COLORS, portrait: 'art_por_oola' });
    const angry = portraitSource(r, oola, 'angry');
    expect(angry.kind === 'portrait' && angry.frame.frame.anim).toBe('angry');
    const grin = portraitSource(r, oola, 'grin');
    expect(grin.kind === 'portrait' && grin.frame.frame.anim).toBe('neutral');
    const shiya = lookFromAppearance({ base: 'human', colors: COLORS, portrait: 'art_por_shiya' });
    expect(portraitSource(r, shiya)).toEqual({ kind: 'crop', reason: 'not_approved' });
    expect(portraitSource(r, lookFromAppearance({ base: 'human', colors: COLORS })).kind).toBe(
      'crop',
    );
  });

  it('shows the bust with its expression overlay, else the portrait, else the crop', () => {
    const yeyu = lookFromAppearance({
      base: 'human',
      colors: COLORS,
      bust: 'art_bust_yeyu',
      portrait: 'art_por_oola',
    });
    const b = bustSource(r, yeyu, 'smile');
    expect(b.kind).toBe('bust');
    if (b.kind === 'bust') {
      expect(b.base.frame.anim).toBe('main');
      expect(b.expression?.frame.anim).toBe('smile');
    }
    const neutral = bustSource(r, yeyu);
    expect(neutral.kind === 'bust' && neutral.expression).toBeNull();
    const noBust = lookFromAppearance({ base: 'human', colors: COLORS, portrait: 'art_por_oola' });
    expect(bustSource(r, noBust, 'happy').kind).toBe('portrait');
    expect(bustSource(r, lookFromAppearance({ base: 'human', colors: COLORS })).kind).toBe('crop');
  });
});

describe('runtime: what the renderers draw', () => {
  const sheetFor = (id: string): PixelMatrix => {
    const m = createMatrix(6 * 48, 4 * 48);
    const tint = id.endsWith('_d') ? 0x884422 : id.endsWith('_r') ? 0x228844 : 0x224488;
    for (let y = 30; y <= 44; y++) for (let x = 0; x < m.w; x += 48) setPixel(m, x + 24, y, tint);
    return m;
  };

  it('draws approved, decoded art and the placeholder for everything else', () => {
    const r = new AssetResolver(source(RAT));
    installAssets(r, { get: (id) => (r.has(id) ? sheetFor(id) : undefined) });
    const rat = ratLook();
    const key = frameKey(rat, 'idle', 'down', 0);
    expect(key).toMatch(/^art:art_mon_dian_rat_d#0:255:0@/);
    const f = buildFrame(rat, 'idle', 'down', 0);
    expect(f.matrix.w).toBe(48);
    expect(f.height).toBe(14);
    expect(frameKey(rat, 'idle', 'left', 0)).toMatch(/^art:art_mon_dian_rat_r#\d+m:255:0@/);
    // a hit flashes and a block does not: the same art frame, two cache entries
    expect(frameKey(rat, 'hit', 'down', 0)).not.toBe(frameKey(rat, 'block', 'down', 0));
    // a villager without art keeps the procedural key and pixels
    const villager = lookFromAppearance({ base: 'human', colors: COLORS });
    expect(frameKey(villager, 'walk', 'right', 2)).toBe(spriteKey(villager, 'walk', 'right', 2));
    expect(matrixHash(buildFrame(villager, 'walk', 'right', 2).matrix)).toBe(
      matrixHash(generateFrame(villager, 'walk', 'right', 2).matrix),
    );
    // approved but not decoded (the image failed): the placeholder
    installAssets(r, { get: () => undefined });
    expect(frameKey(rat, 'idle', 'down', 0)).toBe(spriteKey(rat, 'idle', 'down', 0));
    resetAssets();
    expect(frameKey(rat, 'idle', 'down', 0)).toBe(spriteKey(rat, 'idle', 'down', 0));
  });

  it('serves portrait pixels only for approved, decoded portraits', () => {
    const r = new AssetResolver(source([record('art_por_oola', 'por_npc')]));
    const sheet = createMatrix(128, 128);
    setPixel(sheet, 70, 10, 0xaa5533);
    installAssets(r, { get: () => sheet });
    const oola = lookFromAppearance({ base: 'human', colors: COLORS, portrait: 'art_por_oola' });
    const px = portraitPixels(oola, 'happy');
    expect(px && [px.w, px.h]).toEqual([64, 64]);
    expect(px && matrixHash(px)).toBe(matrixHash(cropMatrix(sheet, 64, 0, 64, 64)));
    expect(portraitPixels(lookFromAppearance({ base: 'human', colors: COLORS }))).toBeNull();
  });
});

describe('runtime shapes match the import pipeline', () => {
  it('reads what the tools write: records, metadata and processed paths', () => {
    // Compile-time pins: a tool manifest record and a tool metadata file fit the client shapes.
    const asRecord = (m: ManifestRecord): AssetRecord => m;
    const asMeta = (m: toolMeta.ArtMeta): AssetMeta => m;
    expect(typeof asRecord).toBe('function');
    expect(typeof asMeta).toBe('function');
    for (const file of ['art/monsters/art_mon_dian_rat_d.png', 'art/icons/items/art_ico_x.png']) {
      expect(processedPathOf(file)).toBe(toolMeta.processedPathOf(file));
      expect(metaPathOf(file)).toBe(toolMeta.metaPathOf(file));
    }
  });
});

describe('no art: the first-round picture', () => {
  interface BaselineEntity {
    id: string;
    kind: string;
    appearance: Appearance;
    look: string;
    frames: string;
    count: number;
  }
  const entities = (baseline as unknown as { entities: BaselineEntity[] }).entities;
  const monsters = new Map(buildContent().monsters.map((m) => [m.id, m]));
  /** The fixture's inputs with today's monster bases (the body aliases of this package). */
  const today = (e: BaselineEntity): { app: Appearance; ref?: string } => {
    if (!e.id.startsWith('monster:')) return { app: e.appearance };
    const id = e.id.slice('monster:'.length);
    const base = monsters.get(id)?.appearance.base ?? e.appearance.base;
    return { app: { ...e.appearance, base }, ref: id };
  };

  it('pins a fixed set of entities: every monster and companion, personas and archetypes', () => {
    expect(entities.length).toBeGreaterThan(100);
    expect(entities.filter((e) => e.id.startsWith('monster:')).length).toBe(41);
    expect(entities.every((e) => e.count > 0)).toBe(true);
  });

  it('draws every entity exactly as before PK-M0-10 with no art installed', () => {
    resetAssets();
    for (const e of entities) {
      const { app, ref } = today(e);
      expect(entityDigest(app, e.kind, ref), e.id).toEqual({
        look: e.look,
        frames: e.frames,
        count: e.count,
      });
    }
  });

  it('still draws it when the manifest only holds unapproved art for those subjects', () => {
    const recs: AssetRecord[] = [];
    const statuses = ['review', 'rework', 'rejected', 'retired'] as const;
    let i = 0;
    for (const id of monsters.keys()) {
      const status = statuses[i++ % statuses.length] ?? 'review';
      for (const d of ['d', 'r', 'u'])
        recs.push(record(`art_mon_${id}_${d}`, 'mon_medium', status));
      recs.push(record(`art_boss_${id}_d`, 'boss_sheet', status));
    }
    // one approved, unrelated asset so the resolver is not empty and every look is resolved
    recs.push(record('art_ico_unrelated', 'ico_item'));
    const r = new AssetResolver(source(recs));
    expect(r.size).toBe(1);
    installAssets(r, { get: () => createMatrix(32, 32) });
    for (const e of entities.filter((x) => x.id.startsWith('monster:'))) {
      const { app, ref } = today(e);
      expect(entityDigest(app, e.kind, ref), e.id).toEqual({
        look: e.look,
        frames: e.frames,
        count: e.count,
      });
    }
  });
});

describe('loader: manifest, processed files and decoding', () => {
  /** A fake dev server over in-memory files under /assets/. */
  const serve = (files: Record<string, unknown>) => async (url: string) => {
    if (!(url in files)) throw new Error(`404 ${url}`);
    return files[url];
  };
  const fresh = (id: string, template: string, sha = 'a'.repeat(64)) => ({
    ...metaFor(id, template),
    importVersion: toolMeta.IMPORT_VERSION,
    source: { sha256: sha },
  });
  const rec = (
    id: string,
    template: string,
    status: AssetRecord['status'],
    sha = 'a'.repeat(64),
  ) => ({
    ...record(id, template, status),
    sha256: sha,
  });

  it('honours ?art=procedural in development builds only', () => {
    expect(forceProcedural('?art=procedural', true)).toBe(true);
    expect(forceProcedural('?art=procedural', false)).toBe(false);
    expect(forceProcedural('?art=atlas&x=1', true)).toBe(false);
  });

  it('installs nothing from the real, empty manifest, or when the manifest is missing', async () => {
    expect(manifestJson).toEqual([]);
    const decoded: string[] = [];
    const decode = async (u: string) => {
      decoded.push(u);
      return createMatrix(1, 1);
    };
    const empty = await loadAssets({
      fetchJson: serve({ '/assets/manifest.json': manifestJson }),
      decode,
    });
    expect(empty.resolver.size).toBe(0);
    const missing = await loadAssets({ fetchJson: serve({}), decode });
    expect(missing.resolver.size).toBe(0);
    expect(decoded).toEqual([]);
  });

  it('loads approved, fresh results only and decodes their processed images', async () => {
    const files: Record<string, unknown> = {
      '/assets/manifest.json': [
        rec('art_mon_dian_rat_d', 'mon_small', 'approved'),
        rec('art_mon_dian_rat_r', 'mon_small', 'approved', 'b'.repeat(64)),
        rec('art_mon_dian_rat_u', 'mon_small', 'review'),
        rec('art_mon_old_d', 'mon_small', 'approved'),
        rec('art_mon_broken_d', 'mon_small', 'approved'),
      ],
      '/assets/processed/test/art_mon_dian_rat_d.json': fresh('art_mon_dian_rat_d', 'mon_small'),
      // made from another source file than the manifest records: stale
      '/assets/processed/test/art_mon_dian_rat_r.json': fresh('art_mon_dian_rat_r', 'mon_small'),
      '/assets/processed/test/art_mon_dian_rat_u.json': fresh('art_mon_dian_rat_u', 'mon_small'),
      // made by an older import: stale
      '/assets/processed/test/art_mon_old_d.json': {
        ...fresh('art_mon_old_d', 'mon_small'),
        importVersion: '0.0.1',
      },
      '/assets/processed/test/art_mon_broken_d.json': fresh('art_mon_broken_d', 'mon_small'),
    };
    const decoded: string[] = [];
    const { resolver, pixels } = await loadAssets({
      fetchJson: serve(files),
      decode: async (u) => {
        decoded.push(u);
        if (u.includes('broken')) throw new Error('bad png');
        return createMatrix(288, 192);
      },
    });
    expect(
      resolver
        .approved()
        .map((h) => h.id)
        .sort(),
    ).toEqual(['art_mon_broken_d', 'art_mon_dian_rat_d']);
    expect(resolver.lookup('art_mon_dian_rat_r')).toMatchObject({ ok: false, reason: 'no_meta' });
    expect(resolver.lookup('art_mon_dian_rat_u')).toMatchObject({ ok: false, reason: 'review' });
    expect(resolver.lookup('art_mon_old_d')).toMatchObject({ ok: false, reason: 'no_meta' });
    expect(decoded.sort()).toEqual([
      '/assets/processed/test/art_mon_broken_d.png',
      '/assets/processed/test/art_mon_dian_rat_d.png',
    ]);
    expect(pixels.get('art_mon_dian_rat_d')?.w).toBe(288);
    expect(pixels.get('art_mon_broken_d')).toBeUndefined();
    const forced = await loadAssets({
      fetchJson: serve(files),
      procedural: true,
      decode: async () => undefined,
    });
    expect(forced.resolver.size).toBe(0);
  });
});
