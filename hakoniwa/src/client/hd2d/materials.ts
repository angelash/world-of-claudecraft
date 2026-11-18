// Materials of the HD-2D scene (art_pipeline.md 2.3 to 2.7): pixel textures from the
// procedural painters, Lambert shading for the ground and building shells (sun, sky and
// shadow maps from three.js) with pixel sampling of the colour and window-light maps, the
// light map, dynamic lights, water, the roof dissolve and the switch-tile dissolve injected
// through onBeforeCompile, a shader material for standees with upright depth and a
// matching shadow-depth material, and the silhouette material of figures behind cover.
// Shared uniform objects let one update per frame reach every material.

import * as THREE from 'three';
import type { PixelMatrix } from '../sprites/pixels';
import {
  DISSOLVE_DECL,
  DISSOLVE_FRAGMENT,
  LIGHT_DECL,
  MAX_DYNAMIC_LIGHTS,
  MAX_SWITCH_RECTS,
  PIXEL_EMISSIVE_FRAGMENT,
  PIXEL_MAP_FRAGMENT,
  SILHOUETTE_FRAGMENT,
  STANDEE_DEPTH_FRAGMENT,
  STANDEE_FRAGMENT,
  STANDEE_VERTEX,
  SWITCH_DECL,
  SWITCH_FRAGMENT,
  WATER_DECL,
  WATER_FRAGMENT,
  WORLD_POS_VERTEX,
} from './shaders';

type U<T> = { value: T };

/** Uniforms every lit material reads; updated once per frame by the renderer. */
export interface SharedUniforms {
  uLightmap: U<THREE.Texture>;
  uMapSize: U<THREE.Vector2>;
  uDyn: U<THREE.Vector4[]>;
  uDynColor: U<THREE.Color[]>;
  uDynCount: U<number>;
  uLightK: U<number>;
  uTime: U<number>;
  uRight: U<THREE.Vector3>;
  uUp: U<THREE.Vector3>;
  uToCam3: U<THREE.Vector3>;
  uToCam: U<THREE.Vector2>;
  uAmbient: U<THREE.Color>;
  /** changed switch rectangles (x, z, w, h) while a switch change fades */
  uSwRect: U<THREE.Vector4[]>;
  uSwCount: U<number>;
  /** 0..1 progress of the switch fade */
  uSwT: U<number>;
}

/** The switch-fade role of one static scene: 0 at rest, 1 outgoing, 2 incoming. */
export interface SwitchRole {
  uSwMode: U<number>;
}

export function createSharedUniforms(): SharedUniforms {
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  return {
    uLightmap: { value: blank },
    uMapSize: { value: new THREE.Vector2(1, 1) },
    uDyn: { value: Array.from({ length: MAX_DYNAMIC_LIGHTS }, () => new THREE.Vector4()) },
    uDynColor: { value: Array.from({ length: MAX_DYNAMIC_LIGHTS }, () => new THREE.Color()) },
    uDynCount: { value: 0 },
    uLightK: { value: 1 },
    uTime: { value: 0 },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uToCam3: { value: new THREE.Vector3(0, 0.6, 0.8) },
    uToCam: { value: new THREE.Vector2(0, 1) },
    uAmbient: { value: new THREE.Color(1, 1, 1) },
    uSwRect: { value: Array.from({ length: MAX_SWITCH_RECTS }, () => new THREE.Vector4()) },
    uSwCount: { value: 0 },
    uSwT: { value: 0 },
  };
}

/** A pixel texture from a painted matrix: sRGB, linear filter (for pixel AA), no mipmaps. */
export function pixelTexture(m: PixelMatrix, srgb = true): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(m.rgba), m.w, m.h, THREE.RGBAFormat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Per-building dissolve state shared by its walls, roof and door leaves. */
export interface DissolveUniforms {
  uOpen: U<number>;
  uCenter: U<THREE.Vector2>;
  uHalf: U<THREE.Vector2>;
  uCutFar: U<number>;
  uCutNear: U<number>;
}

export function createDissolve(
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  cutFar: number,
  cutNear: number,
): DissolveUniforms {
  return {
    uOpen: { value: 0 },
    uCenter: { value: new THREE.Vector2(cx, cz) },
    uHalf: { value: new THREE.Vector2(hx, hz) },
    uCutFar: { value: cutFar },
    uCutNear: { value: cutNear },
  };
}

interface LitOptions {
  map: THREE.Texture;
  emissiveMap?: THREE.Texture;
  water?: { mask: THREE.Texture; hi: THREE.Color };
  dissolve?: DissolveUniforms;
  roof?: boolean;
  alphaTest?: number;
  color?: THREE.Color;
  /** the map has switch tiles: the surface takes part in their dissolve */
  switchRole?: SwitchRole;
}

function switchUniforms(shared: SharedUniforms, role: SwitchRole) {
  return {
    uSwRect: shared.uSwRect,
    uSwCount: shared.uSwCount,
    uSwT: shared.uSwT,
    uSwMode: role.uSwMode,
  };
}

