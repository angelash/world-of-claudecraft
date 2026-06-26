import { CAMPS, GROUND_OBJECTS, ITEMS, MOBS, QUESTS } from '../../src/sim/data';

export interface AmbientBotPoint2d {
  x: number;
  z: number;
}

interface AmbientBotQuestRouteBase {
  questId: string;
  acceptObjectiveId: string;
  activeObjectiveId: string;
  turnInObjectiveId: string;
  acceptLabel: string;
  activeLabel: string;
  turnInLabel: string;
  giverNpcTemplateId: string;
  turnInNpcTemplateId: string;
  camps: readonly AmbientBotPoint2d[];
  pursueAtLevel: number;
  questObjectiveIndex?: number;
}

export interface AmbientBotKillQuestRoute extends AmbientBotQuestRouteBase {
  kind: 'kill';
  mobId: string;
  allowAnyHostileFallback?: boolean;
}

export interface AmbientBotCollectQuestRoute extends AmbientBotQuestRouteBase {
  kind: 'collect';
  objectItemId: string;
}

export type AmbientBotQuestRoute = AmbientBotKillQuestRoute | AmbientBotCollectQuestRoute;

interface AmbientBotQuestRouteConfig {
  activeObjectiveId?: string;
  questObjectiveIndex?: number;
}

function campsFor(mobId: string): AmbientBotPoint2d[] {
  return CAMPS
    .filter((camp) => camp.mobId === mobId)
    .map((camp) => ({ x: camp.center.x, z: camp.center.z }));
}

function objectPointsFor(itemId: string): AmbientBotPoint2d[] {
  return GROUND_OBJECTS
    .filter((object) => object.itemId === itemId)
    .flatMap((object) => object.positions.map((point) => ({ x: point.x, z: point.z })));
}

function questLabel(questId: string): string {
  return QUESTS[questId]?.name ?? questId;
}

function mobLabel(mobId: string): string {
  return MOBS[mobId]?.name ?? mobId;
}

function itemLabel(itemId: string): string {
  return ITEMS[itemId]?.name ?? itemId;
}

function killRoute(
  questId: string,
  giverNpcTemplateId: string,
  mobId: string,
  pursueAtLevel: number,
  activeLabel = `Hunting ${mobLabel(mobId)}`,
  config: AmbientBotQuestRouteConfig = {},
): AmbientBotKillQuestRoute {
  const quest = questLabel(questId);
  return {
    kind: 'kill',
    questId,
    acceptObjectiveId: `accept_${questId.slice(2)}`,
    activeObjectiveId: config.activeObjectiveId ?? `hunt_${questId.slice(2)}`,
    turnInObjectiveId: `turnin_${questId.slice(2)}`,
    acceptLabel: `Picking up ${quest}`,
    activeLabel,
    turnInLabel: `Turning in ${quest}`,
    giverNpcTemplateId,
    turnInNpcTemplateId: giverNpcTemplateId,
    mobId,
    camps: campsFor(mobId),
    pursueAtLevel,
    questObjectiveIndex: config.questObjectiveIndex,
  };
}

function collectRoute(
  questId: string,
  giverNpcTemplateId: string,
  objectItemId: string,
  pursueAtLevel: number,
  activeLabel = `Collecting ${itemLabel(objectItemId)}`,
  config: AmbientBotQuestRouteConfig = {},
): AmbientBotCollectQuestRoute {
  const quest = questLabel(questId);
  return {
    kind: 'collect',
    questId,
    acceptObjectiveId: `accept_${questId.slice(2)}`,
    activeObjectiveId: config.activeObjectiveId ?? `collect_${questId.slice(2)}`,
    turnInObjectiveId: `turnin_${questId.slice(2)}`,
    acceptLabel: `Picking up ${quest}`,
    activeLabel,
    turnInLabel: `Turning in ${quest}`,
    giverNpcTemplateId,
    turnInNpcTemplateId: giverNpcTemplateId,
    objectItemId,
    camps: objectPointsFor(objectItemId),
    pursueAtLevel,
    questObjectiveIndex: config.questObjectiveIndex,
  };
}

export const AMBIENT_BOT_SOLO_QUEST_ROUTES: readonly AmbientBotQuestRoute[] = [
  killRoute('q_wolves', 'marshal_redbrook', 'forest_wolf', 1, 'Hunting Forest Wolves'),
  killRoute('q_boars', 'trader_wilkes', 'wild_boar', 2, 'Collecting Bristly Boar Hides'),
  killRoute('q_spiders', 'apothecary_lin', 'webwood_spider', 2, 'Collecting Webwood Silk'),
  killRoute('q_murlocs', 'fisherman_brandt', 'mudfin_murloc', 3, 'Driving back the Mudfin'),
  collectRoute('q_supplies', 'trader_wilkes', 'supply_crate', 3, 'Recovering Stolen Supplies'),
  killRoute('q_mine', 'foreman_odell', 'tunnel_rat', 4, 'Clearing Tunnel Rats'),
  killRoute('q_greyjaw', 'marshal_redbrook', 'old_greyjaw', 4, 'Hunting Old Greyjaw'),
  killRoute('q_bandits', 'marshal_redbrook', 'vale_bandit', 5, 'Breaking the Vale Bandits'),
  killRoute('q_ringleader', 'marshal_redbrook', 'gorrak', 5, 'Hunting Gorrak the Ruthless'),
  killRoute('q_bones', 'brother_aldric', 'restless_bones', 5, 'Laying Restless Bones to Rest'),
  collectRoute('q_whispers', 'brother_aldric', 'gravecaller_sigil', 5, "Searching for the Gravecaller's Sigil"),
  collectRoute('q_names_of_the_dead', 'brother_aldric', 'weathered_ledger_page', 5, 'Gathering Weathered Ledger Pages'),
  killRoute('q_silence_the_call', 'brother_aldric', 'restless_bones', 6, 'Silencing the Chapel Dead'),
  killRoute(
    'q_rite',
    'brother_aldric',
    'tunnel_rat',
    6,
    'Collecting Blessed Tallow',
    { activeObjectiveId: 'hunt_rite_blessed_wax', questObjectiveIndex: 0 },
  ),
  killRoute(
    'q_rite',
    'brother_aldric',
    'restless_bones',
    6,
    'Collecting Ghostly Essence',
    { activeObjectiveId: 'hunt_rite_ghostly_essence', questObjectiveIndex: 1 },
  ),
];
