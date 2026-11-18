// PK-M1-24 HD-2D presentation completion, the render side: the one light model shared by the
// light map and the dynamic lights, window light sampled like the colour map, the hip roof's
// texel density, pixel ground marks (shadow, rings by relation, the threat ring), the far sky
// (packs, layers by tier, pitch fade, parallax, seamless placeholder strips), the combat marks
// and the fairness list (what every tier keeps, opacity caps, paint order), the projected
// facing of the four display directions, and the frame signature of the new scene fields.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { roofMesh } from '../src/client/hd2d/geometry';
import {
  inRingGap,
  markPx,
  markSize,
  RING_COLORS,
  ringMark,
  shadowMark,
} from '../src/client/hd2d/ground_marks';
import {
  LIGHT_STEPS,
  LIGHTMAP_PX,
  LIGHTMAP_SCALE,
  lightAtPixel,
  lightColorLinear,
  paintLightmap,
  srgbToLinear,
  steppedFalloff,
} from '../src/client/hd2d/lightmap';
import { createSharedUniforms, litMaterial } from '../src/client/hd2d/materials';
import { QUALITY_TIER_IDS, QUALITY_TIERS } from '../src/client/hd2d/quality';
import { LIGHT_DECL } from '../src/client/hd2d/shaders';
import {
  celestial,
  horizonFraction,
  layerOffset,
  paintSkyLayer,
  SKY_BAND_H,
  SKY_BAND_W,
  skyLayers,
  skyPackFor,
  skyPixelScale,
  skyVisibility,
} from '../src/client/hd2d/sky';
import {
  clampPitch,
  PITCH_MAX,
  PITCH_MIN,
  projectToScreen,
  screenFacing,
  viewBasis,
} from '../src/client/hd2d/view';
import {
  castBarBox,
  cellOutline,
  edgeArrows,
  type GroundWarning,
  insideWarning,
  NO_MARKS,
  showsCastBar,
  THREAT_NAME_COLOR,
  wantsEdgeArrow,
  warningPolygons,
} from '../src/client/render/combat_marks';
import {
  FLASH_ALPHA_CAP,
  FOG_ALPHA_CAP,
  flashAlpha,
  gradeHaze,
  KEPT_EVERY_TIER,
  knobProblems,
  PARTICLE_ALPHA_CAP,
  particleAlpha,
} from '../src/client/render/fairness';
import { frameSignals } from '../src/client/render/frame_signals';
import { paintOverlays } from '../src/client/render/overlay_painter';
import { buildScene, type Scene, type SceneInput } from '../src/client/render/scene';
import { dirFromFacing } from '../src/client/sprites/anim_spec';
import { getAlpha } from '../src/client/sprites/pixels';
import { calendarAt, tickAtDay } from '../src/core/time';
import type { MapDef } from '../src/systems/world/types';

const SRC = join(__dirname, '..', 'src', 'client');

// ---------------------------------------------------------------------------
// one light model

/** The shader's dynamic-light path (shaders.ts hkArtificial) written out in JS. */
function shaderDynamic(
  l: { x: number; y: number; radius: number; color: number; intensity: number },
  px: number,
  py: number,
): [number, number, number] {
  const cx = (px + 0.5) / LIGHTMAP_PX;
  const cy = (py + 0.5) / LIGHTMAP_PX;
  const dist = Math.hypot(cx - l.x, cy - l.y);
  if (l.radius <= 0 || dist >= l.radius) return [0, 0, 0];
  const bayer =
    [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(py % 4) * 4 + (px % 4)] ?? 0;
  const t = (1 - dist / l.radius) * 3 + bayer / 16 - 0.5;
  const s = Math.max(0, Math.min(3, Math.floor(t + 0.5)));
  const k = (LIGHT_STEPS[s] as number) * l.intensity;
  const [r, g, b] = lightColorLinear(l.color);
  return [r * k, g * k, b * k];
}

