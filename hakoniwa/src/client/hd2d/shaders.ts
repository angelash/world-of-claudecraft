// GLSL pieces of the HD-2D scene (art_pipeline.md 2.3 to 2.9), injected into three.js
// materials: pixel anti-aliased sampling (texels snap to their centres with a one screen
// pixel blend at texel edges), artificial light from the static light map plus up to
// MAX_DYNAMIC_LIGHTS point lights with stepped falloff, the ordered-dither dissolve and
// cutaway of opened buildings, animated pixel water, and the standee vertex stage with
// upright depth. Strings only; materials.ts wires them.

export const MAX_DYNAMIC_LIGHTS = 8;

/** Declarations shared by every lit HD-2D material (fragment side). */
export const LIGHT_DECL = /* glsl */ `
uniform sampler2D uLightmap;
uniform vec2 uMapSize;
uniform vec4 uDyn[${MAX_DYNAMIC_LIGHTS}];
uniform vec3 uDynColor[${MAX_DYNAMIC_LIGHTS}];
uniform int uDynCount;
uniform float uLightK;
varying vec3 vHkWorld;

const float HK_BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float hkBayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  return HK_BAYER[y * 4 + x];
}

vec3 hkArtificial(vec3 p) {
  vec2 uv = clamp(p.xz / uMapSize, 0.0, 1.0);
  vec3 lm = texture2D(uLightmap, uv).rgb * 2.0;
  vec3 l = lm * lm;
  for (int i = 0; i < ${MAX_DYNAMIC_LIGHTS}; i++) {
    if (i >= uDynCount) break;
    vec4 d = uDyn[i];
    float f = clamp(1.0 - length(p.xz - d.xy) / d.z, 0.0, 1.0);
    vec2 q = floor(p.xz * 4.0);
    f = floor(f * 3.0 + hkBayer(q) / 16.0) / 3.0;
    l += uDynColor[i] * f * d.w;
  }
  return l * uLightK;
}
`;

/** Replacement for three's map_fragment: pixel anti-aliased sampling. */
export const PIXEL_MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  vec2 hkTs = vec2(textureSize(map, 0));
  vec2 hkT = vMapUv * hkTs;
  vec2 hkSeam = floor(hkT + 0.5);
  vec2 hkFw = max(fwidth(hkT), vec2(1e-4));
  hkT = hkSeam + clamp((hkT - hkSeam) / hkFw, -0.5, 0.5);
  vec4 sampledDiffuseColor = texture2D(map, hkT / hkTs);
  diffuseColor *= sampledDiffuseColor;
#endif
`;

/** World position varying, appended after three's project_vertex. */
export const WORLD_POS_VERTEX = /* glsl */ `
  vec4 hkW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    hkW = instanceMatrix * hkW;
  #endif
  vHkWorld = (modelMatrix * hkW).xyz;
`;

/** Dissolve and cutaway of opened buildings (needs vMapUv and the map texture size). */
export const DISSOLVE_DECL = /* glsl */ `
uniform float uOpen;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform vec2 uToCam;
uniform float uCutFar;
uniform float uCutNear;
`;

export const DISSOLVE_FRAGMENT = /* glsl */ `
  if (uOpen > 0.0) {
    #ifdef HK_ROOF
      float hkCut = -1.0;
    #else
      vec2 hkRel = (vHkWorld.xz - uCenter) / max(uHalf, vec2(0.5));
      float hkFacing = dot(hkRel, uToCam);
      float hkCut = hkFacing > 0.45 ? uCutNear : uCutFar;
    #endif
    if (vHkWorld.y > hkCut) {
      vec2 hkCell = floor(vMapUv * vec2(textureSize(map, 0)));
      if (hkBayer(hkCell) < uOpen * 16.0) discard;
    }
  }
`;

/** Animated pixel water on the ground (water mask: R water, G deep). */
export const WATER_DECL = /* glsl */ `
uniform sampler2D uWaterMask;
uniform float uTime;
uniform vec3 uWaterHi;
float hkHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

export const WATER_FRAGMENT = /* glsl */ `
  {
    vec4 hkWm = texture2D(uWaterMask, clamp(vHkWorld.xz / uMapSize, 0.0, 1.0));
    if (hkWm.r > 0.5) {
      vec2 px = floor(vHkWorld.xz * 16.0);
      float dir = mod(px.y, 2.0) < 1.0 ? 1.0 : -1.0;
      float seg = floor((px.x + uTime * 6.0 * dir) / 5.0);
      float wave = step(0.9, hkHash(vec2(seg, px.y)));
      float glint = step(0.997, hkHash(px + floor(uTime * 2.0)));
      float k = (wave * 0.35 + glint * 0.6) * (hkWm.g > 0.5 ? 0.6 : 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, uWaterHi, k);
    }
  }
`;

