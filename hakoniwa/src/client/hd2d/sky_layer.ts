// The far sky and the out-of-bounds ground of the HD-2D scene (art_pipeline.md 2.5 and 2.13):
// one full-screen quad at the far plane, drawn after the opaque scene with the depth test on
// and no depth write, so it shades only the pixels the map leaves and never covers anything. Above
// the horizon: the gradient, stars, the sun or moon and up to three wrapping layer strips
// (the art when approved, else the procedural strips of sky.ts); below it, and wherever the
// pitch hides the sky, the pack's dark outside colour under a light pixel fog that moves with
// the ground. Everything is quantised to whole sky pixels. The rules live in sky.ts.

import * as THREE from 'three';
import type { SkyPack } from '../../systems/world/atlas';
import type { PixelMatrix } from '../sprites/pixels';
import { SKY_BAND_H, SKY_BAND_W, type SkyLayerSpec } from './sky';

const VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec2 uRes;
uniform float uScale;
uniform float uHorizon;
uniform float uVis;
uniform vec3 uZenith;
uniform vec3 uHorizonCol;
uniform vec3 uOutside;
uniform vec3 uFogCol;
uniform float uFog;
uniform vec2 uFogOff;
uniform float uFogTime;
uniform float uStars;
uniform vec4 uSun;
uniform vec3 uSunCol;
uniform vec3 uLayerTint;
uniform sampler2D uL0;
uniform sampler2D uL1;
uniform sampler2D uL2;
uniform int uCount;
uniform vec3 uOff;
uniform vec3 uHaze;

