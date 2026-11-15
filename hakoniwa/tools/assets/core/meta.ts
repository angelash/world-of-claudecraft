// Step 10 (art_pipeline.md 13): the frame metadata written next to every processed image,
// assets/processed/<category>/<id>.json. Bump IMPORT_VERSION whenever any step's output can
// change; processed results carry it, and `assets:check` lists results made by another version.

import type { Problem } from './reasons';

export const IMPORT_VERSION = '1.0.0';

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
