// Player-facing quest queries: the quest log (active, ready to turn in, done) with
// objective progress, and the current act.

import type { FlagValue } from '../../core/contracts';
import { openingActId } from './act_order';
import type { ActDef, Objective, QuestDef, QuestStatus, QuestsSlice } from './types';

export interface ObjectiveView {
  label: string;
  progress: number;
  need: number;
  done: boolean;
  optional: boolean;
  /** choice objectives without an NPC are answered from the log */
  options?: { id: string; label: string }[];
}

export interface QuestView {
  id: string;
  title: string;
  act: string;
  kind: 'main' | 'side';
  status: QuestStatus;
  desc: string;
  stageDesc: string;
  giver?: string;
  turnIn?: string;
  objectives: ObjectiveView[];
}

export interface QuestLogView {
  act: string;
  actTitle: string;
  active: QuestView[];
  ready: QuestView[];
  done: QuestView[];
}

type LogWorld = { slices: { quests: QuestsSlice }; meta: { flags: Record<string, FlagValue> } };

function need(o: Objective): number {
  return 'count' in o && typeof o.count === 'number' ? o.count : 1;
}

export function questView(
  world: LogWorld,
  content: { quests: QuestDef[] },
  id: string,
): QuestView | null {
  const q = world.slices.quests.quests[id];
  const def = content.quests.find((d) => d.id === id);
  if (!q || !def) return null;
  const stage = def.stages[q.stage];
  return {
    id,
    title: def.title,
    act: def.act,
    kind: def.kind,
    status: q.status,
    desc: def.desc,
    stageDesc: q.status === 'active' ? (stage?.desc ?? '') : '',
    giver: def.giver,
    turnIn: def.turnIn,
    objectives:
      q.status === 'active' && stage
        ? stage.objectives.map((o, i) => ({
            label: o.label,
            progress: Math.min(need(o), q.met[i] ? need(o) : (q.counts[i] ?? 0)),
            need: need(o),
            done: !!q.met[i],
            optional: !!o.optional,
            options:
              o.type === 'choice' && !o.npc
                ? o.options.map((x) => ({ id: x.id, label: x.label }))
                : undefined,
          }))
        : [],
  };
}

export function questLog(
  world: LogWorld,
  content: { quests: QuestDef[]; acts: ActDef[] },
): QuestLogView {
  const act = String(world.meta.flags.act ?? openingActId(content));
  const views = world.slices.quests.order
    .map((id) => questView(world, content, id))
    .filter((v): v is QuestView => !!v);
  return {
    act,
    actTitle: content.acts.find((a) => a.id === act)?.title ?? '',
    active: views.filter((v) => v.status === 'active'),
    ready: views.filter((v) => v.status === 'ready'),
    done: views.filter((v) => v.status === 'done'),
  };
}

export function currentAct(
  world: { meta: { flags: Record<string, FlagValue> } },
  content: { acts: ActDef[] },
): ActDef | null {
  const act = String(world.meta.flags.act ?? openingActId(content));
  return content.acts.find((a) => a.id === act) ?? null;
}
