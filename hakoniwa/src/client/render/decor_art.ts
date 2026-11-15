// Procedural decor and building-sign sprites (art_pipeline.md 1.7 and 6.2): street lamps,
// wells, barrels, crates, fences, stalls and the rest of the look layer's decor kinds,
// drawn with the same shape-grid pipeline as the paper doll (upper-left light, outline
// from the neighbour's ramp) at 16 pixels per metre. Both renderers use these: the
// HD-2D scene as standees, the flat fallback as depth-sorted props. Pure; Node-tested.

import type { DecorKind, SignKind } from '../../systems/world/look';
import { shadeRamp } from '../sprites/palette';
import type { PixelMatrix, Rgb } from '../sprites/pixels';
import {
  autoShade,
  colorize,
  createShape,
  drawLine,
  fillEllipse,
  fillRect,
  fillTriangle,
  outline,
  type ShapeGrid,
  SLOT,
  setCell,
} from '../sprites/shape';

export interface DecorSprite {
  matrix: PixelMatrix;
  /** foot position inside the matrix */
  anchorX: number;
  anchorY: number;
  /** a light source position (pixels inside the matrix) when the decor emits light */
  lightAt?: { x: number; y: number };
}

const WOOD = 0x8a6440;
const DARK_WOOD = 0x5e4228;
const IRON = 0x5a5a62;
const STONE = 0x9a958a;
const CLOTH = 0xb8463a;
const STRAW = 0xd0b060;

function finish(
  g: ShapeGrid,
  colors: Partial<Record<number, Rgb>>,
  anchorX: number,
  anchorY: number,
  lightAt?: { x: number; y: number },
  glow?: Rgb,
): DecorSprite {
  autoShade(g);
  outline(g);
  const palette: Partial<Record<number, Rgb[]>> = {};
  for (const [slot, c] of Object.entries(colors)) palette[Number(slot)] = shadeRamp(c as Rgb);
  const matrix = colorize(g, palette, glow !== undefined ? { glow } : {});
  return lightAt ? { matrix, anchorX, anchorY, lightAt } : { matrix, anchorX, anchorY };
}

function lamp(): DecorSprite {
  const g = createShape(12, 44);
  fillRect(g, 5, 10, 2, 32, SLOT.METAL);
  fillRect(g, 3, 41, 6, 2, SLOT.METAL);
  fillRect(g, 2, 3, 8, 8, SLOT.METAL);
  fillRect(g, 3, 4, 6, 6, SLOT.GLOW);
  fillTriangle(g, 1, 3, 11, 3, 6, 0, SLOT.METAL);
  return finish(g, { [SLOT.METAL]: 0x3e3e46 }, 6, 42, { x: 6, y: 7 }, 0xffe0a0);
}

function brazier(): DecorSprite {
  const g = createShape(14, 22);
  fillRect(g, 3, 9, 8, 4, SLOT.METAL);
  drawLine(g, 4, 13, 2, 20, 1, SLOT.METAL);
  drawLine(g, 9, 13, 11, 20, 1, SLOT.METAL);
  fillEllipse(g, 7, 6, 3, 4, SLOT.GLOW);
  return finish(g, { [SLOT.METAL]: IRON }, 7, 20, { x: 7, y: 6 }, 0xffa040);
}

function well(): DecorSprite {
  const g = createShape(26, 34);
  fillEllipse(g, 13, 26, 11, 5, SLOT.SECONDARY);
  fillRect(g, 2, 20, 22, 7, SLOT.SECONDARY);
  fillEllipse(g, 13, 20, 9, 3, SLOT.METAL, 3);
  fillRect(g, 3, 4, 2, 17, SLOT.LEATHER);
  fillRect(g, 21, 4, 2, 17, SLOT.LEATHER);
  fillTriangle(g, 0, 6, 26, 6, 13, 0, SLOT.PRIMARY);
  fillRect(g, 12, 7, 1, 7, SLOT.METAL);
  fillRect(g, 11, 13, 3, 3, SLOT.LEATHER);
  return finish(
    g,
    {
      [SLOT.PRIMARY]: 0xa8543a,
      [SLOT.SECONDARY]: STONE,
      [SLOT.LEATHER]: DARK_WOOD,
      [SLOT.METAL]: 0x2a3a4a,
    },
    13,
    31,
  );
}

