// A named person's row on a tide night (act1_borderstone.md 8.4; builtin_ai.md 1.2, 5.8;
// the seam PK-M1-52 left for the NPC brain and the model path). At each phase of a written
// tide night that a later phase still picks rows after, every actor led by a named person
// with more than one legal row files an npc.decision_point request: the menu is the actor's
// legal rows, the suggestion is the row the kernel would take (the pick already made while
// it stays legal, else the table's first legal row, `pickRows`). A model may name another
// legal row through `tide.act`, which the tide system checks and takes from the next phase.
// The fallback is empty: with no model the kernel's own rule runs untouched (writing the
// built-in row would pin it against a later change of the table's order, and could clobber
// a pick that arrived while the request waited). A group without a named person (the
// militia) stays with the table. Draws no random numbers. (PK-M1-21)

import type { AiContextV1 } from '../../../core/ai_port';
import { contentRef } from '../../../core/content_key';
import type { SystemContext } from '../../../core/system';
import { tr } from '../../../core/text';
import { conditionHolds } from '../../quests/effects';
import { runningNight } from '../../tide/night';
import { legalRows } from '../../tide/rules';
import type { ActorDef, ActorRowDef, PhaseDef } from '../../tide/types';
import { baseContext } from '../ai_context';
import { personaById } from '../personas';

/** The decision kind of the request (builtin_ai.md 1.4). */
export const TIDE_ROW_ROLE = 'npc.decision_point';

/** The built-in row of an actor: the first legal one (8.4), or null with no choice to make. */
export function builtinRow(legal: readonly ActorRowDef[]): string | null {
  return legal.length > 1 ? (legal[0]?.id ?? null) : null;
}

/** The named person who decides for an actor: the first one alive with a persona card. */
function deciderOf(ctx: SystemContext, actor: ActorDef): string | null {
  for (const id of actor.npcs ?? []) {
    const st = ctx.world.slices.npc.npcs[id];
    if (st && !st.gone && personaById(ctx.content, id)) return id;
  }
  return null;
}

/** A phase that picks the actors' rows (the tide night's own test, night.ts `startPhase`). */
function picksRows(ph: PhaseDef): boolean {
  return !!(ph.settle || ph.seek || ph.surge || ph.witness || ph.mob);
}

/** A phase of the night began: each named actor with a choice files its request. */
export function onTidePhase(ctx: SystemContext, d: { night: string; phase: string }): void {
  const run = runningNight(ctx);
  if (!run || run.def.id !== d.night) return;
  // a pick takes from the next phase: nothing to ask when no later phase picks a row
  const at = run.def.phases.findIndex((ph) => ph.id === d.phase);
  if (at < 0 || !run.def.phases.slice(at + 1).some(picksRows)) return;
  for (const actor of run.def.actors) {
    const who = deciderOf(ctx, actor);
    if (!who) continue;
    const legal = legalRows(actor, (expr) => conditionHolds(ctx, expr));
    // a pick already made (a model's) stays while it is still legal (the kernel's rule)
    const kept = run.st.chosen[actor.id];
    const row =
      legal.length > 1 && legal.some((r) => r.id === kept) ? (kept as string) : builtinRow(legal);
    if (row === null) continue;
    const p = personaById(ctx.content, who);
    if (!p) continue;
    const label = (r: ActorRowDef) =>
      contentRef('tideNights', run.def.id, `actors.${actor.id}.rows.${r.id}.label`);
    const context: AiContextV1 = baseContext(
      ctx.content,
      p,
      ctx.world.slices.npc.minds[who],
      (k) => ctx.flag(k),
      tr('sys.npc.prompt.tide_situation', { phase: d.phase }),
      { 'tide.act': tr('sys.npc.prompt.tide_command', { actor: actor.id }) },
      { options: legal.map((r) => ({ id: r.id, label: label(r) })), suggested: row },
    );
    ctx.ai.request({
      agentId: who,
      role: TIDE_ROW_ROLE,
      purpose: 'tide_row',
      revision: ctx.tick,
      context,
      allowed: ['tide.act'],
      fallback: [],
      deadlineTicks: 20,
      priority: 4,
    });
  }
}
