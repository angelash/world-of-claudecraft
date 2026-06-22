import { MOBS } from '../../src/sim/data';
import type { Entity, MobFamily } from '../../src/sim/types';
import type { AiIntentType, AiSpeechFingerprint } from './ai_types';

export interface FamilyMoodBias {
  fear: number;
  curiosity: number;
  hunger: number;
  territory: number;
  reverence: number;
  disgust: number;
  fatigue: number;
}

export interface FamilySemantics {
  family: MobFamily;
  familyName: string;
  baseInstincts: string[];
  sceneAmplifiers: string[];
  sceneSuppressors: string[];
  attractedItemTags: string[];
  avoidedItemTags: string[];
  likelyIntents: AiIntentType[];
  visibleBehaviors: string[];
  speechStyle: string;
  moodBias: FamilyMoodBias;
}

export interface CompactFamilySemantics {
  family: MobFamily;
  familyName: string;
  baseInstincts: string[];
  sceneAmplifiers: string[];
  sceneSuppressors: string[];
  attractedItemTags: string[];
  avoidedItemTags: string[];
  likelyIntents: AiIntentType[];
  speechStyle: string;
  speechFingerprint: AiSpeechFingerprint;
}

export const MOB_FAMILIES: readonly MobFamily[] = [
  'beast',
  'humanoid',
  'murloc',
  'spider',
  'kobold',
  'undead',
  'troll',
  'ogre',
  'elemental',
  'dragonkin',
  'demon',
] as const;

const COMMON_PASSIVE_INTENTS: AiIntentType[] = ['lookAt', 'pause', 'commentOnScene', 'inspectObject'];

