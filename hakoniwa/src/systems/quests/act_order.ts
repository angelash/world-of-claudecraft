// Act order from the acts table (data/quests/acts.json): the act a new game opens in and
// the current act flag with that opening act as its default. A leaf module (types only),
// so every narrative system can ask without pulling in the quest runtime.

import type { ActDef } from './types';

type ActContent = { acts?: readonly ActDef[] };

/** The act a new game opens in: the lowest index in the acts table. */
export function openingAct(content: ActContent): ActDef | undefined {
  let best: ActDef | undefined;
  for (const a of content.acts ?? []) if (!best || a.index < best.index) best = a;
  return best;
}

/** Id of the opening act ('' when the content carries no acts table). */
export function openingActId(content: ActContent): string {
  return openingAct(content)?.id ?? '';
}

/** The current act flag value, the opening act before the act flag is written. */
export function currentActId(ctx: { flag(key: string): unknown; content: ActContent }): string {
  return String(ctx.flag('act') ?? openingActId(ctx.content));
}
