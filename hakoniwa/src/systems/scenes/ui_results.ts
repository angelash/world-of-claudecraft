// What an interface opened by a scene's `ui` effect hands back (catalog_cutscenes.md 4.1.2,
// 13.6): the client closes the interface with `scenes.ui_done` and may attach a result. The
// kernel checks the result here before anything is written, since it comes from the player.
// The spirit mirror (`ui_mode_creator`, ux_and_onboarding.md 3.4.3) returns the player's new
// appearance (colours and a paper-doll recipe) and the creator's own look string, which goes
// to the effect's `storeAs` flag so the creator can be restored from a save. Interfaces
// without a result (the credits, the carried memories) just close. Pure apart from the writes
// through the world port and ctx.setFlag.

import type { SystemContext } from '../../core/system';
import { setAppearance } from '../world';
import { appearanceProblems } from '../world/appearance';
import type { Appearance } from '../world/types';

/** The creator's result: the appearance to wear and the creator's own encoded look. */
export interface CreatorResult {
  appearance: Pick<Appearance, 'base' | 'colors' | 'doll'>;
  /** the creator's look string (client format, stored verbatim in the result flag) */
  look: string;
}

export type UiResult = CreatorResult | Record<string, never>;

/** Longest look string a flag keeps. */
export const MAX_LOOK_LENGTH = 240;
/** Bases the mirror may give a player (people only: the player is never a creature). */
export const CREATOR_BASES: readonly string[] = ['human', 'elf', 'beastkin', 'halfling', 'dwarf'];

const HEX = /^#[0-9a-f]{6}$/i;
const LOOK = /^[a-z0-9_=;:#,.|-]*$/i;
/** The doll fields the mirror sets (body, outfit, head, hair); nothing else travels. */
const CREATOR_DOLL_FIELDS: readonly string[] = ['body', 'outfit', 'head', 'hair'];
/** Longest doll field value kept. */
const MAX_DOLL_FIELD = 64;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The appearance and look of a creator result, or the reason it is refused. */
export function checkCreatorResult(
  raw: unknown,
): { ok: true; appearance: Appearance; look: string } | { ok: false; why: string } {
  if (!isRecord(raw) || !isRecord(raw.appearance)) return { ok: false, why: 'no appearance' };
  const a = raw.appearance;
  const base = a.base;
  if (typeof base !== 'string' || !CREATOR_BASES.includes(base)) return { ok: false, why: 'base' };
  const colors = a.colors;
  if (!Array.isArray(colors) || colors.length !== 4 || !colors.every((c) => HEX.test(String(c))))
    return { ok: false, why: 'colors' };
  const look = raw.look;
  if (typeof look !== 'string' || look.length > MAX_LOOK_LENGTH || !LOOK.test(look))
    return { ok: false, why: 'look' };
  const appearance: Appearance = { base, colors: colors.map((c) => String(c).toLowerCase()) };
  if (a.doll !== undefined) {
    if (!isRecord(a.doll)) return { ok: false, why: 'doll' };
    // only the fields the mirror sets travel, short, and shaped as asset ids (body h, hs, hb)
    const doll: Record<string, string> = {};
    for (const [k, v] of Object.entries(a.doll)) {
      if (!CREATOR_DOLL_FIELDS.includes(k)) return { ok: false, why: 'doll' };
      if (typeof v !== 'string' || v.length > MAX_DOLL_FIELD) return { ok: false, why: 'doll' };
      doll[k] = v;
    }
    if (typeof doll.body !== 'string') return { ok: false, why: 'doll' };
    appearance.doll = doll as unknown as Appearance['doll'];
    if (appearanceProblems('creator', appearance).length > 0) return { ok: false, why: 'doll' };
  }
  return { ok: true, appearance, look };
}

/**
 * Apply the result an interface returned. False when the result is refused (nothing is
 * written); an interface without a result, or a result left out, always succeeds.
 */
export function applyUiResult(
  ctx: SystemContext,
  ui: string,
  storeAs: string | undefined,
  result: unknown,
): boolean {
  if (ui !== 'ui_mode_creator') return true;
  // closing the mirror without a result keeps the appearance the player has
  if (result === undefined || (isRecord(result) && Object.keys(result).length === 0)) return true;
  const r = checkCreatorResult(result);
  if (!r.ok) return false;
  setAppearance(ctx, ctx.world.slices.world.playerId, r.appearance);
  if (storeAs) ctx.setFlag(storeAs, r.look);
  return true;
}
