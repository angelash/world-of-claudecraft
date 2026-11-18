// The art the renderers draw from (art_pipeline.md 2.1 and 6.4): the installed resolver and
// the decoded sheet pixels. Until the bootstrap installs something (./loader.ts), and for
// every look without approved art, frameKey and buildFrame are exactly the procedural
// generator's spriteKey and generateFrame, so with no art the renderers draw the first-round
// picture bit for bit. A paper doll is composed from its approved parts (doll_compose.ts) only
// when every named part is in; until then it is the same placeholder. Pure apart from the one
// installed value, which only presentation reads.

import type { AnimName, Dir } from '../sprites/anim_spec';
import { frameEffects, generateFrame, type SpriteFrame, spriteKey } from '../sprites/generate';
import type { SpriteLook } from '../sprites/look';
import type { PixelMatrix } from '../sprites/pixels';
import { composeDoll } from './doll_compose';
import { assetSpriteFrame, framePixels } from './frames';
import { AssetResolver, type ResolvedFrame } from './resolver';
import { portraitSource, spriteSource } from './sprite_source';

/** Decoded processed sheets by asset id. */
export interface SheetPixels {
  get(assetId: string): PixelMatrix | undefined;
}

const NO_PIXELS: SheetPixels = { get: () => undefined };

let resolver = AssetResolver.empty();
let pixels: SheetPixels = NO_PIXELS;
/** Resolved art per look and frame, so a standee shown every frame resolves once. */
let memo = new WeakMap<SpriteLook, Map<string, ArtHit | null>>();

/** Install the art the renderers use (the loader calls this once at startup). */
export function installAssets(r: AssetResolver, p: SheetPixels): void {
  resolver = r;
  pixels = p;
  memo = new WeakMap();
}

/** Back to no art (tests). */
export function resetAssets(): void {
  installAssets(AssetResolver.empty(), NO_PIXELS);
}

export function installedResolver(): AssetResolver {
  return resolver;
}

type ArtHit =
  | { key: string; frame: ResolvedFrame; sheet: PixelMatrix; composed?: undefined }
  | { key: string; composed: SpriteFrame };

function resolveArt(look: SpriteLook, anim: AnimName, dir: Dir, frame: number): ArtHit | null {
  const s = spriteSource(resolver, look, anim, dir, frame);
  if (s.kind === 'procedural' && s.reason === 'doll_compositor') {
    const doll = composeDoll(resolver, pixels, look, anim, dir, frame);
    return doll ? { key: doll.key, composed: doll.frame } : null;
  }
  if (s.kind !== 'sheet') return null;
  const sheet = pixels.get(s.frame.assetId);
  if (!sheet) return null;
  const f = s.frame;
  // The same art frame can be shown with different effects (a hit flashes, a block does not).
  const fx = frameEffects(look.archetype, anim, frame);
  const key = `art:${f.assetId}#${f.index}${f.flipX ? 'm' : ''}:${fx.alpha}:${fx.flash}@${look.key}`;
  return { key, frame: f, sheet };
}

function artFor(look: SpriteLook, anim: AnimName, dir: Dir, frame: number): ArtHit | null {
  if (resolver.size === 0) return null;
  let byFrame = memo.get(look);
  if (!byFrame) {
    byFrame = new Map();
    memo.set(look, byFrame);
  }
  const k = `${anim}|${dir}|${frame}`;
  let hit = byFrame.get(k);
  if (hit === undefined) {
    hit = resolveArt(look, anim, dir, frame);
    byFrame.set(k, hit);
  }
  return hit;
}

/** Cache key of the frame a standee shows (art when approved and decoded, else procedural). */
export function frameKey(look: SpriteLook, anim: AnimName, dir: Dir, frame: number): string {
  return artFor(look, anim, dir, frame)?.key ?? spriteKey(look, anim, dir, frame);
}

/** The frame a standee shows, from art when it is approved and decoded, else procedural. */
export function buildFrame(look: SpriteLook, anim: AnimName, dir: Dir, frame: number): SpriteFrame {
  const art = artFor(look, anim, dir, frame);
  if (!art) return generateFrame(look, anim, dir, frame);
  return art.composed ?? assetSpriteFrame(art.sheet, art.frame, look, anim, frame);
}

/**
 * The decoded pixels of an approved single-image asset (a far-sky layer strip), or null to
 * keep the placeholder (art_pipeline.md 2.13, 6.4).
 */
export function bitmapPixels(assetId: string): PixelMatrix | null {
  if (resolver.size === 0 || !resolver.has(assetId)) return null;
  return pixels.get(assetId) ?? null;
}

/** Portrait pixels for a look's expression, or null to crop the standee (art_pipeline.md 3.6). */
export function portraitPixels(look: SpriteLook, expression = 'neutral'): PixelMatrix | null {
  if (resolver.size === 0) return null;
  const s = portraitSource(resolver, look, expression);
  if (s.kind !== 'portrait') return null;
  const sheet = pixels.get(s.frame.assetId);
  return sheet ? framePixels(sheet, s.frame) : null;
}
