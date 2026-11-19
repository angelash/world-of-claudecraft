import { afterEach, describe, expect, it } from 'vitest';
import { WorldPresenter } from '../src/client/app/world_presenter';
import { AssetResolver } from '../src/client/assets/resolver';
import { frameKey, installAssets, resetAssets } from '../src/client/assets/runtime';
import {
  castSurface,
  contentIconPixels,
  fitIconPixels,
  surfaceFrame,
} from '../src/client/assets/surface_art';
import type { AssetMeta, AssetRecord } from '../src/client/assets/types';
import { paintGround } from '../src/client/hd2d/ground';
import { STYLE_PACKS } from '../src/client/hd2d/style_packs';
import { paintWallAtlas } from '../src/client/hd2d/textures';
import { placedSprite } from '../src/client/render/decor_art';
import { buildMapContext } from '../src/client/render/map_context';
import { bakeGround } from '../src/client/render/tile_art';
import { lookFromEntity } from '../src/client/sprites/look';
import { createMatrix, getPixel, type PixelMatrix, setPixel } from '../src/client/sprites/pixels';
import type { GameView } from '../src/client/view/game_view';
import type { MapDef } from '../src/systems/world/types';

function record(id: string, template = 'tile_ground'): { record: AssetRecord; meta: AssetMeta } {
  return {
    record: { id, file: `art/${id}.png`, kind: 'art', template, status: 'approved' },
    meta: {
      id,
      template,
      style: null,
      size: [64, 64],
      cell: [64, 64],
      grid: [1, 1],
      frames: [
        {
          anim: 'main',
          dir: 'front',
          i: 0,
          x: 0,
          y: 0,
          w: 64,
          h: 64,
          ax: null,
          ay: null,
          ms: null,
          footprint: 1,
        },
      ],
      anims: {},
      directions: { drawn: ['front'], mirrored: [] },
      swatch: [],
      processing: {},
    },
  };
}

function install(entries: ReturnType<typeof record>[], sheets: Map<string, PixelMatrix>) {
  const resolver = new AssetResolver({
    records: entries.map((x) => x.record),
    meta: (r) => entries.find((x) => x.record.id === r.id)?.meta,
    aliases: { herb_alias: 'bread' },
  });
  installAssets(resolver, sheets);
  return resolver;
}

function map(kind = 'grass'): MapDef {
  return {
    id: 'test',
    name: 'Test',
    style: 'lothar_plain',
    region: 'lothar_plain',
    width: 5,
    height: 1,
    rows: ['.....'],
    legend: { '.': kind as 'grass' },
    locations: [],
    exits: [],
    spawns: [],
  };
}

function solid(color: number, width = 64, height = 64): PixelMatrix {
  const pixels = createMatrix(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) setPixel(pixels, x, y, color);
  return pixels;
}

afterEach(resetAssets);

