import { DUNGEONS, QUESTS } from '../../src/sim/data';
import type { AmbientPlayerBotBrainTickResult } from '../ambient_bots/brain';

export interface HostedPlayActionLog {
  key: string;
  text: string;
  cooldownMs: number;
}

const LONG_COOLDOWN_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const SHORT_COOLDOWN_MS = 20_000;

export function hostedPlayActionLogForResult(
  result: AmbientPlayerBotBrainTickResult,
): HostedPlayActionLog | null {
  const questName = objectiveQuestName(result.objectiveQuestId);
  const dungeonName = objectiveDungeonName(result.objectiveDungeonId);

  if (result.objectiveId.startsWith('accept_') && questName) {
    return {
      key: `accept:${result.objectiveQuestId}`,
      text: `Hosted play: heading to accept ${questName}.`,
      cooldownMs: LONG_COOLDOWN_MS,
    };
  }
  if (result.objectiveId.startsWith('turnin_') && questName) {
    return {
      key: `turnin:${result.objectiveQuestId}`,
      text: `Hosted play: heading to turn in ${questName}.`,
      cooldownMs: LONG_COOLDOWN_MS,
    };
  }
  if ((result.objectiveId.startsWith('hunt_') || result.objectiveId.startsWith('collect_')) && questName) {
    return {
      key: `quest:${result.objectiveQuestId}`,
      text: `Hosted play: working on ${questName}.`,
      cooldownMs: DEFAULT_COOLDOWN_MS,
    };
  }
  if (result.objectiveId.startsWith('enter_') && questName) {
    return {
      key: `party:${result.objectiveQuestId}`,
      text: `Hosted play: gathering a party for ${questName}.`,
      cooldownMs: LONG_COOLDOWN_MS,
    };
  }
  if (result.objectiveId.startsWith('leave_')) {
    if (dungeonName) {
      return {
        key: `leave:${result.objectiveDungeonId}`,
        text: `Hosted play: leaving ${dungeonName}.`,
        cooldownMs: LONG_COOLDOWN_MS,
      };
    }
    if (questName) {
      return {
        key: `leave:${result.objectiveQuestId}`,
        text: `Hosted play: leaving the dungeon for ${questName}.`,
        cooldownMs: LONG_COOLDOWN_MS,
      };
    }
  }
  if (result.objectiveId.startsWith('restock_')) {
    return {
      key: 'restock',
      text: 'Hosted play: heading to a vendor for supplies.',
      cooldownMs: DEFAULT_COOLDOWN_MS,
    };
  }
  if (result.objectiveId.startsWith('buy_')) {
    return {
      key: `buy:${result.objectiveId}`,
      text: 'Hosted play: heading to a vendor for an upgrade.',
      cooldownMs: DEFAULT_COOLDOWN_MS,
    };
  }
  if (result.objectiveId === 'grind') {
    return {
      key: `grind:${result.objectiveLabel}`,
      text: 'Hosted play: grinding for experience.',
      cooldownMs: DEFAULT_COOLDOWN_MS,
    };
  }
  if (result.objectiveId === 'recover') {
    return result.objectiveLabel === 'Retreating from a dangerous pull'
      ? {
          key: 'retreat',
          text: 'Hosted play: retreating to safety.',
          cooldownMs: SHORT_COOLDOWN_MS,
        }
      : {
          key: 'recover',
          text: 'Hosted play: recovering between pulls.',
          cooldownMs: SHORT_COOLDOWN_MS,
        };
  }
  if (result.objectiveId === 'release') {
    return {
      key: 'release',
      text: 'Hosted play: releasing spirit.',
      cooldownMs: SHORT_COOLDOWN_MS,
    };
  }
  return null;
}

function objectiveQuestName(questId: string | undefined): string {
  if (!questId) return '';
  return QUESTS[questId]?.name ?? questId;
}

function objectiveDungeonName(dungeonId: string | undefined): string {
  if (!dungeonId) return '';
  return DUNGEONS[dungeonId]?.name ?? dungeonId;
}
