// Scene and quest choices that raise the nation's autonomy must survive the daily city
// settlement. The city rewrites the derived autonomy flags every day from its ledgers, so a
// story bonus lives in its own flag (`autonomy_bonus`) that the settlement adds back in.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnyWorldEvent, CommandKind, CommandMap } from '../src/core';
import type { Engine } from '../src/core/engine';
import { calendarAt, tickAtDay } from '../src/core/time';
import { createGame as createFullGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { DAILY_CITY_FLAGS } from '../src/systems/city/daily';

const CHAIN = new Set([
  'modifiers',
  'world',
  'inventory',
  'economy',
  'city',
  'warfare',
  'strategy',
]);
const SITE = 'old_outpost';
const OWNER = 'site:old_outpost';

function createGame(seed: number) {
  return createFullGame({ seed, systems: allSystems().filter((s) => CHAIN.has(s.id)) });
}

function stepDays(engine: Engine, n: number): void {
  const day = calendarAt(engine.tick).dayIndex;
  engine.step(tickAtDay(day + n, 0, 30) - engine.tick);
}

function run<K extends CommandKind>(
  engine: Engine,
  kind: K,
  data: CommandMap[K],
  events: AnyWorldEvent[],
) {
  const before = events.length;
  engine.queue(kind, data);
  engine.step(1);
  const res = events.slice(before).find((e) => e.kind === 'command.result' && e.data.kind === kind);
  if (res?.kind !== 'command.result') throw new Error(`no result for ${kind}`);
  return res.data;
}

/** A founded village promoted to a territory, with the nation founded on top of it. */
function foundedNation(seed: number) {
  const engine = createGame(seed);
  const events: AnyWorldEvent[] = [];
  engine.onEvents((evs) => {
    for (const e of evs) if (e.kind === 'command.result') events.push(e);
  });
  expect(
    run(engine, 'world.teleport', { entityId: 'player', mapId: SITE, x: 22.5, y: 19.5 }, events).ok,
  ).toBe(true);
  const places: [string, number, number][] = [
    ['communal_stove', 15, 14],
    ['shack', 18, 14],
    ['shack', 21, 14],
    ['farm', 14, 23],
  ];
  for (const [defId, x, y] of places) {
    expect(run(engine, 'city.place', { siteId: SITE, defId, x, y }, events).ok).toBe(true);
  }
  expect(
    run(engine, 'city.add_population', { siteId: SITE, group: 'refugees', count: 30 }, events).ok,
  ).toBe(true);
  stepDays(engine, 2);
  const owners = engine.world.slices.inventory.owners;
  const h = owners[OWNER] ?? { money: 0, items: {}, equipped: {} };
  owners[OWNER] = h;
  h.items.grain = (h.items.grain ?? 0) + 300;
  expect(run(engine, 'city.found', { siteId: SITE }, events).ok).toBe(true);
  run(engine, 'flag.set', { key: 'a3_territory_granted', value: true }, events);
  run(engine, 'flag.set', { key: 'a4_nation_founded', value: true }, events);
  stepDays(engine, 1);
  return { engine, events };
}

function expectedAutonomy(engine: Engine, bonus: number): number {
  const city = engine.world.slices.city;
  const site = city.sites[SITE]?.autonomy.value ?? 0;
  const core = city.nation.core?.value ?? 0;
  return Math.round(Math.min(100, Math.max(0, 0.6 * site + 0.4 * core + bonus)));
}

describe('story autonomy bonus', () => {
  it('keeps a scene bonus through the daily settlement', () => {
    const { engine, events } = foundedNation(41);
    expect(engine.world.meta.flags.autonomy).toBe(expectedAutonomy(engine, 0));
    run(engine, 'flag.set', { key: 'autonomy_bonus', value: 5 }, events);
    stepDays(engine, 3);
    expect(engine.world.meta.flags.autonomy).toBe(expectedAutonomy(engine, 5));
  });

  it('never lets scene or quest data write a flag the city rewrites daily', () => {
    const offenders: string[] = [];
    const visit = (node: unknown, file: string): void => {
      if (Array.isArray(node)) {
        for (const n of node) visit(n, file);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      const writes = o.type === 'add' || o.type === 'flag' || o.type === 'copy';
      if (writes && typeof o.key === 'string' && DAILY_CITY_FLAGS.includes(o.key)) {
        offenders.push(`${file}: ${o.type} ${o.key}`);
      }
      for (const v of Object.values(o)) visit(v, file);
    };
    for (const dir of ['data/scenes', 'data/quests']) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        visit(JSON.parse(readFileSync(join(dir, f), 'utf8')), `${dir}/${f}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
