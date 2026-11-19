import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import {
  deserializeWorld,
  Engine,
  type GameSystem,
  rawText,
  type SystemContext,
  serializeWorld,
  stateHash,
  worldHash,
} from '../src/core';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { Autoplayer, nextLeg, partyStrength } from '../src/game/autoplay';
import { attackers } from '../src/game/autoplay/fight';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { resolveHit } from '../src/systems/combat/damage';
import { startEvade } from '../src/systems/combat/monster_ai';
import { engage } from '../src/systems/combat/threat';
import type { QuestDef } from '../src/systems/quests/types';
import { MAX_WAIT_HOURS, skipState } from '../src/systems/travel';
import type { MapDef } from '../src/systems/world/types';

const FIELD: MapDef = {
  id: 'zz_recovery_field',
  name: 'x',
  region: 'x',
  width: 16,
  height: 12,
  rows: Array.from({ length: 12 }, (_, y) =>
    y === 0 || y === 11 ? '#'.repeat(16) : `#${'.'.repeat(14)}#`,
  ),
  legend: { '#': 'wall', '.': 'floor' },
  locations: [],
  spawns: [],
  exits: [
    { id: 'blocked', x: 8, y: 5, toMap: 'zz_recovery_safe', toX: 2.5, toY: 5.5, label: 'x' },
    { id: 'open', x: 2, y: 5, toMap: 'zz_recovery_safe', toX: 2.5, toY: 5.5, label: 'x' },
  ],
  switches: [{ id: 'gate', x: 7, y: 1, w: 1, h: 10, closedTile: 'wall', openWhen: 'zz_gate_open' }],
};
const SAFE = { ...FIELD, id: 'zz_recovery_safe', switches: [], exits: [] };

function game(extraSystems: GameSystem[] = []): Engine {
  const content = buildContent();
  content.maps = [...content.maps, FIELD, SAFE];
  const g = createGame({
    aiMode: 'off',
    content,
    flagPolicy: 'off',
    systems: [...allSystems(), ...extraSystems],
  });
  g.queue('world.teleport', { entityId: 'player', mapId: FIELD.id, x: 5.5, y: 5.5 });
  g.step(1);
  return g;
}

