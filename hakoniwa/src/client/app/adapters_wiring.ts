// Connects the gameplay systems to the client: every adapter of ../view/adapters.ts is
// built here from the modules under ../adapters/, which call each system's exported
// queries and build its commands. The client reaches the systems only through these.

import {
  createAppraiseAdapter,
  createCharacterAdapter,
  createCombatAdapter,
  createUnitFrameAdapter,
} from '../adapters/combat';
import {
  createBattleAdapter,
  createCompanyAdapter,
  createStrategyAdapter,
  createTerritoryAdapter,
} from '../adapters/domain';
import { createBannerAdapter, createLogAdapter } from '../adapters/log';
import {
  createConversationAdapter,
  createDoorsAdapter,
  createGoddessAdapter,
  createInteractAdapter,
  createPartyAdapter,
  createQuestMarkerAdapters,
  createQuestsAdapter,
  createRumorsAdapter,
  createSceneAdapter,
  createTradeAdapter,
} from '../adapters/social';
import type { ClientAdapters } from '../view/adapters';

export function createAdapters(): ClientAdapters {
  const markers = createQuestMarkerAdapters();
  return {
    unitFrames: createUnitFrameAdapter(),
    combat: createCombatAdapter(),
    interact: createInteractAdapter(),
    conversation: createConversationAdapter(),
    scene: createSceneAdapter(),
    trade: createTradeAdapter(),
    overhead: markers.overhead,
    mapMarkers: markers.mapMarkers,
    log: [createLogAdapter()],
    banner: createBannerAdapter(),
    character: createCharacterAdapter(),
    doors: createDoorsAdapter(),
    quests: createQuestsAdapter(),
    rumors: createRumorsAdapter(),
    party: createPartyAdapter(),
    company: createCompanyAdapter(),
    territory: createTerritoryAdapter(),
    battle: createBattleAdapter(),
    strategy: createStrategyAdapter(),
    goddess: createGoddessAdapter(),
    appraise: createAppraiseAdapter(),
  };
}
