import { describe, expect, it } from 'vitest';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { companionReactionEvents } from '../server/ai/companion_reactions';
import { lightSemanticFor, timeSemanticAt, timeWeatherMood, weatherSemanticAt } from '../server/ai/time_weather_model';
import type { AiWorldDirectorProposal } from '../server/ai/world_director';

function context(overrides: {
  family?: string | null;
  environmental?: string[];
  undeadPressure?: number;
  weatherKind?: 'clear' | 'rain' | 'fog';
  starry?: boolean;
  location?: string[];
  structure?: string[];
  lightTags?: string[];
  directorProposals?: AiWorldDirectorProposal[];
} = {}): AiJobContextV1 {
  const time = overrides.starry ? timeSemanticAt(22 * 60) : timeSemanticAt(10 * 60);
  const baseWeather = weatherSemanticAt('eastbrook_vale', 0);
  const weather = overrides.weatherKind
    ? { ...baseWeather, kind: overrides.weatherKind, tags: overrides.weatherKind === 'rain' ? ['rain'] : overrides.weatherKind === 'fog' ? ['fog'] : ['clearSky'] }
    : baseWeather;
  const baseLight = overrides.starry ? { ...lightSemanticFor(time, weather), tags: ['moonlight', 'starrySky'] } : lightSemanticFor(time, weather);
  const light = overrides.lightTags ? { ...baseLight, tags: overrides.lightTags, level: overrides.lightTags.includes('sunlit') ? 'bright' as const : baseLight.level } : baseLight;
  return {
    schemaVersion: 1,
    jobId: 'companion-job',
    trigger: 'object_inspected',
    entity: { kind: 'object', entityId: 10, templateId: 'ground_test', name: 'Test Object', level: 1, questIds: [], dead: false },
    player: { entityId: 1, name: 'Ari', level: 1, classId: 'hunter', activeQuestIds: [], completedQuestIds: [] },
    locale: 'en',
    scene: {
      zoneId: 'eastbrook_vale',
      subsceneId: 'fallen_chapel',
      biomeTags: ['vale'],
      locationTags: overrides.location ?? ['questSite'],
      structureTags: overrides.structure ?? ['ruinedChapel'],
      environmentalTags: overrides.environmental ?? [],
      nearbySemanticObjects: [],
      droppedItems: [],
      companions: [{ entityId: 22, templateId: 'forest_wolf', displayName: 'Forest Wolf', family: overrides.family ?? 'beast', tags: ['pet', 'beast'] }],
      time,
      weather,
      light,
      mood: timeWeatherMood(time, weather, light),
      recentSceneEvents: [],
      danger: {
        undeadPressure: overrides.undeadPressure ?? 0,
        hostileDensity: 0,
        corpseDensity: 0,
        recentDeaths: 0,
        safeHavenScore: 0.2,
      },
    },
    familySemantics: null,
    questFacts: [],
    recentObservations: [],
    directorProposals: overrides.directorProposals,
    allowedIntents: ['commentOnScene'],
    outputMode: 'line_id_only',
  };
}

function directorProposal(overrides: Partial<AiWorldDirectorProposal> = {}): AiWorldDirectorProposal {
  return {
    proposalId: 'director-companion:proposal',
    intent: 'echoTrace',
    status: 'preview',
    risk: 'low',
    intensity: 0.8,
    targetRef: 'roasted_boar',
    sceneId: 'fallen_chapel',
    zoneId: 'eastbrook_vale',
    suggestedLineId: 'hudChrome.aiSpeech.worldDirectorHungry',
    expiresAt: 180,
    reasonTags: ['mood:hungry', 'subject:item', 'proposal:traceEcho', 'trace:food'],
    safetyNotes: ['presentationOnly', 'noQuestMutation', 'noCombatMutation', 'noLootOrEconomyMutation'],
    ...overrides,
  };
}

function lineId(ctx: AiJobContextV1): string | null {
  const event = companionReactionEvents(ctx)[0];
  if (!event || event.type !== 'aiSpeech' || event.speech.mode !== 'lineId') return null;
  return event.speech.lineId;
}

function firstReaction(ctx: AiJobContextV1): { lineId: string; kind: string; sceneTags: string[] } | null {
  const event = companionReactionEvents(ctx)[0];
  if (!event || event.type !== 'aiSpeech' || event.speech.mode !== 'lineId') return null;
  return {
    lineId: event.speech.lineId,
    kind: event.reaction?.kind ?? 'ignore',
    sceneTags: event.reaction?.sceneTags ?? [],
  };
}

