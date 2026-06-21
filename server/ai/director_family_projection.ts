import type { MobFamily } from '../../src/sim/types';
import type { AiWorldDirectorProposal } from './world_director';

export type DirectorFamilyReaction = 'approach' | 'avoid' | 'inspect';

export interface DirectorFamilyProjectionInput {
  family: MobFamily;
  individualTier?: 'none' | 'quirk' | 'singularity';
  individualTraits?: readonly string[];
}

export interface DirectorFamilyProjection {
  reaction: DirectorFamilyReaction;
  curiosity: number;
  fear: number;
  reasonTags: string[];
}

export function mobFamilyFromValue(value: string | null | undefined): MobFamily | null {
  switch (value) {
    case 'beast':
    case 'humanoid':
    case 'murloc':
    case 'spider':
    case 'kobold':
    case 'undead':
    case 'troll':
    case 'ogre':
    case 'elemental':
    case 'dragonkin':
    case 'demon':
      return value;
    default:
      return null;
  }
}

export function familyDirectorProjectionFor(
  proposal: AiWorldDirectorProposal,
  input: DirectorFamilyProjectionInput,
): DirectorFamilyProjection | null {
  const tags = new Set(proposal.reasonTags);
  const intensity = clamp01(proposal.intensity);
  const family = input.family;
  const mood = taggedMood(tags);
  let curiosity = 0;
  let fear = 0;
  const projectionTags: string[] = [];

  const add = (tag: string, nextCuriosity: number, nextFear: number): void => {
    if (!projectionTags.includes(tag)) projectionTags.push(tag);
    curiosity += nextCuriosity;
    fear += nextFear;
  };

  if (isDeathPressure(proposal, tags, mood)) {
    if (family === 'undead') {
      add('directorProjection:deathResonance', 0.34 + intensity * 0.18, 0);
    } else if (family === 'demon') {
      add('directorProjection:demonicPressure', 0.3 + intensity * 0.16, 0.02);
    } else if (family === 'elemental') {
      add('directorProjection:elementalDisturbance', 0.2 + intensity * 0.1, 0.04);
    } else if (family === 'dragonkin') {
      add('directorProjection:ancientJudgment', 0.16 + intensity * 0.08, 0.12 + intensity * 0.08);
    } else {
      add('directorProjection:mortalFear', 0.02, 0.3 + intensity * 0.18);
    }
  } else if (isFoodTrace(proposal, tags, mood)) {
    if (family === 'beast' || family === 'murloc' || family === 'troll' || family === 'ogre') {
      add('directorProjection:scavengerScent', 0.32 + intensity * 0.16, family === 'beast' ? 0.04 : 0.01);
    } else if (family === 'spider') {
      add('directorProjection:preyPattern', 0.2 + intensity * 0.1, 0.02);
    } else if (family === 'humanoid' || family === 'kobold') {
      add('directorProjection:campScrap', 0.12 + intensity * 0.05, 0.03);
    }
  } else if (isValueRumor(proposal, tags, mood)) {
    if (family === 'kobold') {
      add('directorProjection:smallGreed', 0.34 + intensity * 0.16, 0.03);
    } else if (isMortalSocial(family)) {
      add('directorProjection:civilRumor', 0.26 + intensity * 0.12, 0.03);
    } else if (family === 'dragonkin') {
      add('directorProjection:ancientJudgment', 0.22 + intensity * 0.08, 0.06);
    } else if (family === 'demon') {
      add('directorProjection:temptationScent', 0.18 + intensity * 0.08, 0);
    }
  } else if (proposal.intent === 'echoQuestRelief' || mood === 'relieved') {
    if (isMortalSocial(family) || family === 'dragonkin') {
      add('directorProjection:civilRelief', 0.22 + intensity * 0.1, 0.02);
    } else if (family === 'undead' || family === 'demon') {
      add('directorProjection:livingOrderPressure', 0.03, 0.16 + intensity * 0.1);
    }
  } else if (proposal.intent === 'echoEncounterMemory') {
    if (mood === 'triumphant') {
      if (family === 'dragonkin') {
        add('directorProjection:ancientJudgment', 0.28 + intensity * 0.1, 0.03);
      } else if (isMortalSocial(family) || family === 'ogre') {
        add('directorProjection:campPowerVacuum', 0.2 + intensity * 0.08, 0.05);
      } else if (family === 'undead' || family === 'demon') {
        add('directorProjection:throneShock', 0.16 + intensity * 0.08, 0.08);
      }
    }
  } else if (mood === 'uncanny' || mood === 'stirred' || proposal.intent === 'raiseCampCaution') {
    if (family === 'elemental') {
      add('directorProjection:elementalDisturbance', 0.24 + intensity * 0.1, 0.03);
    } else if (family === 'dragonkin') {
      add('directorProjection:ancientJudgment', 0.2 + intensity * 0.08, 0.05);
    } else if (family === 'undead' || family === 'demon' || family === 'spider') {
      add('directorProjection:thresholdSense', 0.18 + intensity * 0.08, 0.04);
    } else {
      add('directorProjection:ambientUnease', 0.08, 0.16 + intensity * 0.08);
    }
  }

  const traitBoost = input.individualTier === 'singularity' ? 0.08 : input.individualTier === 'quirk' ? 0.04 : 0;
  if (traitBoost > 0) {
    const traits = input.individualTraits ?? [];
    if (traits.includes('omenSensitive') || traits.includes('stargazer')) {
      curiosity += traitBoost;
      if (!projectionTags.includes('directorProjection:individualOmen')) projectionTags.push('directorProjection:individualOmen');
    }
    if (traits.includes('cowardly')) {
      fear += traitBoost;
      if (!projectionTags.includes('directorProjection:individualFear')) projectionTags.push('directorProjection:individualFear');
    }
    if (traits.includes('collector')) {
      curiosity += traitBoost * 0.8;
      if (!projectionTags.includes('directorProjection:individualCollector')) projectionTags.push('directorProjection:individualCollector');
    }
  }

  curiosity = clamp01(curiosity);
  fear = clamp01(fear);
  if (Math.max(curiosity, fear) < 0.12) return null;
  return {
    reaction: fear > curiosity + 0.06 ? 'avoid' : curiosity > 0.24 ? 'approach' : 'inspect',
    curiosity,
    fear,
    reasonTags: projectionReasonTags(proposal, family, projectionTags),
  };
}