function barrel(): DecorSprite {
  const g = createShape(12, 16);
  fillEllipse(g, 6, 8, 5, 7, SLOT.PRIMARY);
  fillRect(g, 1, 4, 10, 1, SLOT.METAL);
  fillRect(g, 1, 11, 10, 1, SLOT.METAL);
  fillEllipse(g, 6, 2, 4, 1.5, SLOT.PRIMARY, 1);
  return finish(g, { [SLOT.PRIMARY]: WOOD, [SLOT.METAL]: IRON }, 6, 14);
}

function crate(variant: number): DecorSprite {
  const g = createShape(14, 15);
  fillRect(g, 1, 3, 12, 11, SLOT.PRIMARY);
  fillRect(g, 1, 1, 12, 3, SLOT.PRIMARY, 1);
  drawLine(g, 2, 4, 11, 12, 1, SLOT.LEATHER);
  if (variant % 2) drawLine(g, 11, 4, 2, 12, 1, SLOT.LEATHER);
  return finish(g, { [SLOT.PRIMARY]: 0xa07a4a, [SLOT.LEATHER]: DARK_WOOD }, 7, 13);
}

function fence(): DecorSprite {
  const g = createShape(18, 16);
  for (const x of [1, 8, 15]) {
    fillRect(g, x, 3, 2, 12, SLOT.PRIMARY);
    setCell(g, x, 2, SLOT.PRIMARY);
  }
  fillRect(g, 0, 5, 18, 2, SLOT.PRIMARY, 1);
  fillRect(g, 0, 10, 18, 2, SLOT.PRIMARY);
  return finish(g, { [SLOT.PRIMARY]: 0x9a7448 }, 9, 14);
}

function stall(variant: number): DecorSprite {
  const g = createShape(32, 34);
  fillRect(g, 3, 10, 2, 22, SLOT.LEATHER);
  fillRect(g, 27, 10, 2, 22, SLOT.LEATHER);
  fillRect(g, 2, 21, 28, 6, SLOT.SECONDARY);
  for (let x = 0; x < 32; x++) {
    const stripe = Math.floor(x / 4) % 2 === 0;
    for (let y = 2; y < 10; y++) {
      if (y < 2 + Math.abs(16 - x) / 8) continue;
      setCell(g, x, y, stripe ? SLOT.PRIMARY : SLOT.WHITE);
    }
  }
  fillEllipse(g, 9, 20, 3, 2, SLOT.ACCENT);
  fillEllipse(g, 16, 20, 3, 2, variant % 2 ? SLOT.ACCENT : SLOT.HAIR);
  fillEllipse(g, 23, 20, 3, 2, SLOT.HAIR);
  return finish(
    g,
    {
      [SLOT.PRIMARY]: variant % 3 === 1 ? 0x3e6a8a : variant % 3 === 2 ? 0x5a7a3a : CLOTH,
      [SLOT.WHITE]: 0xece6d8,
      [SLOT.SECONDARY]: WOOD,
      [SLOT.LEATHER]: DARK_WOOD,
      [SLOT.ACCENT]: 0xd8a040,
      [SLOT.HAIR]: 0x8ab050,
    },
    16,
    31,
  );
}

function bench(): DecorSprite {
  const g = createShape(22, 12);
  fillRect(g, 1, 4, 20, 3, SLOT.PRIMARY, 1);
  fillRect(g, 2, 7, 2, 4, SLOT.LEATHER);
  fillRect(g, 18, 7, 2, 4, SLOT.LEATHER);
  return finish(g, { [SLOT.PRIMARY]: WOOD, [SLOT.LEATHER]: DARK_WOOD }, 11, 10);
}

