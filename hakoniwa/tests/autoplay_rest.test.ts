import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Autoplayer, playerHealth } from '../src/game/autoplay';
import { createGame } from '../src/game/create';
import type { MapDef } from '../src/systems/world/types';

const REST_MAP: MapDef = {
  id: 'zz_rest_a',
  name: 'x',
  region: 'x',
  width: 24,
  height: 16,
  rows: Array.from({ length: 16 }, (_, y) =>
    y === 0 || y === 15 ? '#'.repeat(24) : `#${'.'.repeat(22)}#`,
  ),
  legend: { '#': 'wall', '.': 'floor' },
  locations: [],
  spawns: [],
  exits: [{ id: 'other', x: 2, y: 5, toMap: 'zz_rest_b', toX: 2.5, toY: 5.5, label: 'x' }],
};

describe('autoplayer rest recovery', () => {
  it('recovers beside two linked entrances without repeatedly crossing between nearby idle monsters', () => {
    const content = buildContent();
    const rat = content.monsters.find((m) => m.id === 'dian_rat');
    if (!rat) throw new Error('missing fixture rat');
    content.monsters = [...content.monsters, { ...rat, id: 'zz_rest_rat', speed: 0 }];
    const other = {
      ...REST_MAP,
      id: 'zz_rest_b',
      exits: [{ ...(REST_MAP.exits[0] as MapDef['exits'][number]), toMap: REST_MAP.id }],
    };
    content.maps = [...content.maps, REST_MAP, other];
    const engine = createGame({ content, aiMode: 'off', flagPolicy: 'off' });
    engine.queue('flag.set', { key: 'act', value: 'epilogue' });
    engine.queue('world.teleport', { entityId: 'player', mapId: REST_MAP.id, x: 2.5, y: 5.5 });
    for (const map of [REST_MAP.id, other.id])
      engine.queue('combat.spawn', {
        monsterId: 'zz_rest_rat',
        mapId: map,
        x: 10.5,
        y: 5.5,
        level: 1,
      });
    engine.step(1);
    engine.world.slices.scenes.current = null;
    engine.world.slices.scenes.queue = [];
    const player = engine.world.slices.combat.units.player;
    if (!player) throw new Error('missing player');
    player.hp /= 2;
    let crossings = 0;
    engine.onEvents((events) => {
      crossings += events.filter(
        (e) => e.kind === 'world.map_changed' && e.data.id === 'player',
      ).length;
    });
    const bot = new Autoplayer(engine);
    for (let n = 0; n < 300 && playerHealth(engine.world, engine.content) < 0.999; n++)
      engine.step(bot.rest('fixture recovery'));
    expect(playerHealth(engine.world, engine.content)).toBe(1);
    expect(crossings).toBeLessThanOrEqual(1);
  });
});
