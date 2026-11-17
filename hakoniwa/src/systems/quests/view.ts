// Player-facing quest queries: the quest log (active, ready to turn in, done) with
// objective progress, and the current act.

import type { FlagValue } from '../../core/contracts';
import { openingActId } from './act_order';
import { objectiveNeed, objectiveProgress } from './objectives';
import type { ActDef, QuestDef, QuestKind, QuestStatus, QuestsSlice } from './types';

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
  /** a run-time instance renders its title from this content record (instances.ts) */
  textOf?: { table: string; id: string };
  act: string;
  kind: QuestKind;
  status: QuestStatus;
  /** the solution path taken (quest.<id>.path) */
  path?: string;
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
  /** closed without the player finishing them: failed, expired, done by someone else */
  ended: QuestView[];
}

type LogWorld = { slices: { quests: QuestsSlice }; meta: { flags: Record<string, FlagValue> } };

export function questView(
  world: LogWorld,
  content: { quests: QuestDef[] },
  id: string,
): QuestView | null {
  const q = world.slices.quests.quests[id];
  // a run-time instance (a guild commission) lives in the slice, not in the content
  const def = content.quests.find((d) => d.id === id) ?? world.slices.quests.instances?.[id];
  if (!q || !def) return null;
  const stage = def.stages[q.stage];
  return {
    id,
    title: def.title,
    ...(def.textOf ? { textOf: { ...def.textOf } } : {}),
    act: def.act,
    kind: def.kind,
    status: q.status,
    path: q.path,
    desc: def.desc,
    stageDesc: q.status === 'active' ? (stage?.desc ?? '') : '',
    giver: def.giver,
    turnIn: def.turnIn,
    objectives:
      q.status === 'active' && stage
        ? stage.objectives.map((o, i) => ({
            label: o.label,
            progress: objectiveProgress(o, q, i),
            need: objectiveNeed(o),
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
    ended: views.filter(
      (v) => v.status === 'failed' || v.status === 'expired' || v.status === 'by_other',
    ),
  };
}

export function currentAct(
  world: { meta: { flags: Record<string, FlagValue> } },
  content: { acts: ActDef[] },
): ActDef | null {
  const act = String(world.meta.flags.act ?? openingActId(content));
  return content.acts.find((a) => a.id === act) ?? null;
}
