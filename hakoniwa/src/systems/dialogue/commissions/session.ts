// A person's request in the conversation (quests_and_events.md 6.2 step 3; builtin_ai.md
// 6.4 rows 30, 34, 49, 50): once the person has told their trouble (gen_trouble, "need
// work?", "can I help?", a dependent's plea), a need that maps to a request template becomes
// a personal commission and the talk asks the player; yes takes it on the spot, no leaves
// it on the board. The question is pending for the yes and no intents (6.3).

import { contentText } from '../../../core/content_key';
import type { SystemContext } from '../../../core/system';
import { type TextParam, tr } from '../../../core/text';
import { commissionDef } from '../../guild';
import { moodOf } from '../../npc/brain/mood';
import { varsFor } from '../replies';
import { speak } from '../speak';
import type { DialogueSession } from '../types';
import { requestFrom, takeRequest } from './requests';

export const REQUEST_YES = 'request:yes';
export const REQUEST_NO = 'request:no';

/** Offer the person's request as a yes-or-no question (null: their trouble maps to nothing). */
export function offerRequest(ctx: SystemContext, s: DialogueSession): string | null {
  const p = requestFrom(ctx, s.npcRef);
  if (!p) return null;
  const t = commissionDef(ctx.content, p.template);
  const title = contentText('commissions', t, p.display, 'title');
  s.question = { kind: 'request', ref: p.id };
  s.asked = true;
  // the question goes on the main list (the topic menu would drop it on the next choice)
  if (s.menu === 'topics' && s.root) {
    s.options = s.root;
    s.root = undefined;
    s.menu = 'root';
  }
  s.options = s.options.filter((o) => o.id !== REQUEST_YES && o.id !== REQUEST_NO);
  const at = Math.max(0, s.options.length - 1);
  s.options.splice(
    at,
    0,
    {
      id: REQUEST_YES,
      label: tr('sys.dialogue.request.yes', { title }),
      hint: tr('sys.dialogue.request.reward', { reward: p.reward }),
      system: 'dialogue',
    },
    { id: REQUEST_NO, label: tr('sys.dialogue.request.no'), system: 'dialogue' },
  );
  return p.id;
}

/** The player's answer to the pending request: yes takes it, no leaves it on the board. */
export function answerRequest(
  ctx: SystemContext,
  s: DialogueSession,
  yes: boolean,
): TextParam | null {
  const q = s.question;
  if (q?.kind !== 'request') return null;
  s.question = undefined;
  s.options = s.options.filter((o) => o.id !== REQUEST_YES && o.id !== REQUEST_NO);
  const st = ctx.world.slices.npc.npcs[s.npcRef];
  const mood = st ? moodOf(st, ctx.tick) : undefined;
  if (yes && !takeRequest(ctx, q.ref)) return tr('sys.dialogue.request.gone');
  const said = speak(ctx, {
    speaker: s.npcRef,
    slot: yes ? 'react.promise_noted' : 'react.nothing_more',
    vars: varsFor(ctx, s.npcRef),
    mood,
  });
  return said?.text ?? null;
}
