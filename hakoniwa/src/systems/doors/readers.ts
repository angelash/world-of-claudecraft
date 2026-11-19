// Readers of the door features that change what the player sees (PK-M1-56): the past-life
// differences of prologue_antechamber.md 2.2 and the remnants' door resonance. Each reader
// is a pure query over the world and the content, silent (null, or 0) while its feature
// flag is false, so a player without the door sees exactly what they saw before. The
// numbers and the feature names come from data/doors/readers.json. The consumers are
// outside doors and not wired yet (docs/70_packets/pk_m1_56_door_readers/progress.md,
// requests): the trade window, the sight radius of the fog and the lighting, the rumour
// book and the quest log, the door-mark awakening of the resonance door.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { applyModifiers } from '../modifiers';
import type { DoorReaders } from './types';

/** The readers' record (empty when the content has none). */
export function doorReaders(content: Pick<ContentMap, 'door_readers'>): DoorReaders {
  return content.door_readers ?? {};
}

function featureOn(world: World, feature: string | undefined): boolean {
  return !!feature && !!world.meta.flags[`feature.${feature}`];
}

/**
 * The abacus past life (prologue 2.2 "交易时看到商品的大致进价区间"): the rough band of
 * what a good cost the merchant, around its base price (the quote's base line: the
 * item's value times the market's price factor), widened by the data's spread and rounded
 * outward to whole coins. Null without the feature or for a good with no base price.
 */
export function priceBand(
  world: World,
  content: Pick<ContentMap, 'door_readers'>,
  base: number,
): { lo: number; hi: number } | null {
  const r = doorReaders(content).priceBand;
  if (!r || !featureOn(world, r.feature) || !(base > 0)) return null;
  return {
    lo: Math.max(0, Math.floor(base * (1 - r.spread))),
    hi: Math.ceil(base * (1 + r.spread)),
  };
}

/**
 * The nightlight past life (prologue 2.2 "夜间视野更远"): the sight radius at night, in
 * tiles, that replaces the night's own (travel_and_exploration.md 6.1: 8 at night, 12 by
 * day). Null without the feature: the night keeps its radius.
 */
export function nightSightRadius(
  world: World,
  content: Pick<ContentMap, 'door_readers'>,
): number | null {
  const r = doorReaders(content).nightSight;
  return r && featureOn(world, r.feature) ? r.radius : null;
}

/**
 * The notes past life (prologue 2.2 "传闻在任务日志里自动标注'来源人'与'可能失真'"): the
 * tag a rumour the player holds carries, its teller and whether it may be distorted. Every
 * telling may distort (cognition/rumor.ts distorts at each hop, the first included), so
 * every retold rumour (hops 1 and up) is marked and only what the player saw (hops 0) is
 * not: the door's gift is the reminder itself. Null without the feature.
 */
export function rumorSourceTag(
  world: World,
  content: Pick<ContentMap, 'door_readers'>,
  heard: { from: string; hops: number },
): { from: string; mayDistort: boolean } | null {
  const r = doorReaders(content).rumorSource;
  if (!r || !featureOn(world, r.feature)) return null;
  return { from: heard.from, mayDistort: heard.hops > 0 };
}

/**
 * The remnants' door resonance on a map (the `door_resonance` modifier channel, steps 0 to
 * 3; catalog_goddess_interventions.md `div_janu_resonance`): the whole steps the active
 * modifiers give, after the channel's cap.
 */
export function resonanceSteps(world: World, mapId: string): number {
  if (!world.slices.modifiers) return 0;
  const v = applyModifiers(world, 'door_resonance', mapId, 0);
  return Math.max(0, Math.floor(v + 1e-9));
}
