// The portrait resolution of `ui_mode_dialogue` and `ui_mode_cutscene` (ux_and_onboarding.md
// 7.2; art_pipeline.md 3.6; catalog_cutscenes.md 2.7): one function answers, for a speaker and
// an expression key, what to draw: the half-length bust with its expression overlay, the
// portrait (one size up when it stands in for a bust), the standee crop of the speaker's
// entity, a name plate, or the empty frame of a faceless speaker. Expressions fall back cell
// by cell to what is drawn (no grin: smile; a four-cell portrait: surprised to sad, thinking
// and special to neutral; the eighth expressions to their nearest cell). Asset ids:
// `art_bust_<id>` and `art_por_<id>` unless the speaker's look names its own. Also picks the
// dialogue layout (story for main characters, regular for everyone else). Pure; Node-tested.

import type { AssetResolver, ResolvedFrame } from '../../assets/resolver';

/** Expression keys (ux 7.2; art_pipeline 3.6). */
export const EXPRESSIONS = [
  'neutral',
  'smile',
  'grin',
  'angry',
  'sad',
  'surprised',
  'thinking',
  'special',
] as const;

/**
 * Cells to try for an expression, first drawn wins (art_pipeline 3.6): grin falls to smile;
 * a four-cell portrait answers surprised with sad and thinking or special with neutral; the
 * eighth expressions fall to the nearest cell (pained: sad, tender: smile); cold is neutral.
 */
export function expressionChain(expression: string | undefined): string[] {
  const e = (expression ?? 'neutral').trim().toLowerCase() || 'neutral';
  switch (e) {
    case 'neutral':
    case 'cold':
      return ['neutral'];
    case 'grin':
      return ['grin', 'smile', 'neutral'];
    case 'surprised':
      return ['surprised', 'sad', 'neutral'];
    case 'pained':
      return ['pained', 'sad', 'neutral'];
    case 'tender':
      return ['tender', 'smile', 'neutral'];
    default:
      return [e, 'neutral'];
  }
}

export interface SpeakerRef {
  /** persona, goddess or speaker id ('' when unknown) */
  id: string;
  /** display name, already rendered */
  name: string;
  /** the art the speaker's entity look names (portrait and bust ids), if any */
  art?: { portrait?: string; bust?: string };
  /** the speaker has an entity on the map whose standee can be cropped */
  entityId?: string | null;
}

export type PortraitPlan =
  | { kind: 'bust'; base: ResolvedFrame; expression: ResolvedFrame | null; cell: string }
  | { kind: 'portrait'; frame: ResolvedFrame; cell: string; large: boolean }
  | { kind: 'crop'; entityId: string }
  | { kind: 'plate'; initial: string }
  | { kind: 'empty' };

export interface PortraitOptions {
  /** speakers without a face (the faceless: an empty frame, never a portrait) */
  faceless?: (id: string) => boolean;
}

/** The asset ids of a speaker's portrait and bust. */
export function portraitIds(s: SpeakerRef): { portrait: string; bust: string } {
  const id = s.id.trim();
  return {
    portrait: s.art?.portrait ?? (id ? `art_por_${id}` : ''),
    bust: s.art?.bust ?? (id ? `art_bust_${id}` : ''),
  };
}

/** The first code point of a name, for the plate. */
export function nameInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ?? '';
}

function portraitFrame(
  r: AssetResolver,
  id: string,
  chain: readonly string[],
): { frame: ResolvedFrame; cell: string } | null {
  if (!id) return null;
  for (const cell of chain) {
    const f = r.frame(id, cell, 'front', 0);
    if (f) return { frame: f, cell };
  }
  return null;
}

/**
 * What to draw for a speaker: `want` 'bust' (the story layout, the cutscene's bust layer)
 * tries the bust first and shows the portrait one size up without one; 'portrait' (the
 * regular layout) tries the portrait only. Then the entity's standee crop, then a plate.
 */
export function resolvePortrait(
  r: AssetResolver,
  s: SpeakerRef,
  expression: string | undefined,
  want: 'bust' | 'portrait',
  opts: PortraitOptions = {},
): PortraitPlan {
  if (s.id && opts.faceless?.(s.id)) return { kind: 'empty' };
  const chain = expressionChain(expression);
  const ids = portraitIds(s);
  if (want === 'bust' && ids.bust) {
    const base = r.frame(ids.bust, 'main', 'front', 0);
    if (base) {
      let expr: ResolvedFrame | null = null;
      let cell = 'neutral';
      for (const c of chain) {
        if (c === 'neutral') break;
        const f = r.frame(`${ids.bust}_expr`, c, 'front', 0);
        if (f) {
          expr = f;
          cell = c;
          break;
        }
      }
      return { kind: 'bust', base, expression: expr, cell };
    }
  }
  const p = portraitFrame(r, ids.portrait, chain);
  if (p) return { kind: 'portrait', frame: p.frame, cell: p.cell, large: want === 'bust' };
  if (s.entityId) return { kind: 'crop', entityId: s.entityId };
  return { kind: 'plate', initial: nameInitial(s.name) };
}

/** A signature of a plan (painters redraw only when it changes). */
export function planKey(p: PortraitPlan): string {
  switch (p.kind) {
    case 'bust':
      return `b|${p.base.assetId}|${p.base.index}|${p.expression?.assetId ?? ''}|${p.expression?.index ?? ''}`;
    case 'portrait':
      return `p|${p.frame.assetId}|${p.frame.index}|${p.large ? 1 : 0}`;
    case 'crop':
      return `c|${p.entityId}`;
    case 'plate':
      return `n|${p.initial}`;
    default:
      return 'e';
  }
}

/**
 * The dialogue layout (ux 7.1): the story layout for the main characters (those drawn with a
 * half-length bust, or named in `main`, the data list PK-M1-27 may supply), the regular one
 * for everyone else.
 */
export function dialogueLayout(
  r: AssetResolver,
  s: SpeakerRef,
  main?: ReadonlySet<string>,
): 'regular' | 'story' {
  if (s.id && main?.has(s.id)) return 'story';
  const bust = portraitIds(s).bust;
  return bust && r.frame(bust, 'main', 'front', 0) ? 'story' : 'regular';
}

/** Integer scale for pixel art of `size` px to fit `box` px (whole multiples, art_pipeline 3.6). */
export function pixelScale(size: number, box: number): number {
  if (size <= 0 || box <= 0) return 1;
  return Math.max(1, Math.floor(box / size));
}