/** Standee vertex stage: quad faces the camera, depth as if standing upright at the foot. */
export const STANDEE_VERTEX = /* glsl */ `
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uToCam3;
varying vec2 vUv;
varying vec3 vFoot;
varying float vHeight;
void main() {
  vec3 foot = vec3(0.0);
  #ifdef USE_INSTANCING
    foot = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  foot = (modelMatrix * vec4(foot, 1.0)).xyz;
  vec3 world = foot + uRight * position.x + uUp * position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #ifndef HK_SHADOW
    vec3 upright = foot + uRight * position.x + vec3(0.0, max(position.y, 0.0), 0.0) + uToCam3 * 0.3;
    vec4 u = projectionMatrix * viewMatrix * vec4(upright, 1.0);
    gl_Position.z = (u.z / u.w) * gl_Position.w;
  #endif
  vUv = uv;
  vFoot = foot;
  vHeight = max(position.y, 0.0);
}
`;

export const STANDEE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 uAmbient;
uniform float uFlash;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vFoot;
varying float vHeight;
${LIGHT_DECL.replace('varying vec3 vHkWorld;', '')}
void main() {
  vec2 ts = vec2(textureSize(map, 0));
  vec2 t = vUv * ts;
  vec2 seam = floor(t + 0.5);
  vec2 fw = max(fwidth(t), vec2(1e-4));
  t = seam + clamp((t - seam) / fw, -0.5, 0.5);
  vec4 c = texture2D(map, t / ts);
  if (c.a < 0.5) discard;
  vec3 light = uAmbient + hkArtificial(vec3(vFoot.x, vHeight, vFoot.z));
  vec3 col = c.rgb * light;
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const STANDEE_DEPTH_FRAGMENT = /* glsl */ `
#include <packing>
uniform sampler2D map;
varying vec2 vUv;
void main() {
  if (texture2D(map, vUv).a < 0.5) discard;
  gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
}
`;

/** Full-screen grade (art_pipeline.md 2.9): tilt-shift, light grade, film look, vignette, grain. */
export const GRADE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const GRADE_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform vec3 uTint;
uniform vec3 uShade;
uniform float uSat;
uniform float uLift;
uniform float uWarm;
uniform float uTeal;
uniform float uContrast;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uTilt;
uniform vec3 uHazeColor;
uniform float uHaze;
uniform vec3 uVigColor;
uniform float uVigStrength;
uniform float uFlash;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  if (uTilt > 0.0) {
    float d = abs(vUv.y - 0.5) * 2.0;
    float r = smoothstep(0.55, 1.0, d) * uTilt;
    if (r > 0.0) {
      vec3 acc = c.rgb;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7854;
        acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r * 2.5 / uRes).rgb;
      }
      c.rgb = acc / 9.0;
    }
  }
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  c.rgb *= uTint;
  c.rgb *= mix(uShade, vec3(1.0), smoothstep(0.0, 0.35, lum));
  c.rgb = mix(vec3(lum), c.rgb, uSat);
  c.rgb += uLift * uShade * 0.05;
  c.rgb += vec3(uWarm, uWarm * 0.45, -uWarm * 0.3) * smoothstep(0.35, 1.0, lum) * 0.5;
  c.rgb += vec3(-uTeal * 0.3, uTeal * 0.12, uTeal * 0.28) * (1.0 - smoothstep(0.0, 0.25, lum)) * 0.25;
  c.rgb = max(vec3(0.0), (c.rgb - 0.18) * uContrast + 0.18);
  c.rgb = mix(c.rgb, uHazeColor, uHaze);
  float v = smoothstep(0.4, 1.0, length((vUv - 0.5) * vec2(1.0, 0.85)) * 1.414);
  c.rgb *= 1.0 - v * uVignette;
  c.rgb = mix(c.rgb, uVigColor, v * uVigStrength);
  c.rgb += (hash(vUv * uRes + fract(uTime)) - 0.5) * uGrain * (0.4 + lum);
  c.rgb = mix(c.rgb, vec3(0.85, 0.9, 1.0), uFlash);
  gl_FragColor = c;
}
`;