describe('the light map and the dynamic lights share one light model', () => {
  const lamp = { id: 'l', x: 5.3, y: 4.1, radius: 3.2, color: 0xffc878, intensity: 0.9 };

  it('lights every light-map pixel exactly as the shader lights a dynamic one', () => {
    for (let py = 0; py < 40; py++)
      for (let px = 0; px < 40; px++) {
        const a = lightAtPixel(lamp, px, py);
        const b = shaderDynamic(lamp, px, py);
        for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i] as number, 9);
      }
  });

  it('stores linear light over the scale and the shader reads it back unsquared', () => {
    const buf = paintLightmap([lamp], 12, 10);
    const W = 12 * LIGHTMAP_PX;
    const px = Math.floor(lamp.x * LIGHTMAP_PX);
    const py = Math.floor(lamp.y * LIGHTMAP_PX);
    const [r] = lightAtPixel(lamp, px, py);
    expect(buf[(py * W + px) * 4]).toBe(Math.min(255, Math.round((r * 255) / LIGHTMAP_SCALE)));
    // the old model squared the stored value; the shader now multiplies it back once
    expect(LIGHT_DECL).toContain(`* ${LIGHTMAP_SCALE}.0`);
    expect(LIGHT_DECL).not.toMatch(/lm\s*\*\s*lm/);
    expect(LIGHT_DECL).toContain(
      `float[4](${LIGHT_STEPS.map((n) => (Number.isInteger(n) ? `${n}.0` : `${n}`)).join(', ')})`,
    );
  });

  it('converts colours with the sRGB curve three.js uses', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 9);
    const c = new THREE.Color().setHex(0xffc878);
    const [r, g, b] = lightColorLinear(0xffc878);
    expect(r).toBeCloseTo(c.r, 5);
    expect(g).toBeCloseTo(c.g, 5);
    expect(b).toBeCloseTo(c.b, 5);
    expect(LIGHT_STEPS).toContain(steppedFalloff(1.7, 4, 3, 1));
  });
});

describe('window light takes the pixel sampling of the colour map', () => {
  it('replaces three.js emissive sampling with the snapped sampling', () => {
    const shared = createSharedUniforms();
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const mat = litMaterial(shared, { map: tex, emissiveMap: tex });
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader:
        '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>\n#include <opaque_fragment>',
    };
    mat.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).not.toContain('#include <emissivemap_fragment>');
    expect(shader.fragmentShader).toContain('textureSize(emissiveMap, 0)');
    expect(shader.fragmentShader).toContain('hkESeam');
  });
});

// ---------------------------------------------------------------------------
// hip roof texel density

/** Texture pixels per metre along every edge of every slope triangle. */
function densities(rect: { x: number; y: number; w: number; h: number }) {
  const rm = roofMesh(rect, 2.6, 'hip', rect.w >= rect.h ? 'x' : 'z');
  const md = rm.slopes;
  const out: number[] = [];
  for (let i = 0; i < md.indices.length; i += 3) {
    const tri = [md.indices[i], md.indices[i + 1], md.indices[i + 2]] as number[];
    for (let k = 0; k < 3; k++) {
      const a = tri[k] as number;
      const b = tri[(k + 1) % 3] as number;
      const p = (j: number) => md.positions.slice(j * 3, j * 3 + 3) as number[];
      const u = (j: number) => md.uvs.slice(j * 2, j * 2 + 2) as number[];
      const pa = p(a);
      const pb = p(b);
      const world = Math.hypot(
        (pa[0] as number) - (pb[0] as number),
        (pa[1] as number) - (pb[1] as number),
        (pa[2] as number) - (pb[2] as number),
      );
      const ua = u(a);
      const ub = u(b);
      const texel = Math.hypot(
        ((ua[0] as number) - (ub[0] as number)) * rm.wPx,
        ((ua[1] as number) - (ub[1] as number)) * rm.lPx,
      );
      // skip the sloped hip edges whose texture path is not a straight measure of length
      if (world > 0) out.push(texel / world);
    }
  }
  return out;
}

