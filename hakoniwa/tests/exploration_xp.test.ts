// Build calibration, real position discovery, credited first clears, saved settlement and replay.
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import { deserializeWorld, serializeWorld, stateHash } from '../src/core/save';
import type { GameSystem } from '../src/core/system';
import { createGame, resumeGame } from '../src/game/create';
import { system as combat, unitOf } from '../src/systems/combat';
import { resolveHit } from '../src/systems/combat/damage';
import { killUnit } from '../src/systems/combat/death';
import { spawnMonster } from '../src/systems/combat/spawning';
import { system as dungeons } from '../src/systems/dungeons';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import {
  fadedXp,
  system as records,
  validateRecordsSlice,
  xpRewardsProblems,
} from '../src/systems/records';
import { getEntity, isWalkable, nearestWalkable, system as world } from '../src/systems/world';
import { buildXpRewards, calibrateRewards } from '../tools/content/xp_rewards';
import { withCtx } from './ailments_harness';

const CONTENT = buildContent();
const SYSTEMS = [modifiers, world, inventory, combat, dungeons, records];
const AT = { mapId: 'borderstone', x: 50, y: 39 };
const awards = (g: Engine) =>
  g.world.recent.filter(
    (e): e is Extract<AnyWorldEvent, { kind: 'xp.awarded' }> => e.kind === 'xp.awarded',
  );

function discoveryContent(closed = false): ContentMap {
  const content = {
    ...CONTENT,
    maps: CONTENT.maps.map((m) =>
      m.id !== 'borderstone'
        ? m
        : {
            ...m,
            spawns: [],
            locations: [
              ...m.locations,
              {
                id: 'test_vista',
                name: 'test vista',
                kind: 'landmark',
                x: 50,
                y: 39,
                w: 3,
                h: 3,
                discovery: { kind: 'vista' as const, act: 1 },
              },
              {
                id: 'test_future',
                name: 'test future',
                kind: 'secret',
                x: 50,
                y: 39,
                w: 3,
                h: 3,
                discovery: { kind: 'secret' as const, act: 2 },
              },
            ],
            ...(closed
              ? {
                  switches: [
                    {
                      id: 'test_closed',
                      x: 50,
                      y: 39,
                      w: 3,
                      h: 3,
                      closedTile: 'wall' as const,
                      openWhen: 'a1_culvert_sealed',
                    },
                  ],
                }
              : {}),
          },
    ),
  };
  return { ...content, xpRewards: buildXpRewards(content) };
}

function atLocation(mapId: string, id: string): typeof AT {
  const map = CONTENT.maps.find((m) => m.id === mapId);
  const loc = map?.locations.find((l) => l.id === id);
  if (!map || !loc) throw new Error('missing test location');
  for (let y = loc.y; y < loc.y + loc.h; y++)
    for (let x = loc.x; x < loc.x + loc.w; x++)
      if (isWalkable(map, x + 0.5, y + 0.5)) return { mapId, x: x + 0.5, y: y + 0.5 };
  throw new Error('no walkable location');
}

function killMonster(g: Engine, id: string, at: typeof AT, credited = true): void {
  g.queue('world.teleport', { entityId: 'player', ...at });
  g.step(1);
  withCtx(g, (ctx) => {
    const m = spawnMonster(ctx, id, at.mapId, at.x, at.y);
    if (!m) throw new Error('missing test monster');
    // Last blow alone is sufficient even when accumulated party damage is under 10%.
    m.partyDamage = 0;
    killUnit(ctx, m, credited ? (unitOf(ctx.world, 'player') ?? null) : null);
  });
}

function game(content: ContentMap = CONTENT): Engine {
  const g = createGame({ seed: 17, aiMode: 'off', content, systems: SYSTEMS });
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('world.teleport', { entityId: 'player', ...AT });
  g.step(1);
  return g;
}

function defeat(g: Engine, owned: boolean, position = AT) {
  g.queue('world.teleport', { entityId: 'player', ...position });
  g.step(1);
  withCtx(g, (ctx) => {
    const m = spawnMonster(ctx, 'dian_colossus', position.mapId, position.x + 1, position.y);
    if (!m) throw new Error('missing colossus');
    m.partyDamage = owned ? 100_000 : 0;
    killUnit(ctx, m, owned ? (unitOf(ctx.world, 'player') ?? null) : null);
  });
}

