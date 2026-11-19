import type { GameSystem, SystemContext } from '../../src/core';
import { createGame } from '../../src/game/create';
import { allSystems } from '../../src/game/registry';
import { spawnMonster } from '../../src/systems/combat/spawning';
import recorded from './fixtures/m02_encounter.json';

// Recorded M02 decision boundaries keep the real content, actors and terrain. The
// player's real skill rack and worn sword come from the matching tick-2370 anchor.
export function recordedEncounter(tick: number) {
  const sample = recorded.samples.find((s) => s.tick === tick);
  if (!sample) throw new Error(`missing recorded encounter at ${tick}`);
  let pending: ((ctx: SystemContext) => void) | undefined;
  const probe: GameSystem = {
    id: 'zz_autoplay_encounter',
    order: 999,
    tick(ctx) {
      const action = pending;
      pending = undefined;
      action?.(ctx);
    },
  };
  const g = createGame({ seed: recorded.seed, aiMode: 'off', systems: [...allSystems(), probe] });
  g.world.meta.tick = tick;
  g.world.meta.flags.act = 'act1';
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  const missing = sample.units.filter((row) => !g.world.slices.world.entities[row.id]);
  if (missing.length > 0) {
    pending = (ctx) => {
      for (const row of missing) {
        if (!row.ref) throw new Error(`recorded summon has no definition: ${row.id}`);
        const made = spawnMonster(ctx, row.ref, row.mapId, row.x, row.y, {
          level: row.level,
          summonerId: 'summonerId' in row ? row.summonerId : undefined,
        });
        if (made?.id !== row.id) throw new Error(`recorded summon id changed: ${row.id}`);
      }
    };
    g.step(1);
    g.world.meta.tick = tick;
  }
  Object.assign(g.world.slices.combat.units.player ?? {}, structuredClone(recorded.playerBase));
  Object.assign(g.world.slices.inventory.owners, {
    player: structuredClone(recorded.holdingPlayer),
  });
  for (const row of sample.units) {
    const body = g.world.slices.world.entities[row.id];
    const unit = g.world.slices.combat.units[row.id];
    if (!body || !unit || (body.ref ?? null) !== row.ref) {
      throw new Error(`recorded unit changed: ${row.id}`);
    }
    Object.assign(body, {
      x: row.x,
      y: row.y,
      mapId: row.mapId,
      alive: row.alive,
      move: structuredClone(row.move),
      intent: structuredClone(row.intent),
    });
    Object.assign(unit, {
      hp: row.hp,
      level: row.level,
      target: row.target,
      threat: structuredClone(row.threat),
      autoAttack: row.autoAttack,
      cast: structuredClone(row.cast),
      cds: structuredClone(row.cds),
      gcd: row.gcd,
      ai: structuredClone(row.ai),
      auras: structuredClone(row.auras),
    });
    if ('swingAt' in row) unit.swingAt = row.swingAt;
  }
  for (const row of sample.terrain) {
    const terrain = g.world.slices.combat.terrain?.[row.id];
    const body = g.world.slices.world.entities[row.id];
    const unit = g.world.slices.combat.units[row.id];
    if (!terrain || !body || !unit) throw new Error(`recorded terrain changed: ${row.id}`);
    terrain.state = row.state as typeof terrain.state;
    body.alive = row.alive;
    unit.hp = row.hp;
  }
  const boss = g.world.slices.combat.units.monster_16;
  const player = g.world.slices.world.entities.player;
  if (!boss || !player) throw new Error('missing recorded party or guardian');
  return {
    g,
    boss,
    player,
    run(action: (ctx: SystemContext) => void) {
      pending = action;
      g.step(1);
    },
  };
}