describe('the hip roof keeps the pixel density of its slopes', () => {
  for (const rect of [
    { x: 0, y: 0, w: 6, h: 4 },
    { x: 3, y: 2, w: 9, h: 5 },
    { x: 0, y: 0, w: 4, h: 7 },
  ]) {
    it(`maps eaves and ridges at 16 pixels a metre (${rect.w}x${rect.h})`, () => {
      const rm = roofMesh(rect, 2.6, 'hip', rect.w >= rect.h ? 'x' : 'z');
      // the eave edges of the four slopes (v = 1 at both ends) are exactly 16 px/m
      const md = rm.slopes;
      const eaves: number[] = [];
      for (let i = 0; i < md.indices.length; i += 3) {
        const tri = [md.indices[i], md.indices[i + 1], md.indices[i + 2]] as number[];
        for (let k = 0; k < 3; k++) {
          const a = tri[k] as number;
          const b = tri[(k + 1) % 3] as number;
          if (md.uvs[a * 2 + 1] !== 1 || md.uvs[b * 2 + 1] !== 1) continue;
          const len = Math.hypot(
            (md.positions[a * 3] as number) - (md.positions[b * 3] as number),
            (md.positions[a * 3 + 2] as number) - (md.positions[b * 3 + 2] as number),
          );
          eaves.push(
            (Math.abs((md.uvs[a * 2] as number) - (md.uvs[b * 2] as number)) * rm.wPx) / len,
          );
        }
      }
      expect(eaves.length).toBeGreaterThanOrEqual(4);
      for (const d of eaves) expect(d).toBeGreaterThan(15.5);
      for (const d of eaves) expect(d).toBeLessThan(16.5);
      // no edge of any slope is stretched or squeezed by more than the hip's own shear
      for (const d of densities(rect)) expect(d).toBeLessThan(16 * 1.5);
    });
  }
});

// ---------------------------------------------------------------------------
// pixel ground marks

describe('ground marks are pixel art at the ground resolution', () => {
  it('sizes marks in whole even pixels from the frame width', () => {
    const s = markSize(48, 1);
    expect(s.w).toBeCloseTo(0.75);
    expect(markPx(s.w)).toBe(12);
    expect(markPx(0.01)).toBe(4);
    expect(markPx(s.w) % 2).toBe(0);
  });

  it('paints a solid shadow with a dithered rim, symmetric across both axes', () => {
    const m = shadowMark(16, 12);
    expect(getAlpha(m, 8, 6)).toBe(255);
    expect(getAlpha(m, 0, 0)).toBe(0);
    let rim = 0;
    for (let x = 0; x < 16; x++) if (getAlpha(m, x, 0) > 0) rim++;
    expect(rim).toBeGreaterThan(0);
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 16; x++)
        expect(getAlpha(m, x, y) > 0 || getAlpha(m, 15 - x, 11 - y) === 0).toBe(true);
  });

  it('draws hollow rings, the hostile one broken on the diagonals, the hover one thin', () => {
    const solid = ringMark(24, 20, 'friendly');
    const hostile = ringMark(24, 20, 'hostile');
    const hover = ringMark(24, 20, 'hover');
    expect(getAlpha(solid, 12, 10)).toBe(0);
    const count = (m: typeof solid) => {
      let n = 0;
      for (let i = 3; i < m.rgba.length; i += 4) if ((m.rgba[i] as number) > 0) n++;
      return n;
    };
    expect(count(hostile)).toBeLessThan(count(solid));
    expect(count(hover)).toBeLessThan(count(solid));
    // the gaps sit on the diagonals: the top-left diagonal of the hostile ring is empty
    expect(inRingGap('hostile', Math.PI / 4)).toBe(true);
    expect(inRingGap('hostile', 0)).toBe(false);
    expect(inRingGap('friendly', Math.PI / 4)).toBe(false);
    expect(RING_COLORS.threat).not.toBe(RING_COLORS.hostile);
  });
});

// ---------------------------------------------------------------------------
// far sky

const OUT: MapDef = {
  id: 'field',
  name: 'field',
  region: 'edgestone_area',
  width: 10,
  height: 10,
  rows: Array.from({ length: 10 }, () => '..........'),
  legend: { '.': 'grass' },
  locations: [],
  spawns: [],
  exits: [],
};

