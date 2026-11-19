// src/client/assets/: the asset resolver (art_pipeline.md 2.1, 6.4 and 6.5). Renderers ask it
// for the approved AI art of a look and keep the procedural placeholder whenever there is
// none: an id that the manifest does not list, or lists as review, rework, rejected or
// retired, always draws the placeholder. The pure layer (types, resolver, sprite_source,
// frames, runtime) is Node-tested and registered in CLIENT_PURE_CORES; the loader reads the
// manifest and decodes images in the browser; release reads its slim approved-media pack.

export { installApprovedArt, type LoadOptions, loadAssets } from './loader';
export {
  type AssetHit,
  type AssetLookup,
  type AssetMiss,
  type AssetMissReason,
  AssetResolver,
  type AssetSource,
  type ResolvedFrame,
  variantId,
} from './resolver';
export {
  buildFrame,
  frameKey,
  installAssets,
  installedResolver,
  portraitPixels,
  resetAssets,
  type SheetPixels,
} from './runtime';
export {
  activeArt,
  type BustSource,
  bustSource,
  dollPlan,
  type PortraitSource,
  portraitSource,
  type SpriteSource,
  spriteSource,
} from './sprite_source';
export type { AssetFrame, AssetMeta, AssetRecord, AssetStatus } from './types';
