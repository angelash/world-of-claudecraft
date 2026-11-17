// The data side of the commission board window (ux_and_onboarding.md 6.3.7; the window
// itself is PK-M1-23): a board's postings with title, rank, client, place, pay and the
// guild's cut on two lines, the days to finish, the client's own claims kept apart from the
// system's facts, the rank needed; the player's rank, the practical mark, the progress
// toward the next rank, and the commissions held. Pure reads of the world and the content.

import { contentRef, contentText } from '../../core/content_key';
import type { ContentMap, FlagValue } from '../../core/contracts';
import type { TextParam } from '../../core/text';
import { isRank, nextRankDef, type PromotionNeed, promotionNeeds, rankNeeded } from './ranks';
import { readGuild } from './slice';
import type { GuildRank, PlaceRef, Posting } from './types';

export interface PostingView {
  id: string;
  /** GC-F-001 */
  display: string;
  templateId: string;
  title: TextParam;
  rank: GuildRank;
  /** the client (a person id), or null for the board's publisher */
  giver: string | null;
  place: PlaceRef;
  /** what the adventurer gets, copper */
  reward: number;
  /** the guild's cut the client pays on top, copper */
  cut: number;
  /** days to finish once taken */
  days: number;
  /** the last day to finish (calendar day index), once taken */
  deadline?: number;
  urgent: boolean;
  emergency: boolean;
  /** what the client says about it (marked "委托人称" by the window) */
  claims: TextParam[];
  /** the rank a lone taker needs on this board */
  needs: GuildRank;
  state: Posting['state'];
}

export interface BoardView {
  boardId: string;
  name: TextParam;
  postings: PostingView[];
  /** the player's rank, null before registration */
  playerRank: GuildRank | null;
  /** the card bears 实 (practical recognition) */
  practical: boolean;
  rankProgress: { next: GuildRank | null; needs: PromotionNeed[] };
  /** commissions the player holds, on every board */
  accepted: PostingView[];
  maxAccepted: number;
}

type ViewWorld = { slices: object; meta: { flags: Record<string, FlagValue> } };

function postingView(content: ContentMap, p: Posting): PostingView {
  const t = (content.commissions ?? []).find((c) => c.id === p.template);
  const board = (content.guildBoards ?? []).find((b) => b.id === p.board);
  const v: PostingView = {
    id: p.id,
    display: p.display,
    templateId: p.template,
    title: contentText('commissions', t, p.display, 'title'),
    rank: p.rank,
    giver: p.giver,
    place: { ...p.place },
    reward: p.reward,
    cut: p.cut,
    days: p.days,
    urgent: p.urgent,
    emergency: p.emergency,
    claims: (t?.claims ?? []).map((_, i) => contentRef('commissions', p.template, 'claims', i)),
    needs: board ? rankNeeded(p.rank, board.reach, board.lone) : p.rank,
    state: p.state,
  };
  if (p.deadline !== undefined) v.deadline = p.deadline;
  return v;
}

/** One board's window data, or null for an unknown board. */
export function boardView(
  world: ViewWorld,
  content: ContentMap,
  boardId: string,
): BoardView | null {
  const board = (content.guildBoards ?? []).find((b) => b.id === boardId);
  const cfg = content.guildConfig;
  if (!board || !cfg) return null;
  const s = readGuild(world);
  const postings = Object.values(s?.postings ?? {});
  const rankFlag = world.meta.flags.guild_rank;
  const rank = isRank(rankFlag) ? rankFlag : null;
  const next = rank ? nextRankDef(cfg, rank) : undefined;
  return {
    boardId,
    name: contentText('guild_boards', board, board.id, 'name'),
    postings: postings
      .filter((p) => p.board === boardId && p.state === 'posted')
      .map((p) => postingView(content, p)),
    playerRank: rank,
    practical: world.meta.flags['guild.practical'] === true,
    rankProgress: {
      next: next?.id ?? null,
      needs: next && s?.member ? promotionNeeds(next, s.member, cfg.registration.cardLevel) : [],
    },
    accepted: postings.filter((p) => p.state === 'accepted').map((p) => postingView(content, p)),
    maxAccepted: cfg.maxAccepted,
  };
}

/** Every posting the guild knows, newest first (debug panels, tests). */
export function allPostings(world: ViewWorld): Posting[] {
  return Object.values(readGuild(world)?.postings ?? {}).sort((a, b) => b.postedDay - a.postedDay);
}
