import { CAMPS, DUNGEONS, GROUND_OBJECTS, ITEMS, MOBS, QUESTS } from '../../src/sim/data';

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
  acceptBeforeActiveQuestIds?: readonly string[];
  deferReadyWhileQuestIdsActive?: readonly string[];
  dungeonId?: string;
  suggestedPartySize?: number;
}

export interface AmbientBotKillQuestRoute extends AmbientBotQuestRouteBase {
  kind: 'kill';
  mobId: string;
  alternateMobIds?: readonly string[];
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
  turnInNpcTemplateId?: string;
  alternateMobIds?: readonly string[];
  acceptBeforeActiveQuestIds?: readonly string[];
  deferReadyWhileQuestIdsActive?: readonly string[];
  dungeonId?: string;
  suggestedPartySize?: number;
}

function campsForMobIds(mobIds: readonly string[]): AmbientBotPoint2d[] {
  return CAMPS
    .filter((camp) => mobIds.includes(camp.mobId))
    .map((camp) => ({ x: camp.center.x, z: camp.center.z }));
}

function objectPointsFor(itemId: string): AmbientBotPoint2d[] {
  return GROUND_OBJECTS
    .filter((object) => object.itemId === itemId)
    .flatMap((object) => object.positions.map((point) => ({ x: point.x, z: point.z })));
}