/** Lambert material with pixel sampling, artificial light and optional water or dissolve. */
export function litMaterial(shared: SharedUniforms, o: LitOptions): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    map: o.map,
    color: o.color ?? new THREE.Color(1, 1, 1),
    alphaTest: o.alphaTest ?? 0,
  });
  if (o.emissiveMap) {
    mat.emissiveMap = o.emissiveMap;
    mat.emissive = new THREE.Color(1, 1, 1);
    mat.emissiveIntensity = 0;
  }
  const defines: Record<string, string> = {};
  if (o.water) defines.HK_WATER = '';
  if (o.dissolve) defines.HK_DISSOLVE = '';
  if (o.roof) defines.HK_ROOF = '';
  if (o.switchRole) defines.HK_SWITCH = '';
  mat.defines = defines;
  mat.customProgramCacheKey = () => `hk:${Object.keys(defines).sort().join(',')}`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uLightmap: shared.uLightmap,
      uMapSize: shared.uMapSize,
      uDyn: shared.uDyn,
      uDynColor: shared.uDynColor,
      uDynCount: shared.uDynCount,
      uLightK: shared.uLightK,
      uTime: shared.uTime,
      uToCam: shared.uToCam,
    });
    if (o.water) {
      shader.uniforms.uWaterMask = { value: o.water.mask };
      shader.uniforms.uWaterHi = { value: o.water.hi };
    }
    if (o.dissolve) Object.assign(shader.uniforms, o.dissolve);
    if (o.switchRole) Object.assign(shader.uniforms, switchUniforms(shared, o.switchRole));
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHkWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_POS_VERTEX}`);
    let frag = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${LIGHT_DECL}\n${o.water ? WATER_DECL : ''}\n${o.dissolve ? DISSOLVE_DECL : ''}\n${o.switchRole ? SWITCH_DECL : ''}`,
    );
    frag = frag.replace(
      '#include <map_fragment>',
      `${PIXEL_MAP_FRAGMENT}\n${o.water ? WATER_FRAGMENT : ''}\n${o.dissolve ? DISSOLVE_FRAGMENT : ''}\n${o.switchRole ? SWITCH_FRAGMENT : ''}`,
    );
    // the window light of night walls takes the same pixel sampling as the colour map
    frag = frag.replace('#include <emissivemap_fragment>', PIXEL_EMISSIVE_FRAGMENT);
    frag = frag.replace(
      '#include <opaque_fragment>',
      'outgoingLight += diffuseColor.rgb * hkArtificial(vHkWorld);\n#include <opaque_fragment>',
    );
    shader.fragmentShader = frag;
  };
  return mat;
}

/** Standee material (one per texture); static standees of a switch map join the switch dissolve. */
export function standeeMaterial(
  shared: SharedUniforms,
  map: THREE.Texture,
  switchRole?: SwitchRole,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: switchRole ? { HK_SWITCH: '' } : {},
    // Standee quads face the camera; the shadow pass must draw both sides or a sun in
    // front of the camera would see their backs and drop the shadow.
    shadowSide: THREE.DoubleSide,
    uniforms: {
      map: { value: map },
      uFlash: { value: 0 },
      uOpacity: { value: 1 },
      uAmbient: shared.uAmbient,
      uRight: shared.uRight,
      uUp: shared.uUp,
      uToCam3: shared.uToCam3,
      uLightmap: shared.uLightmap,
      uMapSize: shared.uMapSize,
      uDyn: shared.uDyn,
      uDynColor: shared.uDynColor,
      uDynCount: shared.uDynCount,
      uLightK: shared.uLightK,
      ...(switchRole ? switchUniforms(shared, switchRole) : {}),
    },
    vertexShader: STANDEE_VERTEX,
    fragmentShader: STANDEE_FRAGMENT,
  });
}

/**
 * Silhouette of a figure behind cover (art_pipeline.md 2.4): the standee billboard drawn
 * only where something nearer covers it, after everything else, in one flat colour.
 */
export function silhouetteMaterial(
  shared: SharedUniforms,
  map: THREE.Texture,
  color: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uColor: { value: new THREE.Color().setHex(color) },
      uRight: shared.uRight,
      uUp: shared.uUp,
      uToCam3: shared.uToCam3,
    },
    vertexShader: STANDEE_VERTEX,
    fragmentShader: SILHOUETTE_FRAGMENT,
    depthFunc: THREE.GreaterDepth,
    depthWrite: false,
    // pulled a hair toward the camera, so the figure's own pixels never count as cover
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
}

/** Shadow-depth material for standees: same billboard, alpha-tested, packed depth. */
export function standeeDepthMaterial(
  shared: SharedUniforms,
  map: THREE.Texture,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: { HK_SHADOW: '' },
    uniforms: {
      map: { value: map },
      uRight: shared.uRight,
      uUp: shared.uUp,
      uToCam3: shared.uToCam3,
    },
    vertexShader: STANDEE_VERTEX,
    fragmentShader: STANDEE_DEPTH_FRAGMENT,
  });
}
