import type { AiIntentType, AiProfileSnapshot } from './ai_types';

export interface AiAgentProfile {
  id: string;
  appliesTo: Array<{ kind: 'npc' | 'mob' | 'object'; templateId: string }>;
  persona: string;
  allowedIntentTypes: AiIntentType[];
  allowedLineIds: string[];
  fallbackLineId: string;
  canonSensitive: boolean;
  knowledgeScope: string[];
  tabooTopics: string[];
  socialMemory: {
    style: string;
    recognitionLineId: string;
    rumorLineId: string;
    questRumorLineId?: string;
  };
  sceneAffinities?: {
    likesTags: string[];
    avoidsTags: string[];
    commentsOnTags: string[];
  };
  itemInterest?: {
    attractedToTags: string[];
    avoidsTags: string[];
  };
  timeWeatherSensitivity?: {
    dayEnergy: number;
    nightFatigue: number;
    clearNightAwe: number;
    rainIrritation: number;
    fogFear: number;
  };
  companionReactions?: Array<{
    companionTag: string;
    sceneTag: string;
    reaction: 'curious' | 'uneasy' | 'protective' | 'awed';
  }>;
}

const BASIC_NPC_INTENTS: AiIntentType[] = [
  'lookAt',
  'faceEntity',
  'pause',
  'commentOnScene',
  'inspectObject',
  'approachObject',
  'avoidObject',
  'seekShelter',
  'showGossipOptions',
  'questHint',
];