describe('companionReactionEvents', () => {
  it('makes living companions fearful in undead pressure scenes', () => {
    expect(lineId(context({ family: 'humanoid', environmental: ['deathPressure'], undeadPressure: 0.5 }))).toBe('hudChrome.aiSpeech.companionSelfUndeadFear');
  });

  it('does not make undead companions fear undead pressure', () => {
    expect(lineId(context({ family: 'undead', environmental: ['deathPressure'], undeadPressure: 0.5 }))).not.toBe('hudChrome.aiSpeech.companionSelfUndeadFear');
  });

  it('uses weather and starry-sky moods when the scene is otherwise safe', () => {
    expect(lineId(context({ weatherKind: 'rain' }))).toBe('hudChrome.aiSpeech.companionSelfRainTired');
    expect(lineId(context({ starry: true }))).toBe('hudChrome.aiSpeech.companionSelfStarrySky');
  });

  it('gives demon and undead companions distinct pressure in living scenes', () => {
    expect(lineId(context({ family: 'demon', location: ['town', 'safeTown'], structure: ['forge'] }))).toBe('hudChrome.aiSpeech.companionSelfDemonDefiance');
    expect(lineId(context({ family: 'undead', location: ['town', 'safeTown'], structure: ['forge'], lightTags: ['sunlit'] }))).toBe('hudChrome.aiSpeech.companionSelfUndeadDayHollow');
  });

  it('gives beast companions a sharper scent reaction to death, fire, and old blood', () => {
    const reaction = firstReaction(context({ family: 'beast', environmental: ['deathPressure', 'oldBlood'], undeadPressure: 0.5 }));
    expect(reaction).toMatchObject({
      lineId: 'hudChrome.aiSpeech.companionSelfBeastScentUneasy',
      kind: 'avoid',
      sceneTags: expect.arrayContaining(['deathPressure', 'oldBlood']),
    });
  });

  it('lets murloc companions become curious around rain and water instead of just tired', () => {
    const reaction = firstReaction(context({ family: 'murloc', weatherKind: 'rain', location: ['shore'], environmental: ['openWater', 'fishSmell'] }));
    expect(reaction).toMatchObject({
      lineId: 'hudChrome.aiSpeech.companionSelfMurlocWaterCall',
      kind: 'inspect',
      sceneTags: expect.arrayContaining(['shore', 'openWater']),
    });
  });

  it('lets spider companions read fog and low visibility as a stillness cue', () => {
    const reaction = firstReaction(context({ family: 'spider', weatherKind: 'fog', environmental: ['lowVisibility', 'insectNoise'] }));
    expect(reaction).toMatchObject({
      lineId: 'hudChrome.aiSpeech.companionSelfSpiderStillness',
      kind: 'inspect',
      sceneTags: expect.arrayContaining(['lowVisibility', 'insectNoise']),
    });
  });

  it('lets elemental and dragonkin companions respond to sky, height, and old stone', () => {
    expect(firstReaction(context({ family: 'elemental', starry: true }))).toMatchObject({
      lineId: 'hudChrome.aiSpeech.companionSelfElementalResonance',
      kind: 'inspect',
    });
    expect(firstReaction(context({ family: 'dragonkin', environmental: ['highView', 'oldStone'] }))).toMatchObject({
      lineId: 'hudChrome.aiSpeech.companionSelfDragonkinWatch',
      kind: 'inspect',
    });
  });

  it('lets mortal-like companions notice daytime safe havens without changing gameplay', () => {
    expect(firstReaction(context({ family: 'humanoid', location: ['town', 'safeTown'], structure: ['house'], environmental: ['warmLight'] }))).toMatchObject({
      lineId: 'hudChrome.aiSpeech.companionSelfMortalSafeHaven',
      kind: 'inspect',
    });
  });

  it('lets companions read lingering world director mood after the concrete trace is gone', () => {
    const reaction = firstReaction(context({
      family: 'beast',
      location: ['forest'],
      structure: [],
      environmental: [],
      directorProposals: [directorProposal()],
    }));

    expect(reaction).toMatchObject({
      lineId: 'hudChrome.aiSpeech.companionSelfBeastScentUneasy',
      kind: 'inspect',
      sceneTags: expect.arrayContaining(['director:echoTrace', 'mood:hungry', 'directorProjection:scavengerScent']),
    });
  });

  it('lets living companions fear a director caution proposal without changing pet commands', () => {
    const reaction = firstReaction(context({
      family: 'humanoid',
      location: ['forest'],
      structure: [],
      environmental: [],
      directorProposals: [directorProposal({
        intent: 'raiseCampCaution',
        targetRef: 'fallen_chapel',
        suggestedLineId: 'hudChrome.aiSpeech.worldDirectorHaunted',
        reasonTags: ['mood:haunted', 'subject:scene', 'proposal:campAlert'],
      })],
    }));

    expect(reaction).toMatchObject({
      lineId: 'hudChrome.aiSpeech.companionSelfUndeadFear',
      kind: 'avoid',
      sceneTags: expect.arrayContaining(['director:raiseCampCaution', 'mood:haunted', 'directorProjection:mortalFear']),
    });
  });

  it('lets social companions read covetous director rumors through the same family projection', () => {
    const reaction = firstReaction(context({
      family: 'humanoid',
      location: ['forest'],
      structure: [],
      environmental: [],
      directorProposals: [directorProposal({
        intent: 'nudgeNpcRumor',
        targetRef: 'redbrook_blade',
        suggestedLineId: 'hudChrome.aiSpeech.worldDirectorCovetous',
        reasonTags: ['mood:covetous', 'subject:item', 'proposal:npcTopicShift', 'trace:valuable'],
      })],
    }));

    expect(reaction).toMatchObject({
      lineId: 'hudChrome.aiSpeech.companionSelfMortalSafeHaven',
      kind: 'inspect',
      sceneTags: expect.arrayContaining(['directorProjection:civilRumor', 'family:humanoid']),
    });
  });
});