describe('the far sky (art_pipeline.md 2.13)', () => {
  it('picks the sky pack: atlas first, the map pack, the region pack; none indoors', () => {
    expect(skyPackFor(OUT)).toBe('lothar_plain');
    expect(skyPackFor({ ...OUT, style: 'valen_city' })).toBe('valen_city');
    expect(skyPackFor({ ...OUT, style: 'valen_city' }, 'earth_night_city')).toBe(
      'earth_night_city',
    );
    expect(skyPackFor({ ...OUT, style: 'sealed_ruins' })).toBe('lothar_plain');
    expect(skyPackFor({ ...OUT, indoor: true })).toBeNull();
    expect(skyPackFor({ ...OUT, style: 'door_corridor' })).toBeNull();
    // an unknown atlas sky is ignored
    expect(skyPackFor(OUT, 'nowhere')).toBe('lothar_plain');
  });

  it('keeps far, then clouds, then the mid band by tier, drawn back to front', () => {
    const ids = (n: number) => skyLayers('wild_forest', n).map((l) => l.kind);
    expect(ids(3)).toEqual(['clouds', 'far', 'mid']);
    expect(ids(2)).toEqual(['clouds', 'far']);
    expect(ids(1)).toEqual(['far']);
    expect(ids(0)).toEqual([]);
    expect(skyLayers('wild_forest', 3).map((l) => l.assetId)).toContain('art_bg_wild_forest_mid');
    expect(skyLayers('dream_door_sea', 3).map((l) => l.assetId)).toEqual([
      'art_bg_sky_dream_door_sea_far',
      'art_bg_sky_dream_door_sea_near',
    ]);
    expect(skyLayers('wild_forest', 3).find((l) => l.kind === 'far')?.parallax).toBe(0.02);
    expect(skyLayers('wild_forest', 3).find((l) => l.kind === 'mid')?.parallax).toBe(0.05);
    const tiers = Object.fromEntries(QUALITY_TIER_IDS.map((t) => [t, QUALITY_TIERS[t].skyLayers]));
    expect(tiers).toEqual({ ultra: 3, high: 3, mid: 2, low: 1, flat: 0 });
  });

  it('shows fully to 45 degrees, fades out by 60, and its horizon rises with the pitch', () => {
    expect(skyVisibility(36)).toBe(1);
    expect(skyVisibility(45)).toBe(1);
    expect(skyVisibility(52.5)).toBeCloseTo(0.5);
    expect(skyVisibility(60)).toBe(0);
    expect(skyVisibility(64)).toBe(0);
    expect(horizonFraction(30)).toBeGreaterThan(horizonFraction(45));
    expect(horizonFraction(45)).toBeGreaterThan(horizonFraction(60));
    expect(skyPixelScale(1080, 3)).toBe(3);
    expect(skyPixelScale(1080, 1)).toBe(1);
    expect(skyPixelScale(200, 6)).toBe(1);
  });

  it('turns one band per camera turn, moves with parallax, and drifts the clouds by game hours', () => {
    const far = { parallax: 0.02, drift: 0 };
    const clouds = { parallax: 0.01, drift: 0.25 };
    expect(layerOffset(far, 0, 0, 0, 640)).toBe(0);
    expect(layerOffset(far, 360, 0, 0, 640)).toBe(0);
    expect(layerOffset(far, 90, 0, 0, 640)).toBe((SKY_BAND_W * 3) / 4);
    expect(layerOffset(far, 0, 10, 0, 640)).toBe(Math.round(10 * 16 * 0.02));
    expect(layerOffset(clouds, 0, 0, 1, 640)).toBe(160);
    expect(layerOffset(far, -10, 0, 0, 640)).toBeGreaterThan(0);
  });

  it('turns the band the same way as the world and the sun', () => {
    const far = { parallax: 0.02, drift: 0 };
    // a northern landmark moves right on screen as the yaw rises...
    const v = (yaw: number) => ({ focusX: 0, focusY: 0, step: 1, pitch: 36, yaw });
    const north = (yaw: number) => projectToScreen(v(yaw), { w: 800, h: 600 }, 0, 0, -10).x;
    expect(north(10)).toBeGreaterThan(north(0));
    // ...and so does the sun...
    const sun: [number, number, number] = [0.2, 0.5, -0.84];
    expect(celestial(sun, 10, 1)?.x ?? 0).toBeGreaterThan(celestial(sun, 0, 1)?.x ?? 0);
    // ...and the band: its sample offset goes down, so its pixels move right
    expect(layerOffset(far, 10, 0, 0, 640)).toBeLessThan(
      layerOffset(far, 0, 0, 0, 640) || SKY_BAND_W,
    );
  });

  it('places the sun in front of a south-facing camera at noon and none behind it', () => {
    const noon: [number, number, number] = [0, 0.9, 0.43];
    expect(celestial(noon, 180, 1)).not.toBeNull();
    expect(celestial(noon, 0, 1)).toBeNull();
    expect(celestial([0, 0.9, 0.43], 180, 0.1)?.moon).toBe(true);
  });

  it('paints seamless deterministic placeholder strips with a transparent sky', () => {
    for (const kind of ['far', 'mid', 'clouds'] as const) {
      const a = paintSkyLayer('lothar_plain', kind);
      const b = paintSkyLayer('lothar_plain', kind);
      expect(a.w).toBe(SKY_BAND_W);
      expect(a.h).toBe(SKY_BAND_H);
      expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
      expect(getAlpha(a, 10, 0)).toBe(0);
    }
    // the far ridge meets itself across the seam
    const far = paintSkyLayer('ash_waste', 'far');
    const top = (x: number) => {
      for (let y = 0; y < SKY_BAND_H; y++) if (getAlpha(far, x, y) > 0) return y;
      return SKY_BAND_H;
    };
    expect(Math.abs(top(0) - top(SKY_BAND_W - 1))).toBeLessThanOrEqual(3);
    expect(paintSkyLayer('valen_city', 'mid')).not.toEqual(paintSkyLayer('wild_forest', 'mid'));
  });
});

