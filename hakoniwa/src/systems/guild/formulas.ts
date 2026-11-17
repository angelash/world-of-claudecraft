// The commission formulas (catalog_quests_acts1_3.md 2.3 and 2.4; progression_and_pacing.md
// 3.1.1 and 7.4; society.md 3.3). Pure: the coefficients come from data/guild/config.json.
//
//   pay = clamp(round5(rank base x kind x difficulty x distance), the rank's band)
//         (x urgent 1.5 after the clamp, round5 again)
//   difficulty: commission level minus the rank's median level, banded
//   xp  = round5(xpForLevel(commission level) x rank coefficient x kind modifier)
//         x the week's decay (1, 0.5, 0.25 for the first, second, third and later
//         completion of one template in a game week), 0 at the classic zero difference
//   cut = round(pay x 15%), paid by the client on top
//   penalty = round5(pay x 20%) on a default

import { xpForLevel, zeroDiff } from '../combat/formulas';
import type { CommissionDef, GuildConfig, RankPay } from './types';

/** Round to the nearest multiple of `step` (5 copper, 5 experience). */
export function roundTo(v: number, step: number): number {
  if (step <= 1) return Math.round(v);
  return Math.round(v / step) * step;
}

/** The pay row of a commission rank; throws on a rank the table lacks (the validator stops that). */
export function rankPay(cfg: GuildConfig, rank: CommissionDef['rank']): RankPay {
  const row = cfg.pay[rank];
  if (!row) throw new Error(`guild: no pay row for rank ${rank}`);
  return row;
}

/** The difficulty factor of a commission level against its rank's median (catalog 2.3). */
export function difficultyFactor(
  cfg: GuildConfig,
  rank: CommissionDef['rank'],
  level: number,
): number {
  const diff = level - rankPay(cfg, rank).median;
  for (const b of cfg.difficulty) if (b.upTo === undefined || diff <= b.upTo) return b.factor;
  return 1;
}

/** Pay in copper before urgency: the formula, rounded, clamped into the rank's band. */
export function basePay(cfg: GuildConfig, t: CommissionDef): number {
  const row = rankPay(cfg, t.rank);
  const raw =
    row.base *
    cfg.kinds[t.kind].pay *
    difficultyFactor(cfg, t.rank, t.level) *
    cfg.distance[t.distance];
  return Math.min(row.max, Math.max(row.min, roundTo(raw, cfg.round)));
}

/** Pay of a posting: urgent postings pay `cfg.urgent` times the base (catalog 5.6). */
export function postingPay(cfg: GuildConfig, t: CommissionDef, urgent: boolean): number {
  const pay = basePay(cfg, t);
  return urgent ? roundTo(pay * cfg.urgent, cfg.round) : pay;
}

/** The guild's cut, paid by the client on top of the pay (the adventurer gets it all). */
export function guildCut(cfg: GuildConfig, pay: number): number {
  return Math.round(pay * cfg.cut);
}

/** The default penalty (违约金): a share of the pay. */
export function defaultPenalty(cfg: GuildConfig, pay: number): number {
  return roundTo(pay * cfg.penalty, cfg.round);
}

/** Experience of a template before the week's decay and the zero difference (catalog 2.4). */
export function baseXp(cfg: GuildConfig, t: CommissionDef): number {
  return roundTo(xpForLevel(t.level) * rankPay(cfg, t.rank).xp * cfg.kinds[t.kind].xp, cfg.round);
}

/** The decay multiplier for a completion with `earlier` completions of the template this week. */
export function decayFactor(cfg: GuildConfig, earlier: number): number {
  if (cfg.decay.length === 0) return 1;
  return cfg.decay[Math.min(Math.max(0, earlier), cfg.decay.length - 1)] as number;
}

/**
 * Experience for completing a commission: none once the player stands the classic zero
 * difference above the commission level (where the classic kill formula reaches 0 too,
 * combat's mobXpValue); else the base times the week's decay.
 */
export function commissionXp(
  cfg: GuildConfig,
  t: CommissionDef,
  playerLevel: number,
  earlierThisWeek: number,
): number {
  if (playerLevel - t.level >= zeroDiff(playerLevel)) return 0;
  return roundTo(baseXp(cfg, t) * decayFactor(cfg, earlierThisWeek), cfg.round);
}
