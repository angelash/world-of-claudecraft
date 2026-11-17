// Guild ranks (society.md 3.1, 3.2): their order, what promotion into the next rank needs,
// and the rank gate of a board (catalog_quests_acts1_3.md 2.1). Pure.
//
// The level a promotion needs is the level the crystal reads on the card. The player has no
// page, so the card reads the registration's card level (Lv1) forever and the level gate never
// opens by itself; the guild charter's practical recognition (实绩认定, society.md 3.2) is the
// player's way up: an examiner of at least the target rank decides the rank in a fight, and
// the card bears the mark 实.

import {
  GUILD_RANKS,
  type GuildConfig,
  type GuildRank,
  type MemberRecord,
  type RankDef,
} from './types';

/** Position of a rank, F = 0; -1 for anything else. */
export function rankIndex(rank: unknown): number {
  return GUILD_RANKS.indexOf(rank as GuildRank);
}

export function isRank(v: unknown): v is GuildRank {
  return rankIndex(v) >= 0;
}

/** The rank after `rank` in the config's table, or undefined at the top. */
export function nextRankDef(cfg: GuildConfig, rank: GuildRank): RankDef | undefined {
  const i = cfg.ranks.findIndex((r) => r.id === rank);
  return i >= 0 ? cfg.ranks[i + 1] : undefined;
}

export function rankDef(cfg: GuildConfig, rank: GuildRank): RankDef | undefined {
  return cfg.ranks.find((r) => r.id === rank);
}

/** One requirement of a promotion, with where the member stands. */
export interface PromotionNeed {
  kind: 'level' | 'commissions' | 'clean' | 'merit' | 'exam';
  /** the commission rank counted (commissions) */
  rank?: GuildRank;
  need: number | string;
  have: number | string;
  met: boolean;
}

/**
 * What promotion into `target` needs and where the member stands (the board's rank progress,
 * ux_and_onboarding.md 6.3.7). An exam is never met here: passing it is the promotion itself.
 */
export function promotionNeeds(
  target: RankDef,
  member: MemberRecord,
  cardLevel: number,
): PromotionNeed[] {
  const out: PromotionNeed[] = [];
  if (target.level > 0)
    out.push({
      kind: 'level',
      need: target.level,
      have: cardLevel,
      met: cardLevel >= target.level,
    });
  if (target.commissions) {
    const have = member.done[target.commissions.rank] ?? 0;
    out.push({
      kind: 'commissions',
      rank: target.commissions.rank,
      need: target.commissions.count,
      have,
      met: have >= target.commissions.count,
    });
  }
  if (target.clean)
    out.push({ kind: 'clean', need: 0, have: member.defaults, met: member.defaults === 0 });
  if (target.merit)
    out.push({
      kind: 'merit',
      need: target.merit,
      have: member.merit,
      met: member.merit >= target.merit,
    });
  if (target.exam) out.push({ kind: 'exam', need: target.exam, have: '', met: false });
  return out;
}

/** Whether every requirement but the exam holds. */
export function readyForExam(needs: readonly PromotionNeed[]): boolean {
  return needs.every((n) => n.met || n.kind === 'exam');
}

/** Whether the promotion happens by itself: no exam and every requirement met. */
export function autoPromotes(target: RankDef, needs: readonly PromotionNeed[]): boolean {
  return !target.exam && needs.every((n) => n.met);
}

/**
 * The highest commission rank a taker may accept on a board: the higher of their own rank
 * and the rank of an adventurer of the guild leading their party ("与 D 级以上同行者同队时按
 * 队长定级"), plus the board's reach, and never below the board's lone ceiling (the
 * borderstone branch serves F and E to any member). A notice board (reach null) takes anyone.
 */
export function gateIndex(
  own: GuildRank,
  partyRanks: readonly GuildRank[],
  reach: number | null,
  lone?: GuildRank,
): number {
  if (reach === null) return GUILD_RANKS.length - 1;
  const lead = Math.max(rankIndex(own), ...partyRanks.map(rankIndex));
  const gate = Math.max(lead + Math.max(0, reach), lone ? rankIndex(lone) : -1);
  return Math.min(GUILD_RANKS.length - 1, gate);
}

/** The lowest rank that may take a posting of `rank` alone, for the "需要 X 级" message. */
export function rankNeeded(rank: GuildRank, reach: number | null, lone?: GuildRank): GuildRank {
  if (reach === null) return GUILD_RANKS[0];
  if (lone && rankIndex(rank) <= rankIndex(lone)) return GUILD_RANKS[0];
  return GUILD_RANKS[Math.max(0, rankIndex(rank) - Math.max(0, reach))] as GuildRank;
}
