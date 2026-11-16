// Digests of the procedural render inputs (the format of tests/fixtures/procedural_baseline.json,
// captured with the first-round code before PK-M0-10): per entity every frame key, pixel hash,
// size, anchor, height, lift and glow over the five first-round animations in four
// directions; per built map its style pack, scene layout and roof meshes. Shared by
// tests/client_assets.test.ts and tests/client_hd2d.test.ts.

import { buildFrame, frameKey } from '../src/client/assets/runtime';
import { roofMesh } from '../src/client/hd2d/geometry';
import { buildLayout } from '../src/client/hd2d/layout';
import { stylePackFor } from '../src/client/hd2d/style_packs';
import { type AnimName, DIRS } from '../src/client/sprites/anim_spec';
import { frameCountFor } from '../src/client/sprites/generate';
import { lookFromEntity } from '../src/client/sprites/look';
import { matrixHash } from '../src/client/sprites/pixels';
import type { Appearance, MapDef } from '../src/systems/world/types';

/** The animations of the first round, in their capture order. */
export const FIRST_ROUND_ANIMS: readonly AnimName[] = ['idle', 'walk', 'attack', 'hit', 'death'];

export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (x instanceof Map) return [...x.entries()];
    if (x instanceof Set) return [...x.values()];
    if (ArrayBuffer.isView(x)) return Array.from(x as unknown as ArrayLike<number>);
    return x;
  });
}

/**
 * Digest of what the renderers draw for an entity, through the same calls they make
 * (frameKey and buildFrame of src/client/assets/runtime.ts).
 */
export function entityDigest(
  appearance: Appearance,
  kind: string,
  ref?: string,
): { look: string; frames: string; count: number } {
  const look = lookFromEntity({ appearance, kind, ref });
  const parts: string[] = [];
  let count = 0;
  for (const anim of FIRST_ROUND_ANIMS) {
    for (const dir of DIRS) {
      for (let f = 0; f < frameCountFor(look, anim); f++) {
        const fr = buildFrame(look, anim, dir, f);
        parts.push(
          [
            frameKey(look, anim, dir, f),
            matrixHash(fr.matrix),
            fr.matrix.w,
            fr.matrix.h,
            fr.anchorX,
            fr.anchorY,
            fr.height,
            fr.lift,
            fr.glow ? `${fr.glow.radius}:${fr.glow.color}` : '-',
          ].join(','),
        );
        count++;
      }
    }
  }
  const lookStr = stable({
    archetype: look.archetype,
    scale: look.scale,
    primary: look.primary,
    secondary: look.secondary,
    skin: look.skin,
    hair: look.hair,
    glow: look.glow,
    glyph: look.glyph,
    key: look.key,
  });
  return { look: fnv(lookStr), frames: fnv(parts.join('|')), count };
}

/** Digest of a built map's static HD-2D inputs: style pack, scene layout, roof meshes. */
export function mapDigest(map: MapDef): { pack: string; layout: string; roofs: string } {
  const pack = stylePackFor(map);
  const layout = buildLayout(map, pack);
  const roofs = layout.buildings.map((b) =>
    stable(roofMesh(b.rect, b.look.wallHeight, b.look.roof, b.ridge)),
  );
  return { pack: fnv(stable(pack)), layout: fnv(stable(layout)), roofs: fnv(roofs.join('|')) };
}