// ---------------------------------------------------------------------------
// combat marks and the fairness list

describe('combat marks match the kernel areas', () => {
  it('outlines a circle whose inside is the hit test, and fills it with the cast', () => {
    const shape = { kind: 'circle' as const, x: 5, y: 5, radius: 3 };
    const [outline] = warningPolygons(shape, 1);
    for (const p of outline ?? []) expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(3);
    expect(warningPolygons(shape, 0)).toEqual([]);
    const [half] = warningPolygons(shape, 0.5);
    for (const p of half ?? []) expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(1.5);
    expect(insideWarning(shape, 7.9, 5)).toBe(true);
    expect(insideWarning(shape, 8.1, 5)).toBe(false);
  });

  it('draws kernel cells as the tiles the kernel hits, outlined around the whole area', () => {
    const shape = { kind: 'cells' as const, cells: [2, 2, 3, 2, 3, 3] };
    expect(insideWarning(shape, 2.9, 2.1)).toBe(true);
    expect(insideWarning(shape, 3.5, 3.9)).toBe(true);
    expect(insideWarning(shape, 2.5, 3.5)).toBe(false);
    expect(warningPolygons(shape, 1)).toHaveLength(3);
    // the fill spreads from the middle: a little progress fills fewer cells
    expect(warningPolygons(shape, 0.2).length).toBeLessThan(3);
    expect(warningPolygons(shape, 0)).toEqual([]);
    // three cells in an L have eight outer edges and no inner ones
    const edges = cellOutline(shape.cells);
    expect(edges).toHaveLength(8);
    expect(edges).not.toContainEqual([3, 2, 3, 3]);
  });

  it('shows cast bars and edge arrows only where the rules say', () => {
    const cast = { progress: 0.5, interruptible: true };
    const m = (over: object) => ({ ...NO_MARKS, ...over });
    expect(showsCastBar({ relation: 'hostile', marks: m({ cast }) })).toBe(true);
    expect(showsCastBar({ relation: 'neutral', marks: m({ cast }) })).toBe(true);
    expect(showsCastBar({ relation: 'self', marks: m({ cast }) })).toBe(false);
    expect(showsCastBar({ relation: 'friendly', marks: m({ cast }) })).toBe(false);
    expect(showsCastBar({ relation: 'hostile', marks: NO_MARKS })).toBe(false);
    expect(
      wantsEdgeArrow({ relation: 'hostile', hovered: false, marks: m({ threat: true }) }),
    ).toBe(true);
    expect(wantsEdgeArrow({ relation: 'hostile', hovered: true, marks: NO_MARKS })).toBe(true);
    expect(wantsEdgeArrow({ relation: 'hostile', hovered: false, marks: NO_MARKS })).toBe(false);
    expect(
      wantsEdgeArrow({ relation: 'friendly', hovered: true, marks: m({ threat: true }) }),
    ).toBe(false);
  });

  it('tests cones, rings and lines the way their outlines are drawn', () => {
    const cone = { kind: 'cone' as const, x: 0, y: 0, radius: 4, dir: 0, arc: Math.PI / 2 };
    expect(insideWarning(cone, 3, 0)).toBe(true);
    expect(insideWarning(cone, 2.5, 2.4)).toBe(true);
    expect(insideWarning(cone, 2.4, 2.5)).toBe(false);
    expect(insideWarning(cone, 0, 3)).toBe(false);
    const ring = { kind: 'ring' as const, x: 0, y: 0, inner: 2, radius: 4 };
    expect(insideWarning(ring, 1, 0)).toBe(false);
    expect(insideWarning(ring, 3, 0)).toBe(true);
    const line = { kind: 'line' as const, x: 0, y: 0, dir: Math.PI / 2, length: 6, width: 2 };
    expect(insideWarning(line, 0.9, 5)).toBe(true);
    expect(insideWarning(line, 1.1, 5)).toBe(false);
    expect(insideWarning(line, 0, -0.5)).toBe(false);
    expect(warningPolygons(line, 1)[0]).toHaveLength(4);
  });

  it('puts edge arrows on the inset screen edge toward off-screen threats, bosses first', () => {
    const vp = { w: 800, h: 600 };
    const arrows = edgeArrows(
      [
        { id: 'a', x: 1600, y: 300, boss: false },
        { id: 'b', x: 400, y: -900, boss: true },
        { id: 'c', x: 400, y: 300, boss: false },
      ],
      vp,
      1,
    );
    expect(arrows.map((a) => a.id)).toEqual(['b', 'a']);
    const a = arrows.find((x) => x.id === 'a');
    expect(a?.x).toBe(800 - 28);
    expect(a?.y).toBe(300);
    expect(arrows[0]?.size).toBeGreaterThan(a?.size ?? 0);
    expect(castBarBox({ x: 100, y: 50 }, 2).w).toBe(88);
  });
});

