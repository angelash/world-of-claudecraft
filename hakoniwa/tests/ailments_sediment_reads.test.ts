// The local sediment reads routed to PK-M1-51 (development_plan.md 4.2): the night ambush of
// a camp sleep and the witness's sorcery bonus read the grade where it happens through
// sedimentAt (a location's hot spot over the map level, src/systems/world/sediment.ts), not
// the map's level. The ambush is checked on the query itself; the witness read sits inside
// witnessFeat (cognition, PK-M1-18's in this wave), so a source guard pins the one read.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tickAtDay } from '../src/core/time';
import type { World } from '../src/core/world';
import { ambushChance, sleepAmbushChance } from '../src/systems/travel';
import { content, withHotSpot } from './ailments_harness';

/** The hunters' camp of forest_edge (a camp with its fire; canon map grade 1). */
const CAMP = { map: 'forest_edge', x: 6, y: 34 };
const NIGHT = tickAtDay(0, 22);

/** The smallest world the rest query reads: the sleeper where it lies. */
function view(c: ReturnType<typeof content>, at = CAMP) {
  const world = {
    meta: { tick: NIGHT, flags: {} },
    slices: {
      world: {
        playerId: 'player',
        entities: {
          player: { id: 'player', mapId: at.map, x: at.x, y: at.y, tags: [], alive: true },
        },
      },
    },
  } as unknown as World;
  return { world, content: c };
}

describe('the night ambush reads the local sediment', () => {
  it('a hot spot on the camp raises the chance to its grade', () => {
    const base = sleepAmbushChance(view(content()), 'player', NIGHT);
    expect(base).toBeCloseTo(ambushChance(1, { night: true, fire: true }), 10);
    const hot = withHotSpot('forest_edge', 'hunter_camp', 4);
    expect(sleepAmbushChance(view(hot), 'player', NIGHT)).toBeCloseTo(
      ambushChance(4, { night: true, fire: true }),
      10,
    );
  });

  it('a hot spot elsewhere on the map leaves the camp at the map level', () => {
    const other = withHotSpot('forest_edge', 'bandit_lookout', 5);
    expect(sleepAmbushChance(view(other), 'player', NIGHT)).toBeCloseTo(
      ambushChance(1, { night: true, fire: true }),
      10,
    );
  });
});

describe('the routed reads go through sedimentAt', () => {
  const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

  it.each([
    ['src/systems/travel/rest.ts', 'sleepAmbushChance'],
    ['src/systems/cognition/witness.ts', 'witnessFeat'],
  ])('%s reads no map level directly', (file, fn) => {
    const text = src(file);
    expect(text).toContain(fn);
    expect(text).toMatch(/\bsedimentAt\(map, /);
    // `map.sediment` or `map?.sediment` would be the map level, bypassing the hot spots
    expect(text).not.toMatch(/\bmap\??\.sediment\b/);
  });
});
