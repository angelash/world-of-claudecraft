// Closing outcomes of a quest besides completion (PK-M1-58; quests_and_events.md 3.5): a
// quest fails forward (`failed`: its failure effects apply and the story goes on), runs out
// (`expired`: past act week `expiry.week` of its act, a later act, or `expiry.when`; the
// default settlement applies), or someone else gets there first (`by_other`: `byOther.when`
// holds; the favour or nothing applies instead of the reward). Each writes quest.<id> with
// the outcome (registry 8.6) and emits its event. A quest the player never started can
// expire or be done by someone else too: the world does not wait (2.2 rule 5); it gets a
// closed record (not in the log order) so it never starts afterwards. Quests of an act the
// world has not reached yet are left alone.

import type { SystemContext } from '../../core/system';
import type { TextParam } from '../../core/text';
import { currentActId } from './act_order';
import { actIndex } from './conditions';
import type { Effect } from './effect_types';
import { applyEffects, conditionHolds } from './effects';
import { allQuestDefs, questTitle } from './instances';
import type { QuestDef, QuestProgress } from './types';

export type ClosedStatus = 'failed' | 'expired' | 'by_other';

declare module '../../core/contracts' {
  interface EventMap {
    /** a quest failed forward (quests_and_events.md 3.5) */
    'quest.failed': { questId: string; title: TextParam };
    /** a quest ran out; its default settlement applied */
    'quest.expired': { questId: string; title: TextParam; started: boolean };
    /** someone else got there first */
    'quest.by_other': { questId: string; title: TextParam; started: boolean };
  }
}

/** Whether a status is final (no further progress, no restart). */
export function isClosed(status: QuestProgress['status'] | undefined): boolean {
  return status === 'done' || status === 'failed' || status === 'expired' || status === 'by_other';
}

/** Close a quest with an outcome (creating a record for one never started). */
export function closeQuest(
  ctx: SystemContext,
  def: QuestDef,
  status: ClosedStatus,
  effects: readonly Effect[] | undefined,
): QuestProgress {
  const slice = ctx.world.slices.quests;
  let q = slice.quests[def.id];
  const started = !!q;
  if (!q) {
    q = {
      id: def.id,
      status: 'active',
      stage: 0,
      counts: [],
      met: [],
      stageStartTick: ctx.tick,
      startedTick: ctx.tick,
      choices: {},
    };
    slice.quests[def.id] = q;
  }
  if (isClosed(q.status)) return q;
  q.status = status;
  q.endedTick = ctx.tick;
  slice.lastBeatTick = ctx.tick;
  slice.dirty = true;
  ctx.setFlag(`quest.${def.id}`, status);
  const title = questTitle(def);
  if (status === 'failed') ctx.emit('quest.failed', { questId: def.id, title });
  else if (status === 'expired') ctx.emit('quest.expired', { questId: def.id, title, started });
  else ctx.emit('quest.by_other', { questId: def.id, title, started });
  applyEffects(ctx, effects);
  return q;
}

/** Forward failure of a started quest: its failure effects apply. */
export function failQuest(ctx: SystemContext, def: QuestDef, q: QuestProgress): void {
  if (q.status !== 'active' && q.status !== 'ready') return;
  closeQuest(ctx, def, 'failed', def.failure?.effects);
}

/** Whether a quest's expiry is due now. */
export function expiryDue(ctx: SystemContext, def: QuestDef): boolean {
  const e = def.expiry;
  if (!e) return false;
  if (e.when && conditionHolds(ctx, e.when)) return true;
  if (e.week === undefined) return false;
  const here = actIndex(currentActId(ctx));
  const mine = actIndex(def.act);
  if (Number.isNaN(here) || Number.isNaN(mine) || here < mine) return false;
  if (here > mine) return true;
  return Number(ctx.flag('act_week') ?? 0) > e.week;
}

/**
 * Settle every quest whose closing condition holds, run-time instances included (a
 * commission's deadline is its expiry): by_other first (someone got there),
 * then expiry, then (started quests only) the failure condition. Quests the player
 * finished (ready, done) and closed ones are left alone.
 */
export function settleOutcomes(ctx: SystemContext): void {
  const slice = ctx.world.slices.quests;
  const here = actIndex(currentActId(ctx));
  for (const def of allQuestDefs(ctx)) {
    if (!def.byOther && !def.expiry && !def.failure?.when) continue;
    // a quest of a later act has not come into the world yet
    if (!(actIndex(def.act) <= here)) continue;
    const q = slice.quests[def.id];
    if (q && q.status !== 'active') continue;
    if (def.byOther && conditionHolds(ctx, def.byOther.when)) {
      closeQuest(ctx, def, 'by_other', def.byOther.effects);
    } else if (expiryDue(ctx, def)) {
      closeQuest(ctx, def, 'expired', def.expiry?.effects);
    } else if (q && def.failure?.when && conditionHolds(ctx, def.failure.when)) {
      failQuest(ctx, def, q);
    }
  }
}
