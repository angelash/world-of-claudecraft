// Which art a look shows (art_pipeline.md 3.1, 3.6 and 3.8): the resolution order for
// standees is the frame sheet, then the paper doll, then the procedural placeholder; for
// portraits the portrait sheet, then a crop of the standee; for half-body portraits the bust,
// then the portrait one size up, then the crop. Every step only takes approved art, so an id
// without approved art always ends on the placeholder. Pure.
//
// Sheets: a main character's strips are <sheet>_<strip> (art_chr_yeyu_walk) with rows for
// down, right and up and mirrored left frames. A creature's sheets are one per direction
// (art_mon_dian_rat_d, _r, _u; left mirrors _r); a creature without a facing has only its _d
// sheet (art_mon_dian_dreg_d, 3.8), shown unmirrored in every direction. A character's strip
// that is not approved yet borrows another strip of the same sheet (run walks, every pose
// without its strip idles), so one figure never mixes art and placeholder; a creature needs
// all its direction sheets approved before it switches to art. Alias subjects (a tainted rung
// that shares its base species' sheets, tools/assets/core/aliases.ts) keep the placeholder
// until the swatch-row recolour exists, so they never look like the base species (3.8).

import { DOLL_LAYERS } from '../../systems/world/appearance';
import type { DollRecipe } from '../../systems/world/types';
import { ANIM_SPECS, type AnimName, type Dir, stripFrame } from '../sprites/anim_spec';
import { CREATURE_BODIES, type LookArt, type SpriteLook } from '../sprites/look';
import type { AssetResolver, ResolvedFrame } from './resolver';

export type SpriteSource =
  | { kind: 'sheet'; frame: ResolvedFrame }
  | { kind: 'procedural'; reason: string };

/**
 * Strips a character borrows, in order, when the animation's own strip is not approved; the
 * idle strip comes last for every animation. A weapon swing only borrows another close
 * attack; the generic attack cue also takes the ranged strip of a character who has nothing
 * else.
 */
const STRIP_FALLBACK: Readonly<Partial<Record<AnimName, readonly AnimName[]>>> = {
  run: ['walk'],
  attack: ['melee', 'thrust', 'shoot'],
  melee: ['thrust'],
  thrust: ['melee'],
  block: ['hit'],
  dodge: ['hit'],
  revive: ['death'],
  ride: ['walk'],
};

/** Animation rows of creature sheets (mon_*, boss_sheet, pet_mount) an animation reads, in order. */
const CREATURE_ROWS: Readonly<Record<AnimName, readonly string[]>> = (() => {
  const rows: Partial<Record<AnimName, readonly string[]>> = {
    walk: ['move', 'walk'],
    run: ['move', 'run', 'walk'],
    ride: ['move', 'walk'],
    attack: ['attack', 'attack_a'],
    melee: ['attack', 'attack_a'],
    thrust: ['attack', 'attack_a'],
    shoot: ['attack', 'attack_b', 'attack_a'],
    cast_release: ['special', 'attack', 'attack_a'],
    hit: ['hit'],
    block: ['hit'],
    dodge: ['hit'],
    death: ['death'],
    revive: ['death'],
  };
  for (const name of Object.keys(ANIM_SPECS) as AnimName[]) rows[name] ??= ['idle'];
  return rows as Record<AnimName, readonly string[]>;
})();

const SHEET_PREFIXES = ['art_mon_', 'art_boss_', 'art_pet_'] as const;

/** The art references in force: a state variant's fields replace the base ones. */
export function activeArt(art: LookArt | undefined, variant?: string): LookArt | undefined {
  if (!art || !variant) return art;
  const v = art.variants?.[variant];
  if (!v) return art;
  return {
    ...art,
    ...(v.sheet ? { sheet: v.sheet } : {}),
    ...(v.portrait ? { portrait: v.portrait } : {}),
    ...(v.bust ? { bust: v.bust } : {}),
  };
}

/** Emotes are drawn facing the viewer only: the figure turns to the camera first (3.4). */
function facingFor(anim: AnimName, dir: Dir): Dir {
  return ANIM_SPECS[anim].strip === 'emote' ? 'down' : dir;
}