describe('registered surface art consumers', () => {
  it('samples a full four-metre tile through both ground paths with matching coordinates', () => {
    const id = 'art_tile_lothar_plain_grass_01';
    const pixels = solid(0x102030);
    setPixel(pixels, 16, 0, 0x203040);
    setPixel(pixels, 32, 0, 0x304050);
    install([record(id)], new Map([[id, pixels]]));
    const flat = bakeGround(map());
    const hd = paintGround(map(), STYLE_PACKS.lothar_plain);
    expect(getPixel(flat, 0, 0)).toBe(0x102030);
    expect(getPixel(flat, 16, 0)).toBe(0x203040);
    expect(getPixel(flat, 32, 0)).toBe(0x304050);
    expect(getPixel(flat, 64, 0)).toBe(0x102030);
    expect(hd.rgba).toEqual(flat.rgba);
  });

  it('leaves the existing ground intact under transparent art pixels', () => {
    const baseline = bakeGround(map());
    const id = 'art_tile_lothar_plain_grass_01';
    const pixels = solid(0x112233);
    setPixel(pixels, 0, 0, 0xffffff, 0);
    install([record(id)], new Map([[id, pixels]]));
    const out = bakeGround(map());
    expect(getPixel(out, 0, 0)).toBe(getPixel(baseline, 0, 0));
    expect(getPixel(out, 1, 0)).toBe(0x112233);
    expect(out.rgba[3]).toBe(255);
  });

  it('replaces plain wall surfaces while retaining window light and the interior', () => {
    const colors = [0x111111, 0x222222, 0x333333, 0x444444] as const;
    const before = paintWallAtlas('stone', colors, 3, 0xffcc33, 1, 0x555555, 'lothar_plain');
    const id = 'art_bld_lothar_plain_wall_stone';
    install([record(id, 'bld_wall')], new Map([[id, solid(0xabcdef)]]));
    const out = paintWallAtlas('stone', colors, 3, 0xffcc33, 1, 0x555555, 'lothar_plain');
    expect(getPixel(out.color, 2, 10)).toBe(0xabcdef);
    expect(getPixel(out.color, 18, 10)).toBe(0xabcdef);
    expect(getPixel(out.color, 48, 10)).toBe(getPixel(before.color, 48, 10));
    expect(out.emissive.rgba).toEqual(before.emissive.rgba);
  });

  it('crops icon frames with alpha, accepts content aliases, and ignores undecoded/review art', () => {
    const id = 'art_ico_item_bread';
    const entry = record(id, 'ico_item');
    entry.meta.frames[0] = { ...entry.meta.frames[0]!, x: 2, y: 3, w: 2, h: 2, ax: 1, ay: 1 };
    const pixels = solid(0x777777);
    setPixel(pixels, 2, 3, 0xaabbcc, 0);
    setPixel(pixels, 3, 3, 0x123456, 128);
    install([entry], new Map([[id, pixels]]));
    const out = contentIconPixels('item', 'herb_alias');
    expect(out?.id).toBe(id);
    expect(out?.pixels.w).toBe(2);
    expect(out?.pixels.rgba[3]).toBe(0);
    expect(out?.pixels.rgba[7]).toBe(128);
    expect(out?.anchorX).toBe(1);
    install([entry], new Map());
    expect(contentIconPixels('item', 'bread')).toBeNull();
    entry.record.status = 'review';
    install([entry], new Map([[id, pixels]]));
    expect(contentIconPixels('item', 'bread')).toBeNull();
  });

  it('reinstalling decoded pixels updates crops, baked ground and the static scene cache key', () => {
    const id = 'art_tile_lothar_plain_grass_01';
    const resolver = install([record(id)], new Map([[id, solid(0x111111)]]));
    const before = buildMapContext(map());
    expect(getPixel(bakeGround(map()), 0, 0)).toBe(0x111111);
    expect(getPixel(surfaceFrame(id)!.pixels, 0, 0)).toBe(0x111111);
    installAssets(resolver, new Map([[id, solid(0x222222)]]));
    const after = buildMapContext(map());
    expect(after.key).not.toBe(before.key);
    expect(getPixel(bakeGround(map()), 0, 0)).toBe(0x222222);
    expect(getPixel(surfaceFrame(id)!.pixels, 0, 0)).toBe(0x222222);
  });

  it('the actual world presenter requests a map redraw after art reinstall without a switch change', () => {
    const view = { content: {}, flags: () => ({}) } as unknown as GameView;
    // StagePresenter creates DOM only when its mirror is shown; this test uses its normal
    // constructor and the production context/change methods without showing any stage.
    const presenter = new WorldPresenter({} as HTMLElement, view, {});
    const before = presenter.contextFor(map(), 0);
    expect(presenter.switchChange(map(), 1)).toBeNull();
    resetAssets();
    const refreshed = presenter.switchChange(map(), 2);
    expect(refreshed).not.toBeNull();
    expect(refreshed?.key).not.toBe(before.key);
    expect(presenter.switchChange(map(), 3)).toBeNull();
    presenter.dispose();
  });

  it('reinstall changes the sprite cache key even with the same look, frame and resolver', () => {
    const id = 'art_mon_test_d';
    const entry = record(id, 'mon_small');
    entry.meta.anims = { 'idle/down': { frames: [0], ms: [100], loop: true, hold: false } };
    const resolver = install([entry], new Map([[id, solid(0x111111)]]));
    const look = lookFromEntity({
      appearance: { base: 'rat', colors: [] },
      kind: 'monster',
      ref: 'test',
    });
    const before = frameKey(look, 'idle', 'down', 0);
    installAssets(resolver, new Map([[id, solid(0x222222)]]));
    expect(frameKey(look, 'idle', 'down', 0)).not.toBe(before);
  });

  it('centres icons at integer scale and preserves transparent and partial-alpha pixels', () => {
    const pixels = solid(0x112233, 2, 1);
    setPixel(pixels, 0, 0, 0, 0);
    setPixel(pixels, 1, 0, 0xabcdef, 128);
    const icon = fitIconPixels(pixels, 6);
    expect(icon.w).toBe(6);
    expect(icon.h).toBe(6);
    expect(icon.rgba[(1 * 6 + 0) * 4 + 3]).toBe(0);
    expect(icon.rgba[(1 * 6 + 3) * 4 + 3]).toBe(128);
    expect(icon.rgba[3]).toBe(0); // centred, without stretching the one-pixel height
    const smaller = fitIconPixels(solid(0x445566, 32, 32), 24);
    expect(smaller.rgba[(4 * 24 + 4) * 4 + 3]).toBe(255);
    expect(smaller.rgba[3]).toBe(0); // whole divisor gives 16x16 centred in 24x24
  });

  it('the shared scene placement reads one cropped rock variant with its own anchor', () => {
    const id = 'art_prop_ash_waste_stones';
    const entry = record(id, 'prop_small');
    entry.meta.frames = [
      { ...entry.meta.frames[0]!, x: 0, y: 0, w: 32, h: 32, ax: 7, ay: 29 },
      { ...entry.meta.frames[0]!, x: 32, y: 0, w: 32, h: 32, ax: 12, ay: 30 },
    ];
    const pixels = solid(0x121212);
    setPixel(pixels, 32, 0, 0x343434, 0);
    install([entry], new Map([[id, pixels]]));
    const placement = { id: 'r', source: 'rock' as const, kind: 'rock', variant: 1, x: 1, y: 1 };
    const out = placedSprite(placement, 'ash_waste');
    expect(out?.matrix.w).toBe(32);
    expect(out?.matrix.h).toBe(32);
    expect(out?.matrix.rgba[3]).toBe(0);
    expect(out?.anchorX).toBe(12);
    expect(out?.anchorY).toBe(30);
    expect(placedSprite(placement, 'lothar_plain')?.matrix).not.toBe(out?.matrix);
  });

  it('uses only a known school cast bitmap and follows its imported frame timing', () => {
    const id = 'art_vfx_school_fire_cast';
    const entry = record(id, 'vfx_medium');
    entry.meta.frames = [
      { ...entry.meta.frames[0]!, x: 0, y: 0, w: 32, h: 32, ms: 40 },
      { ...entry.meta.frames[0]!, x: 32, y: 0, w: 32, h: 32, ms: 80 },
    ];
    const pixels = solid(0x111111);
    setPixel(pixels, 32, 0, 0x222222);
    install([entry], new Map([[id, pixels]]));
    expect(getPixel(castSurface('fire', 39)!.pixels, 0, 0)).toBe(0x111111);
    expect(getPixel(castSurface('fire', 40)!.pixels, 0, 0)).toBe(0x222222);
    expect(getPixel(castSurface('fire', 120)!.pixels, 0, 0)).toBe(0x111111);
    expect(castSurface('physical', 40)).toBeNull();
    expect(castSurface('shadow', 40)).toBeNull(); // an uninstalled catalog asset is no effect
  });
});
