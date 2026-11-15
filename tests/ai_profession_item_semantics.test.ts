import { describe, expect, it } from 'vitest';
import { itemSemanticFor } from '../server/ai/item_interest';
import {
  FARM_COMPOST_ITEM_ID,
  FARM_CROPS,
  FARM_GROWTH_TONIC_ITEM_ID,
  FARM_WITHERED_HUSK_ITEM_ID,
} from '../src/sim/content/farm_crops';

describe('AI profession item semantics', () => {
  it('distinguishes every seed and harvest without treating barley as metal or crops as cooked food', () => {
    expect(Object.keys(FARM_CROPS).length).toBeGreaterThan(0);
    for (const crop of Object.values(FARM_CROPS)) {
      const seed = itemSemanticFor(crop.seedItemId);
      expect(seed.itemTags, crop.seedItemId).toEqual(
        expect.arrayContaining(['material', 'plant', 'seed']),
      );
      expect(seed.itemTags).not.toContain('food');
      for (const itemId of [crop.produceItemId, crop.fineProduceItemId]) {
        const produce = itemSemanticFor(itemId);
        expect(produce.itemTags, itemId).toEqual(
          expect.arrayContaining(['material', 'plant', 'crop', 'ingredient']),
        );
        expect(produce.itemTags).not.toContain('food');
        expect(produce.itemTags, itemId).not.toContain('metal');
        expect(produce.valueSignals).toContain('useful');
      }
      expect(seed.itemTags, crop.seedItemId).not.toContain('metal');
    }
  });

  it.each([
    [FARM_COMPOST_ITEM_ID, ['soil', 'fertilizer']],
    [FARM_WITHERED_HUSK_ITEM_ID, ['plant', 'residue']],
    [FARM_GROWTH_TONIC_ITEM_ID, ['alchemy', 'farming']],
  ])('recognizes the actual farming role of %s', (itemId, tags) => {
    const semantic = itemSemanticFor(itemId);
    expect(semantic.itemTags).toEqual(expect.arrayContaining(['material', ...tags]));
    expect(semantic.itemTags).not.toContain('food');
    expect(semantic.valueSignals).toContain('useful');
  });

  it.each(['duskforged_billet', 'sunspun_bolt', 'lucent_reagent'])(
    'recognizes %s through the canonical material registry',
    (itemId) => {
      const semantic = itemSemanticFor(itemId);
      expect(semantic.itemTags).toContain('material');
      expect(semantic.valueSignals).toContain('useful');
    },
  );

  it.each(['raw_stillmere_salmon', 'raw_hollowgill_sturgeon'])(
    'recognizes %s as an uncooked catch',
    (itemId) => {
      const semantic = itemSemanticFor(itemId);
      expect(semantic.itemTags).toEqual(expect.arrayContaining(['material', 'fish', 'water']));
      expect(semantic.smellTags).toContain('fish');
      expect(semantic.itemTags).not.toContain('food');
    },
  );

  it('recognizes the flower keepsake without classifying fishing trash or unknown junk as fish or material', () => {
    const flower = itemSemanticFor('dawnhold_posy');
    expect(flower.itemTags).toEqual(expect.arrayContaining(['plant', 'flower']));
    expect(flower.smellTags).toContain('floral');
    expect(flower.itemTags).not.toContain('food');
    const boot = itemSemanticFor('soggy_boot');
    expect(boot.itemTags).not.toContain('fish');
    expect(boot.itemTags).not.toContain('material');
    expect(itemSemanticFor('unknown_compat_material')).toEqual({
      itemId: 'unknown_compat_material',
      itemTags: ['unknown'],
      smellTags: [],
      dangerTags: [],
      valueSignals: [],
    });
  });
});