function projectionReasonTags(
  proposal: AiWorldDirectorProposal,
  family: MobFamily,
  projectionTags: readonly string[],
): string[] {
  return [...new Set([
    ...projectionTags,
    `director:${proposal.intent}`,
    `family:${family}`,
    `directorRisk:${proposal.risk}`,
    ...proposal.reasonTags,
  ])].slice(0, 8);
}

function taggedMood(tags: ReadonlySet<string>): string | null {
  for (const tag of tags) {
    if (tag.startsWith('mood:')) return tag.slice('mood:'.length);
  }
  return null;
}

function isDeathPressure(
  proposal: AiWorldDirectorProposal,
  tags: ReadonlySet<string>,
  mood: string | null,
): boolean {
  return proposal.intent === 'raiseCampCaution'
    || mood === 'haunted'
    || mood === 'dread'
    || tags.has('trace:cursed')
    || tags.has('trace:singularity')
    || tags.has('bossMemory:wipe');
}

function isFoodTrace(proposal: AiWorldDirectorProposal, tags: ReadonlySet<string>, mood: string | null): boolean {
  return proposal.intent === 'echoTrace' && (mood === 'hungry' || tags.has('trace:food'));
}

function isValueRumor(proposal: AiWorldDirectorProposal, tags: ReadonlySet<string>, mood: string | null): boolean {
  return proposal.intent === 'nudgeNpcRumor'
    || mood === 'covetous'
    || tags.has('trace:valuable');
}

function isMortalSocial(family: MobFamily): boolean {
  return family === 'humanoid' || family === 'kobold' || family === 'troll' || family === 'ogre';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