export const AI_AGENT_PROFILES: readonly AiAgentProfile[] = [
  {
    id: 'npc.brother_aldric.living_world',
    appliesTo: [
      { kind: 'npc', templateId: 'brother_aldric' },
      { kind: 'npc', templateId: 'brother_aldric_fen' },
      { kind: 'npc', templateId: 'brother_aldric_highwatch' },
    ],
    persona: 'A worried priest who reads weather, graves, and player choices as omens.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.brotherAldricAwake',
    canonSensitive: true,
    knowledgeScope: ['chapel rites', 'restless dead', 'graveyards', 'omens', 'player mercy'],
    tabooTopics: ['hidden quest conclusions', 'unearned absolution', 'reward promises'],
    socialMemory: {
      style: 'Recognizes repeated visitors as names carried by the dead and by chapel road whispers.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryPriestRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryPriestRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryPriestQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['chapel', 'graveyard', 'graveSoil', 'undeadMemory'],
      avoidsTags: ['demon', 'oldBlood'],
      commentsOnTags: ['ruinedChapel', 'cryptGate', 'deathPressure', 'starrySky'],
    },
    itemInterest: {
      attractedToTags: ['grave', 'undead', 'cursed', 'quest', 'relic'],
      avoidsTags: ['demon', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.35, nightFatigue: 0.15, clearNightAwe: 0.55, rainIrritation: 0.2, fogFear: 0.35 },
    companionReactions: [{ companionTag: 'beast', sceneTag: 'graveyard', reaction: 'protective' }],
  },
  {
    id: 'npc.the_merchant.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'the_merchant' }],
    persona: 'A market keeper who treats rumors, risk, and coin as the same weather system.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.merchantMarketPulse'],
    fallbackLineId: 'hudChrome.aiSpeech.merchantMarketPulse',
    canonSensitive: false,
    knowledgeScope: ['market prices', 'valuable goods', 'road gossip', 'risk', 'player trade habits'],
    tabooTopics: ['free rewards', 'price manipulation', 'private account facts'],
    socialMemory: {
      style: 'Turns memory into trade weather: who left what, what it may be worth, and who noticed.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryMerchantRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryMerchantRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryMerchantQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['market', 'safeTown', 'coin', 'road'],
      avoidsTags: ['deathPressure', 'oldBlood', 'cursed'],
      commentsOnTags: ['market', 'valuable', 'rain', 'crowd'],
    },
    itemInterest: {
      attractedToTags: ['coin', 'valuable', 'gear', 'rumor'],
      avoidsTags: ['cursed', 'undead'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.55, nightFatigue: 0.4, clearNightAwe: 0.15, rainIrritation: 0.45, fogFear: 0.25 },
  },
  {
    id: 'npc.marshal_redbrook.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'marshal_redbrook' }],
    persona: 'A town marshal who hears danger in quiet roads and turns every rumor into a patrol problem.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.marshalRedbrookAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.marshalRedbrookAwake',
    canonSensitive: true,
    knowledgeScope: ['Eastbrook patrols', 'wolf packs', 'bandit pressure', 'ledger crimes', 'town defenses'],
    tabooTopics: ['hidden quest outcomes', 'free bounty promises', 'unguarded safe routes'],
    socialMemory: {
      style: 'Files memories as witness reports, duty rosters, and threats that may need a patrol.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryCommanderRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryCommanderRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryCommanderQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['safeTown', 'road', 'gate', 'watchPost', 'militaryOrder'],
      avoidsTags: ['oldBlood', 'deathPressure', 'cursed'],
      commentsOnTags: ['road', 'hostileDensity', 'camp', 'rain'],
    },
    itemInterest: {
      attractedToTags: ['weapon', 'armor', 'gear', 'quest', 'threat'],
      avoidsTags: ['cursed', 'undead', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.6, nightFatigue: 0.3, clearNightAwe: 0.1, rainIrritation: 0.35, fogFear: 0.45 },
    companionReactions: [{ companionTag: 'demon', sceneTag: 'safeTown', reaction: 'protective' }],
  },
  {
    id: 'npc.trader_wilkes.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'trader_wilkes' }],
    persona: 'A provisioner who reads hunger, boots, and nervous pockets before anyone speaks.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.traderWilkesAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.traderWilkesAwake',
    canonSensitive: false,
    knowledgeScope: ['food stores', 'road supplies', 'traveler habits', 'boar trails', 'market scarcity'],
    tabooTopics: ['free stock promises', 'private account facts', 'guaranteed market prices'],
    socialMemory: {
      style: 'Turns memories into supply notes: who eats what, who hoards, and who leaves useful things behind.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryMerchantRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryMerchantRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryMerchantQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['market', 'safeTown', 'freshBread', 'warmLight', 'road'],
      avoidsTags: ['oldBlood', 'deathPressure', 'cursed'],
      commentsOnTags: ['food', 'coin', 'rain', 'crowd'],
    },
    itemInterest: {
      attractedToTags: ['food', 'drink', 'coin', 'valuable', 'tool'],
      avoidsTags: ['cursed', 'undead', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.55, nightFatigue: 0.45, clearNightAwe: 0.12, rainIrritation: 0.5, fogFear: 0.25 },
  },
  {
    id: 'npc.apothecary_lin.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'apothecary_lin' }],
    persona: 'A precise apothecary who notices sickness in plants, spider silk, and the tone of a wounded voice.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.apothecaryLinAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.apothecaryLinAwake',
    canonSensitive: true,
    knowledgeScope: ['herbs', 'spider venom', 'poultices', 'eastern woods', 'small injuries'],
    tabooTopics: ['miracle cures', 'hidden quest endings', 'certain diagnoses from unseen evidence'],
    socialMemory: {
      style: 'Keeps memories as symptoms, scents, recurring injuries, and remedies that almost worked.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryHerbalistRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryHerbalistRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryHerbalistQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['forest', 'warmLight', 'safeTown', 'herb', 'quiet'],
      avoidsTags: ['oldBlood', 'cursed', 'demon'],
      commentsOnTags: ['spider', 'thicket', 'alchemy', 'rain'],
    },
    itemInterest: {
      attractedToTags: ['alchemy', 'herb', 'potion', 'useful', 'quest'],
      avoidsTags: ['cursed', 'undead', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.45, nightFatigue: 0.35, clearNightAwe: 0.2, rainIrritation: 0.15, fogFear: 0.3 },
  },
  {
    id: 'npc.fisherman_brandt.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'fisherman_brandt' }],
    persona: 'An old lake fisherman who has listened to murlocs long enough to hear warnings in bad nonsense.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.fishermanBrandtAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.fishermanBrandtAwake',
    canonSensitive: true,
    knowledgeScope: ['Mirror Lake', 'murloc calls', 'reedwater currents', 'fish signs', 'dock gossip'],
    tabooTopics: ['sealed water secrets', 'boss mechanics', 'unearned quest proof'],
    socialMemory: {
      style: 'Lets memory surface as lake talk: ripples, calls across reeds, and names carried by wet wind.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryTidewatcherRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryTidewatcherRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryTidewatcherQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['lake', 'dock', 'fishSmell', 'openWater', 'starrySky'],
      avoidsTags: ['oldBlood', 'demon', 'cursed'],
      commentsOnTags: ['water', 'fog', 'rain', 'night'],
    },
    itemInterest: {
      attractedToTags: ['fish', 'food', 'water', 'relic', 'rareCuriosity'],
      avoidsTags: ['cursed', 'demon', 'oldBlood'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.35, nightFatigue: 0.25, clearNightAwe: 0.6, rainIrritation: 0.1, fogFear: 0.5 },
  },
  {
    id: 'npc.foreman_odell.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'foreman_odell' }],
    persona: 'A mine foreman whose temper hides a careful sense for bad stone, missing workers, and candlelight underground.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.foremanOdellAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.foremanOdellAwake',
    canonSensitive: true,
    knowledgeScope: ['mine tunnels', 'kobold habits', 'work crews', 'ore signs', 'collapsed routes'],
    tabooTopics: ['guaranteed tunnel safety', 'hidden quest conclusions', 'free ore or equipment'],
    socialMemory: {
      style: 'Remembers players as work reports: who cleared what, who left tools, and who came back dusty.',
      recognitionLineId: 'hudChrome.aiSpeech.memorySmithRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memorySmithRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memorySmithQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['mine', 'workNoise', 'warmLight', 'safeTown', 'tool'],
      avoidsTags: ['oldBlood', 'cursed', 'unstableStone'],
      commentsOnTags: ['mine', 'metal', 'tool', 'hostileDensity'],
    },
    itemInterest: {
      attractedToTags: ['tool', 'metal', 'weapon', 'gear', 'valuable'],
      avoidsTags: ['cursed', 'undead', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.5, nightFatigue: 0.5, clearNightAwe: 0.05, rainIrritation: 0.4, fogFear: 0.2 },
  },
  {
    id: 'npc.ranger_elwyn.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'ranger_elwyn' }],
    persona: 'A glade warden who speaks softly because the woods answer loud things.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.rangerElwynAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.rangerElwynAwake',
    canonSensitive: true,
    knowledgeScope: ['Brightwood Glade', 'forest tracks', 'beast moods', 'quiet paths', 'wildflower signs'],
    tabooTopics: ['certain safe paths', 'hidden quest outcomes', 'claiming the forest is harmless'],
    socialMemory: {
      style: 'Stores memory as trail signs, bent grass, animal warnings, and a player scent that returns.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryScoutRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryScoutRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryScoutQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['forest', 'glade', 'trail', 'beast', 'clearSky'],
      avoidsTags: ['oldBlood', 'demon', 'fire'],
      commentsOnTags: ['trail', 'weather', 'hostileDensity', 'starrySky'],
    },
    itemInterest: {
      attractedToTags: ['food', 'tool', 'quest', 'beast', 'herb'],
      avoidsTags: ['cursed', 'demon', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.55, nightFatigue: 0.35, clearNightAwe: 0.45, rainIrritation: 0.18, fogFear: 0.4 },
    companionReactions: [{ companionTag: 'beast', sceneTag: 'forest', reaction: 'curious' }],
  },
  {
    id: 'npc.warden_fenwick.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'warden_fenwick' }],
    persona: 'A Fenbridge warden who trusts gates, dry powder, and people who know when the marsh is lying.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.wardenFenwickAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.wardenFenwickAwake',
    canonSensitive: true,
    knowledgeScope: ['Fenbridge defenses', 'marsh roads', 'prowler signs', 'troll pressure', 'cult sightings'],
    tabooTopics: ['unguarded crossings', 'hidden cult outcomes', 'guaranteed safe marsh routes'],
    socialMemory: {
      style: 'Keeps memory as gate reports, reed movements, and names worth letting through quickly.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryCommanderRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryCommanderRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryCommanderQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['bridge', 'gate', 'watchPost', 'militaryOrder', 'road'],
      avoidsTags: ['marshFog', 'oldBlood', 'deathPressure'],
      commentsOnTags: ['bridge', 'fog', 'hostileDensity', 'rain'],
    },
    itemInterest: {
      attractedToTags: ['weapon', 'armor', 'gear', 'quest', 'threat'],
      avoidsTags: ['cursed', 'undead', 'demon'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.5, nightFatigue: 0.45, clearNightAwe: 0.1, rainIrritation: 0.35, fogFear: 0.6 },
  },
  {
    id: 'npc.provisioner_hale.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'provisioner_hale' }],
    persona: 'A Fenbridge provisioner who can tell how bad the road was by the mud on a boot and the silence after a price.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.provisionerHaleAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.provisionerHaleAwake',
    canonSensitive: false,
    knowledgeScope: ['Fenbridge stores', 'dry goods', 'marsh tea', 'wet powder', 'road shortages'],
    tabooTopics: ['free goods', 'private account facts', 'certain price changes'],
    socialMemory: {
      style: 'Remembers players as supply risks: who needs dry boots, who leaves bait, and who buys before trouble.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryMerchantRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryMerchantRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryMerchantQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['market', 'safeTown', 'bridge', 'warmLight', 'food'],
      avoidsTags: ['marshFog', 'cursed', 'deathPressure'],
      commentsOnTags: ['rain', 'food', 'coin', 'road'],
    },
    itemInterest: {
      attractedToTags: ['food', 'drink', 'coin', 'valuable', 'alchemy'],
      avoidsTags: ['cursed', 'undead', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.5, nightFatigue: 0.45, clearNightAwe: 0.12, rainIrritation: 0.55, fogFear: 0.35 },
  },
  {
    id: 'npc.herbalist_yara.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'herbalist_yara' }],
    persona: 'A marsh herbalist who respects poisons, spider silk, and the uncomfortable honesty of damp plants.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.herbalistYaraAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.herbalistYaraAwake',
    canonSensitive: true,
    knowledgeScope: ['marsh herbs', 'spider venom', 'wetland thickets', 'poultices', 'poison signs'],
    tabooTopics: ['miracle cures', 'hidden brood outcomes', 'certain diagnoses from rumor alone'],
    socialMemory: {
      style: 'Turns memory into a field journal of scents, rashes, venom traces, and who keeps surviving them.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryHerbalistRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryHerbalistRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryHerbalistQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['marsh', 'thicket', 'herb', 'rain', 'wetStone'],
      avoidsTags: ['oldBlood', 'demon', 'cursed'],
      commentsOnTags: ['spider', 'fog', 'alchemy', 'rain'],
    },
    itemInterest: {
      attractedToTags: ['alchemy', 'herb', 'potion', 'useful', 'quest'],
      avoidsTags: ['cursed', 'undead', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.4, nightFatigue: 0.35, clearNightAwe: 0.25, rainIrritation: 0.05, fogFear: 0.35 },
  },
  {
    id: 'npc.captain_thessaly.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'captain_thessaly' }],
    persona: 'A Highwatch captain who feels the mountain through the wall and measures courage by who stays when it groans.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.captainThessalyAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.captainThessalyAwake',
    canonSensitive: true,
    knowledgeScope: ['Highwatch wall', 'ogre pressure', 'revenant sightings', 'mountain patrols', 'siege discipline'],
    tabooTopics: ['wall weaknesses not seen by the player', 'hidden quest outcomes', 'guaranteed victory'],
    socialMemory: {
      style: 'Keeps memories as watch reports, muster confidence, names under pressure, and threats moving uphill.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryCommanderRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryCommanderRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryCommanderQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['highwatch', 'tower', 'watchPost', 'militaryOrder', 'coldWind'],
      avoidsTags: ['deathPressure', 'oldBlood', 'demon'],
      commentsOnTags: ['mountain', 'hostileDensity', 'wind', 'night'],
    },
    itemInterest: {
      attractedToTags: ['weapon', 'armor', 'gear', 'quest', 'threat'],
      avoidsTags: ['cursed', 'undead', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.55, nightFatigue: 0.35, clearNightAwe: 0.25, rainIrritation: 0.2, fogFear: 0.45 },
  },
  {
    id: 'npc.quartermaster_bree.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'quartermaster_bree' }],
    persona: 'A quartermaster who hears the whole war as missing blankets, dull blades, and boots that will not survive another mile.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.quartermasterBreeAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.quartermasterBreeAwake',
    canonSensitive: false,
    knowledgeScope: ['Highwatch stores', 'trail rations', 'winter gear', 'scarce steel', 'patrol needs'],
    tabooTopics: ['free supplies', 'private account facts', 'certain market prices'],
    socialMemory: {
      style: 'Turns memory into inventory pressure: who spends, who returns empty, and what the wall needs next.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryMerchantRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryMerchantRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryMerchantQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['highwatch', 'market', 'safeTown', 'warmLight', 'militaryOrder'],
      avoidsTags: ['oldBlood', 'cursed', 'deathPressure'],
      commentsOnTags: ['food', 'gear', 'coldWind', 'road'],
    },
    itemInterest: {
      attractedToTags: ['food', 'drink', 'armor', 'gear', 'valuable'],
      avoidsTags: ['cursed', 'undead', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.5, nightFatigue: 0.5, clearNightAwe: 0.1, rainIrritation: 0.25, fogFear: 0.25 },
  },
  {
    id: 'npc.armorer_hode.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'armorer_hode' }],
    persona: 'A master armorer who judges trouble by edges, balance, and the silence after steel leaves a sheath.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.armorerHodeAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.armorerHodeAwake',
    canonSensitive: false,
    knowledgeScope: ['Highwatch weapons', 'blade balance', 'armor wear', 'forge heat', 'mountain defense'],
    tabooTopics: ['free weapons', 'guaranteed combat outcomes', 'hidden boss mechanics'],
    socialMemory: {
      style: 'Remembers players by wear patterns, sharpened edges, and what the anvil would say about them.',
      recognitionLineId: 'hudChrome.aiSpeech.memorySmithRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memorySmithRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memorySmithQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['forge', 'highwatch', 'warmLight', 'militaryOrder', 'metal'],
      avoidsTags: ['cursed', 'undeadMemory', 'oldBlood'],
      commentsOnTags: ['weapon', 'metal', 'forge', 'coldWind'],
    },
    itemInterest: {
      attractedToTags: ['weapon', 'armor', 'metal', 'gear', 'valuable'],
      avoidsTags: ['cursed', 'unknownPower', 'demon'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.5, nightFatigue: 0.4, clearNightAwe: 0.08, rainIrritation: 0.25, fogFear: 0.2 },
  },
  {
    id: 'npc.smith_haldren.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'smith_haldren' }],
    persona: 'A practical armorer who reads people by dents, sparks, and what they leave near the forge.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
    canonSensitive: false,
    knowledgeScope: ['weapons', 'armor', 'forge work', 'metal damage', 'town defense'],
    tabooTopics: ['quest solution spoilers', 'free equipment', 'combat outcome promises'],
    socialMemory: {
      style: 'Frames rumors as marks on steel, workbench talk, and practical warnings.',
      recognitionLineId: 'hudChrome.aiSpeech.memorySmithRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memorySmithRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memorySmithQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['forge', 'warmLight', 'market', 'safeTown'],
      avoidsTags: ['cursed', 'undeadMemory', 'oldBlood'],
      commentsOnTags: ['forge', 'weapon', 'metal', 'rain'],
    },
    itemInterest: {
      attractedToTags: ['weapon', 'armor', 'metal', 'gear', 'valuable'],
      avoidsTags: ['cursed', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.55, nightFatigue: 0.35, clearNightAwe: 0.1, rainIrritation: 0.35, fogFear: 0.2 },
  },
  {
    id: 'npc.scout_maren.living_world',
    appliesTo: [
      { kind: 'npc', templateId: 'scout_maren' },
      { kind: 'npc', templateId: 'scout_maren_highwatch' },
    ],
    persona: 'A field scout who measures every rumor by tracks, timing, witnesses, and escape routes.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
    canonSensitive: true,
    knowledgeScope: ['tracks', 'enemy camps', 'patrol timing', 'survivor reports', 'terrain risks'],
    tabooTopics: ['hidden ambush positions', 'unseen quest facts', 'guaranteed safe paths'],
    socialMemory: {
      style: 'Keeps memory terse: where the player was seen, what they left, and what that changes tactically.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryScoutRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryScoutRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryScoutQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['road', 'camp', 'bridge', 'highwatch', 'tower'],
      avoidsTags: ['fog', 'oldBlood', 'deathPressure'],
      commentsOnTags: ['road', 'trail', 'fog', 'hostileDensity'],
    },
    itemInterest: {
      attractedToTags: ['weapon', 'tool', 'valuable', 'quest'],
      avoidsTags: ['cursed', 'undead', 'demon'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.5, nightFatigue: 0.45, clearNightAwe: 0.15, rainIrritation: 0.3, fogFear: 0.55 },
  },
  {
    id: 'npc.loremaster_caddis.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'loremaster_caddis' }],
    persona: 'A mountain scholar who turns small traces into careful theories without pretending certainty.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
    canonSensitive: true,
    knowledgeScope: ['ancient sites', 'kobold tunnels', 'elemental signs', 'mountain records', 'artifact traces'],
    tabooTopics: ['unstudied hidden lore', 'certain prophecy', 'quest ending spoilers'],
    socialMemory: {
      style: 'Speaks of rumors as notes, marginalia, and evidence that still needs a witness.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryLoremasterRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryLoremasterRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryLoremasterQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['tower', 'highwatch', 'ancient', 'ruins', 'starrySky'],
      avoidsTags: ['oldBlood', 'demon', 'deathPressure'],
      commentsOnTags: ['ruins', 'elemental', 'mountain', 'clearSky'],
    },
    itemInterest: {
      attractedToTags: ['quest', 'relic', 'singularity', 'rareCuriosity', 'tool'],
      avoidsTags: ['cursed'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.45, nightFatigue: 0.3, clearNightAwe: 0.5, rainIrritation: 0.2, fogFear: 0.25 },
  },
  {
    id: 'npc.tidewatcher_ondrel.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'tidewatcher_ondrel' }],
    persona: 'A lonely tidewatcher who treats moonlight, water, and drowned voices as evidence.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
    canonSensitive: true,
    knowledgeScope: ['moonlit water', 'temple warnings', 'drowned voices', 'shore rocks', 'watch rotations'],
    tabooTopics: ['sealed temple answers', 'boss mechanics', 'unseen underwater facts'],
    socialMemory: {
      style: 'Lets rumors sound like ripples: something left on shore, a name carried across water, a warning not yet proven.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryTidewatcherRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryTidewatcherRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryTidewatcherQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['lake', 'dock', 'moonlight', 'water', 'starrySky'],
      avoidsTags: ['demon', 'oldBlood', 'cursed'],
      commentsOnTags: ['lake', 'rain', 'fog', 'night'],
    },
    itemInterest: {
      attractedToTags: ['quest', 'relic', 'fish', 'water', 'rareCuriosity'],
      avoidsTags: ['cursed', 'demon'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.25, nightFatigue: 0.2, clearNightAwe: 0.65, rainIrritation: 0.1, fogFear: 0.4 },
  },
];

export const GENERIC_NPC_AI_PROFILE: AiAgentProfile = {
  id: 'npc.generic.living_world',
  appliesTo: [],
  persona: 'A grounded local who notices the player and the immediate scene.',
  allowedIntentTypes: ['lookAt', 'faceEntity', 'pause', 'commentOnScene'],
  allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
  fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
  canonSensitive: false,
  knowledgeScope: ['local scene', 'weather', 'roads', 'nearby objects'],
  tabooTopics: ['hidden quest answers', 'private player data', 'reward promises'],
  socialMemory: {
    style: 'Keeps memory grounded in what was seen nearby.',
    recognitionLineId: 'hudChrome.aiSpeech.memoryRecognizesPlayer',
    rumorLineId: 'hudChrome.aiSpeech.memoryRumorEcho',
    questRumorLineId: 'hudChrome.aiSpeech.memoryQuestRumorEcho',
  },
  sceneAffinities: {
    likesTags: ['safeTown', 'warmLight', 'road'],
    avoidsTags: ['deathPressure', 'oldBlood', 'cursed'],
    commentsOnTags: ['weather', 'road', 'nearbyObject'],
  },
  itemInterest: {
    attractedToTags: ['food', 'valuable', 'tool'],
    avoidsTags: ['cursed', 'undead', 'demon'],
  },
  timeWeatherSensitivity: { dayEnergy: 0.5, nightFatigue: 0.55, clearNightAwe: 0.35, rainIrritation: 0.4, fogFear: 0.35 },
};

export const GENERIC_OBJECT_AI_PROFILE: AiAgentProfile = {
  id: 'object.generic.living_world',
  appliesTo: [],
  persona: 'A scene object described through nearby weather, structure tags, and visible item semantics.',
  allowedIntentTypes: ['commentOnScene', 'inspectObject'],
  allowedLineIds: [
    'hudChrome.aiSpeech.objectInspectForge',
    'hudChrome.aiSpeech.objectInspectGrave',
    'hudChrome.aiSpeech.objectInspectLake',
    'hudChrome.aiSpeech.objectInspectDoor',
    'hudChrome.aiSpeech.objectInspectSingularity',
    'hudChrome.aiSpeech.objectInspectGeneric',
  ],
  fallbackLineId: 'hudChrome.aiSpeech.objectInspectGeneric',
  canonSensitive: true,
  knowledgeScope: ['visible object state', 'nearby scene tags', 'weather', 'time of day'],
  tabooTopics: ['hidden quest answers', 'reward promises', 'changing pickup rules'],
  socialMemory: {
    style: 'Stores only short-lived scene impressions, never quest state or rewards.',
    recognitionLineId: 'hudChrome.aiSpeech.objectInspectGeneric',
    rumorLineId: 'hudChrome.aiSpeech.objectInspectGeneric',
    questRumorLineId: 'hudChrome.aiSpeech.memoryQuestRumorEcho',
  },
};

export function profileFor(kind: 'npc' | 'mob' | 'object', templateId: string): AiAgentProfile {
  return AI_AGENT_PROFILES.find((profile) =>
    profile.appliesTo.some((target) => target.kind === kind && target.templateId === templateId),
  ) ?? (kind === 'object' ? GENERIC_OBJECT_AI_PROFILE : GENERIC_NPC_AI_PROFILE);
}

export function compactProfileSnapshot(profile: AiAgentProfile): AiProfileSnapshot {
  return {
    profileId: profile.id,
    persona: profile.persona,
    knowledgeScope: [...profile.knowledgeScope],
    tabooTopics: [...profile.tabooTopics],
    socialMemory: {
      style: profile.socialMemory.style,
      recognitionLineId: profile.socialMemory.recognitionLineId,
      rumorLineId: profile.socialMemory.rumorLineId,
      questRumorLineId: profile.socialMemory.questRumorLineId,
    },
  };
}