/**
 * Frame number of an animation frame inside a sheet row of `n` frames: loops wrap; one-shots
 * spread over the row in proportion and their last frame lands on the row's last (a held death
 * pose stays the row's final pose, whatever its length).
 */
function rowFrame(anim: AnimName, frame: number, n: number): number {
  const spec = ANIM_SPECS[anim];
  const f = stripFrame(anim, frame);
  if (spec.loop) return f % n;
  if (f >= spec.frames - 1) return n - 1;
  return Math.min(n - 1, Math.floor((f * n) / spec.frames));
}

function characterFrame(
  r: AssetResolver,
  sheet: string,
  anim: AnimName,
  dir: Dir,
  frame: number,
): ResolvedFrame | null {
  if (!r.has(`${sheet}_idle`)) return null;
  for (const a of [anim, ...(STRIP_FALLBACK[anim] ?? []), 'idle' as const]) {
    const spec = ANIM_SPECS[a];
    const id = `${sheet}_${spec.strip}`;
    if (!r.has(id)) continue;
    const d = facingFor(a, dir);
    const n = r.frameCount(id, spec.sheetAnim, d);
    if (n === 0) continue;
    const f = r.frame(id, spec.sheetAnim, d, rowFrame(anim, frame, n));
    if (f) return f;
  }
  return null;
}

/**
 * The creature sheets of the first base that has them: all three direction sheets approved,
 * or only a _d sheet approved while the manifest lists no _r or _u sheet at all (a creature
 * without a facing, 3.8).
 */
function creatureSheets(
  r: AssetResolver,
  bases: readonly string[],
): { base: string; front: boolean } | null {
  for (const base of bases) {
    if (!r.has(base, 'down')) continue;
    if (r.has(base, 'right') && r.has(base, 'up')) return { base, front: false };
    if (!r.listed(`${base}_r`) && !r.listed(`${base}_u`)) return { base, front: true };
  }
  return null;
}

function creatureFrame(
  r: AssetResolver,
  bases: readonly string[],
  anim: AnimName,
  dir: Dir,
  frame: number,
): ResolvedFrame | null {
  const set = creatureSheets(r, bases);
  if (!set) return null;
  const rowDir: Dir = set.front ? 'down' : dir;
  const id = `${set.base}${rowDir === 'down' ? '_d' : rowDir === 'up' ? '_u' : '_r'}`;
  for (const row of [...CREATURE_ROWS[anim], 'idle']) {
    const n = r.frameCount(id, row, rowDir);
    if (n === 0) continue;
    const f = r.frame(id, row, rowDir, rowFrame(anim, frame, n));
    if (f) return f;
  }
  return null;
}

/**
 * The art a standee shows for one animation frame, or why it stays procedural. `variant` is
 * the key of the look's state variant in force, when the caller knows one.
 */
export function spriteSource(
  r: AssetResolver,
  look: SpriteLook,
  anim: AnimName,
  dir: Dir,
  frame: number,
  variant?: string,
): SpriteSource {
  if (r.size === 0) return { kind: 'procedural', reason: 'no_art' };
  const art = activeArt(look.art, variant);
  if (!art) return { kind: 'procedural', reason: 'no_reference' };
  const sheet = art.sheet;
  if (sheet) {
    const f = characterFrame(r, sheet, anim, dir, frame);
    if (f) return { kind: 'sheet', frame: f };
  }
  const creatureSheet = !!sheet && SHEET_PREFIXES.some((p) => sheet.startsWith(p));
  let aliased = false;
  if (CREATURE_BODIES.has(look.body) || creatureSheet) {
    const bases: string[] = [];
    if (sheet) bases.push(sheet);
    if (art.subject) {
      const s = r.subject(art.subject);
      aliased = s !== art.subject;
      if (!aliased) for (const p of SHEET_PREFIXES) bases.push(`${p}${s}`);
    }
    const f = creatureFrame(r, bases, anim, dir, frame);
    if (f) return { kind: 'sheet', frame: f };
  }
  if (art.doll) return { kind: 'procedural', reason: 'doll_compositor' };
  return { kind: 'procedural', reason: aliased ? 'alias_recolour' : 'not_approved' };
}

