// Player-facing goddess queries: only what the player can know (goddess_gm.md 1.2).
// Gaze and relation are shown as bands, never raw numbers; known actions are the
// public entries of the miracle ledger ("神之记录").

import type { FlagValue } from '../../core/contracts';
import { evaluate, flagResolver } from '../quests/conditions';
import type { GoddessDef, GoddessSlice, MiracleEntry } from './types';

export interface GoddessView {
  id: string;
  name: string;
  title: string;
  /** the honorific is known to the player once a goddess introduced herself (all sitting ones) */
  honorific: string | null;
  gazeBand: string;
  relationBand: string;
  impression: number;
  memoryTags: string[];
  departed: boolean;
  knownActions: { tick: number; note: string; mapId: string }[];
}

type ViewWorld = { slices: { goddess: GoddessSlice }; meta: { flags: Record<string, FlagValue> } };

export function gazeBandLabel(g: number): string {
  if (g >= 80) return '盯紧';
  if (g >= 50) return '关注';
  if (g >= 20) return '有印象';
  return '不知其存在或只当传闻';
}

export function relationBandLabel(r: number): string {
  if (r >= 50) return '亲近';
  if (r >= 15) return '有好感';
  if (r > -15) return '平淡';
  if (r > -50) return '不快';
  return '敌视';
}

/** The goddesses as the player knows them; one with appearsWhen (Janu: the first dream) shows once it holds. */
export function goddessView(world: ViewWorld, content: { goddesses: GoddessDef[] }): GoddessView[] {
  const resolve = flagResolver(world.meta.flags);
  const out: GoddessView[] = [];
  for (const def of content.goddesses) {
    const s = world.slices.goddess.goddesses[def.id];
    if (!s) continue;
    if (def.appearsWhen && !evaluate(def.appearsWhen, resolve)) continue;
    const named = !def.revealWhen || evaluate(def.revealWhen, resolve);
    out.push({
      id: def.id,
      name: named ? def.name : (def.hiddenName ?? def.name),
      title: named ? def.title : '',
      honorific: named ? def.honorific : null,
      gazeBand: gazeBandLabel(s.gaze),
      relationBand: relationBandLabel(s.relation),
      impression: s.impression,
      memoryTags: [],
      departed: s.departed,
      knownActions: world.slices.goddess.ledger
        .filter((e) => e.goddess === def.id && e.public)
        .slice(-10)
        .map((e) => ({ tick: e.tick, note: e.note, mapId: e.mapId })),
    });
  }
  return out;
}

/** 神之记录: the public part of the miracle ledger (all of it once the review opens). */
export function divineRecord(world: ViewWorld): MiracleEntry[] {
  const all = !!world.meta.flags.a6_court_open;
  return world.slices.goddess.ledger.filter((e) => all || e.public).map((e) => ({ ...e }));
}

/** Revelations shown on the steles so far. */
export function revelationsShown(
  world: ViewWorld,
): { id: string; text: string; literal: string }[] {
  return world.slices.goddess.revelations.map((r) => ({
    id: r.id,
    text: r.text,
    literal: r.literal,
  }));
}