describe('M1 reward construction', () => {
  it('is fresh and calibrates actual declared content into each budget', () => {
    expect(CONTENT.xpRewards).toEqual(buildXpRewards(CONTENT));
    expect(xpRewardsProblems(CONTENT)).toEqual([]);
    for (const c of CONTENT.xpRewards?.calibration ?? []) {
      expect(Math.abs(c.expected - c.budget)).toBeLessThanOrEqual(c.budget * 0.05);
      expect(c.calibration).toBeGreaterThanOrEqual(0.6);
      expect(c.calibration).toBeLessThanOrEqual(1.5);
    }
    expect(CONTENT.xpRewards?.entries.some((r) => r.id === 'first:boss:ash_scroll_drift')).toBe(
      false,
    );
    expect(
      CONTENT.xpRewards?.entries.find((r) => r.id === 'first:boss:tally_rat_crone')?.weight,
    ).toBe(1);
  });

  it('refuses missing calibrated input rather than inventing a coefficient', () => {
    expect(() => calibrateRewards([], { first: 9408, explore: 6272 })).toThrow(/missing/);
  });

  it('rejects malformed and unresolved reward contracts without throwing', () => {
    expect(
      xpRewardsProblems({
        ...CONTENT,
        xpRewards: { version: 1, entries: [null], calibration: [null] },
      } as unknown as ContentMap).length,
    ).toBeGreaterThan(0);
    const bad = structuredClone(CONTENT.xpRewards!);
    bad.entries[0]!.trigger.mapId = 'missing';
    expect(xpRewardsProblems({ ...CONTENT, xpRewards: bad })).toContain(
      `xpRewards: missing map for ${bad.entries[0]?.id}`,
    );
    expect(
      discoveryContent().xpRewards?.entries.some(
        (r) => r.id === 'explore:secret:borderstone:test_future',
      ),
    ).toBe(false);
  });

  it('the late-player factor never applies catch-up to discoveries', () => {
    expect(fadedXp(100, 8, 8)).toBe(100);
    expect(fadedXp(100, 14, 8)).toBe(80);
    expect(fadedXp(100, 18, 8)).toBe(10);
    expect(fadedXp(100, 1, 8)).toBe(100);
  });
});

