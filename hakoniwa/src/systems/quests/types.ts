// Quest and act data model (docs/40_design/systems/quests_and_events.md 3, 5, 7).

import type { Effect } from './effect_types';

export type Objective = (
  | {
      type: 'kill';
      /** monster content id (entity ref) or any of refs */
      ref?: string;
      refs?: string[];
      /** entity kind of the victim (monster by default) */
      kind?: string;
      /** only on this map */
      mapId?: string;
      count: number;
    }
  | { type: 'talk'; npc: string }
  | { type: 'reach'; mapId: string; location?: string }
  | { type: 'collect'; item: string; count: number; consume?: boolean }
  | { type: 'flag'; when: string }
  | {
      type: 'choice';
      /** offered when talking to this NPC; without npc it is chosen from the quest log */
      npc?: string;
      options: { id: string; label: string; effects?: Effect[] }[];
    }
  | { type: 'build'; defId?: string; count: number }
  | { type: 'battle'; scenario: string; onLose?: Effect[] }
  | { type: 'level'; level: number }
  | { type: 'door'; doorId: string }
  | { type: 'wait'; hours?: number; days?: number }
  | { type: 'scene'; scene: string }
) & {
  label: string;
  /** robust alternative completion: satisfied as soon as this condition holds */
  orWhen?: string;
  optional?: boolean;
};

export interface QuestStage {
  id: string;
  desc: string;
  objectives: Objective[];
  /** 'all' (default): every required objective; 'any': the first one done completes the stage */
  complete?: 'all' | 'any';
  onEnter?: Effect[];
  onComplete?: Effect[];
}

export interface QuestDef {
  id: string;
  /** act key: act1 .. act6 */
  act: string;
  kind: 'main' | 'side';
  title: string;
  /** NPC id offering it; absent means it starts automatically when the trigger holds */
  giver?: string;
  /** NPC id to turn in to; absent means it completes when the last stage is done */
  turnIn?: string;
  desc: string;
  /** availability condition (reveal-ledger syntax) */
  trigger?: string;
  stages: QuestStage[];
  onStart?: Effect[];
  /** completion effects and rewards (xp, money, items, flags, features, scenes, act) */
  rewards?: Effect[];
  /** log ordering inside an act */
  order?: number;
}

export interface ActDef {
  id: string;
  index: number;
  title: string;
  /** where the player is put when the act begins */
  entry?: { mapId: string; location?: string };
  /** scene played when the act begins */
  introScene?: string;
  /** flags written when the act begins */
  onEnter?: Effect[];
}

export type QuestStatus = 'active' | 'ready' | 'done' | 'failed';

export interface QuestProgress {
  id: string;
  status: QuestStatus;
  stage: number;
  /** objective index -> progress count */
  counts: number[];
  /** objective index -> satisfied */
  met: boolean[];
  stageStartTick: number;
  startedTick: number;
  doneTick?: number;
  /** chosen option ids of choice objectives */
  choices: Record<string, string>;
}

export interface QuestsSlice {
  quests: Record<string, QuestProgress>;
  /** quest ids in start order */
  order: string[];
  /** availability needs a re-check */
  dirty: boolean;
  /** player level as last reported */
  level: number;
  /** completed buildings by def id */
  built: Record<string, number>;
  /** opened doors */
  doors: string[];
  /** scenes seen to the end */
  scenesSeen: string[];
  lastBeatTick: number;
}