function banner(variant: number): DecorSprite {
  const g = createShape(12, 40);
  fillRect(g, 1, 0, 2, 39, SLOT.LEATHER);
  fillRect(g, 3, 2, 8, 14, SLOT.PRIMARY);
  fillTriangle(g, 3, 16, 11, 16, 7, 20, SLOT.PRIMARY);
  fillRect(g, 5, 6, 4, 4, SLOT.ACCENT);
  return finish(
    g,
    {
      [SLOT.PRIMARY]: variant % 2 ? 0x3e4a7a : 0x8a2e2a,
      [SLOT.LEATHER]: DARK_WOOD,
      [SLOT.ACCENT]: 0xd8b04a,
    },
    2,
    38,
  );
}

function statue(): DecorSprite {
  const g = createShape(18, 40);
  fillRect(g, 2, 30, 14, 9, SLOT.SECONDARY);
  fillRect(g, 6, 14, 6, 16, SLOT.PRIMARY);
  fillEllipse(g, 9, 10, 3.5, 4, SLOT.PRIMARY);
  drawLine(g, 6, 16, 3, 24, 2, SLOT.PRIMARY);
  drawLine(g, 12, 16, 15, 8, 2, SLOT.PRIMARY);
  return finish(g, { [SLOT.PRIMARY]: 0xb8b4a8, [SLOT.SECONDARY]: 0x8a867c }, 9, 38);
}

function grave(variant: number): DecorSprite {
  const g = createShape(12, 16);
  if (variant % 2) {
    fillRect(g, 5, 1, 2, 13, SLOT.PRIMARY);
    fillRect(g, 2, 4, 8, 2, SLOT.PRIMARY);
  } else {
    fillRect(g, 2, 5, 8, 9, SLOT.PRIMARY);
    fillEllipse(g, 6, 5, 4, 3, SLOT.PRIMARY);
  }
  return finish(g, { [SLOT.PRIMARY]: 0x8a8a84 }, 6, 14);
}

function haystack(): DecorSprite {
  const g = createShape(22, 18);
  fillEllipse(g, 11, 11, 10, 7, SLOT.PRIMARY);
  fillEllipse(g, 11, 6, 6, 4, SLOT.PRIMARY);
  return finish(g, { [SLOT.PRIMARY]: STRAW }, 11, 16);
}

function cart(): DecorSprite {
  const g = createShape(30, 20);
  fillRect(g, 3, 5, 22, 8, SLOT.PRIMARY);
  fillRect(g, 3, 3, 22, 2, SLOT.PRIMARY, 1);
  drawLine(g, 25, 11, 30, 13, 1, SLOT.LEATHER);
  fillEllipse(g, 8, 15, 4, 4, SLOT.LEATHER);
  fillEllipse(g, 20, 15, 4, 4, SLOT.LEATHER);
  fillEllipse(g, 8, 15, 1, 1, SLOT.METAL);
  fillEllipse(g, 20, 15, 1, 1, SLOT.METAL);
  return finish(g, { [SLOT.PRIMARY]: WOOD, [SLOT.LEATHER]: DARK_WOOD, [SLOT.METAL]: IRON }, 14, 18);
}

function signBoard(): DecorSprite {
  const g = createShape(14, 26);
  fillRect(g, 6, 8, 2, 17, SLOT.LEATHER);
  fillRect(g, 1, 1, 12, 8, SLOT.PRIMARY);
  fillRect(g, 3, 3, 8, 1, SLOT.METAL);
  fillRect(g, 3, 5, 6, 1, SLOT.METAL);
  return finish(
    g,
    { [SLOT.PRIMARY]: 0xa07a4a, [SLOT.LEATHER]: DARK_WOOD, [SLOT.METAL]: 0x3a2a1a },
    7,
    24,
  );
}

const cache = new Map<string, DecorSprite>();