function dungeonPointsFor(
  dungeonId: string,
  mobIds: readonly string[],
): AmbientBotPoint2d[] {
  return (DUNGEONS[dungeonId]?.spawns ?? [])
    .filter((spawn) => mobIds.includes(spawn.mobId))
    .map((spawn) => ({ x: spawn.x, z: spawn.z }));
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
  const dungeonId = config.dungeonId;
  const suggestedPartySize = config.suggestedPartySize
    ?? (dungeonId ? DUNGEONS[dungeonId]?.suggestedPlayers ?? 1 : undefined);
  const camps = dungeonId
    ? dungeonPointsFor(dungeonId, [mobId, ...(config.alternateMobIds ?? [])])
    : campsForMobIds([mobId, ...(config.alternateMobIds ?? [])]);
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
    turnInNpcTemplateId: config.turnInNpcTemplateId ?? giverNpcTemplateId,
    mobId,
    ...(config.alternateMobIds ? { alternateMobIds: config.alternateMobIds } : {}),
    camps,
    pursueAtLevel,
    questObjectiveIndex: config.questObjectiveIndex,
    ...(config.acceptBeforeActiveQuestIds
      ? { acceptBeforeActiveQuestIds: config.acceptBeforeActiveQuestIds }
      : {}),
    ...(config.deferReadyWhileQuestIdsActive
      ? { deferReadyWhileQuestIdsActive: config.deferReadyWhileQuestIdsActive }
      : {}),
    ...(dungeonId ? { dungeonId } : {}),
    ...(suggestedPartySize ? { suggestedPartySize } : {}),
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
  const suggestedPartySize = config.suggestedPartySize
    ?? (config.dungeonId ? DUNGEONS[config.dungeonId]?.suggestedPlayers ?? 1 : undefined);
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
    turnInNpcTemplateId: config.turnInNpcTemplateId ?? giverNpcTemplateId,
    objectItemId,
    camps: objectPointsFor(objectItemId),
    pursueAtLevel,
    questObjectiveIndex: config.questObjectiveIndex,
    ...(config.acceptBeforeActiveQuestIds
      ? { acceptBeforeActiveQuestIds: config.acceptBeforeActiveQuestIds }
      : {}),
    ...(config.deferReadyWhileQuestIdsActive
      ? { deferReadyWhileQuestIdsActive: config.deferReadyWhileQuestIdsActive }
      : {}),
    ...(config.dungeonId ? { dungeonId: config.dungeonId } : {}),
    ...(suggestedPartySize ? { suggestedPartySize } : {}),
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
  collectRoute(
    'q_fenbridge_muster',
    'brother_aldric',
    'fen_muster_order',
    6,
    'Carrying the Fenbridge muster order north',
    { turnInNpcTemplateId: 'warden_fenwick' },
  ),
  killRoute(
    'q_prowlers',
    'warden_fenwick',
    'mire_prowler',
    6,
    'Clearing Mire Prowlers from the causeway',
  ),
  killRoute(
    'q_prowler_pelts',
    'provisioner_hale',
    'mire_prowler',
    6,
    'Collecting Mire Prowler Pelts',
    { questObjectiveIndex: 0 },
  ),
  collectRoute(
    'q_fen_supplies',
    'provisioner_hale',
    'lost_caravan_goods',
    7,
    'Salvaging the lost caravan',
  ),
  killRoute(
    'q_deepfen',
    'warden_fenwick',
    'deepfen_murloc',
    7,
    'Driving back the Deepfen snappers',
  ),
  killRoute(
    'q_idols',
    'brother_aldric_fen',
    'deepfen_murloc',
    7,
    'Recovering Waterlogged Idols',
    { activeObjectiveId: 'hunt_idols', questObjectiveIndex: 0 },
  ),
  killRoute(
    'q_deepfen_purge',
    'warden_fenwick',
    'deepfen_murloc',
    7,
    'Breaking the Deepfen dredge',
  ),
  killRoute(
    'q_widows',
    'herbalist_yara',
    'mire_widow',
    8,
    'Clearing the Widow Thicket',
  ),
  killRoute(
    'q_broodmother',
    'herbalist_yara',
    'mire_widow',
    10,
    'Burning through the Broodmother hatchlings',
    { activeObjectiveId: 'hunt_broodmother_widows', questObjectiveIndex: 0 },
  ),
  killRoute(
    'q_broodmother',
    'herbalist_yara',
    'mirefen_broodmother',
    10,
    'Hunting the Broodmother',
    { activeObjectiveId: 'hunt_broodmother_matriarch', questObjectiveIndex: 1 },
  ),
  killRoute(
    'q_drowned',
    'brother_aldric_fen',
    'drowned_dead',
    9,
    'Laying the drowned dead to rest',
  ),
  collectRoute(
    'q_drowned_censers',
    'brother_aldric_fen',
    'rusted_censer',
    9,
    'Recovering Rusted Censers',
  ),
  killRoute(
    'q_no_rest',
    'brother_aldric_fen',
    'drowned_dead',
    9,
    'Driving the drowned from the reeds',
  ),
  killRoute(
    'q_trolls',
    'warden_fenwick',
    'fen_troll',
    10,
    'Driving the Mirefen trolls off the barrows',
  ),
  killRoute(
    'q_troll_fetishes',
    'scout_maren',
    'fen_troll',
    10,
    'Gathering Mirefen Troll Fetishes',
  ),
  killRoute(
    'q_grubjaw',
    'provisioner_hale',
    'grubjaw',
    11,
    'Hunting Grubjaw the Glutton',
  ),
  killRoute(
    'q_cult_camp',
    'scout_maren',
    'gravecaller_cultist',
    11,
    'Breaking the cult camp in the reeds',
  ),
  killRoute(
    'q_summoners',
    'brother_aldric_fen',
    'gravecaller_summoner',
    11,
    'Silencing Gravecaller Summoners',
    { questObjectiveIndex: 0 },
  ),
  killRoute(
    'q_summoners',
    'brother_aldric_fen',
    'gravecaller_summoner',
    11,
    'Recovering Gravecaller Ciphers',
    {
      activeObjectiveId: 'hunt_summoner_ciphers',
      questObjectiveIndex: 1,
      alternateMobIds: ['gravecaller_mender'],
    },
  ),
  killRoute(
    'q_deacon',
    'warden_fenwick',
    'deacon_voss',
    12,
    'Hunting Deacon Voss',
  ),
  collectRoute(
    'q_bastion_door',
    'brother_aldric_fen',
    'bastion_ward_stone',
    12,
    'Recovering a Bastion Ward Stone',
  ),
  killRoute(
    'q_olen',
    'scout_maren',
    'knight_commander_olen',
    12,
    'Laying Knight-Commander Olen to rest',
    {
      dungeonId: 'sunken_bastion',
      suggestedPartySize: 5,
      acceptBeforeActiveQuestIds: ['q_mistcaller'],
      deferReadyWhileQuestIdsActive: ['q_mistcaller'],
    },
  ),
  killRoute(
    'q_mistcaller',
    'brother_aldric_fen',
    'vael_the_mistcaller',
    12,
    'Hunting Vael the Mistcaller',
    {
      dungeonId: 'sunken_bastion',
      suggestedPartySize: 5,
    },
  ),
  collectRoute(
    'q_highwatch_summons',
    'brother_aldric_fen',
    'highwatch_summons',
    12,
    'Carrying Aldric\'s summons to Highwatch',
    { turnInNpcTemplateId: 'captain_thessaly' },
  ),
  killRoute(
    'q_stalkers',
    'captain_thessaly',
    'ridge_stalker',
    12,
    'Driving back the Highwatch ridge stalkers',
    {
      acceptBeforeActiveQuestIds: ['q_stalker_pelts'],
      deferReadyWhileQuestIdsActive: ['q_stalker_pelts'],
    },
  ),
  killRoute(
    'q_stalker_pelts',
    'quartermaster_bree',
    'ridge_stalker',
    12,
    'Collecting Ridge Stalker Pelts',
    { questObjectiveIndex: 0 },
  ),
  killRoute(
    'q_kobold_tunnels',
    'loremaster_caddis',
    'deeprock_kobold',
    14,
    'Clearing Deeprock Tunnelers',
  ),
  killRoute(
    'q_glowing_wax',
    'quartermaster_bree',
    'deeprock_kobold',
    14,
    'Collecting Glowing Wax',
    { questObjectiveIndex: 0 },
  ),
  killRoute(
    'q_ogre_edges',
    'scout_maren_highwatch',
    'thornpeak_ogre',
    15,
    'Driving back the Thornpeak foothill ogres',
  ),
  collectRoute(
    'q_ogre_totems',
    'scout_maren_highwatch',
    'ogre_war_totem',
    15,
    'Recovering Ogre War Totems',
  ),
  killRoute(
    'q_ogre_bounty',
    'captain_thessaly',
    'thornpeak_ogre',
    15,
    'Collecting the captain\'s ogre bounty',
  ),
  killRoute(
    'q_elementals',
    'loremaster_caddis',
    'stormcrag_elemental',
    16,
    'Quelling the Stormcrag elementals',
  ),
  killRoute(
    'q_shard_cores',
    'loremaster_caddis',
    'stormcrag_elemental',
    16,
    'Collecting Storm Cores',
    {
      questObjectiveIndex: 0,
      acceptBeforeActiveQuestIds: ['q_kazzix'],
      deferReadyWhileQuestIdsActive: ['q_kazzix'],
    },
  ),
  killRoute(
    'q_kazzix',
    'loremaster_caddis',
    'shardlord_kazzix',
    17,
    'Hunting Shardlord Kazzix',
    { questObjectiveIndex: 0 },
  ),
  killRoute(
    'q_zealots',
    'brother_aldric_highwatch',
    'wyrmcult_zealot',
    17,
    'Silencing the Wyrmcult zealots',
  ),
  killRoute(
    'q_cult_orders',
    'brother_aldric_highwatch',
    'wyrmcult_zealot',
    17,
    'Recovering Wyrmcult Orders',
  ),
  killRoute(
    'q_necromancers',
    'brother_aldric_highwatch',
    'wyrmcult_necromancer',
    18,
    'Recovering Ritual Phylacteries',
  ),
  killRoute(
    'q_revenants',
    'captain_thessaly',
    'boneclad_revenant',
    18,
    'Putting the boneclad revenants back to rest',
  ),
  killRoute(
    'q_revenant_vanguard',
    'captain_thessaly',
    'boneclad_revenant',
    18,
    'Breaking the revenant vanguard',
  ),
  collectRoute(
    'q_wyrm_sigils',
    'brother_aldric_highwatch',
    'gravewyrm_sigil',
    18,
    'Recovering Gravewyrm Sigils',
  ),
  killRoute(
    'q_breaking_the_seal',
    'brother_aldric_highwatch',
    'stormcrag_elemental',
    18,
    'Collecting Blessed Embers',
  ),
  killRoute(
    'q_voice_below',
    'brother_aldric_highwatch',
    'wyrmcult_zealot',
    18,
    'Silencing the kneeling zealots',
    {
      activeObjectiveId: 'hunt_voice_below_zealots',
      questObjectiveIndex: 0,
    },
  ),
  killRoute(
    'q_voice_below',
    'brother_aldric_highwatch',
    'wyrmcult_necromancer',
    18,
    'Silencing the kneeling necromancers',
    {
      activeObjectiveId: 'hunt_voice_below_necromancers',
      questObjectiveIndex: 1,
    },
  ),
  collectRoute(
    'q_sanctum_gate',
    'brother_aldric_highwatch',
    'sanctum_key_shard',
    18,
    'Recovering Sanctum Key Shards',
  ),
  killRoute(
    'q_crushers',
    'captain_thessaly',
    'ogre_crusher',
    18,
    'Breaking the Thornpeak ogre war-camp crushers',
    { suggestedPartySize: 3 },
  ),
  killRoute(
    'q_drogmar',
    'captain_thessaly',
    'warlord_drogmar',
    18,
    'Hunting Warlord Drogmar',
    { suggestedPartySize: 3 },
  ),
  killRoute(
    'q_korgath',
    'scout_maren_highwatch',
    'korgath_the_bound',
    18,
    'Hunting Korgath the Bound',
    {
      dungeonId: 'gravewyrm_sanctum',
      suggestedPartySize: 5,
    },
  ),
  killRoute(
    'q_velkhar',
    'brother_aldric_highwatch',
    'grand_necromancer_velkhar',
    18,
    'Hunting Grand Necromancer Velkhar',
    {
      dungeonId: 'gravewyrm_sanctum',
      suggestedPartySize: 5,
    },
  ),
];
