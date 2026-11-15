import { describe, expect, it } from 'vitest';
import {
  compactFamilySemanticsForMob,
  FAMILY_SEMANTICS,
  familySemanticsFor,
  MOB_FAMILIES,
} from '../server/ai/family_semantics';
import type { MobFamily } from '../src/sim/types';

const expectedFamilies: MobFamily[] = [
  'beast',
  'humanoid',
  'mudfin',
  'spider',
  'burrower',
  'reptile',
  'undead',
  'troll',
  'ogre',
  'elemental',
  'dragonkin',
  'demon',
];

describe('AI family semantics', () => {
  it('covers every current MobFamily with instincts, scene tags, and visible behaviors', () => {
    expect([...MOB_FAMILIES].sort()).toEqual([...expectedFamilies].sort());
    for (const family of expectedFamilies) {
      const semantics = familySemanticsFor(family);
      expect(semantics.family).toBe(family);
      expect(semantics.baseInstincts.length, family).toBeGreaterThan(0);
      expect(semantics.sceneAmplifiers.length, family).toBeGreaterThan(0);
      expect(semantics.sceneSuppressors.length, family).toBeGreaterThan(0);
      expect(semantics.visibleBehaviors.length, family).toBeGreaterThan(0);
      expect(FAMILY_SEMANTICS[family]).toBe(semantics);
    }
  });

  it('keeps base instincts when a mob template adds more specific behavior', () => {
    const beast = familySemanticsFor('beast');
    const wolf = compactFamilySemanticsForMob('forest_wolf');
    expect(wolf).toBeTruthy();
    for (const instinct of beast.baseInstincts) {
      expect(wolf!.baseInstincts).toContain(instinct);
    }
    expect(wolf!.baseInstincts).toContain('packHunt');
    expect(wolf!.attractedItemTags).toContain('meat');
  });
});