describe('the fairness list (art_pipeline.md 2.12, 4.10)', () => {
  it('lets a quality tier hold look knobs only, never a kept item', () => {
    for (const t of QUALITY_TIER_IDS) expect(knobProblems(QUALITY_TIERS[t])).toEqual([]);
    expect(knobProblems({ ...QUALITY_TIERS.low, groundWarnings: false })).toHaveLength(1);
    const kept = KEPT_EVERY_TIER.map((k) => k.id);
    for (const id of [
      'names',
      'overhead_markers',
      'enemy_cast_bars',
      'ground_warnings',
      'offscreen_threat_arrows',
      'threat_rings',
      'hidden_self_party_silhouette',
      'sediment_haze',
    ])
      expect(kept).toContain(id);
  });

  it('caps fog, particles and haze so warnings and rings stay readable', () => {
    expect(FOG_ALPHA_CAP).toBeLessThanOrEqual(0.35);
    expect(particleAlpha(1)).toBe(PARTICLE_ALPHA_CAP);
    expect(particleAlpha(0.3)).toBe(0.3);
    expect(gradeHaze(1)).toBeLessThanOrEqual(0.2);
    expect(flashAlpha(1)).toBe(FLASH_ALPHA_CAP);
    expect(flashAlpha(0.2)).toBeCloseTo(0.17);
    // both renderers flash through the cap
    for (const f of ['hd2d/weather_overlay.ts', 'render/flat_renderer.ts'])
      expect(readFileSync(join(SRC, f), 'utf8'), f).toContain('flashAlpha(flash)');
    // neither renderer draws the fog above the cap
    for (const f of ['hd2d/weather_overlay.ts', 'render/flat_renderer.ts']) {
      const src = readFileSync(join(SRC, f), 'utf8');
      expect(src, f).toContain('FOG_ALPHA_CAP');
      expect(src, f).not.toMatch(/drawFog\([^)]*0\.\d+\)/);
    }
  });

  it('draws the weather first and every combat mark after it, in both renderers', () => {
    const hd = readFileSync(join(SRC, 'hd2d/hd2d_renderer.ts'), 'utf8');
    expect(hd.indexOf('paintWeatherOverlay(o')).toBeGreaterThan(0);
    expect(hd.indexOf('paintWeatherOverlay(o')).toBeLessThan(hd.indexOf('paintOverlays(o'));
    const flat = readFileSync(join(SRC, 'render/flat_renderer.ts'), 'utf8');
    expect(flat.indexOf('this.drawWeather(scene, scene.weather')).toBeLessThan(
      flat.indexOf('paintOverlays(c'),
    );
    // no tier field reaches the overlay painter or the combat marks
    for (const f of ['render/overlay_painter.ts', 'render/combat_marks.ts']) {
      const src = readFileSync(join(SRC, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/quality|QualitySettings|tier/i);
    }
  });
});

// ---------------------------------------------------------------------------
// the overlay painter with the combat marks