export const FAMILY_SEMANTICS: Record<MobFamily, FamilySemantics> = {
  beast: {
    family: 'beast',
    familyName: 'Beast',
    baseInstincts: ['scent', 'territory', 'hunger', 'packSafety'],
    sceneAmplifiers: ['forest', 'nest', 'blood', 'clearNight', 'waterSource'],
    sceneSuppressors: ['forge', 'fire', 'undeadPressure', 'demonScent', 'workNoise'],
    attractedItemTags: ['food', 'meat', 'fish', 'blood', 'smallPrey'],
    avoidedItemTags: ['fire', 'undead', 'cursed', 'demon', 'metalNoise'],
    likelyIntents: ['lookAt', 'approachObject', 'avoidObject', 'inspectObject', 'pause'],
    visibleBehaviors: ['sniff', 'circle', 'growl', 'backAway', 'guardFood'],
    speechStyle: 'Use body language, sound, and hesitation more than human explanation.',
    moodBias: { fear: 0.35, curiosity: 0.45, hunger: 0.75, territory: 0.7, reverence: 0.05, disgust: 0.2, fatigue: 0.25 },
  },
  humanoid: {
    family: 'humanoid',
    familyName: 'Humanoid',
    baseInstincts: ['socialJudgment', 'profit', 'fear', 'status', 'faction'],
    sceneAmplifiers: ['camp', 'market', 'firelight', 'road', 'rumor'],
    sceneSuppressors: ['surrounded', 'guardPost', 'bossDeath', 'strongerPlayer'],
    attractedItemTags: ['coin', 'valuable', 'weapon', 'tool', 'potion', 'rumor'],
    avoidedItemTags: ['cursed', 'undead', 'demon', 'oldBlood'],
    likelyIntents: [...COMMON_PASSIVE_INTENTS, 'approachObject', 'seekShelter'],
    visibleBehaviors: ['appraise', 'haggle', 'threaten', 'whisper', 'callAlly'],
    speechStyle: 'Judge value, danger, status, and social consequence.',
    moodBias: { fear: 0.45, curiosity: 0.55, hunger: 0.25, territory: 0.4, reverence: 0.25, disgust: 0.35, fatigue: 0.35 },
  },
  murloc: {
    family: 'murloc',
    familyName: 'Murloc',
    baseInstincts: ['shallowWaterSafety', 'fishSmell', 'tribeAlarm', 'wetMud'],
    sceneAmplifiers: ['lake', 'rain', 'moonlitWater', 'shore', 'fish'],
    sceneSuppressors: ['dryHighland', 'fire', 'forge', 'brightLight', 'isolation'],
    attractedItemTags: ['fish', 'wet', 'shiny', 'shell', 'moon'],
    avoidedItemTags: ['fire', 'dry', 'metalNoise', 'holy'],
    likelyIntents: ['lookAt', 'approachObject', 'avoidObject', 'inspectObject', 'pause'],
    visibleBehaviors: ['gurgle', 'cluster', 'dartTowardWater', 'tiltHead'],
    speechStyle: 'Short wet sounds, crowd reactions, and sudden movement carry the meaning.',
    moodBias: { fear: 0.45, curiosity: 0.65, hunger: 0.45, territory: 0.55, reverence: 0.15, disgust: 0.15, fatigue: 0.15 },
  },
  spider: {
    family: 'spider',
    familyName: 'Spider',
    baseInstincts: ['vibration', 'web', 'shadow', 'patience', 'brood'],
    sceneAmplifiers: ['cave', 'forestShadow', 'corpse', 'fog', 'trappedPrey'],
    sceneSuppressors: ['fire', 'strongWind', 'openDaylight', 'brokenWeb'],
    attractedItemTags: ['blood', 'corpse', 'insect', 'trapped', 'silk'],
    avoidedItemTags: ['fire', 'ash', 'wind', 'heavyTremor'],
    likelyIntents: ['lookAt', 'inspectObject', 'avoidObject', 'pause'],
    visibleBehaviors: ['holdStill', 'sideStep', 'retreatToWeb', 'tapGround'],
    speechStyle: 'Predatory stillness and small movements matter more than words.',
    moodBias: { fear: 0.25, curiosity: 0.5, hunger: 0.6, territory: 0.65, reverence: 0.05, disgust: 0.2, fatigue: 0.1 },
  },
  kobold: {
    family: 'kobold',
    familyName: 'Kobold',
    baseInstincts: ['darkness', 'candle', 'smallGreed', 'mining', 'cowardice'],
    sceneAmplifiers: ['mine', 'candle', 'narrowTunnel', 'metal', 'stone'],
    sceneSuppressors: ['openField', 'lostCandle', 'guardPost', 'floodedTunnel'],
    attractedItemTags: ['coin', 'metal', 'tool', 'gem', 'candle', 'shiny'],
    avoidedItemTags: ['water', 'beastScent', 'collapse', 'holy'],
    likelyIntents: [...COMMON_PASSIVE_INTENTS, 'approachObject', 'avoidObject'],
    visibleBehaviors: ['clutchCandle', 'snatchSmallObject', 'squeal', 'hideBehindAlly'],
    speechStyle: 'Nervous, acquisitive, and quick to blame the dark.',
    moodBias: { fear: 0.7, curiosity: 0.55, hunger: 0.2, territory: 0.35, reverence: 0.2, disgust: 0.25, fatigue: 0.3 },
  },
  undead: {
    family: 'undead',
    familyName: 'Undead',
    baseInstincts: ['coldMemory', 'grudge', 'binding', 'lifeDullness'],
    sceneAmplifiers: ['graveyard', 'crypt', 'bone', 'night', 'cursed'],
    sceneSuppressors: ['holy', 'chapelBell', 'purifyingFire', 'warmLife'],
    attractedItemTags: ['bone', 'grave', 'cursed', 'shadow', 'deathMagic', 'relic'],
    avoidedItemTags: ['holy', 'sunBlessed', 'purifyingFire'],
    likelyIntents: ['lookAt', 'approachObject', 'inspectObject', 'pause'],
    visibleBehaviors: ['whisper', 'stareAtLiving', 'driftCloser', 'makeLivingUneasy'],
    speechStyle: 'Cold, fragmentary, and pulled by unfinished memory.',
    moodBias: { fear: 0.1, curiosity: 0.35, hunger: 0.05, territory: 0.55, reverence: 0.65, disgust: 0.1, fatigue: 0.05 },
  },
  troll: {
    family: 'troll',
    familyName: 'Troll',
    baseInstincts: ['hunger', 'regenerationPride', 'tribe', 'cruelHumor'],
    sceneAmplifiers: ['meat', 'marshCamp', 'campfire', 'trophy', 'weakPrey'],
    sceneSuppressors: ['strongFire', 'mockery', 'leaderDeath', 'regenDenied'],
    attractedItemTags: ['food', 'meat', 'trophy', 'bone', 'weapon'],
    avoidedItemTags: ['strongFire', 'holy', 'poisonedMeat'],
    likelyIntents: ['lookAt', 'approachObject', 'inspectObject', 'commentOnScene'],
    visibleBehaviors: ['laugh', 'sniffFood', 'loom', 'stallFight'],
    speechStyle: 'Coarse appetite, threats, and jokes that sound like hunger.',
    moodBias: { fear: 0.25, curiosity: 0.45, hunger: 0.85, territory: 0.55, reverence: 0.1, disgust: 0.2, fatigue: 0.2 },
  },
  ogre: {
    family: 'ogre',
    familyName: 'Ogre',
    baseInstincts: ['sizeAdvantage', 'slowConfidence', 'hunger', 'territoryPressure'],
    sceneAmplifiers: ['largeFood', 'heavyWeapon', 'campfire', 'drum', 'trophy'],
    sceneSuppressors: ['narrowHighPath', 'strongMagic', 'dragonPresence', 'focusedFire'],
    attractedItemTags: ['food', 'meat', 'weapon', 'heavy', 'trophy'],
    avoidedItemTags: ['dragon', 'strongMagic', 'narrowPath'],
    likelyIntents: ['lookAt', 'approachObject', 'commentOnScene', 'pause'],
    visibleBehaviors: ['poundGround', 'blockPath', 'loomCloser', 'misreadIntent'],
    speechStyle: 'Direct, territorial, and often confidently wrong.',
    moodBias: { fear: 0.2, curiosity: 0.35, hunger: 0.8, territory: 0.8, reverence: 0.05, disgust: 0.15, fatigue: 0.45 },
  },
  elemental: {
    family: 'elemental',
    familyName: 'Elemental',
    baseInstincts: ['elementalResonance', 'balance', 'pressure', 'inhumanMood'],
    sceneAmplifiers: ['storm', 'stone', 'water', 'fire', 'wind', 'moon'],
    sceneSuppressors: ['bindingRune', 'antiElement', 'drainingRelic'],
    attractedItemTags: ['magic', 'stone', 'water', 'fire', 'storm', 'relic'],
    avoidedItemTags: ['binding', 'draining', 'void'],
    likelyIntents: ['lookAt', 'inspectObject', 'pause', 'commentOnScene'],
    visibleBehaviors: ['resonate', 'pulse', 'turnSuddenly', 'fallSilent'],
    speechStyle: 'Speak as pressure, pulse, and resonance rather than mortal emotion.',
    moodBias: { fear: 0.15, curiosity: 0.55, hunger: 0.0, territory: 0.5, reverence: 0.35, disgust: 0.05, fatigue: 0.0 },
  },
  dragonkin: {
    family: 'dragonkin',
    familyName: 'Dragonkin',
    baseInstincts: ['ancientMemory', 'majesty', 'territory', 'bloodline', 'judgment'],
    sceneAmplifiers: ['highPlace', 'ancientRuin', 'dragonBone', 'treasure', 'strongMagic', 'moonlight'],
    sceneSuppressors: ['defiledRuin', 'bindingCircle', 'pettyTheft', 'weakTaunt'],
    attractedItemTags: ['treasure', 'magic', 'relic', 'ancient', 'dragon'],
    avoidedItemTags: ['defiled', 'binding', 'falseOffering'],
    likelyIntents: ['lookAt', 'inspectObject', 'commentOnScene', 'pause'],
    visibleBehaviors: ['lookDown', 'slowTurn', 'judgePlayer', 'rememberInsult'],
    speechStyle: 'Grave, old, and appraising, with a long memory for disrespect.',
    moodBias: { fear: 0.12, curiosity: 0.5, hunger: 0.1, territory: 0.8, reverence: 0.55, disgust: 0.3, fatigue: 0.1 },
  },
  demon: {
    family: 'demon',
    familyName: 'Demon',
    baseInstincts: ['hunger', 'mockery', 'contract', 'painAesthetic', 'antiHoly'],
    sceneAmplifiers: ['shadow', 'fire', 'soul', 'fear', 'cursed', 'cult'],
    sceneSuppressors: ['holy', 'ward', 'contractBacklash', 'bindingCircle'],
    attractedItemTags: ['cursed', 'shadow', 'fire', 'soul', 'fear', 'relic'],
    avoidedItemTags: ['holy', 'ward', 'binding', 'purifyingFire'],
    likelyIntents: ['lookAt', 'approachObject', 'inspectObject', 'commentOnScene'],
    visibleBehaviors: ['taunt', 'leanTowardFear', 'tempt', 'needleCompanion'],
    speechStyle: 'Tempting, cruel, and amused by fear or sacred boundaries.',
    moodBias: { fear: 0.1, curiosity: 0.5, hunger: 0.65, territory: 0.35, reverence: 0.0, disgust: 0.45, fatigue: 0.0 },
  },
};

