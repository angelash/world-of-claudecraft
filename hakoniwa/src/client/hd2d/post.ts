// Post-processing chain of the HD-2D scene (art_pipeline.md 2.9): render, bloom (high
// tier), one grade pass (time-of-day tint and shade, the style pack's film look, haze,
// tilt-shift on the high tier, vignette, grain, sediment and divine vignette colours,
// lightning) and the output pass (ACES tone mapping and sRGB).

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { QualitySettings } from './quality';
import { GRADE_FRAGMENT, GRADE_VERTEX } from './shaders';
import type { FilmLook } from './style_packs';

export interface GradeParams {
  tint: number;
  shade: number;
  film: FilmLook;
  haze: number;
  hazeColor: number;
  vigColor: number;
  vigStrength: number;
  flash: number;
  timeS: number;
  /** 0..1 wet ground: darker and less saturated (art_pipeline.md 2.8) */
  wet: number;
  /** 0..1 snow: brighter and softer */
  snow: number;
}

function gradeUniforms() {
  return {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uShade: { value: new THREE.Color(1, 1, 1) },
    uSat: { value: 1 },
    uLift: { value: 0 },
    uWarm: { value: 0 },
    uTeal: { value: 0 },
    uContrast: { value: 1 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uTime: { value: 0 },
    uTilt: { value: 0 },
    uHazeColor: { value: new THREE.Color(1, 1, 1) },
    uHaze: { value: 0 },
    uVigColor: { value: new THREE.Color(0, 0, 0) },
    uVigStrength: { value: 0 },
    uFlash: { value: 0 },
  };
}

export class PostChain {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly passes: { dispose(): void }[] = [];
  private readonly u = gradeUniforms();
  private quality: QualitySettings | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    const render = new RenderPass(scene, camera);
    this.composer.addPass(render);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 0.88);
    this.composer.addPass(this.bloom);
    // A ShaderMaterial is used as is by ShaderPass, so these uniform objects stay live.
    const grade = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: this.u,
        vertexShader: GRADE_VERTEX,
        fragmentShader: GRADE_FRAGMENT,
      }),
    );
    this.composer.addPass(grade);
    const output = new OutputPass();
    this.composer.addPass(output);
    this.passes.push(render, this.bloom, grade, output);
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
    this.bloom.enabled = q.bloom;
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.u.uRes.value.set(w * pixelRatio, h * pixelRatio);
  }

  apply(p: GradeParams): void {
    const u = this.u;
    u.uTint.value.setHex(p.tint).multiplyScalar(1 - 0.12 * p.wet + 0.08 * p.snow);
    u.uShade.value.setHex(p.shade);
    u.uSat.value = p.film.saturation * (1 - 0.18 * p.wet - 0.1 * p.snow);
    u.uLift.value = p.film.lift;
    u.uWarm.value = p.film.warm;
    u.uTeal.value = p.film.teal;
    u.uContrast.value = p.film.contrast * (1 - 0.08 * p.snow);
    u.uVignette.value = p.film.vignette;
    u.uGrain.value = this.quality?.grain ? p.film.grain : 0;
    u.uTilt.value = this.quality?.tiltShift ? 1 : 0;
    u.uTime.value = p.timeS;
    u.uHazeColor.value.setHex(p.hazeColor);
    u.uHaze.value = p.haze;
    u.uVigColor.value.setHex(p.vigColor);
    u.uVigStrength.value = p.vigStrength;
    u.uFlash.value = p.flash;
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    for (const p of this.passes) p.dispose();
    this.composer.dispose();
  }
}
