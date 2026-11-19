// Care of the hurt (PK-M1-21; progression_and_pacing.md 10.1, 10.3; companions_and_party.md
// 8.4, 11.3; world_state_registry.md `npc.<id>.injury`): a companion's grave injury shows as
// major and clears when it is back; a major injury written from outside (the tide night)
// sends a companion in the field off as a story grave injury and heals a named person after
// the care days; a treated light wound heals after a night in a bed (an untreated one does
// not); a resting companion's visit is +1 bond once per injury. The real engine over the
// shipped content.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY } from '../src/core/time';
import { createGame } from '../src/game/create';
import { system as ailments, injure, readAilments } from '../src/systems/ailments';
import { system as combat } from '../src/systems/combat';
import { system as doors } from '../src/systems/doors';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { skipState, system as travel } from '../src/systems/travel';
import { system as world } from '../src/systems/world';

const SYSTEMS: GameSystem[] = [modifiers, world, inventory, combat, party, doors, ailments, travel];
const SCRIPT = { type: 'script' as const, script: 'test' };

let shipped: ContentMap | undefined;
const content = () => {
  shipped ??= buildContent();
  return shipped;
};

function makeGame(): Engine {
  const g = createGame({ seed: 7, aiMode: 'off', content: content(), systems: SYSTEMS });
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
  g.step(1);
  return g;
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

function recruit(g: Engine, ...ids: string[]): void {
  for (const id of ids) g.queue('flag.set', { key: `companion.${id}.recruited`, value: true });
  g.step(1);
}

/** Let game hours pass as one long skip and wait for its end. */
function skipHours(g: Engine, hours: number, kind: 'travel' | 'sleep' = 'travel'): void {
  g.queue('time.skip', { hours, kind, mode: 'long' }, SCRIPT);
  g.step(1);
  let guard = hours * 2 + 10;
  while (skipState(g.world) && guard-- > 0) g.step(1);
  g.step(21);
}

const flag = (g: Engine, key: string) => g.world.meta.flags[key];
const member = (g: Engine, id: string) => {
  const m = g.world.slices.party.members[id];
  if (!m) throw new Error(`no ${id}`);
  return m;
};
function lastResult(g: Engine, kind: string) {
  const r = [...g.world.recent]
    .reverse()
    .find((e) => e.kind === 'command.result' && e.data.kind === kind);
  return r?.kind === 'command.result' ? r.data : undefined;
}

describe('grave injuries as npc.<id>.injury (registry 8.5)', () => {
  it("a companion's grave injury reads major while it rests, none once it is back", () => {
    const g = makeGame();
    recruit(g, 'ron');
    g.queue('party.wound', { companionId: 'ron' }, SCRIPT);
    g.step(2);
    expect(member(g, 'ron').state).toBe('resting');
    expect(flag(g, 'npc.ron.injury')).toBe('major');
    skipHours(g, 50);
    expect(member(g, 'ron').state).toBe('party');
    expect(flag(g, 'npc.ron.injury')).toBe('none');
  });

  it('a major injury written from outside (the tide night) sends a field companion to rest', () => {
    const g = makeGame();
    recruit(g, 'ron');
    g.queue('flag.set', { key: 'npc.ron.injury', value: 'major' }, SCRIPT);
    g.step(2);
    expect(member(g, 'ron').state).toBe('resting');
    expect(g.world.recent.some((e) => e.kind === 'party.wounded' && e.data.cause === 'story')).toBe(
      true,
    );
    expect(g.world.slices.party.care?.ron).toBeUndefined();
  });

  it('a named person outside the party is well again after the care days (2)', () => {
    const g = makeGame();
    g.queue('flag.set', { key: 'npc.bron.injury', value: 'major' }, SCRIPT);
    g.step(2);
    const until = g.world.slices.party.care?.bron;
    expect(until).toBe(g.world.meta.tick - 1 + 2 * TICKS_PER_GAME_DAY);
    skipHours(g, 24);
    expect(flag(g, 'npc.bron.injury')).toBe('major');
    skipHours(g, 26);
    expect(flag(g, 'npc.bron.injury')).toBe('none');
    expect(g.world.slices.party.care).toBeUndefined();
  });
});

describe('a light wound: a night in a bed once treated (10.1)', () => {
  const night = (treated: boolean) => {
    const g = makeGame();
    recruit(g, 'ron');
    withCtx(g, (ctx) => injure(ctx, 'companion_ron', 'light'));
    if (treated)
      withCtx(g, (ctx) =>
        ctx.emit('combat.heal', {
          sourceId: 'player',
          targetId: 'companion_ron',
          amount: 5,
          overheal: 0,
          crit: false,
        }),
      );
    // the inn of Borderstone, at night
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 38.5, y: 45 }, SCRIPT);
    g.step(2);
    skipHours(g, 13);
    g.queue('time.sleep', {});
    g.step(1);
    for (let i = 0; i < 40 && skipState(g.world); i++) g.step(1);
    g.step(2);
    return readAilments(g.world)?.bodies.companion_ron?.injuries.map((i) => i.kind) ?? [];
  };

  it('treated, it is gone in the morning; untreated, it stays', () => {
    expect(night(true)).toEqual([]);
    expect(night(false)).toEqual(['light']);
  });

  it('a sleep under four hours is no night; four hours in the bed are', () => {
    const slept = (hours: number) => {
      const g = makeGame();
      recruit(g, 'ron');
      withCtx(g, (ctx) => injure(ctx, 'companion_ron', 'light'));
      g.queue(
        'world.teleport',
        { entityId: 'player', mapId: 'borderstone', x: 38.5, y: 45 },
        SCRIPT,
      );
      g.step(2);
      withCtx(g, (ctx) => {
        ctx.emit('combat.heal', {
          sourceId: 'player',
          targetId: 'companion_ron',
          amount: 5,
          overheal: 0,
          crit: false,
        });
      });
      // the sleep as the travel system reports it when it ends
      withCtx(g, (ctx) =>
        ctx.emit('time.skipped', {
          kind: 'sleep',
          mode: 'short',
          entityId: 'player',
          outcome: 'done',
          hours,
          notes: [],
          more: 0,
        }),
      );
      return readAilments(g.world)?.bodies.companion_ron?.injuries.map((i) => i.kind) ?? [];
    };
    expect(slept(2)).toEqual(['light']);
    expect(slept(4)).toEqual([]);
  });
});

describe('visiting a resting companion (8.4: +1 once per grave injury)', () => {
  it('+1 bond, once, where it rests; not while it is with the party', () => {
    const g = makeGame();
    recruit(g, 'ron');
    g.queue('party.visit', { companionId: 'ron' });
    g.step(1);
    expect(lastResult(g, 'party.visit')?.code).toBe('not_resting');
    g.queue('party.wound', { companionId: 'ron' }, SCRIPT);
    g.step(2);
    const bond = member(g, 'ron').bond;
    // away from where it rests, there is no visit (11.3)
    g.queue('party.visit', { companionId: 'ron' });
    g.step(1);
    expect(lastResult(g, 'party.visit')?.code).toBe('far_from_rest');
    expect(member(g, 'ron').bond).toBe(bond);
    // at the herb hut of Borderstone (a clinic)
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 74, y: 44.5 }, SCRIPT);
    g.step(2);
    g.queue('party.visit', { companionId: 'ron' });
    g.step(1);
    expect(member(g, 'ron').bond).toBe(bond + 1);
    g.queue('party.visit', { companionId: 'ron' });
    g.step(1);
    expect(lastResult(g, 'party.visit')?.code).toBe('visited');
    expect(member(g, 'ron').bond).toBe(bond + 1);
  });
});
