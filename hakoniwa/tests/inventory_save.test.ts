// The instance layer against the frozen saves (tests/fixtures/saves, PK-M1-13): every
// sample, written before the layer, still migrates to its golden hash with the inventory's
// save check and rename fields in play, and its first tick gives every instanced item a
// record (counts unchanged, worn slots matched, the slice check clean); the backfilled
// world then round-trips through a save unchanged.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import {
  type IdField,
  migrateSnapshot,
  type SliceOwner,
  serializeWorld,
  stateHash,
  worldHash,
} from '../src/core/save';
import { resumeGame } from '../src/game/create';
import { COMBAT_ID_FIELDS } from '../src/systems/combat';
import {
  type Holding,
  INSTANCE_LAYER_REV,
  instancesOf,
  system as inventory,
  isInstanced,
  upgradeSlice,
  validateInventorySlice,
} from '../src/systems/inventory';

const FIXTURES = join(__dirname, 'fixtures', 'saves');
const MANIFEST = JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8')) as {
  samples: { file: string; renameVersion: number; hash: string; state: string; seed: number }[];
};
const QUEST_ID_FIELDS: IdField[] = [
  { path: 'quests.@keys', kind: 'quest' },
  { path: 'quests.*.id', kind: 'quest' },
  { path: 'order.*', kind: 'quest' },
];
const OWNERS: SliceOwner[] = [
  { id: 'quests', idFields: QUEST_ID_FIELDS },
  { id: 'combat', idFields: COMBAT_ID_FIELDS },
  inventory,
];
const CONTENT = buildContent();
const hex = (n: number) => n.toString(16).padStart(8, '0');

function text(file: string): string {
  return gunzipSync(readFileSync(join(FIXTURES, file))).toString('utf8');
}

/** Every instanced count has its records at full durability, every slot its worn record. */
function consistent(owners: Record<string, Holding>): number {
  let records = 0;
  for (const [owner, h] of Object.entries(owners)) {
    for (const [id, n] of Object.entries(h.items)) {
      const def = CONTENT.items.find((i) => i.id === id);
      if (!def || !isInstanced(def)) continue;
      const mine = instancesOf(h, id);
      expect(mine.length, `${owner} ${id}`).toBe(n);
      records += mine.length;
    }
    for (const [slot, id] of Object.entries(h.equipped)) {
      const worn = h.worn?.[slot as keyof typeof h.equipped];
      expect(h.instances?.[worn ?? '']?.defId, `${owner} ${slot}`).toBe(id);
    }
  }
  return records;
}

describe('frozen saves through the instance layer', () => {
  for (const s of MANIFEST.samples) {
    it(`${s.file}: keeps its golden, then backfills its records on the first tick`, () => {
      const raw = text(s.file);
      const { world } = migrateSnapshot(raw, s.renameVersion, { owners: OWNERS });
      expect([hex(worldHash(world)), hex(stateHash(world))]).toEqual([s.hash, s.state]);
      const inv = world.slices.inventory;
      expect(inv.rev).toBeUndefined();
      expect(validateInventorySlice(inv)).toEqual([]);
      // the sweep itself, on a copy: counts unchanged, one record per instanced piece
      const copy = structuredClone(inv);
      let n = 0;
      upgradeSlice(
        copy,
        (id) => CONTENT.items.find((i) => i.id === id),
        (p) => `${p}${++n}`,
      );
      expect(Object.fromEntries(Object.entries(copy.owners).map(([o, h]) => [o, h.items]))).toEqual(
        Object.fromEntries(Object.entries(inv.owners).map(([o, h]) => [o, h.items])),
      );
      expect(consistent(copy.owners)).toBe(n);
      // and in the game: the first tick does it, and the ports keep it so
      const engine = resumeGame(world, { seed: s.seed, aiMode: 'off' });
      engine.step(1);
      const after = engine.world.slices.inventory;
      expect(after.rev).toBe(INSTANCE_LAYER_REV);
      expect(validateInventorySlice(after)).toEqual([]);
      consistent(after.owners);
      // the backfilled world round-trips through a save
      const again = migrateSnapshot(serializeWorld(engine.world), 0, { owners: OWNERS });
      expect(worldHash(again.world)).toBe(worldHash(engine.world));
    }, 180_000);
  }

  it('a late act carries equipment and gives it records', () => {
    const late = MANIFEST.samples.find((x) => x.file.endsWith('act3.hks')) ?? MANIFEST.samples[0];
    if (!late) throw new Error('no sample');
    const { world } = migrateSnapshot(text(late.file), late.renameVersion, { owners: OWNERS });
    const engine = resumeGame(world, { seed: late.seed, aiMode: 'off' });
    engine.step(1);
    const all = Object.values(engine.world.slices.inventory.owners).flatMap((h) =>
      Object.values(h.instances ?? {}),
    );
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((i) => i.instanceId.startsWith('it'))).toBe(true);
  }, 180_000);
});
