// The client's save loads run the content id migrations (release_engineering.md 5.5; the
// ability and aura renumbering of PK-M1-26, rename version 2): ClientSaves reads a slot
// through the migrator main.ts builds lazily from every game system (`createMigrator` with
// the systems as slice owners), so a save written before a rename comes back with the new
// ids in the combat slice, not only in its flags. Without that migrator the kernel default
// renames the flags only and the slice keeps the old ids (the case this pins against).

import { describe, expect, it } from 'vitest';
import { ClientSaves, MemoryStore } from '../src/client/hud/save_slots';
import {
  ContainerBackend,
  createMigrator,
  MemoryStorage,
  type SaveBackend,
  type WorldMigrator,
} from '../src/core/save';
import type { World } from '../src/core/world';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';

function backend(): ContainerBackend {
  return new ContainerBackend(new MemoryStorage(), {
    now: () => 0,
    writer: { id: 'w-test', name: 'test' },
  });
}

/** ClientSaves over a shared backend, writing as rename version `renameVersion`. */
function clientSaves(
  be: SaveBackend,
  renameVersion: number,
  migrator?: () => Promise<WorldMigrator>,
): ClientSaves {
  return new ClientSaves({
    backend: be,
    now: () => Date.UTC(2026, 10, 17),
    newRunId: () => 'r-0123abcd',
    versions: { gameVersion: '0.1.0', renameVersion, build: 'test' },
    extras: new MemoryStore(),
    migrator,
  });
}

type Units = World['slices']['combat']['units'];
const units = (w: World): Units => w.slices.combat.units;

/** A live world whose player holds old (rename version 1) ability and aura ids. */
function oldIdWorld() {
  const engine = createGame({ seed: 7 });
  engine.step(2);
  const w = engine.world;
  const pid = w.slices.world.playerId;
  const p = units(w)[pid];
  if (!p) throw new Error('no player unit');
  p.auras = [{ id: 'door_mirror', sourceId: pid, expires: 0, stacks: 1, lvl: 1, origin: 'door' }];
  p.abilities = ['door_step'];
  return { engine, pid };
}

describe('client save loads run the content id migrations', () => {
  it('loads a save from before the ability and aura renumbering with the new ids', async () => {
    const be = backend();
    const { engine, pid } = oldIdWorld();
    const writer = clientSaves(be, 1);
    writer.attach(engine);
    await writer.save('manual_01', { mapId: '', mapName: '' });

    // main.ts's migrator: built lazily from every game system, on the first load
    let built = 0;
    const migrator = async () => {
      built++;
      return createMigrator({ owners: allSystems() });
    };
    const reader = clientSaves(be, 2, migrator);
    const loaded = await reader.load('manual_01');
    const p = units(loaded.world)[pid];
    expect(p?.auras.map((a) => a.id)).toEqual(['aur_door_mirror']);
    expect(p?.abilities).toEqual(['sk_door_step']);
    expect(built).toBe(1);
  });

  it('without the systems as owners the slice keeps the old ids (what the wiring fixes)', async () => {
    const be = backend();
    const { engine, pid } = oldIdWorld();
    const writer = clientSaves(be, 1);
    writer.attach(engine);
    await writer.save('manual_01', { mapId: '', mapName: '' });

    const loaded = await clientSaves(be, 2).load('manual_01');
    const p = units(loaded.world)[pid];
    expect(p?.auras.map((a) => a.id)).toEqual(['door_mirror']);
    expect(p?.abilities).toEqual(['door_step']);
  });
});
