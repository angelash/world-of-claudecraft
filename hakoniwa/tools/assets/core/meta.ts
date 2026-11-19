// Step 10 (art_pipeline.md 13): the frame metadata written next to every processed image,
// assets/processed/<category>/<id>.json. Bump ART_IMPORT_VERSION in import_versions.ts when
// art output can change; audio has its own version. IMPORT_VERSION stays an art-only alias
// for existing art consumers (pipeline, atlas and client loader).

import type { Problem } from './reasons';

export { ART_IMPORT_VERSION as IMPORT_VERSION } from './import_versions';

export interface FrameMeta {
  anim: string;
  dir: string;
  i: number;
  /** Rectangle in the processed sheet. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Anchor inside the frame (null when the template has none). */
  ax: number | null;
  ay: number | null;
  ms: number | null;
  footprint: number;
  /** Mirrored frame: same rectangle drawn flipped horizontally. */
  flipX?: boolean;
}

export interface AnimMeta {
  frames: number[];
  ms: (number | null)[];
  loop: boolean;
  hold: boolean;
  stepTiles?: number;
}

export interface ArtMeta {
  id: string;
  kind: 'art';
  template: string;
  style: string | null;
  importVersion: string;
  source: {
    file: string;
    sha256: string;
    w: number;
    h: number;
    colorType: number;
    bitDepth: number;
  };
  aigcLabel: string;
  size: [number, number];
  cell: [number, number];
  grid: [number, number];
  palette: string;
  swatch: string[];
  slots: Record<string, { slot: string; level: number }>;
  frames: FrameMeta[];
  anims: Record<string, AnimMeta>;
  directions: { drawn: string[]; mirrored: { dir: string; from: string }[] };
  processing: Record<string, unknown>;
  problems: Problem[];
}

/** Processed-file location for an asset file path relative to assets/ (art/x/y.png -> processed/x/y.png). */
export function processedPathOf(file: string): string {
  return `processed/${file.replace(/^art\//, '')}`;
}

export function metaPathOf(file: string): string {
  return processedPathOf(file).replace(/\.[a-z0-9]+$/, '.json');
}
