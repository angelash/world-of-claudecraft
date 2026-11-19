// Scripted speakers (catalog_dialogue_lines_act1.md 0 item 4; catalog 1.5): a person who,
// in the acts their card lists under `scripted`, says only the lines written in their own
// pack. No role, template, class or common line stands in for a gap (the gap stays silent,
// "……"), the legacy rule templates are not used, and the npc.dialogue model is never asked
// to word an answer or a chat line (the written line goes out as it is). Ash in act 1 is
// the case it was made for: every answer of his is "还不是时候" until act 2. Pure.

import type { ContentMap } from '../../core/contracts';
import { personaById } from '../npc/personas';

/** True when `npcRef` may speak only its own written lines in `act` (its card's `scripted`). */
export function isScripted(
  content: Pick<ContentMap, 'npcs'>,
  npcRef: string,
  act: unknown,
): boolean {
  if (typeof act !== 'string') return false;
  return personaById(content as ContentMap, npcRef)?.scripted?.includes(act) ?? false;
}