export function decorSprite(kind: DecorKind, variant = 0): DecorSprite {
  const v = Math.abs(variant) % 3;
  const key = `${kind}:${v}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let s: DecorSprite;
  switch (kind) {
    case 'lamp':
      s = lamp();
      break;
    case 'brazier':
      s = brazier();
      break;
    case 'well':
      s = well();
      break;
    case 'barrel':
      s = barrel();
      break;
    case 'crate':
      s = crate(v);
      break;
    case 'fence':
      s = fence();
      break;
    case 'stall':
      s = stall(v);
      break;
    case 'bench':
      s = bench();
      break;
    case 'banner':
      s = banner(v);
      break;
    case 'statue':
      s = statue();
      break;
    case 'grave':
      s = grave(v);
      break;
    case 'haystack':
      s = haystack();
      break;
    case 'cart':
      s = cart();
      break;
    default:
      s = signBoard();
  }
  cache.set(key, s);
  return s;
}

/** Hanging shop sign by a door: a bracket and a board with the trade's glyph. */
export function shopSignSprite(kind: SignKind): DecorSprite | null {
  if (kind === 'none') return null;
  const key = `shop:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = createShape(14, 14);
  fillRect(g, 0, 0, 14, 1, SLOT.METAL);
  fillRect(g, 3, 1, 1, 2, SLOT.METAL);
  fillRect(g, 10, 1, 1, 2, SLOT.METAL);
  fillRect(g, 1, 3, 12, 10, SLOT.PRIMARY);
  const glyph = SLOT.ACCENT;
  switch (kind) {
    case 'mug':
      fillRect(g, 4, 6, 5, 5, glyph);
      fillRect(g, 9, 7, 1, 3, glyph);
      break;
    case 'anvil':
      fillRect(g, 3, 6, 8, 2, glyph);
      fillRect(g, 5, 8, 4, 2, glyph);
      fillRect(g, 4, 10, 6, 1, glyph);
      break;
    case 'scales':
      fillRect(g, 6, 5, 2, 6, glyph);
      fillRect(g, 3, 6, 8, 1, glyph);
      fillRect(g, 3, 8, 2, 1, glyph);
      fillRect(g, 9, 8, 2, 1, glyph);
      break;
    case 'book':
      fillRect(g, 3, 6, 4, 5, glyph);
      fillRect(g, 7, 6, 4, 5, glyph);
      break;
    case 'cross':
      fillRect(g, 6, 5, 2, 7, glyph);
      fillRect(g, 4, 7, 6, 2, glyph);
      break;
    case 'herb':
      drawLine(g, 7, 11, 7, 5, 1, glyph);
      fillEllipse(g, 5, 7, 1.5, 1, glyph);
      fillEllipse(g, 9, 6, 1.5, 1, glyph);
      break;
    case 'shield':
      fillRect(g, 4, 5, 6, 4, glyph);
      fillTriangle(g, 4, 9, 10, 9, 7, 12, glyph);
      break;
    case 'bread':
      fillEllipse(g, 7, 8, 4, 2.5, glyph);
      drawLine(g, 5, 7, 6, 9, 1, SLOT.PRIMARY);
      drawLine(g, 8, 7, 9, 9, 1, SLOT.PRIMARY);
      break;
    case 'wheel':
      fillEllipse(g, 7, 8, 4, 4, glyph);
      fillEllipse(g, 7, 8, 2, 2, SLOT.PRIMARY);
      fillRect(g, 7, 4, 1, 9, glyph);
      fillRect(g, 3, 8, 9, 1, glyph);
      break;
    case 'horseshoe':
      fillRect(g, 4, 5, 2, 6, glyph);
      fillRect(g, 9, 5, 2, 6, glyph);
      fillRect(g, 5, 10, 5, 2, glyph);
      break;
  }
  const s = finish(
    g,
    { [SLOT.PRIMARY]: 0x7a5a38, [SLOT.METAL]: 0x3a3a40, [SLOT.ACCENT]: 0xe8d8a8 },
    7,
    13,
  );
  cache.set(key, s);
  return s;
}