describe('autoplayer recovery uses the current world', () => {
  it('splits calendar waits into the same eight-hour requests the player is allowed', () => {
    const g = game();
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 48.5, y: 32.5 });
    g.step(1);
    g.world.slices.scenes.current = null;
    g.world.slices.scenes.queue = [];
    const bot = new Autoplayer(g);
    bot.wait(7 * 24 * TICKS_PER_GAME_HOUR);
    expect(g.world.inbox).toContainEqual(
      expect.objectContaining({
        kind: 'time.skip',
        data: { hours: MAX_WAIT_HOURS, kind: 'wait', mode: 'long' },
      }),
    );
  });

  it('resumes and replays a real capped wait from a save with its request still queued', () => {
    const g = game();
    // This clock fixture is outside story direction; the recorded continuation uses
    // only the same wait command as the real player, with no calendar/quest flag writes.
    g.queue('flag.set', { key: 'act', value: 'epilogue' });
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 48.5, y: 32.5 });
    g.step(1);
    g.world.slices.scenes.current = null;
    g.world.slices.scenes.queue = [];
    g.drainLog();
    const start = g.tick;
    const bot = new Autoplayer(g);
    bot.wait(7 * 24 * TICKS_PER_GAME_HOUR);
    const saved = serializeWorld(g.world);
    g.step(1);
    expect(skipState(g.world)).not.toBeNull();
    for (let n = 0; skipState(g.world) && n < 10; n++) g.step(1);
    expect(skipState(g.world)).toBeNull();
    expect(g.tick - start).toBe(1 + MAX_WAIT_HOURS * TICKS_PER_GAME_HOUR);
    const end = g.tick;
    const log = g.drainLog();
    expect(log.filter((entry) => entry.command.kind === 'time.skip')).toHaveLength(1);
    const resumed = Engine.resume(deserializeWorld(saved), g.content, g.systems, { aiMode: 'off' });
    resumed.step(end - resumed.tick);
    const replayed = Engine.replayFrom(deserializeWorld(saved), g.content, g.systems, log, {
      aiMode: 'off',
    });
    replayed.step(end - replayed.tick);
    for (const continued of [resumed, replayed]) {
      expect(continued.tick).toBe(end);
      expect(worldHash(continued.world)).toBe(worldHash(g.world));
      expect(stateHash(continued.world)).toBe(stateHash(g.world));
    }
  });

  it('gives the next decision at a wait interruption instead of running out the cancelled wait', () => {
    const g = game([
      {
        id: 'zz_recovery_interrupt',
        order: 89,
        skip(ctx) {
          ctx.emit('time.interrupt', { reason: rawText('fixture interruption') });
        },
      },
    ]);
    g.queue('flag.set', { key: 'act', value: 'epilogue' });
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 48.5, y: 32.5 });
    g.step(1);
    g.world.slices.scenes.current = null;
    g.world.slices.scenes.queue = [];
    const bot = new Autoplayer(g);
    bot.wait(7 * 24 * TICKS_PER_GAME_HOUR);
    g.step(1);
    expect(skipState(g.world)).not.toBeNull();
    g.step(bot.think());
    expect(g.world.slices.travel.last?.outcome).toBe('interrupted');
    expect(g.tick).toBe(TICKS_PER_GAME_HOUR);
  });
  it('selects an exit reachable on the live switched map rather than the nearer sealed gate', () => {
    const maps = [FIELD, SAFE];
    expect(nextLeg(maps, {}, FIELD.id, SAFE.id, { x: 5.5, y: 5.5 })?.exit.id).toBe('open');
    expect(
      nextLeg(maps, { zz_gate_open: true }, FIELD.id, SAFE.id, { x: 5.5, y: 5.5 })?.exit.id,
    ).toBe('blocked');
  });

  it('tries another arrival on a divided map when the first one cannot reach the onward exit', () => {
    const exit = FIELD.exits[0];
    if (!exit) throw new Error('missing recovery fixture exit');
    const middle = { ...FIELD, exits: [exit] };
    const root = {
      ...SAFE,
      id: 'zz_recovery_root',
      exits: [
        { ...exit, id: 'left_entry', x: 3, toMap: FIELD.id, toX: 2.5 },
        { ...exit, id: 'right_entry', x: 4, toMap: FIELD.id, toX: 11.5 },
      ],
    };
    expect(nextLeg([root, middle, SAFE], {}, root.id, SAFE.id, { x: 5.5, y: 5.5 })?.exit.id).toBe(
      'right_entry',
    );
  });

  it('leaves through a reachable exit to recover instead of backing into an unreachable gate forever', () => {
    const g = game();
    const bot = new Autoplayer(g);
    g.queue('combat.spawn', { monsterId: 'dian_rat', mapId: FIELD.id, x: 6.5, y: 8.5, level: 1 });
    g.step(1);
    bot.rest('recover');
    const queued = g.world.inbox.find((command) => command.kind === 'world.move_to');
    expect(queued).toMatchObject({ data: { entityId: 'player', x: 2.5, y: 5.5 } });
    g.queue('world.teleport', { entityId: 'player', mapId: FIELD.id, x: 2.5, y: 5.5 });
    g.step(1);
    bot.rest('recover');
    expect(
      g.world.inbox.some(
        (command) => command.kind === 'world.use_exit' && command.data.exitId === 'open',
      ),
    ).toBe(true);
    g.step(1);
    expect(g.world.slices.world.entities.player?.mapId).toBe(SAFE.id);
  });

  it('does not count waiting, resting or remote roster members as available fighting strength', () => {
    const g = game();
    const base = partyStrength(g.world);
    g.queue('flag.set', { key: 'companion.yeyu.recruited', value: true });
    g.step(1);
    const m = g.world.slices.party.members.yeyu;
    if (!m) throw new Error('missing fixture companion');
    expect(partyStrength(g.world)).toBeGreaterThan(base);
    m.state = 'waiting';
    expect(partyStrength(g.world)).toBe(base);
    m.state = 'resting';
    expect(partyStrength(g.world)).toBe(base);
    m.state = 'party';
    const e = g.world.slices.world.entities[m.entityId];
    if (e) e.mapId = SAFE.id;
    expect(partyStrength(g.world)).toBe(base);
  });

  it('leaves an unreachable nearby defender alone when it is outside actual weapon reach', () => {
    const g = game();
    g.queue('flag.set', { key: 'act', value: 'epilogue' });
    g.queue('world.teleport', { entityId: 'player', mapId: FIELD.id, x: 6.5, y: 5.5 });
    g.queue('combat.spawn', { monsterId: 'dian_rat', mapId: FIELD.id, x: 8.5, y: 5.5, level: 1 });
    g.step(1);
    g.world.slices.scenes.current = null;
    g.world.slices.scenes.queue = [];
    const rat = Object.values(g.world.slices.world.entities).find(
      (e) => e.ref === 'dian_rat' && e.mapId === FIELD.id,
    );
    if (!rat) throw new Error('missing recovery fixture rat');
    const bot = new Autoplayer(g);
    const probe = {
      id: 'zz_engage',
      order: 999,
      tick(ctx: SystemContext) {
        const enemy = ctx.world.slices.combat.units[rat.id];
        const player = ctx.world.slices.combat.units.player;
        if (enemy && player) engage(ctx, enemy, player);
      },
    };
    Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
    bot.fight(rat.id, 'fixture');
    g.step(2);
    expect(bot.reach.ok(rat.id, g.tick)).toBe(false);
    bot.think();
    expect(bot.intent.what).not.toBe('fight dian_rat (defend)');
  });

  it('tries the real path to an idle boss behind a wall instead of waiting for it to notice', () => {
    const g = game();
    g.queue('combat.spawn', {
      monsterId: 'guardian_raven',
      mapId: FIELD.id,
      x: 8.5,
      y: 5.5,
      level: 3,
    });
    g.step(1);
    const boss = Object.values(g.world.slices.world.entities).find(
      (e) => e.ref === 'guardian_raven' && e.mapId === FIELD.id,
    );
    if (!boss) throw new Error('missing recovery fixture boss');
    const bot = new Autoplayer(g);
    bot.fight(boss.id, 'fixture');
    expect(g.world.inbox.some((command) => command.kind === 'world.move_to')).toBe(true);
    g.step(1);
    expect(bot.reach.ok(boss.id, g.tick)).toBe(false);
  });

  it('lets an evading named boss return home before approaching it again', () => {
    const g = game();
    g.queue('combat.spawn', {
      monsterId: 'guardian_raven',
      mapId: FIELD.id,
      x: 2.5,
      y: 5.5,
      level: 3,
    });
    g.step(1);
    const boss = Object.values(g.world.slices.world.entities).find(
      (e) => e.ref === 'guardian_raven' && e.mapId === FIELD.id,
    );
    if (!boss) throw new Error('missing recovery fixture boss');
    const probe = {
      id: 'zz_evade',
      order: 999,
      tick(ctx: SystemContext) {
        const u = ctx.world.slices.combat.units[boss.id];
        if (u) startEvade(ctx, u);
      },
    };
    Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
    const bot = new Autoplayer(g);
    bot.hunt(
      { type: 'kill', ref: 'guardian_raven', count: 1, label: 'x', mapId: FIELD.id },
      'fixture',
    );
    expect(
      g.world.inbox.some((c) => c.kind === 'combat.attack' || c.kind === 'world.move_to'),
    ).toBe(false);
  });

  it('drops a boss from its attackers after a real hit makes it yield', () => {
    const g = game();
    g.queue('combat.spawn', {
      monsterId: 'guardian_raven',
      mapId: FIELD.id,
      x: 2.5,
      y: 5.5,
      level: 3,
    });
    g.step(1);
    const boss = Object.values(g.world.slices.world.entities).find(
      (e) => e.ref === 'guardian_raven' && e.mapId === FIELD.id,
    );
    if (!boss) throw new Error('missing fixture boss');
    const probe = {
      id: 'zz_yield',
      order: 999,
      tick(ctx: SystemContext) {
        const source = ctx.world.slices.combat.units.player,
          target = ctx.world.slices.combat.units[boss.id];
        if (source && target)
          resolveHit(ctx, {
            source,
            target,
            amount: 10000,
            school: 'physical',
            kind: 'melee',
            noRoll: true,
          });
      },
    };
    Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
    expect(g.world.slices.combat.units[boss.id]?.ai?.state).toBe('yielded');
    expect(attackers(g.world)).not.toContain(boss.id);
  });

  it('removes the lower-health attacking add before spending more swings on its large boss', () => {
    const g = game();
    g.queue('flag.set', { key: 'act', value: 'epilogue' });
    g.queue('combat.spawn', {
      monsterId: 'guardian_raven',
      mapId: FIELD.id,
      x: 5.5,
      y: 6.5,
      level: 3,
    });
    g.queue('combat.spawn', {
      monsterId: 'raven_flock',
      mapId: FIELD.id,
      x: 4.5,
      y: 7.5,
      level: 3,
    });
    g.step(1);
    g.world.slices.scenes.current = null;
    g.world.slices.scenes.queue = [];
    const enemies = Object.values(g.world.slices.world.entities).filter(
      (e) => e.mapId === FIELD.id && e.kind === 'monster',
    );
    const boss = enemies.find((e) => e.ref === 'guardian_raven'),
      add = enemies.find((e) => e.ref === 'raven_flock');
    if (!boss || !add) throw new Error('missing fight fixture');
    const probe = {
      id: 'zz_pull',
      order: 999,
      tick(ctx: SystemContext) {
        const me = ctx.world.slices.combat.units.player,
          b = ctx.world.slices.combat.units[boss.id],
          a = ctx.world.slices.combat.units[add.id];
        if (me && b && a) {
          engage(ctx, b, me);
          engage(ctx, a, me);
          resolveHit(ctx, {
            source: me,
            target: b,
            amount: 40,
            school: 'physical',
            kind: 'melee',
            noRoll: true,
          });
        }
      },
    };
    Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
    expect(g.world.slices.combat.units[add.id]?.hp).toBeLessThan(
      g.world.slices.combat.units[boss.id]?.hp ?? 0,
    );
    const bot = new Autoplayer(g);
    bot.think();
    expect(bot.intent.what).toBe('fight raven_flock (defend)');
  });

  it('does not choose a hidden quest option before the visible valid one', () => {
    const g = game();
    const bot = new Autoplayer(g);
    const q = {
      id: 'zz_choice',
      act: 'act1',
      kind: 'main',
      title: 'x',
      desc: 'x',
      stages: [],
    } as QuestDef;
    const objective = {
      type: 'choice',
      label: 'x',
      options: [
        { id: 'unavailable', label: 'x', when: 'zz_unavailable' },
        { id: 'available', label: 'x' },
      ],
    } as const;
    const act = (
      bot as unknown as { objective: (q: QuestDef, o: unknown) => number | null }
    ).objective.bind(bot);
    act(q, objective);
    expect(g.world.inbox).toContainEqual(
      expect.objectContaining({
        kind: 'quests.choose',
        data: { questId: q.id, optionId: 'available' },
      }),
    );
  });
});