const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float bayer(vec2 p) {
  return BAYER[int(mod(p.y, 4.0)) * 4 + int(mod(p.x, 4.0))];
}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec4 layerAt(sampler2D t, float off, vec2 sp, float hz) {
  float row = sp.y - (hz - ${SKY_BAND_H}.0 + 6.0);
  if (row < 0.0 || row >= ${SKY_BAND_H}.0) return vec4(0.0);
  float col = mod(sp.x + off, ${SKY_BAND_W}.0);
  return texture2D(t, (vec2(col, row) + 0.5) / vec2(${SKY_BAND_W}.0, ${SKY_BAND_H}.0));
}
vec3 putLayer(vec3 sky, vec4 c, float haze) {
  return c.a > 0.5 ? mix(c.rgb * uLayerTint, uHorizonCol, haze) : sky;
}
void main() {
  vec2 dev = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 sp = floor(dev / uScale);
  float hz = floor(uHorizon / uScale);
  // Out of bounds: the outside colour and a light fog anchored to the ground (2.5).
  vec2 fp = (sp + uFogOff) / 14.0 + vec2(uFogTime * 0.6, 0.0);
  float n = noise(fp) * 0.65 + noise(fp * 2.3 + 7.1) * 0.35;
  float fogStep = floor(clamp(n * 1.6 - 0.35, 0.0, 1.0) * 3.0 + bayer(sp) / 16.0) / 3.0;
  vec3 col = mix(uOutside, uFogCol, fogStep * uFog);
  if (uVis > 0.0 && sp.y <= hz + 6.0) {
    float t = clamp(sp.y / max(hz, 1.0), 0.0, 1.0);
    float tq = clamp(floor(t * 10.0 + bayer(sp) / 16.0) / 10.0, 0.0, 1.0);
    vec3 sky = mix(uZenith, uHorizonCol, tq);
    if (uStars > 0.0 && t < 0.8 && hash(sp) > 0.996) sky = mix(sky, vec3(1.0), uStars * (0.4 + 0.6 * hash(sp + 3.0)));
    if (uSun.w > 0.0) {
      float d = length(sp - floor(uSun.xy / uScale));
      if (d < uSun.z) sky = uSunCol;
      else if (uSun.w < 1.5 && d < uSun.z + 2.0 && bayer(sp) < 8.0) sky = mix(sky, uSunCol, 0.5);
    }
    if (uCount > 0) sky = putLayer(sky, layerAt(uL0, uOff.x, sp, hz), uHaze.x);
    if (uCount > 1) sky = putLayer(sky, layerAt(uL1, uOff.y, sp, hz), uHaze.y);
    if (uCount > 2) sky = putLayer(sky, layerAt(uL2, uOff.z, sp, hz), uHaze.z);
    col = mix(col, sky, sp.y <= hz ? uVis : uVis * 0.5);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface SkyFrame {
  /** drawing-buffer size */
  bufW: number;
  bufH: number;
  /** drawing-buffer pixels per sky pixel */
  scale: number;
  /** horizon line, buffer pixels from the top */
  horizon: number;
  visibility: number;
  zenith: number;
  horizonColor: number;
  outside: number;
  fogColor: number;
  /** 0..1 light fog over the outside ground */
  fog: number;
  /** ground anchor of the fog, in sky pixels */
  fogOffset: [number, number];
  /** game hours, for the fog drift */
  hours: number;
  stars: number;
  /** buffer pixels from the top-left; null hides it */
  sun: { x: number; y: number; moon: boolean } | null;
  sunColor: number;
  layerTint: number;
  /** horizontal offset of each kept layer, sky pixels */
  offsets: readonly number[];
}

function blankTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  t.needsUpdate = true;
  return t;
}

export class SkyLayer {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly u = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uScale: { value: 1 },
    uHorizon: { value: 0 },
    uVis: { value: 0 },
    uZenith: { value: new THREE.Color() },
    uHorizonCol: { value: new THREE.Color() },
    uOutside: { value: new THREE.Color() },
    uFogCol: { value: new THREE.Color() },
    uFog: { value: 0 },
    uFogOff: { value: new THREE.Vector2() },
    uFogTime: { value: 0 },
    uStars: { value: 0 },
    uSun: { value: new THREE.Vector4() },
    uSunCol: { value: new THREE.Color() },
    uLayerTint: { value: new THREE.Color(1, 1, 1) },
    uL0: { value: blankTexture() as THREE.Texture },
    uL1: { value: blankTexture() as THREE.Texture },
    uL2: { value: blankTexture() as THREE.Texture },
    uCount: { value: 0 },
    uOff: { value: new THREE.Vector3() },
    uHaze: { value: new THREE.Vector3() },
  };
  private readonly blanks: THREE.Texture[];
  private textures: THREE.DataTexture[] = [];
  private key = '';
  private layers: readonly SkyLayerSpec[] = [];

  constructor() {
    this.blanks = [this.u.uL0.value, this.u.uL1.value, this.u.uL2.value];
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    // last of the opaque pass: early depth culls every pixel the scene already covers
    this.mesh.renderOrder = 999;
  }

  /** Kept layers of the map's sky pack; textures rebuild only when the set changes. */
  setLayers(
    pack: SkyPack | null,
    layers: readonly SkyLayerSpec[],
    pixelsOf: (spec: SkyLayerSpec) => PixelMatrix,
  ): void {
    const key = `${pack ?? ''}|${layers.map((l) => l.assetId).join(',')}`;
    if (key === this.key) return;
    this.key = key;
    for (const t of this.textures) t.dispose();
    this.textures = [];
    this.layers = pack ? layers.slice(0, 3) : [];
    const slots = [this.u.uL0, this.u.uL1, this.u.uL2];
    this.layers.forEach((spec, i) => {
      const m = pixelsOf(spec);
      // the strip's own buffer, no copy (strips are kept by the bounded cache in sky.ts)
      const data = new Uint8Array(m.rgba.buffer, m.rgba.byteOffset, m.rgba.byteLength);
      const tex = new THREE.DataTexture(data, m.w, m.h, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.flipY = false;
      tex.needsUpdate = true;
      this.textures.push(tex);
      (slots[i] as { value: THREE.Texture }).value = tex;
    });
    for (let i = this.layers.length; i < 3; i++)
      (slots[i] as { value: THREE.Texture }).value = this.blanks[i] as THREE.Texture;
    this.u.uCount.value = this.layers.length;
    this.u.uHaze.value.set(
      this.layers[0]?.haze ?? 0,
      this.layers[1]?.haze ?? 0,
      this.layers[2]?.haze ?? 0,
    );
  }

  get layerSpecs(): readonly SkyLayerSpec[] {
    return this.layers;
  }

  update(f: SkyFrame): void {
    const u = this.u;
    u.uRes.value.set(f.bufW, f.bufH);
    u.uScale.value = Math.max(1, f.scale);
    u.uHorizon.value = f.horizon;
    u.uVis.value = f.visibility;
    u.uZenith.value.setHex(f.zenith);
    u.uHorizonCol.value.setHex(f.horizonColor);
    u.uOutside.value.setHex(f.outside);
    u.uFogCol.value.setHex(f.fogColor);
    u.uFog.value = f.fog;
    u.uFogOff.value.set(f.fogOffset[0], f.fogOffset[1]);
    u.uFogTime.value = f.hours;
    u.uStars.value = f.stars;
    u.uSunCol.value.setHex(f.sunColor);
    u.uLayerTint.value.setHex(f.layerTint);
    if (f.sun) u.uSun.value.set(f.sun.x, f.sun.y, f.sun.moon ? 5 : 7, f.sun.moon ? 2 : 1);
    else u.uSun.value.set(0, 0, 0, 0);
    u.uOff.value.set(f.offsets[0] ?? 0, f.offsets[1] ?? 0, f.offsets[2] ?? 0);
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const t of this.blanks) t.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
