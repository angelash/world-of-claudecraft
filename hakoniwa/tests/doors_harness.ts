// Shared harness of the doors tests (tests/doors_*.test.ts): the real engine with the
// kernel systems plus combat, party and doors over the matching packs, and small helpers
// to set flags, run code inside a system context and read events and command results.

import type { ContentPack } from '../src/content/pack';
import { pack as combatPack } from '../src/content/packs/combat';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { system as combat } from '../src/systems/combat';
import { system as doors } from '../src/systems/doors';
import type { DoorDef } from '../src/systems/doors/types';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { system as world } from '../src/systems/world';

export const PACKS: ContentPack[] = [worldPack, invPack, combatPack, partyPack, doorsPack];
export const SYSTEMS: GameSystem[] = [modifiers, world, inventory, combat, party, doors];

export function merge(packs: ContentPack[] = PACKS): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs) {
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  }
  return out as unknown as ContentMap;
}

/** A game over the shipped doors, or over `extra` doors added to them. */
export function makeGame(seed = 3, extra: DoorDef[] = []): Engine {
  const content = merge();
  if (extra.length > 0) content.doors = [...content.doors, ...extra];
  return Engine.create(seed, content, SYSTEMS);
}

/** A game whose only doors are `doors` (the shipped ones left out). */
export function gameWith(doorDefs: DoorDef[], seed = 3): Engine {
  const content = merge();
  content.doors = doorDefs;
  return Engine.create(seed, content, SYSTEMS);
}

export function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

export function setFlags(g: Engine, values: Record<string, string | number | boolean>): void {
  for (const [key, value] of Object.entries(values)) g.queue('flag.set', { key, value });
  g.step(12);
}

export function events<K extends AnyWorldEvent['kind']>(g: Engine, kind: K) {
  return g.world.recent.filter((e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind);
}

export function lastResult(g: Engine, kind: string) {
  const r = [...g.world.recent]
    .reverse()
    .find((e) => e.kind === 'command.result' && e.data.kind === kind);
  return r?.kind === 'command.result' ? r.data : undefined;
}

export const flags = (g: Engine) => g.world.meta.flags;

/** A minimal door for a test (category insight in the mirror wing, no seal). */
export function door(id: string, over: Partial<DoorDef> = {}): DoorDef {
  return {
    id,
    name: id,
    category: 'insight',
    act: 1,
    segment: 1,
    wing: 'mirror',
    hint: 'hint',
    desc: 'desc',
    keys: [{ type: 'flag', key: `test.${id}`, label: 'key' }],
    effects: [],
    seal: 'none',
    dangerBand: 'none',
    rankValue: 1,
    jam: 'combat',
    closable: true,
    ...over,
  };
}

/** Open a door through the command and step once. */
export function open(g: Engine, doorId: string): void {
  g.queue('doors.open', { doorId });
  g.step(1);
}
