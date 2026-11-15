import { describe, expect, it } from 'vitest';
import {
  AI_AGENT_PROFILES,
  GENERIC_MOB_AI_PROFILE,
  GENERIC_NPC_AI_PROFILE,
  profileFor,
} from '../server/ai/profiles';
import { NPCS } from '../src/sim/data';

describe('upstream NPC compatibility profiles', () => {
  it.each([
    ['npc_automaton_quartermaster', 'supply', 'gear'],
    ['instructor_maren', 'trainer', 'gear'],
    ['archivist_maelin_ember_projection', 'lore', 'relic'],
    ['stablemaster_marla', 'trainer', 'gear'],
    ['innkeeper_maudie', 'care', 'drink'],
  ])('gives %s an explicit conservative %s profile', (templateId, role, itemTag) => {
    const profile = profileFor('npc', templateId);
    expect(profile.id).toBe(`npc.upstream.${role}.living_world`);
    expect(profile.canonSensitive).toBe(true);
    expect(profile.allowedIntentTypes).toEqual(['lookAt', 'faceEntity', 'pause', 'commentOnScene']);
    expect(profile.allowedLineIds).toEqual(GENERIC_NPC_AI_PROFILE.allowedLineIds);
    expect(profile.socialMemory).toEqual(GENERIC_NPC_AI_PROFILE.socialMemory);
    expect(profile.tabooTopics).toEqual(GENERIC_NPC_AI_PROFILE.tabooTopics);
    expect(profile.itemInterest?.attractedToTags).toContain(itemTag);
    expect(profile.itemInterest?.avoidsTags).toEqual(
      GENERIC_NPC_AI_PROFILE.itemInterest?.avoidsTags,
    );
    expect(GENERIC_NPC_AI_PROFILE.itemInterest?.attractedToTags).toEqual([
      'food',
      'valuable',
      'tool',
    ]);
  });

  it('keeps authored identities, aliases, and the unknown-template boundary', () => {
    expect(profileFor('npc', 'brother_aldric_raid').id).toBe('npc.brother_aldric.living_world');
    expect(profileFor('npc', 'scout_maren').id).toBe('npc.scout_maren.living_world');
    expect(profileFor('npc', 'unclassified_future_npc')).toBe(GENERIC_NPC_AI_PROFILE);
    expect(profileFor('mob', 'instructor_maren')).toBe(GENERIC_MOB_AI_PROFILE);
  });

  it('registers only real, distinct NPC templates beside the authored pack', () => {
    const profiles = AI_AGENT_PROFILES.filter((profile) => profile.id.startsWith('npc.upstream.'));
    expect(profiles.length).toBeGreaterThan(0);
    const targets = profiles.flatMap((profile) => profile.appliesTo);
    expect(targets.length).toBeGreaterThan(60);
    for (const target of targets) {
      expect(target.kind).toBe('npc');
      expect(NPCS[target.templateId], target.templateId).toBeDefined();
    }
    const allNpcTargets = AI_AGENT_PROFILES.flatMap((profile) => profile.appliesTo)
      .filter((target) => target.kind === 'npc')
      .map((target) => target.templateId);
    expect(new Set(allNpcTargets).size).toBe(allNpcTargets.length);
  });
});
