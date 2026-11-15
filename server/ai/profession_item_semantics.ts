import {
  FARM_COMPOST_ITEM_ID,
  FARM_CROPS,
  FARM_GROWTH_TONIC_ITEM_ID,
  FARM_WITHERED_HUSK_ITEM_ID,
} from '../../src/sim/content/farm_crops';
import { FISHING_TABLES_BY_BAND } from '../../src/sim/content/items';
import { isMaterialItemId } from '../../src/sim/material_ids';
import type { ItemDef } from '../../src/sim/types';

type CropItemKind = 'seed' | 'produce';
const CROP_ITEM_KINDS = new Map<string, CropItemKind>();
for (const crop of Object.values(FARM_CROPS)) {
  CROP_ITEM_KINDS.set(crop.seedItemId, 'seed');
  CROP_ITEM_KINDS.set(crop.produceItemId, 'produce');
  CROP_ITEM_KINDS.set(crop.fineProduceItemId, 'produce');
}

const RAW_FISH_ITEM_IDS = new Set<string>();
for (const band of FISHING_TABLES_BY_BAND) {
  for (const table of Object.values(band)) {
    for (const entry of table) {
      if (entry.itemId?.startsWith('raw_')) RAW_FISH_ITEM_IDS.add(entry.itemId);
    }
  }
}

interface ProfessionItemSignals {
  itemTags: string[];
  smellTags: string[];
  valueSignals: string[];
  cropKind: CropItemKind | null;
}

/** Catalog facts augment the older name hints without granting item-use effects. */
export function professionItemSignals(item: ItemDef): ProfessionItemSignals | null {
  const material = isMaterialItemId(item.id);
  const flower = item.kind === 'junk' && /\b(flower|posy|bouquet|blossom)\b/i.test(item.name);
  if (!material && !flower) return null;
  const signals: ProfessionItemSignals = {
    itemTags: material ? ['material'] : [],
    smellTags: [],
    valueSignals: material ? ['useful'] : [],
    cropKind: CROP_ITEM_KINDS.get(item.id) ?? null,
  };
  if (signals.cropKind) {
    signals.itemTags.push('plant', signals.cropKind === 'seed' ? 'seed' : 'crop');
    if (signals.cropKind === 'produce') signals.itemTags.push('ingredient');
  }
  if (item.id === FARM_COMPOST_ITEM_ID) signals.itemTags.push('soil', 'fertilizer');
  if (item.id === FARM_WITHERED_HUSK_ITEM_ID) signals.itemTags.push('plant', 'residue');
  if (item.id === FARM_GROWTH_TONIC_ITEM_ID) signals.itemTags.push('alchemy', 'farming');
  if (RAW_FISH_ITEM_IDS.has(item.id)) {
    signals.itemTags.push('fish', 'water');
    signals.smellTags.push('fish');
  }
  if (flower) {
    signals.itemTags.push('plant', 'flower');
    signals.smellTags.push('floral');
  }
  return signals;
}