const FAMILY_SPEECH_FINGERPRINTS = {
  beast: {
    sentenceRhythm: 'sniff, hesitate, react; if words appear, keep them broken and territorial',
    addressStyle: 'does not address the player politely; tracks scent, posture, hunger, or pack threat',
    favoriteStarts: ['Sniffs hard', 'Hackles rise', 'Circles once'],
    sensoryBias: ['scent', 'blood warmth', 'fur bristle', 'ground vibration'],
    avoidedPhrases: ['I would suggest', 'overall', 'this indicates'],
  },
  humanoid: {
    sentenceRhythm: 'quick social judgment, a risk read, then a selfish or faction-colored angle',
    addressStyle: 'uses friend, stranger, boss, or the player name when it changes leverage',
    favoriteStarts: ['Hold up', 'That is worth something', 'Someone will notice'],
    sensoryBias: ['coin sound', 'camp smoke', 'boot mud', 'watchful eyes'],
    avoidedPhrases: ['to summarize', 'in conclusion', 'my recommendation'],
  },
  murloc: {
    sentenceRhythm: 'wet alarm burst, repeated sound, sudden body movement',
    addressStyle: 'rarely addresses directly; reacts as a small tribe around water',
    favoriteStarts: ['Grrlgl', 'Splashes closer', 'Tilts its head'],
    sensoryBias: ['fish smell', 'wet mud', 'moon water', 'reed rustle'],
    avoidedPhrases: ['therefore', 'overall', 'I think you should'],
  },
  spider: {
    sentenceRhythm: 'stillness first, tiny movement second, threat left mostly implied',
    addressStyle: 'no polite address; treats the player as vibration or trapped heat',
    favoriteStarts: ['Holds still', 'One leg taps', 'The web trembles'],
    sensoryBias: ['thread tension', 'warm blood', 'footfall tremor', 'shadow'],
    avoidedPhrases: ['I would recommend', 'this means', 'from this we can see'],
  },
  kobold: {
    sentenceRhythm: 'nervous grabby speech, candle panic, short blame or bargaining phrase',
    addressStyle: 'uses you, mine, or no address; fear and possession dominate',
    favoriteStarts: ['No take candle', 'Mine first', 'Too bright'],
    sensoryBias: ['candle smoke', 'stone dust', 'shiny metal', 'dark corners'],
    avoidedPhrases: ['overall', 'clearly indicates', 'my recommendation'],
  },
  undead: {
    sentenceRhythm: 'cold fragments, unfinished memory, one pull toward life or grave',
    addressStyle: 'may address the living as warm one, oath-breaker, or not at all',
    favoriteStarts: ['Warm breath', 'Forgotten oath', 'The bell stops'],
    sensoryBias: ['grave cold', 'bone dust', 'old vows', 'stale air'],
    avoidedPhrases: ['I would suggest', 'from my perspective', 'to summarize'],
  },
  troll: {
    sentenceRhythm: 'rough joke, appetite, threat, with little patience for explanation',
    addressStyle: 'calls the player meat, little one, or mocks visible weakness',
    favoriteStarts: ['Smells good', 'Little thing talks', 'That bone is mine'],
    sensoryBias: ['meat smell', 'old blood', 'campfire fat', 'wet hide'],
    avoidedPhrases: ['therefore', 'overall', 'I would recommend'],
  },
  ogre: {
    sentenceRhythm: 'slow confident claim, one concrete want, one oversized misunderstanding',
    addressStyle: 'uses little one, food, or no address, rarely names the player',
    favoriteStarts: ['Mine now', 'Small thing loud', 'Big road says stop'],
    sensoryBias: ['ground thump', 'meat', 'heavy wood', 'smoke'],
    avoidedPhrases: ['it can be inferred', 'to summarize', 'my recommendation'],
  },
  elemental: {
    sentenceRhythm: 'pressure change, resonance, then a short alien conclusion',
    addressStyle: 'does not use social address; senses element, imbalance, and binding',
    favoriteStarts: ['Stone answers', 'Pressure turns', 'The spark leans'],
    sensoryBias: ['pressure', 'pulse', 'heat', 'stone echo'],
    avoidedPhrases: ['I feel like', 'overall', 'you should'],
  },
  dragonkin: {
    sentenceRhythm: 'old judgment, measured pause, then a memory-laden warning',
    addressStyle: 'addresses by worth, trespass, or bloodline more often than name',
    favoriteStarts: ['Small oath', 'Old stone remembers', 'Do not cheapen that'],
    sensoryBias: ['ancient dust', 'hot breath', 'gold weight', 'high wind'],
    avoidedPhrases: ['my recommendation', 'overall', 'I would suggest'],
  },
  demon: {
    sentenceRhythm: 'sweet needle, cruel amusement, temptation hidden inside a dare',
    addressStyle: 'uses dear thing, little fear, or the player name when it can sting',
    favoriteStarts: ['Oh, keep that close', 'That fear suits you', 'A lovely little crack'],
    sensoryBias: ['fear taste', 'sulfur heat', 'soul-prickle', 'holy sting'],
    avoidedPhrases: ['to summarize', 'therefore', 'I would recommend'],
  },
} satisfies Record<MobFamily, AiSpeechFingerprint>;

