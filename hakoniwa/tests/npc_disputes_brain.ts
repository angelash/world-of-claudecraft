// Alive metric 7 with the NPC brain in charge (builtin_ai.md 14.2, VS-08; PK-M1-18): the
// narrative systems, the dispute runner and the social systems (npc, dialogue, cognition)
// under the registry guard, with an hour-coarse clock so act 1 runs in a few thousand
// steps. Nobody plays: every Must dispute must still reach a legal ending with nothing left
// open, and the named people decide their own points (the dispute.decided source is the
// chooser, i.e. the npc.decision_point request's fallback, not the runner's own).

import { Engine } from '../src/core';
import type { AnyWorldEvent, CommandSource } from '../src/core/contracts';
import { Rng } from '../src/core/rng';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import { guardSystems, registryFor } from '../src/game/flag_guard';
import { system as cognition } from '../src/systems/cognition';
import { system as dialogue } from '../src/systems/dialogue';
import { system as disputes, legalEndings } from '../src/systems/disputes';
import { system as npc } from '../src/systems/npc';
import { actWeekStartTick } from '../src/systems/quests';
import { attachSkipHandlers } from '../src/systems/travel/skip_registry';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

export const MUST_DISPUTES = [
  'q_a1_d01_tax_and_bandits',
  'q_a1_d02_witch_trial',
  'q_a1_d04_forest_dispute',
];
const SCRIPT: CommandSource = { type: 'script', script: 'test' };

let content: ReturnType<typeof narrativeContent> | null = null;

function strideSystem(state: { on: boolean }): GameSystem {
  return {
    id: 'zz_stride',
    order: 1,
    clock(world) {
      if (!state.on) return null;
      const t = world.meta.tick;
      return { stride: TICKS_PER_GAME_HOUR - (t % TICKS_PER_GAME_HOUR), hold: null };
    },
  };
}

export interface DisputeRun {
  seed: number;
  /** per Must dispute: settled on a legal ending with every point decided or dropped */
  legal: Record<string, boolean>;
  /** open decision points left at the end (deadlocks) */
  open: number;
  /** decided points whose actor is a named person, and how many of them the brain chose */
  personPoints: number;
  byBrain: number;
  endings: Record<string, string>;
}

/** One headless act-1 run with the NPC brains deciding (no player, no model). */
export function runDisputes(seed: number): DisputeRun {
  content ??= narrativeContent();
  const stride = { on: true };
  const systems = [
    ...guardSystems(
      attachSkipHandlers([...NARRATIVE_SYSTEMS, disputes, npc, dialogue, cognition]),
      registryFor(content),
      'throw',
    ),
    otherTeamsStub,
    strideSystem(stride),
  ];
  const g = Engine.create(seed, content, systems, { aiMode: 'off' });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => {
    for (const e of evs) if (e.kind === 'dispute.decided') events.push(e);
  });
  const rng = new Rng({ s: seed * 7919 + 13 });
  const start = tickAtDay(rng.int(0, 13), rng.int(7, 18));
  if (start > g.tick + 1) g.step(start - g.tick - 1);
  stride.on = false;
  g.queue('flag.set', { key: 'seal_unrest', value: 10 }, SCRIPT);
  g.queue('flag.set', { key: 'act', value: 'act1' }, SCRIPT);
  g.step(1);
  stride.on = true;
  const clock = g.world.slices.quests.clock;
  if (!clock) throw new Error('the act clock has not started');
  const end = actWeekStartTick(clock.startDay, 11, clock.startTick) + 2 * TICKS_PER_GAME_HOUR;
  while (g.tick < end) g.step(1);
  g.step(2);
  const legal: Record<string, boolean> = {};
  const endings: Record<string, string> = {};
  for (const id of MUST_DISPUTES) {
    const def = content.disputes.find((d) => d.id === id);
    const st = g.world.slices.disputes.disputes[id];
    endings[id] = st?.ending ?? '';
    legal[id] =
      !!def &&
      !!st?.ending &&
      legalEndings(def).includes(st.ending) &&
      def.decisions.every((p) => st.chosen[p.id] !== undefined || st.dropped.includes(p.id));
  }
  const persons = new Set(content.npcs.map((p) => p.id));
  const decided = events.filter(
    (e) => e.kind === 'dispute.decided' && persons.has(e.data.actor) && e.data.optionId !== '',
  );
  return {
    seed,
    legal,
    open: g.world.slices.disputes.open.length,
    personPoints: decided.length,
    byBrain: decided.filter((e) => e.kind === 'dispute.decided' && e.data.source === 'chooser')
      .length,
    endings,
  };
}
