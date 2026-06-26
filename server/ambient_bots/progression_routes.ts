import { CAMPS, MOBS, QUESTS } from '../../src/sim/data';

export interface AmbientBotPoint2d {
  x: number;
  z: number;
}

export interface AmbientBotQuestRoute {
  questId: string;
  acceptObjectiveId: string;
  activeObjectiveId: string;
  turnInObjectiveId: string;
  acceptLabel: string;
  activeLabel: string;
  turnInLabel: string;
  giverNpcTemplateId: string;
  turnInNpcTemplateId: string;
  mobId: string;
  camps: readonly AmbientBotPoint2d[];
  pursueAtLevel: number;
  allowAnyHostileFallback?: boolean;
}

function campsFor(mobId: string): AmbientBotPoint2d[] {
  return CAMPS
    .filter((camp) => camp.mobId === mobId)
    .map((camp) => ({ x: camp.center.x, z: camp.center.z }));
}

function questLabel(questId: string): string {
  return QUESTS[questId]?.name ?? questId;
}

function mobLabel(mobId: string): string {
  return MOBS[mobId]?.name ?? mobId;
}

function killRoute(
  questId: string,
  giverNpcTemplateId: string,
  mobId: string,
  pursueAtLevel: number,
  activeLabel = `Hunting ${mobLabel(mobId)}`,
): AmbientBotQuestRoute {
  const quest = questLabel(questId);
  return {
    questId,
    acceptObjectiveId: `accept_${questId.slice(2)}`,
    activeObjectiveId: `hunt_${questId.slice(2)}`,
    turnInObjectiveId: `turnin_${questId.slice(2)}`,
    acceptLabel: `Picking up ${quest}`,
    activeLabel,
    turnInLabel: `Turning in ${quest}`,
    giverNpcTemplateId,
    turnInNpcTemplateId: giverNpcTemplateId,
    mobId,
    camps: campsFor(mobId),
    pursueAtLevel,
  };
}

export const AMBIENT_BOT_SOLO_QUEST_ROUTES: readonly AmbientBotQuestRoute[] = [
  killRoute('q_wolves', 'marshal_redbrook', 'forest_wolf', 1, 'Hunting Forest Wolves'),
  killRoute('q_boars', 'trader_wilkes', 'wild_boar', 2, 'Collecting Bristly Boar Hides'),
  killRoute('q_spiders', 'apothecary_lin', 'webwood_spider', 2, 'Collecting Webwood Silk'),
  killRoute('q_murlocs', 'fisherman_brandt', 'mudfin_murloc', 3, 'Driving back the Mudfin'),
  killRoute('q_mine', 'foreman_odell', 'tunnel_rat', 4, 'Clearing Tunnel Rats'),
  killRoute('q_greyjaw', 'marshal_redbrook', 'old_greyjaw', 4, 'Hunting Old Greyjaw'),
  killRoute('q_bandits', 'marshal_redbrook', 'vale_bandit', 5, 'Breaking the Vale Bandits'),
  killRoute('q_ringleader', 'marshal_redbrook', 'gorrak', 5, 'Hunting Gorrak the Ruthless'),
];
