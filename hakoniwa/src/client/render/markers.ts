// Overhead pixel glyphs (art_pipeline.md 3.6): small world-tier symbols drawn above a
// head, one at a time, highest priority first. They are pixel shapes, not text or
// emoji. Which marker an entity shows comes from a phase-2 adapter (quests, cognition).

import { createMatrix, type PixelMatrix, type Rgb, setPixel } from '../sprites/pixels';

export type MarkerKind =
  | 'quest'
  | 'turn_in'
  | 'surprise'
  | 'question'
  | 'witness'
  | 'thinking'
  | 'whisper'
  | 'anger'
  | 'heart'
  | 'door';

/** Higher shows first when an entity has several. */
export const MARKER_PRIORITY: Record<MarkerKind, number> = {
  turn_in: 90,
  quest: 80,
  door: 70,
  witness: 60,
  anger: 50,
  surprise: 40,
  question: 30,
  heart: 20,
  whisper: 15,
  thinking: 10,
};

// '#' fill, '+' highlight, '.' outline, ' ' empty.
const GLYPHS: Record<MarkerKind, string[]> = {
  quest: ['.....', '.#+#.', '.#+#.', '.###.', '.###.', '..#..', '.....', '.###.', '.....'],
  turn_in: [
    '.......',
    '.##+##.',
    '.#...#.',
    '....##.',
    '...##..',
    '...#...',
    '.......',
    '...#...',
    '.......',
  ],
  surprise: ['...', '.#.', '.#.', '.#.', '...', '.#.', '...'],
  question: ['.....', '.###.', '....#', '..##.', '..#..', '.....', '..#..', '.....'],
  witness: [
    '.........',
    '..#####..',
    '.#+...+#.',
    '#..###..#',
    '.#.....#.',
    '..#####..',
    '.........',
  ],
  thinking: ['.........', '.#..#..#.', '.........'],
  whisper: ['.......', '.#####.', '.#...#.', '.#####.', '..#....', '.......'],
  anger: ['.......', '.#...#.', '..#.#..', '.......', '..#.#..', '.#...#.', '.......'],
  heart: ['.......', '.##.##.', '.#####.', '.#####.', '..###..', '...#...', '.......'],
  door: ['.......', '..###..', '.#+++#.', '.#+++#.', '.#++#+.', '.#+++#.', '.#####.'],
};

const COLORS: Record<MarkerKind, [Rgb, Rgb, Rgb]> = {
  quest: [0xf2c94c, 0xfff2b0, 0x5a3a10],
  turn_in: [0xf2c94c, 0xfff2b0, 0x5a3a10],
  surprise: [0xffffff, 0xffffff, 0x3a3048],
  question: [0xd8e4f0, 0xffffff, 0x2a3448],
  witness: [0xe8d070, 0xfff8d0, 0x3a2a10],
  thinking: [0xe8e8ec, 0xffffff, 0x3a3a48],
  whisper: [0xc8d8f0, 0xffffff, 0x283850],
  anger: [0xe05040, 0xff9080, 0x4a1010],
  heart: [0xe06080, 0xffa0b8, 0x4a1020],
  door: [0xe2b04a, 0xfff0c0, 0x4a3010],
};

const cache = new Map<MarkerKind, PixelMatrix>();

export function markerMatrix(kind: MarkerKind): PixelMatrix {
  let m = cache.get(kind);
  if (m) return m;
  const rows = GLYPHS[kind];
  const w = Math.max(...rows.map((r) => r.length));
  m = createMatrix(w, rows.length);
  const [fill, hi, line] = COLORS[kind];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '#') setPixel(m as PixelMatrix, x, y, fill);
      else if (ch === '+') setPixel(m as PixelMatrix, x, y, hi);
      else if (ch === '.') setPixel(m as PixelMatrix, x, y, line);
    }
  });
  cache.set(kind, m);
  return m;
}

export function topMarker(kinds: readonly MarkerKind[]): MarkerKind | null {
  let best: MarkerKind | null = null;
  for (const k of kinds) if (!best || MARKER_PRIORITY[k] > MARKER_PRIORITY[best]) best = k;
  return best;
}

/**
 * Vertical bob of an overhead marker in device pixels at an overlay scale (device pixels
 * per sprite pixel). Whole pixels, so the frame scheduler can tell when it moves.
 */
export function markerBob(timeMs: number, scale: number): number {
  return Math.round(Math.sin(timeMs / 300) * Math.max(1, scale));
}
