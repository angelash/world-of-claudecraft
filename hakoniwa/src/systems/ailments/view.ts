// The read model of the player's taint gauge (`ui_hud_gauges`, ux_and_onboarding.md 5.2):
// the taint with its three thresholds, the sickness stage the body is in (which is not
// always the threshold the taint has passed: a spot heals below 15, a fever stays), and the
// injuries with their end ticks. The HUD painter is the client's (PK-M1-22); it may read
// this view or the mirrors `player.taint`, `player.sed_stage` and `player.injury`. Pure.

import type { ContentMap } from '../../core/contracts';
import { readAilments } from './slice';
import type { InjuryKind, SedStage } from './types';

export interface AilmentGauge {
  /** taint 0 to 100, one decimal */
  taint: number;
  max: number;
  /** the taint at which each sickness can break out (20, 45, 75) */
  thresholds: number[];
  /** the sickness the body is in */
  stage: SedStage;
  /** the stage the doors feel instead of the body (the player's crystallisation, 9.4) */
  blocking: boolean;
  injuries: { kind: InjuryKind; until: number }[];
}

/** The player's gauge, or null before the ailments system has data or a body to show. */
export function ailmentGauge(
  world: { slices: { world: { playerId: string } } },
  content: Pick<ContentMap, 'ailmentsConfig'>,
): AilmentGauge | null {
  const cfg = content.ailmentsConfig;
  if (!cfg) return null;
  const body = readAilments(world)?.bodies[world.slices.world.playerId];
  return {
    taint: Math.round((body?.taint ?? 0) * 10) / 10,
    max: cfg.max,
    thresholds: cfg.stages.map((s) => s.from),
    stage: body?.stage ?? 'none',
    blocking: body?.stage === 'crystal',
    injuries: (body?.injuries ?? []).map((i) => ({ kind: i.kind, until: i.until })),
  };
}
