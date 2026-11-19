// The act-1 witch trial's evidence presentation (PK-M1-55; act1_borderstone.md 4.2,
// catalog_quests_acts1_3.md A1-M09, ux_and_onboarding.md 17 `tut_a1_present`). The player puts
// pieces before the trial; the shared presentation core (present.ts, also act 6's court) says
// how each lands; the trial's own table (data/scenes/trials.json) says what each proves, what
// the tribunal answers to a wrong or false one, and how many points clear the accused.
//
// Points (4.2): evidence (the grey spring water), testimony (a witness; many witnesses count
// once), exposure (the lamp's trick), debate (the public speech). Bron vouching for the player
// is a point for the player, not for Oola (4.2 "布伦作为公会见证人替玩家说话，不计入欧拉的平反"):
// it lands on the player's tribunal row, never on the trial's points.
//
// A wrong piece (it bears on nothing the court tries) and a false one are rebutted: the line of
// the rebuttal is the trial's data, and so is what it costs (church suspicion); a forgery proves
// nothing. The shipped table has no forged piece yet (act 1's bought rumors are a later
// package). Everything the trial writes is a flag the registry lists (a1_trial_*,
// church_suspicion), so the scene and the dispute runner read one state.

import type { SystemContext } from '../../core/system';
import { countItem } from '../inventory';
import type { Effect } from '../quests/effect_types';
import { applyEffects, registerCompute } from '../quests/effects';
import {
  judgePresentation,
  type PresentOutcome,
  type PresentPiece,
  provenPoints,
  recordPresentation,
  type TribunalRecord,
} from './present';

/** One piece a trial accepts (a key item the player may hold). */
export interface TrialPiece extends PresentPiece {
  /** the flag a landed piece writes per point it proves (a1_trial_evidence and the like) */
  writes?: Record<string, string>;
  /** effects of a landed presentation (a witness's trust, the vouch) */
  effects?: Effect[];
  /** the scene node its landing plays (its written reaction), else the run stays on the node */
  to?: string;
}

/** A rebuttal: what the tribunal says and costs when a piece is wrong or false. */
export interface TrialRebuttal {
  /** the outcome it answers */
  on: 'wrong' | 'forged';
  /** the speaker of the rebuttal line */
  speaker: string;
  /** the line (content text, extracted to a key) */
  text: string;
  effects?: Effect[];
}

/** A trial table (data/scenes/trials.json): the tribunal, its pieces, rebuttals and verdict. */
export interface TrialDef {
  id: string;
  /** the pieces the trial accepts (offered by a scene node whose `present` names this trial) */
  pieces: TrialPiece[];
  rebuttals: TrialRebuttal[];
  /** the points that count toward clearing the accused */
  points: string[];
  /** how many distinct points clear the accused (4.2: two of the four) */
  clears: number;
  /** a point also proven by a flag the scene's own routes write (witness, lamp, speech) */
  pointFlags?: Record<string, string>;
  /** the flag `compute trial_verdict` writes the proven point count to */
  countFlag?: string;
}

/** The trials' slice entry: one tribunal record per trial id. */
export type TrialRecords = Record<string, TribunalRecord>;

export interface TrialPresentResult {
  outcome: PresentOutcome;
  /** the points that this presentation newly proved */
  proved: string[];
  rebuttal: TrialRebuttal | null;
}

/** The pieces of a trial the player could present now (held, not yet shown). */
export function trialOffers(ctx: SystemContext, trial: TrialDef): TrialPiece[] {
  const rec = recordOf(ctx, trial.id);
  const playerId = ctx.world.slices.world.playerId;
  return trial.pieces.filter(
    (p) => countItem(ctx.world, playerId, p.item) > 0 && !rec.shown.includes(p.id),
  );
}

function recordOf(ctx: SystemContext, id: string): TribunalRecord {
  const slice = ctx.world.slices.scenes;
  slice.trials ??= {};
  return slice.trials[id] ?? { shown: [] };
}

/**
 * Present one piece at a trial: judged by the shared core; a hit proves its points (each
 * point's flag written once) and applies its effects; a wrong or false piece gets the trial's
 * rebuttal and its cost. Returns what happened; `missing` and `repeat` change nothing.
 */
export function presentAtTrial(
  ctx: SystemContext,
  trial: TrialDef,
  pieceId: string,
): TrialPresentResult {
  const piece = trial.pieces.find((p) => p.id === pieceId);
  const rec = recordOf(ctx, trial.id);
  if (!piece) return { outcome: 'missing', proved: [], rebuttal: null };
  const playerId = ctx.world.slices.world.playerId;
  const res = judgePresentation(
    piece,
    trial.id,
    rec,
    (item) => countItem(ctx.world, playerId, item) > 0,
  );
  if (res.outcome === 'missing' || res.outcome === 'repeat')
    return { outcome: res.outcome, proved: [], rebuttal: null };
  const before = provenPoints(trial.pieces, trial.id, rec);
  const next = recordPresentation(rec, piece, res);
  const slice = ctx.world.slices.scenes;
  slice.trials ??= {};
  slice.trials[trial.id] = next;
  const after = provenPoints(trial.pieces, trial.id, next);
  const proved = after.filter((p) => !before.includes(p));
  if (res.outcome === 'hit') {
    for (const point of proved) {
      const flag = piece.writes?.[point];
      if (flag) ctx.setFlag(flag, true);
    }
    applyEffects(ctx, piece.effects);
    ctx.emit('trial.presented', { trial: trial.id, piece: piece.id, outcome: res.outcome, proved });
    return { outcome: 'hit', proved, rebuttal: null };
  }
  const rebuttal = trial.rebuttals.find((r) => r.on === res.outcome) ?? null;
  applyEffects(ctx, rebuttal?.effects);
  ctx.emit('trial.presented', { trial: trial.id, piece: piece.id, outcome: res.outcome, proved });
  return { outcome: res.outcome, proved: [], rebuttal };
}

/**
 * The points the trial holds as proven: a point is proven when any piece proved it, or when its
 * flag in the table's `pointFlags` is set (the scene's own routes: a witness choice, the lamp
 * exposed by its own choice, the speech of the debate). In the trial's own point order.
 */
export function trialPoints(ctx: SystemContext, trial: TrialDef): string[] {
  const pointFlags = trial.pointFlags ?? {};
  const viaPieces = provenPoints(trial.pieces, trial.id, recordOf(ctx, trial.id));
  return trial.points.filter((p) => viaPieces.includes(p) || !!ctx.flag(pointFlags[p] ?? ''));
}

/**
 * The verdict count of every trial (`compute trial_verdict`, run by the scene's verdict node):
 * the distinct points proven, by piece or by the scene's own routes, written to the trial's
 * `countFlag` (`a1_trial_points`, registry 8.8.2). The scene branches on it (clears or not).
 */
registerCompute('trial_verdict', (ctx) => {
  for (const trial of ctx.content.trials ?? []) {
    if (!trial.countFlag) continue;
    ctx.setFlag(trial.countFlag, trialPoints(ctx, trial).length);
  }
});
