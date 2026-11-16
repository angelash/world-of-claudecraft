// Runtime shapes of the art the import pipeline writes (art_pipeline.md 6.5 and 13 step 10):
// the manifest fields the asset resolver reads and the processed frame metadata next to each
// processed image. They mirror tools/assets/core/manifest.ts and meta.ts structurally, so the
// pure layer never imports tools/ (only the DOM-side loader takes the alias table and the
// import version from there); tests/client_assets.test.ts pins the two against each other.
// Pure types and constants.

/** Review states of a manifest record; only `approved` art is ever drawn. */
export const ASSET_STATUSES = ['review', 'approved', 'rework', 'rejected', 'retired'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** The manifest fields the resolver reads (assets/manifest.json keeps more). */
export interface AssetRecord {
  id: string;
  kind: 'art' | 'audio';
  /** path relative to assets/ (art/monsters/art_mon_dian_rat_d.png) */
  file: string;
  template: string;
  status: AssetStatus;
}

/** One frame of a processed sheet (tools/assets/core/meta.ts FrameMeta). */
export interface AssetFrame {
  anim: string;
  dir: string;
  /** frame index inside the animation */
  i: number;
  /** rectangle in the processed sheet */
  x: number;
  y: number;
  w: number;
  h: number;
  /** anchor inside the frame (null when the template has none) */
  ax: number | null;
  ay: number | null;
  ms: number | null;
  footprint: number;
  /** a mirrored frame: the same rectangle drawn flipped horizontally */
  flipX?: boolean;
}

export interface AssetAnim {
  /** indices into `frames`, by frame number */
  frames: number[];
  ms: (number | null)[];
  loop: boolean;
  hold: boolean;
  stepTiles?: number;
}

/** Processed metadata of one asset (assets/processed/<category>/<id>.json). */
export interface AssetMeta {
  id: string;
  template: string;
  style: string | null;
  size: [number, number];
  cell: [number, number];
  grid: [number, number];
  frames: AssetFrame[];
  /** keyed "<anim>/<dir>" */
  anims: Record<string, AssetAnim>;
  directions: { drawn: string[]; mirrored: { dir: string; from: string }[] };
  swatch: string[];
  processing: Record<string, unknown>;
}

/** Processed image of a manifest file (art/x/y.png is processed/x/y.png), as meta.ts does. */
export function processedPathOf(file: string): string {
  return `processed/${file.replace(/^art\//, '')}`;
}

/** Processed metadata path of a manifest file (processed/x/y.json). */
export function metaPathOf(file: string): string {
  return processedPathOf(file).replace(/\.[a-z0-9]+$/, '.json');
}