const TEMPLATE_INSTINCT_OVERRIDES: Record<string, { addInstincts?: string[]; addAttractedTags?: string[]; addAvoidedTags?: string[] }> = {
  forest_wolf: { addInstincts: ['packHunt', 'scentTrail'], addAttractedTags: ['meat', 'blood'] },
  wild_boar: { addInstincts: ['rooting', 'startleCharge'], addAttractedTags: ['food'] },
  brightwood_hare: { addInstincts: ['panicFlight'], addAvoidedTags: ['predator', 'loudNoise'] },
  gravecaller_cultist: { addInstincts: ['secretRite', 'fearOfFailure'], addAttractedTags: ['cursed', 'grave', 'relic'], addAvoidedTags: ['guardPost'] },
  tunnel_rat: { addInstincts: ['candlePanic'], addAttractedTags: ['candle', 'tool'] },
  stormcrag_elemental: { addInstincts: ['stormPulse'], addAttractedTags: ['storm', 'stone'] },
};

export function familySemanticsFor(family: MobFamily): FamilySemantics {
  return FAMILY_SEMANTICS[family];
}

export function mobFamilyForEntity(entity: Entity): MobFamily | null {
  if (entity.kind !== 'mob') return null;
  return MOBS[entity.templateId]?.family ?? null;
}