/** One layer of a paper doll for a frame: the approved part's frame, or why it is absent. */
export interface DollLayerPlan {
  layer: (typeof DOLL_LAYERS)[number];
  assetId: string;
  frame: ResolvedFrame | null;
  /** a rigid head part's back row (back hair, the rear brim), drawn under the head (3.3) */
  back?: ResolvedFrame | null;
}

const HEAD_PARTS: ReadonlySet<string> = new Set(['head', 'hair', 'ears', 'headwear', 'beard']);

/**
 * The layers of a paper doll for one frame (art_pipeline.md 3.3), bottom to top: strip layers
 * (back, outfit) read the strip of the animation; rigid head parts read their direction
 * column (front row, plus the optional back row), held items their first grip. The face
 * layer is chosen by body and expression, not by the recipe. Composition needs each body
 * frame's head and hand anchors, which the import does not record yet; the compositor
 * (doll_compose.ts) takes them from the procedural mannequin and composes only when `ready`
 * says every named layer resolved, otherwise the standee keeps the placeholder.
 */
export function dollPlan(
  r: AssetResolver,
  recipe: DollRecipe,
  anim: AnimName,
  dir: Dir,
  frame: number,
): { ready: boolean; layers: DollLayerPlan[] } {
  const spec = ANIM_SPECS[anim];
  const d = facingFor(anim, dir);
  const layers: DollLayerPlan[] = [];
  for (const layer of DOLL_LAYERS) {
    const id = recipe[layer];
    if (!id) continue;
    if (layer === 'outfit') {
      const assetId = `${id}_${spec.strip}`;
      const n = r.frameCount(assetId, spec.sheetAnim, d);
      const f = n > 0 ? r.frame(assetId, spec.sheetAnim, d, rowFrame(anim, frame, n)) : null;
      layers.push({ layer, assetId, frame: f });
    } else if (layer === 'back') {
      layers.push({ layer, assetId: id, frame: r.frame(id, 'rest', d, 0) });
    } else if (layer === 'mainHand' || layer === 'offHand') {
      layers.push({ layer, assetId: id, frame: r.frame(id, 'a000', 'front', 0) });
    } else if (HEAD_PARTS.has(layer)) {
      layers.push({
        layer,
        assetId: id,
        frame: r.frame(id, 'front', d, 0),
        back: r.frame(id, 'back', d, 0),
      });
    }
  }
  return { ready: layers.length > 0 && layers.every((l) => l.frame !== null), layers };
}

export type PortraitSource =
  | { kind: 'portrait'; frame: ResolvedFrame }
  | { kind: 'crop'; reason: string };

/** Portrait cell of an expression; sheets without it show their neutral cell. */
export function portraitSource(
  r: AssetResolver,
  look: SpriteLook,
  expression = 'neutral',
  variant?: string,
): PortraitSource {
  const id = activeArt(look.art, variant)?.portrait;
  if (!id || r.size === 0) return { kind: 'crop', reason: id ? 'no_art' : 'no_reference' };
  const f = r.frame(id, expression, 'front', 0) ?? r.frame(id, 'neutral', 'front', 0);
  return f ? { kind: 'portrait', frame: f } : { kind: 'crop', reason: 'not_approved' };
}

export type BustSource =
  | { kind: 'bust'; base: ResolvedFrame; expression: ResolvedFrame | null }
  | { kind: 'portrait'; frame: ResolvedFrame }
  | { kind: 'crop'; reason: string };

/**
 * Half-body portrait (art_pipeline.md 3.6): the bust with its expression overlay
 * (<bust>_expr; the neutral face is the base itself), else the portrait shown one size up,
 * else the standee crop.
 */
export function bustSource(
  r: AssetResolver,
  look: SpriteLook,
  expression = 'neutral',
  variant?: string,
): BustSource {
  const art = activeArt(look.art, variant);
  const id = art?.bust;
  const base = id ? r.frame(id, 'main', 'front', 0) : null;
  if (id && base) {
    const expr = expression === 'neutral' ? null : r.frame(`${id}_expr`, expression, 'front', 0);
    return { kind: 'bust', base, expression: expr };
  }
  return portraitSource(r, look, expression, variant);
}