function recorder() {
  const calls: { op: string; arg?: unknown }[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, prop: string) {
      if (prop === 'measureText') return () => ({ width: 20 });
      if (prop in target) return target[prop];
      return (...args: unknown[]) => calls.push({ op: prop, arg: args[0] });
    },
    set(_t, prop: string, value) {
      target[prop] = value;
      calls.push({ op: `set:${prop}`, arg: value });
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function sceneWith(extra: Partial<SceneInput>, entities: SceneInput['entities']): Scene {
  return buildScene({
    map: OUT,
    view: { focusX: 5, focusY: 5, step: 2, pitch: 36, yaw: 0 },
    timeMs: 0,
    playerId: 'p',
    calendar: calendarAt(tickAtDay(0, 12)),
    weather: 'clear',
    entities,
    standees: [],
    roofs: [],
    roofOpenness: () => 0,
    selection: null,
    hover: null,
    bubbles: [],
    ...extra,
  });
}

const LOOK = { archetype: 'human', scale: 1, key: 'k', colors: [] } as never;
const ANIM = { anim: 'idle', dir: 'down', frame: 0 } as const;

describe('the overlay draws the combat marks', () => {
  const ent = (id: string, x: number, tags: string[], marks = NO_MARKS) => ({
    entity: {
      id,
      kind: 'monster' as const,
      name: id,
      mapId: OUT.id,
      x,
      y: 5,
      facing: 0,
      speed: 1,
      radius: 0.4,
      faction: 'beast',
      appearance: { base: 'human', colors: [] },
      tags,
      alive: true,
    },
    x,
    y: 5,
    look: LOOK,
    anim: ANIM,
    marker: null,
    marks,
  });

  it('fills warnings first, reddens a threat name, bars a hostile cast, arrows the one off screen', () => {
    const warning: GroundWarning = {
      id: 'w',
      shape: { kind: 'circle', x: 5, y: 5, radius: 2 },
      progress: 0.5,
      hostile: true,
    };
    const scene = sceneWith({ warnings: [warning], selection: 'm1' }, [
      ent('m1', 5, ['hostile'], {
        threat: true,
        boss: false,
        cast: { progress: 0.4, interruptible: false },
      }),
      ent('m2', 400, ['hostile'], { threat: true, boss: true, cast: null }),
    ]);
    const { ctx, calls } = recorder();
    paintOverlays(ctx, scene, {
      dpr: 1,
      scale: 2,
      project: (x, h, y) => ({ x: 400 + (x - 5) * 32, y: 300 + (y - 5) * 20 - h * 32 }),
      frameOf: () => ({ height: 30 }) as never,
      marker: () => ({ width: 16, height: 16 }) as never,
      viewport: { w: 800, h: 600 },
    });
    const ops = calls.map((c) => c.op);
    const firstFill = ops.indexOf('fill');
    const firstText = ops.indexOf('fillText');
    expect(firstFill).toBeGreaterThanOrEqual(0);
    expect(firstFill).toBeLessThan(firstText);
    expect(calls.some((c) => c.op === 'set:fillStyle' && c.arg === THREAT_NAME_COLOR)).toBe(true);
    // the uninterruptible cast bar: a frame and the shield crest
    expect(ops).toContain('strokeRect');
    // the boss off screen gets an arrow (translate to the edge, then rotate)
    expect(ops).toContain('rotate');
  });

  it('keeps an attacking enemy named in red, and hides a cast under a closed roof', () => {
    const scene = sceneWith({}, [
      ent('m1', 5, ['hostile'], { threat: true, boss: false, cast: null }),
      ent('m2', 6, ['hostile']),
    ]);
    const names = scene.items.filter((i) => i.type === 'entity').map((i) => [i.id, i.showName]);
    expect(names).toEqual([
      ['m1', true],
      ['m2', false],
    ]);
    const roof = { locationId: 'hall', x: 0, y: 0, w: 10, h: 10 } as never;
    const covered = sceneWith({ roofs: [roof], roofOpenness: () => 0 }, [
      ent('m1', 5, ['hostile'], {
        threat: true,
        boss: false,
        cast: { progress: 0.5, interruptible: true },
      }),
    ]);
    const e = covered.items.find((i) => i.type === 'entity');
    expect(e && e.type === 'entity' && [e.showName, e.marks.cast]).toEqual([false, null]);
  });

  it('draws no cast bar over the player or a friend', () => {
    const scene = sceneWith({}, [
      { ...ent('p', 5, []), entity: { ...ent('p', 5, []).entity, kind: 'player' as const } },
    ]);
    scene.items.forEach((i) => {
      if (i.type === 'entity')
        i.marks = { threat: false, boss: false, cast: { progress: 0.5, interruptible: true } };
    });
    const { ctx, calls } = recorder();
    paintOverlays(ctx, scene, {
      dpr: 1,
      scale: 2,
      project: (x, _h, y) => ({ x: x * 10, y: y * 10 }),
      frameOf: () => ({ height: 30 }) as never,
      marker: () => ({ width: 16, height: 16 }) as never,
      viewport: { w: 800, h: 600 },
    });
    expect(calls.filter((c) => c.op === 'fillRect')).toHaveLength(0);
  });
});

describe('the frame signature sees the new scene fields', () => {
  const opts = { flat: false, deviceW: 800, deviceH: 600, dpr: 1 };
  const base = sceneWith({}, []);
  const sig = (s: Scene) => frameSignals(s, opts).signature;

  it('ignores the cast of the player, whose bar is on the HUD', () => {
    const LOOK2 = { archetype: 'human', scale: 1, key: 'k', colors: [] } as never;
    const self = (progress: number) =>
      buildScene({
        map: OUT,
        view: { focusX: 5, focusY: 5, step: 2, pitch: 36, yaw: 0 },
        timeMs: 0,
        playerId: 'p',
        calendar: calendarAt(tickAtDay(0, 12)),
        weather: 'clear',
        entities: [
          {
            entity: {
              id: 'p',
              kind: 'player',
              name: 'p',
              mapId: OUT.id,
              x: 5,
              y: 5,
              facing: 0,
              speed: 1,
              radius: 0.4,
              faction: 'player',
              appearance: { base: 'human', colors: [] },
              tags: [],
              alive: true,
            },
            x: 5,
            y: 5,
            look: LOOK2,
            anim: { anim: 'idle', dir: 'down', frame: 0 },
            marker: null,
            marks: { threat: false, boss: false, cast: { progress, interruptible: true } },
          },
        ],
        standees: [],
        roofs: [],
        roofOpenness: () => 0,
        selection: null,
        hover: null,
        bubbles: [],
      });
    expect(sig(self(0.2)).overlay).toBe(sig(self(0.6)).overlay);
  });

  it('changes with warnings, weather and mood fades, and switch fades', () => {
    const warning: GroundWarning = {
      id: 'w',
      shape: { kind: 'circle', x: 5, y: 5, radius: 2 },
      progress: 0.2,
      hostile: true,
    };
    const a = sig({ ...base, warnings: [warning] });
    const b = sig({ ...base, warnings: [{ ...warning, progress: 0.3 }] });
    expect(a.overlay).not.toBe(b.overlay);
    expect(sig({ ...base, weatherFade: { from: 'rain', t: 0.2 } }).tick).not.toBe(sig(base).tick);
    expect(sig({ ...base, mood: { kind: 'dream', k: 0.5 } }).tick).not.toBe(sig(base).tick);
    expect(
      sig({ ...base, switchFade: { rects: [{ x: 1, y: 1, w: 2, h: 1 }], t: 0.5 } }).roof,
    ).not.toBe(sig(base).roof);
  });
});

// ---------------------------------------------------------------------------
// four display directions

describe('four display directions follow the projected facing', () => {
  it('keeps the old top-down turn without a pitch and projects with one', () => {
    expect(dirFromFacing(screenFacing(0, 90))).toBe('down');
    // map facing 50 degrees (more south than east) shows as down from above...
    const f = (50 * Math.PI) / 180;
    expect(dirFromFacing(screenFacing(f, 0))).toBe('down');
    // ...but the oblique camera at 36 degrees shortens south: on screen it walks right
    expect(dirFromFacing(screenFacing(f, 0, 36))).toBe('right');
    // straight axes are unchanged by the pitch
    for (const yaw of [0, 90, 180, 270])
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
        expect(dirFromFacing(screenFacing(a, yaw, 64))).toBe(dirFromFacing(screenFacing(a, yaw)));
  });

  it('lets a cutscene lens go past the player range without widening the player range', () => {
    expect(viewBasis(22, 0).sinP).toBeCloseTo(Math.sin((22 * Math.PI) / 180));
    expect(viewBasis(85, 0).sinP).toBeCloseTo(Math.sin((85 * Math.PI) / 180));
    expect(clampPitch(22)).toBe(PITCH_MIN);
    expect(clampPitch(85)).toBe(PITCH_MAX);
  });
});
