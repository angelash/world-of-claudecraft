import { ZONES } from '../../src/sim/data';
import type { PlayerClass } from '../../src/sim/types';
import type { AmbientBotArchetype, AmbientBotProfile } from './types';

const ZONE_CLASS_SETS: readonly (readonly PlayerClass[])[] = [
  ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'mage'],
  ['warrior', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock'],
  ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'],
];

const ARCHETYPES: readonly AmbientBotArchetype[] = [
  'newcomer',
  'quester',
  'traveler',
  'helper',
  'grinder',
];

function tagsForClass(cls: PlayerClass): readonly string[] {
  switch (cls) {
    case 'warrior': return ['frontline', 'melee'];
    case 'paladin': return ['frontline', 'support'];
    case 'hunter': return ['ranged', 'solo'];
    case 'rogue': return ['melee', 'fast'];
    case 'priest': return ['support', 'caster'];
    case 'shaman': return ['support', 'hybrid'];
    case 'mage': return ['caster', 'burst'];
    case 'warlock': return ['caster', 'pet'];
    case 'druid': return ['hybrid', 'travel'];
  }
}

export const DEFAULT_AMBIENT_BOT_PROFILES: readonly AmbientBotProfile[] = Object.freeze(
  ZONES.flatMap((zone, zoneIndex) => {
    const classes = ZONE_CLASS_SETS[Math.min(zoneIndex, ZONE_CLASS_SETS.length - 1)];
    return classes.map((cls, classIndex) => ({
      profileId: `${zone.id}_${cls}_${ARCHETYPES[classIndex % ARCHETYPES.length]}`,
      class: cls,
      archetype: ARCHETYPES[classIndex % ARCHETYPES.length],
      levelBand: { min: zone.levelRange[0], max: zone.levelRange[1] },
      preferredZoneIds: [zone.id],
      tags: [...tagsForClass(cls), zone.biome],
    }));
  }),
);
