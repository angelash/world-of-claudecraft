// Mood (builtin_ai.md 3.3; npc_society_ai.md 7.2): never stored, derived when needed from
// the need levels and recent happenings, the first row that holds wins: fear, anger,
// worry, weariness, happiness, calm. The codes are the line packs' mood codes
// (catalog_dialogue_lines.md 4.7). Pure.

import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../../core/time';
import type { Mood } from '../../dialogue/lines/types';
import { ensureNeeds } from '../needs';
import type { NpcState } from '../types';
import { since } from './state';

/** The bark context of a mood that colours speech (calm and happy keep the activity's). */
export const MOOD_BARK: Partial<Record<Mood, string>> = {
  fear: 'fear',
  angry: 'angry',
  worried: 'worried',
  tired: 'tired',
};

export function moodOf(st: NpcState, tick: number): Mood {
  const n = ensureNeeds(st.needs);
  if (n.safety < 30 || since(st, 'threat', tick) <= TICKS_PER_GAME_HOUR) return 'fear';
  if (since(st, 'pressure', tick) <= TICKS_PER_GAME_HOUR) return 'fear';
  const day = TICKS_PER_GAME_DAY;
  if (n.face < 25 || since(st, 'insulted', tick) <= day || since(st, 'harmed', tick) <= day)
    return 'angry';
  if (n.money < 30 || n.peace < 30 || since(st, 'mourning', tick) <= 7 * day) return 'worried';
  if (n.energy < 25 || n.hunger < 25) return 'tired';
  const glad =
    since(st, 'gift', tick) <= day ||
    since(st, 'helped', tick) <= day ||
    since(st, 'saved', tick) <= day ||
    since(st, 'festival', tick) <= day;
  if (glad) {
    const others = [n.hunger, n.energy, n.social, n.money, n.safety, n.face, n.peace];
    if (others.every((v) => v >= 50)) return 'happy';
  }
  return 'calm';
}

/** The angry mood is aimed at the player (the cold trust band, builtin_ai 7.4). */
export function angryAtPlayer(st: NpcState, tick: number): boolean {
  return moodOf(st, tick) === 'angry' && st.brain?.offender === 'player';
}