export function compactFamilySemanticsForMob(templateId: string): CompactFamilySemantics | null {
  const mob = MOBS[templateId];
  if (!mob) return null;
  const base = FAMILY_SEMANTICS[mob.family];
  const override = TEMPLATE_INSTINCT_OVERRIDES[templateId];
  return {
    family: base.family,
    familyName: base.familyName,
    baseInstincts: mergeUnique(base.baseInstincts, override?.addInstincts),
    sceneAmplifiers: [...base.sceneAmplifiers],
    sceneSuppressors: [...base.sceneSuppressors],
    attractedItemTags: mergeUnique(base.attractedItemTags, override?.addAttractedTags),
    avoidedItemTags: mergeUnique(base.avoidedItemTags, override?.addAvoidedTags),
    likelyIntents: [...base.likelyIntents],
    speechStyle: base.speechStyle,
    speechFingerprint: cloneSpeechFingerprint(FAMILY_SPEECH_FINGERPRINTS[mob.family]),
  };
}

export function compactFamilySemanticsForEntity(entity: Entity): CompactFamilySemantics | null {
  if (entity.kind !== 'mob') return null;
  return compactFamilySemanticsForMob(entity.templateId);
}

function mergeUnique(base: readonly string[], extra?: readonly string[]): string[] {
  return [...new Set([...(base as string[]), ...(extra ?? [])])];
}

function cloneSpeechFingerprint(fingerprint: AiSpeechFingerprint): AiSpeechFingerprint {
  return {
    sentenceRhythm: fingerprint.sentenceRhythm,
    addressStyle: fingerprint.addressStyle,
    favoriteStarts: [...fingerprint.favoriteStarts],
    sensoryBias: [...fingerprint.sensoryBias],
    avoidedPhrases: [...fingerprint.avoidedPhrases],
  };
}
