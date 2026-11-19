// Commission instances as quests (PK-M1-47; quests_and_events.md 3.9, 6.5): a posting drawn
// from a template `cmm_` becomes, once taken, a quest of kind `commission` with the drawn
// parameters written into the quest model's own objectives. The quests system runs it like
// any quest (kills, deliveries, talks, clues, time); its deadline is the quest's expiry and
// walking away is its failure. Pay, experience and the default penalty are settled by the
// guild when the quest closes (board.ts), because experience depends on the player's level
// and the week's count at that moment. Pure.

import type { Effect } from '../quests/effect_types';
import type { Objective, QuestDef, QuestStage } from '../quests/types';
import type { CommissionDef, Posting } from './types';

/** The posting's display number GC-F-001 as a quest id (gc_f_001). */
export function instanceId(rank: string, serial: number): { id: string; display: string } {
  const n = String(serial).padStart(3, '0');
  return { id: `gc_${rank}_${n}`, display: `GC-${rank.toUpperCase()}-${n}` };
}

function label(t: CommissionDef, i: number): string {
  return t.labels[i] ?? t.title;
}

/** The stages of an instance: the template's goal with the posting's drawn parameters. */
export function instanceStages(t: CommissionDef, p: Posting): QuestStage[] {
  const g = t.goal;
  const at: { mapId: string; location?: string } = { mapId: p.place.mapId };
  if (p.place.location) at.location = p.place.location;
  switch (g.type) {
    case 'kill': {
      const o: Objective = {
        type: 'kill',
        refs: [p.target ?? (g.targets[0] as string)],
        count: p.count ?? g.count[0],
        label: label(t, 0),
      };
      if (g.onMap) o.mapId = p.place.mapId;
      return [{ id: 'goal', desc: t.desc, objectives: [o] }];
    }
    case 'deliver':
      return [
        {
          id: 'goal',
          desc: t.desc,
          objectives: [
            {
              type: 'deliver',
              item: p.item ?? (g.items[0] as string),
              count: p.count ?? g.count[0],
              npc: p.giver ?? '',
              consume: true,
              label: label(t, 0),
            },
          ],
        },
      ];
    case 'talk':
      return [
        {
          id: 'goal',
          desc: t.desc,
          objectives: [
            { type: 'talk', npc: p.recipient ?? (g.to[0] as string), label: label(t, 0) },
          ],
        },
      ];
    case 'find':
      return [
        { id: 'search', desc: t.desc, objectives: [{ type: 'reach', ...at, label: label(t, 0) }] },
        {
          id: 'return',
          desc: t.desc,
          objectives: [{ type: 'talk', npc: p.giver ?? '', label: label(t, 1) }],
        },
      ];
    case 'investigate':
      return [
        {
          id: 'goal',
          desc: t.desc,
          objectives: [
            g.need === undefined
              ? { type: 'investigate', clues: g.clues.map((c) => ({ ...c })), label: label(t, 0) }
              : {
                  type: 'investigate',
                  clues: g.clues.map((c) => ({ ...c })),
                  need: g.need,
                  label: label(t, 0),
                },
          ],
        },
      ];
    case 'watch':
      // the quest model has no "stay inside an area" objective yet: the watch is to be at
      // the post when it starts and still (again) at the post when it ends
      return [
        { id: 'post', desc: t.desc, objectives: [{ type: 'reach', ...at, label: label(t, 0) }] },
        {
          id: 'hold',
          desc: t.desc,
          objectives: [{ type: 'wait', hours: g.hours, label: label(t, 1) }],
        },
        { id: 'relief', desc: t.desc, objectives: [{ type: 'reach', ...at, label: label(t, 2) }] },
      ];
    case 'escort': {
      const npc = p.recipient ?? g.people[0] ?? '';
      return [
        { id: 'meet', desc: t.desc, objectives: [{ type: 'talk', npc, label: label(t, 0) }] },
        {
          id: 'escort',
          desc: t.desc,
          objectives: [{ type: 'escort', npc, ...at, label: label(t, 1) }],
        },
      ];
    }
  }
}

/** The completion writes of a template: its world writes and its key slot. */
export function completionEffects(t: CommissionDef): Effect[] {
  const out: Effect[] = [...(t.writes ?? [])];
  if (t.keySlot) out.push({ type: 'key', ...t.keySlot });
  return out;
}

/**
 * The quest of a taken posting. `deadline` is the last day (calendar day index) to finish
 * it: past it the quest expires (quests_and_events.md 3.5); walking away fails it. The guild
 * charges the default penalty for both when it hears of them. A board with a clerk takes the
 * work back (`turnIn`); a notice board pays when the work is done.
 */
export function instanceQuest(
  t: CommissionDef,
  p: Posting,
  opts: { act: string; turnIn?: string; deadline: number },
): QuestDef {
  const def: QuestDef = {
    id: p.id,
    act: opts.act,
    kind: 'commission',
    title: t.title,
    textOf: { table: 'commissions', id: t.id },
    desc: t.desc,
    stages: instanceStages(t, p),
    rewards: completionEffects(t),
    expiry: { when: `day > ${opts.deadline}` },
  };
  if (opts.turnIn) def.turnIn = opts.turnIn;
  return def;
}