describe('actual-position discoveries', () => {
  it('awards a map and region once and never pays a remote landmark', () => {
    const g = game();
    const reasons = awards(g).map((e) => e.data.reason);
    expect(reasons).toContain('explore:map:borderstone');
    expect(reasons.some((r) => typeof r === 'string' && r.startsWith('explore:region:'))).toBe(
      true,
    );
    expect(reasons).not.toContain('explore:landmark:borderstone_north:ancient_tree');
    const count = awards(g).length;
    g.queue('world.teleport', { entityId: 'player', ...AT });
    g.step(20);
    expect(awards(g)).toHaveLength(count);
  });

  it('a hidden player cannot discover and getters never grant experience', () => {
    const g = game();
    const map = CONTENT.maps.find((m) => m.id === 'brokenspan_post');
    const l = map?.locations.find((l) => l.discovery?.kind === 'landmark');
    if (!l) throw new Error('missing declared landmark');
    withCtx(g, (ctx) => {
      const p = getEntity(ctx.world, 'player');
      if (p) p.hidden = true;
    });
    g.queue('world.teleport', { entityId: 'player', mapId: map!.id, x: l.x + 0.5, y: l.y + 0.5 });
    g.step(20);
    expect(awards(g).some((e) => e.data.reason === `explore:landmark:${map!.id}:${l.id}`)).toBe(
      false,
    );
  });

  it('resumes a settled discovery without paying twice and replays the same commands', () => {
    const g = game();
    const loaded = Engine.resume(deserializeWorld(serializeWorld(g.world)), g.content, g.systems);
    expect(stateHash(loaded.world)).toBe(stateHash(g.world));
    const before = unitOf(loaded.world, 'player')?.xp;
    loaded.step(20);
    expect(unitOf(loaded.world, 'player')?.xp).toBe(before);
    expect(validateRecordsSlice(loaded.world.slices.records)).toEqual([]);
    const a = game();
    a.queue('world.teleport', { entityId: 'player', mapId: 'borderstone_north', x: 12, y: 40 });
    a.step(20);
    const replay = Engine.replay(17, a.content, a.systems, a.world.log, { aiMode: 'off' });
    replay.step(a.tick);
    expect(stateHash(a.world)).toBe(stateHash(replay.world));
  });

  it('keeps complete reward state identical through snapshot replay and the resume factory', () => {
    const live = game();
    const snapshot = serializeWorld(live.world);
    const input = { entityId: 'player', mapId: 'borderstone_north', x: 12, y: 40 };
    live.queue('world.teleport', input);
    live.step(20);
    const replay = Engine.replayFrom(
      deserializeWorld(snapshot),
      live.content,
      live.systems,
      live.world.log,
      { aiMode: 'off' },
    );
    replay.step(20);
    const factory = resumeGame(deserializeWorld(snapshot), {
      content: live.content,
      systems: SYSTEMS,
      aiMode: 'off',
    });
    factory.queue('world.teleport', input);
    factory.step(20);
    expect(stateHash(replay.world)).toBe(stateHash(live.world));
    expect(stateHash(factory.world)).toBe(stateHash(live.world));
  });

  it('requires a continuous three seconds and resets a hidden or briefly moving vista visitor', () => {
    const g = game(discoveryContent());
    g.step(38);
    expect(awards(g).some((e) => e.data.reason === 'explore:vista:borderstone:test_vista')).toBe(
      false,
    );
    const p = getEntity(g.world, 'player')!;
    p.hidden = true;
    g.step(1);
    p.hidden = false;
    g.step(10);
    p.x += 0.1;
    g.step(1);
    p.x -= 0.1;
    g.step(1);
    const since = g.world.slices.records.xp?.vista?.since;
    expect(since).toBe(g.tick);
    g.step(59);
    expect(awards(g).some((e) => e.data.reason === 'explore:vista:borderstone:test_vista')).toBe(
      false,
    );
    g.step(1);
    expect(
      awards(g).filter((e) => e.data.reason === 'explore:vista:borderstone:test_vista'),
    ).toHaveLength(1);
    g.step(10);
    expect(
      awards(g).filter((e) => e.data.reason === 'explore:vista:borderstone:test_vista'),
    ).toHaveLength(1);
  });

  it('refuses a closed switch rectangle, then discovers after the real terrain opens', () => {
    const g = game(discoveryContent(true));
    const p = getEntity(g.world, 'player')!;
    // Place a corrupt/old snapshot inside the closed area; it is still not a discovery.
    p.x = 50.5;
    p.y = 39.5;
    g.step(70);
    expect(awards(g).some((e) => e.data.reason === 'explore:vista:borderstone:test_vista')).toBe(
      false,
    );
    g.queue('flag.set', { key: 'a1_culvert_sealed', value: true });
    g.queue('world.teleport', { entityId: 'player', ...AT });
    g.step(70);
    expect(awards(g).some((e) => e.data.reason === 'explore:vista:borderstone:test_vista')).toBe(
      true,
    );
  });
});

