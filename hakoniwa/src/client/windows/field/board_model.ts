// Implements the model of `ui_win_board`, the commission board (ux_and_onboarding.md 6.3.7):
// the postings with their title (the instance title through its template's content key, which
// is how `QuestView.textOf` renders the same instance in the log), rank, client (named or
// "anonymous"), place, pay and the guild's 15% cut on two lines, days to finish and the rank
// needed; the client's own claims each marked as the client's claim, never on the rule row
// (UX-4); the player's rank, the practical mark and the promotion progress; the
// commissions held (at most `maxAccepted`). Pure; Node-tested. The painter is ./board_window.ts.

import { formatMoney, t, tOr } from '../../../shared_ui/i18n';
import type { PromotionNeed } from '../../../systems/guild/ranks';
import type { BoardView, PostingView } from '../../../systems/guild/view';

export interface PostingRow {
  id: string;
  title: string;
  /** the rank label */
  rank: string;
  /** the named client, or "anonymous" */
  giver: string;
  place: string;
  /** the pay (what the taker gets) */
  reward: string;
  /** the guild cut the client pays on top, '' on a board that takes no cut */
  cut: string;
  /** days to finish before taking; days left once taken */
  deadline: string;
  /** the rank needed when the player's rank is below what a lone taker needs, else '' */
  needs: string;
  /** what the client says, each line marked as the client's claim (UX-4) */
  claims: string[];
  urgent: boolean;
  emergency: boolean;
  /** the player may take it now */
  canAccept: boolean;
  /** a held commission is done and may be handed in */
  canTurnIn: boolean;
  /** why not (rank, held list full), '' when it can */
  reason: string;
}

export interface BoardModel {
  title: string;
  /** your rank with the practical mark, or "not registered" */
  rank: string;
  /** the promotion lines toward the next rank, each "have / need" */
  progress: { label: string; met: boolean }[];
  /** held against the cap */
  heldCount: string;
  postings: PostingRow[];
  accepted: PostingRow[];
  /** the board has nothing posted: the window shows the empty sentence */
  empty: boolean;
}

/** Rank letters in their order, F lowest (catalog 2.3). */
const RANK_ORDER = ['f', 'e', 'd', 'c', 'b', 'a', 's'] as const;

function rankAt(rank: string | null): number {
  return rank ? RANK_ORDER.indexOf(rank as (typeof RANK_ORDER)[number]) : -1;
}

export function rankLabel(rank: string): string {
  return t('ui.win.board.rank', { rank: rank.toUpperCase() });
}

function placeText(p: PostingView['place']): string {
  const map = tOr(`c.maps.${p.mapId}.name`, p.mapId);
  return t('ui.win.board.place', { place: map });
}

function needLine(n: PromotionNeed): { label: string; met: boolean } {
  const label = t(`ui.win.board.need.${n.kind}`, {
    have: n.have,
    need: n.need,
    rank: n.rank ? n.rank.toUpperCase() : '',
  });
  return { label, met: n.met };
}

function postingRow(
  p: PostingView,
  playerRank: string | null,
  room: boolean,
  giverName: (id: string) => string,
  daysLeft: (deadline: number) => number,
): PostingRow {
  const below = rankAt(playerRank) < rankAt(p.needs);
  const reason =
    playerRank === null
      ? t('ui.win.board.not_registered')
      : below
        ? t('ui.win.board.needs', { rank: p.needs.toUpperCase() })
        : !room
          ? t('ui.win.board.full')
          : '';
  return {
    id: p.id,
    title: t(p.title),
    rank: rankLabel(p.rank),
    giver: p.giver
      ? t('ui.win.board.giver', { name: giverName(p.giver) })
      : t('ui.win.board.giver_anon'),
    place: placeText(p.place),
    reward: t('ui.win.board.reward', { money: formatMoney(p.reward) }),
    cut: p.cut > 0 ? t('ui.win.board.cut', { money: formatMoney(p.cut) }) : '',
    deadline:
      p.deadline !== undefined
        ? t('ui.win.board.days_left', { n: daysLeft(p.deadline) })
        : t('ui.win.board.days', { n: p.days }),
    needs: below ? t('ui.win.board.needs', { rank: p.needs.toUpperCase() }) : '',
    claims: p.claims.map((c) => t('ui.win.board.claim', { text: t(c) })),
    urgent: p.urgent,
    emergency: p.emergency,
    canAccept: reason === '',
    canTurnIn: false,
    reason,
  };
}

export interface BoardModelInput {
  view: BoardView;
  /** a person id's display name (the codex or the content record) */
  giverName: (id: string) => string;
  /** days left to a deadline (a calendar day index), counted from today */
  daysLeft: (deadline: number) => number;
  /** a held commission is done and waits to be handed in */
  ready: (postingId: string) => boolean;
}

export function boardModel(i: BoardModelInput): BoardModel {
  const v = i.view;
  const room = v.accepted.length < v.maxAccepted;
  return {
    title: t(v.name),
    rank:
      v.playerRank === null
        ? t('ui.win.board.not_registered')
        : v.practical
          ? t('ui.win.board.your_rank_practical', { rank: v.playerRank.toUpperCase() })
          : t('ui.win.board.your_rank', { rank: v.playerRank.toUpperCase() }),
    progress: v.rankProgress.needs.map(needLine),
    heldCount: t('ui.win.board.held', { n: v.accepted.length, max: v.maxAccepted }),
    postings: v.postings.map((p) => postingRow(p, v.playerRank, room, i.giverName, i.daysLeft)),
    accepted: v.accepted.map((p) => {
      const ready = i.ready(p.id);
      return {
        ...postingRow(p, v.playerRank, true, i.giverName, i.daysLeft),
        canAccept: false,
        canTurnIn: ready,
        reason: ready ? '' : t('ui.win.board.not_ready'),
      };
    }),
    empty: v.postings.length === 0,
  };
}
