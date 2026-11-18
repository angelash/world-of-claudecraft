// The topic menu and the redirect (builtin_ai.md 6.2 "话题菜单", 6.6 "转移话题"). Pure
// scoring over candidates the caller has already found available:
//
//   menu score = 0.4 x fresh + 0.3 x quest relevance + 0.2 x interest + 0.1 x recency
//   quotas: situation 2, interest 2, news 1, quest or trouble 1; the rest by score; at most 6
//   redirect score = 0.5 x adjacent + 0.3 x fresh + 0.2 x interest; the best two
//
// Ties go to the earlier topic in data order, so the menu is stable for the same state.

import type { TopicDef } from './types';

export const MENU_SIZE = 6;
export const REDIRECT_SIZE = 2;

/** Menu quota groups (6.2): situation, the speaker's interests, news, quest or trouble. */
export type MenuSlot = 'situation' | 'interest' | 'news' | 'quest';

export const MENU_QUOTAS: Readonly<Record<MenuSlot, number>> = {
  situation: 2,
  interest: 2,
  news: 1,
  quest: 1,
};

export interface MenuCandidate {
  topic: TopicDef;
  /** data order, the tie-break */
  order: number;
  /** 1 never heard, 0.8 a new version, 0.5 heard with lines left, 0 talked out */
  fresh: number;
  /** 0..1: tied to a quest the player is on or can take */
  quest: number;
  /** 0..1: drawn to the speaker's traits or roles, or the speaker's own topic */
  interest: number;
  /** 0..1: about something that happened lately */
  recent: number;
  slot: MenuSlot | null;
}

export function menuScore(c: MenuCandidate): number {
  return 0.4 * c.fresh + 0.3 * c.quest + 0.2 * c.interest + 0.1 * c.recent;
}

function byScore(a: MenuCandidate, b: MenuCandidate): number {
  return menuScore(b) - menuScore(a) || a.order - b.order;
}

/**
 * The menu (6.2): each quota group takes its best topics, then the best of the rest fill
 * up; talked-out topics sink below every fresh one. Returns topic ids in menu order.
 */
export function rankMenu(cands: readonly MenuCandidate[], size = MENU_SIZE): string[] {
  const live = cands.filter((c) => c.fresh > 0).sort(byScore);
  const spent = cands.filter((c) => c.fresh <= 0).sort(byScore);
  const picked: MenuCandidate[] = [];
  const take = (c: MenuCandidate) => {
    if (picked.length < size && !picked.includes(c)) picked.push(c);
  };
  for (const slot of Object.keys(MENU_QUOTAS) as MenuSlot[]) {
    let n = 0;
    for (const c of live) {
      if (n >= MENU_QUOTAS[slot]) break;
      if (c.slot !== slot || picked.includes(c)) continue;
      take(c);
      n++;
    }
  }
  for (const c of live) take(c);
  // the quota groups go first, then the rest; inside the menu the order is by score
  const shown = picked.sort(byScore);
  for (const c of spent) if (shown.length < size) shown.push(c);
  return shown.map((c) => c.topic.id);
}

/** Whether two topics are neighbours in the graph (same category, linked, or same owner). */
export function adjacent(a: TopicDef, b: TopicDef): boolean {
  if (a.id === b.id) return false;
  if (a.category === b.category) return true;
  if ((a.after ?? []).includes(b.id) || (b.after ?? []).includes(a.id)) return true;
  if ((a.unlocks?.topics ?? []).includes(b.id) || (b.unlocks?.topics ?? []).includes(a.id))
    return true;
  const owners = new Set(a.owners ?? []);
  return (b.owners ?? []).some((o) => owners.has(o));
}

/** The two topics offered instead of a refused one (6.6), best first. */
export function rankRedirect(
  refused: TopicDef | null,
  cands: readonly MenuCandidate[],
  size = REDIRECT_SIZE,
): string[] {
  const score = (c: MenuCandidate) =>
    0.5 * (refused && adjacent(refused, c.topic) ? 1 : 0) + 0.3 * c.fresh + 0.2 * c.interest;
  return cands
    .filter((c) => c.topic.id !== refused?.id)
    .sort((a, b) => score(b) - score(a) || a.order - b.order)
    .slice(0, size)
    .map((c) => c.topic.id);
}