describe('credited first victories', () => {
  it.each([false, true])(
    'distinguishes a resumed first-tick victory from an old clear (already cleared: %s)',
    (oldClear) => {
      const g = game();
      let victimId = '';
      withCtx(g, (ctx) => {
        const victim = spawnMonster(ctx, 'dian_colossus', AT.mapId, AT.x + 1, AT.y);
        if (!victim) throw new Error('missing recovery fight');
        victimId = victim.id;
        if (oldClear) ctx.setFlag('boss.dian_colossus.defeated', true);
      });
      delete g.world.slices.records.xp;
      const saved = deserializeWorld(serializeWorld(g.world));
      const attack: GameSystem = {
        id: 'zz_recovery_first_hit',
        order: 19,
        tick(ctx) {
          const source = unitOf(ctx.world, 'player');
          const target = unitOf(ctx.world, victimId);
          if (source && target && getEntity(ctx.world, victimId)?.alive)
            resolveHit(ctx, {
              source,
              target,
              amount: 100_000,
              school: 'physical',
              kind: 'melee',
              noRoll: true,
            });
        },
      };
      const loaded = Engine.resume(saved, g.content, [...g.systems, attack]);
      loaded.step(1);
      expect(getEntity(loaded.world, victimId)?.alive).toBe(false);
      const first = awards(loaded).filter((e) => e.data.reason === 'first:boss:dian_colossus');
      expect(first).toHaveLength(oldClear ? 0 : 1);
      expect(loaded.world.slices.records.xp?.settled['first:boss:dian_colossus']?.amount).toBe(
        oldClear ? 0 : first[0]?.data.amount,
      );
    },
  );

  it('pays a participating party once, including after snapshot reload', () => {
    const g = game();
    defeat(g, true);
    expect(awards(g).filter((e) => e.data.reason === 'first:boss:dian_colossus')).toHaveLength(1);
    const loaded = Engine.resume(deserializeWorld(serializeWorld(g.world)), g.content, g.systems);
    defeat(loaded, true);
    expect(awards(loaded).filter((e) => e.data.reason === 'first:boss:dian_colossus')).toHaveLength(
      1,
    );
  });

  it('an uncredited first defeat is lost and cannot be farmed on a later respawn', () => {
    const g = game();
    defeat(g, false);
    defeat(g, true);
    expect(awards(g).filter((e) => e.data.reason === 'first:boss:dian_colossus')).toHaveLength(0);
    expect(g.world.slices.records.xp?.settled['first:boss:dian_colossus']?.amount).toBe(0);
  });

  it('backfills an old already-defeated save without retroactively issuing a first reward', () => {
    const g = game();
    delete g.world.slices.records.xp;
    g.world.meta.flags['boss.dian_colossus.defeated'] = true;
    const loaded = Engine.resume(deserializeWorld(serializeWorld(g.world)), g.content, g.systems);
    loaded.step(20);
    defeat(loaded, true);
    expect(awards(loaded).filter((e) => e.data.reason === 'first:boss:dian_colossus')).toHaveLength(
      0,
    );
  });

  it('does not pay a dungeon entry and pays its actual core defeat once for a last-blow participant', () => {
    const g = game();
    const map = CONTENT.maps.find((m) => m.id === 'dg_old_mine')!;
    const spot = nearestWalkable(map, 10, 10)!;
    const at = { mapId: map.id, ...spot };
    g.queue('world.teleport', { entityId: 'player', ...at });
    g.step(1);
    expect(awards(g).some((e) => e.data.reason === 'first:dungeon:dg_old_mine')).toBe(false);
    killMonster(g, 'crystal_mother', at);
    expect(awards(g).filter((e) => e.data.reason === 'first:dungeon:dg_old_mine')).toHaveLength(1);
    expect(awards(g).filter((e) => e.data.reason === 'first:boss:crystal_mother')).toHaveLength(1);
    killMonster(g, 'crystal_mother', at);
    expect(awards(g).filter((e) => e.data.reason === 'first:dungeon:dg_old_mine')).toHaveLength(1);
  });

  it('attributes a real nest clear and loses an NPC first clear permanently', () => {
    const at = atLocation('borderstone', 'old_granary');
    const own = game();
    own.queue('flag.set', { key: 'act_week', value: 4 });
    own.step(1);
    killMonster(own, 'furrow_rat_queen', at);
    expect(
      awards(own).filter((e) => e.data.reason === 'first:nest:nest_furrow_rat_queen'),
    ).toHaveLength(1);
    const other = game();
    other.queue('flag.set', { key: 'act_week', value: 4 });
    other.step(1);
    killMonster(other, 'furrow_rat_queen', at, false);
    killMonster(other, 'furrow_rat_queen', at);
    expect(awards(other).some((e) => e.data.reason === 'first:nest:nest_furrow_rat_queen')).toBe(
      false,
    );
  });
});
