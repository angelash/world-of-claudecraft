// The inner court (PK-M1-53; act1 9.2, travel_and_exploration.md 5.1, city_building 2.2 and
// 2.3, catalog_buildings_city.md 4.1 and 4.2, catalog_relics_lore.md 1.7): the door is
// pushed from a closed door within reach and has a cooldown from data; going in and out
// shows the player going through a door (identity.exposed); storage moves records whole
// and keeps its contents through a death; the display holds its pieces (a displayed piece
// opens no door) and takes a day to give one back; the garden plots, display cases and
// store follow the court tier, which the granary door's feature flag raises.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { type AnyWorldEvent, type CommandKind, type CommandMap, Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, TICKS_PER_GAME_MINUTE } from '../src/core/time';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import {
  type BuildingInstance,
  courtConfigProblems,
  courtTier,
  courtView,
  displayEntries,
  findSpot,
  previewPlacement,
  type SiteDef,
} from '../src/systems/city';
import { doorWithinReach } from '../src/systems/city/court_tiers';
import { dropBag } from '../src/systems/combat/death_costs';
import { keysMet } from '../src/systems/doors/keys';
import { addItem, countItem, holdingOf, isInstanced, stackCount } from '../src/systems/inventory';
import type { MapDef } from '../src/systems/world/types';
import { door } from './doors_harness';

const CITY_CHAIN = ['modifiers', 'world', 'inventory', 'economy', 'city', 'warfare', 'strategy'];
const DOOR_CHAIN = [...CITY_CHAIN, 'combat', 'party', 'doors'];
const COURT = 'inner_court';
const STORE = 'site:inner_court';
const OUTPOST = 'old_outpost';
/** Below the old granary's door on the outpost map (door tile 35,35). */
const AT_DOOR = { x: 35.5, y: 36.5 };
const EXPANSION = 'feature.court_expansion_1';

function game(opts: { chain?: string[]; content?: ContentMap; seed?: number } = {}) {
  const chain = new Set(opts.chain ?? CITY_CHAIN);
  const g = createGame({
    seed: opts.seed ?? 53,
    aiMode: 'off',
    content: opts.content,
    systems: allSystems().filter((s) => chain.has(s.id)),
  });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => {
    for (const e of evs) events.push(e);
  });
  return { g, events };
}

function run<K extends CommandKind>(
  g: Engine,
  events: AnyWorldEvent[],
  kind: K,
  data: CommandMap[K],
) {
  const before = events.length;
  g.queue(kind, data);
  g.step(1);
  const res = events.slice(before).find((e) => e.kind === 'command.result' && e.data.kind === kind);
  if (res?.kind !== 'command.result') throw new Error(`no result for ${kind}`);
  return res.data;
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

function setFlag(g: Engine, events: AnyWorldEvent[], key: string, value: boolean): void {
  run(g, events, 'flag.set', { key, value });
}

function teleport(g: Engine, events: AnyWorldEvent[], mapId: string, at: { x: number; y: number }) {
  expect(run(g, events, 'world.teleport', { entityId: 'player', mapId, ...at }).ok).toBe(true);
}

/** Court open, the player standing at the outpost's door and then inside. */
function inCourt(opts: Parameters<typeof game>[0] = {}) {
  const t = game(opts);
  setFlag(t.g, t.events, 'feature.inner_court', true);
  teleport(t.g, t.events, OUTPOST, AT_DOOR);
  const r = run(t.g, t.events, 'city.enter_court', {});
  expect(r.ok, r.code).toBe(true);
  return t;
}

const player = (g: Engine) => g.world.slices.world.entities[g.world.slices.world.playerId];

function courtDef(content: ContentMap): SiteDef {
  const s = content.city_sites.find((x) => x.kind === 'court');
  if (!s?.court) throw new Error('no court block');
  return s;
}

/** A content copy whose court block is changed by `edit`. */
function contentWith(edit: (court: NonNullable<SiteDef['court']>) => void): ContentMap {
  const content = buildContent();
  content.city_sites = content.city_sites.map((s) => {
    if (s.kind !== 'court') return s;
    const copy = structuredClone(s);
    if (copy.court) edit(copy.court);
    return copy;
  });
  return content;
}

function instancedItem(content: ContentMap): string {
  const def = content.items.find((i) => isInstanced(i) && i.kind === 'weapon');
  if (!def) throw new Error('no instanced weapon in content');
  return def.id;
}

// ---------------------------------------------------------------------------

describe('the court block in data', () => {
  it('ships a sound court block: door tile, no cooldown, display holder, two tiers', () => {
    const content = buildContent();
    expect(courtConfigProblems(content)).toEqual([]);
    const cfg = courtDef(content).court;
    expect(cfg?.door).toMatchObject({ tiles: ['door'], reach: 1.5, cooldownMinutes: 0 });
    expect(cfg?.displayOwner).not.toBe(courtDef(content).stockOwner);
    expect(cfg?.tiers.map((t) => t.id)).toEqual(['initial', 'granary']);
    expect(cfg?.tiers[1]?.requiresFlags).toEqual([EXPANSION]);
  });

  it('reports each broken field of a court block', () => {
    const content = contentWith((c) => {
      c.door = {
        tiles: ['portal'],
        reach: 0,
        cooldownMinutes: -5,
        switchTiles: ['gatehouse'],
        anchorTags: 'old_arch' as unknown as string[],
      };
      c.displayOwner = STORE;
      c.takeDownDays = 0.5;
      c.tiers = [
        { id: 'a', requiresFlags: ['x'], display: [{ id: 'shelf', slots: 0 }] },
        {
          id: 'a',
          display: [{ id: 'shelf', slots: 2 }],
          buildingMax: { court_garden: 99, shack: 1 },
          buildingStorage: { court_store: 1.5 },
        },
      ];
    });
    const problems = courtConfigProblems(content).join('\n');
    for (const bit of [
      'unknown tile kind portal',
      'unknown switch tile kind gatehouse',
      'door.anchorTags must be a list of names',
      'door.reach must be above 0',
      'cooldownMinutes must be a whole number',
      'displayOwner must be a holder of its own',
      'takeDownDays must be a whole number',
      'the first tier is the first opening and needs no flags',
      'tier a listed twice',
      'display case shelf listed twice',
      'display case shelf needs 1 or more slots',
      'court_garden 99 is above the building',
      'shack is not a court building',
      'buildingStorage: court_store must be a whole number',
    ])
      expect(problems).toContain(bit);
  });
});

describe('entering from a closed door (act1 9.2)', () => {
  it('opens from a door tile within reach and refuses away from one', () => {
    const { g, events } = game();
    setFlag(g, events, 'feature.inner_court', true);
    teleport(g, events, OUTPOST, { x: 46.5, y: 39.5 });
    expect(run(g, events, 'city.enter_court', {}).code).toBe('no_door');
    // two tiles off the door (centre distance above 1.5): still no door
    teleport(g, events, OUTPOST, { x: 37.5, y: 36.5 });
    const far = run(g, events, 'city.enter_court', {});
    expect(far.code).toBe('no_door');
    expect(far.reason).toMatchObject({ key: 'sys.city.reject.court_no_door' });
    expect(player(g)?.mapId).toBe(OUTPOST);
    // diagonal to the door (1.41 tiles) is within reach
    teleport(g, events, OUTPOST, { x: 36.5, y: 36.5 });
    expect(run(g, events, 'city.enter_court', {}).ok).toBe(true);
    expect(player(g)?.mapId).toBe(COURT);
  });

  it('still asks for the door feature first', () => {
    const { g, events } = game();
    teleport(g, events, OUTPOST, AT_DOOR);
    expect(run(g, events, 'city.enter_court', {}).code).toBe('locked');
  });

  it('counts a switch closed by the flags by its closed tile, and a tagged location', () => {
    const map: MapDef = {
      id: 'probe',
      name: 'probe',
      region: 'probe',
      width: 6,
      height: 3,
      rows: ['......', '......', '......'],
      legend: { '.': 'grass' },
      locations: [
        { id: 'arch', name: 'arch', kind: 'landmark', x: 5, y: 0, w: 1, h: 1, tags: ['old_arch'] },
      ],
      spawns: [],
      exits: [],
      switches: [
        { id: 'gate', x: 0, y: 1, w: 1, h: 1, closedTile: 'door', openWhen: 'gate_open' },
        { id: 'iron', x: 3, y: 2, w: 1, h: 1, closedTile: 'wall', openWhen: 'iron_open' },
      ],
    };
    const rule = { tiles: ['door'], reach: 1.5, cooldownMinutes: 0 };
    const at = { x: 1.5, y: 1.5 };
    expect(doorWithinReach(map, {}, at, rule)).toBe(true);
    expect(doorWithinReach(map, { gate_open: true }, at, rule)).toBe(false);
    // a closed iron gate drawn as wall counts only when the rule names wall as a switch tile
    const byIron = { x: 3.5, y: 1.5 };
    const ironRule = { ...rule, switchTiles: ['wall'] };
    expect(doorWithinReach(map, { gate_open: true }, byIron, rule)).toBe(false);
    expect(doorWithinReach(map, { gate_open: true }, byIron, ironRule)).toBe(true);
    expect(doorWithinReach(map, { gate_open: true, iron_open: true }, byIron, ironRule)).toBe(
      false,
    );
    const byArch = { x: 4.5, y: 0.5 };
    const archRule = { ...rule, anchorTags: ['old_arch'] };
    expect(doorWithinReach(map, { iron_open: true }, byArch, rule)).toBe(false);
    expect(doorWithinReach(map, { iron_open: true }, byArch, archRule)).toBe(true);
  });

  it('has no cooldown with the shipped value of 0', () => {
    const { g, events } = inCourt();
    expect(run(g, events, 'city.leave_court', {}).ok).toBe(true);
    expect(run(g, events, 'city.enter_court', {}).ok).toBe(true);
  });

  it('waits out a cooldown written in data (30 game minutes in a test copy)', () => {
    const content = contentWith((c) => {
      c.door.cooldownMinutes = 30;
    });
    const { g, events } = inCourt({ content });
    const entered = g.world.slices.city.court.lastEnterTick ?? -1;
    expect(entered).toBeGreaterThan(0);
    expect(run(g, events, 'city.leave_court', {}).ok).toBe(true);
    const early = run(g, events, 'city.enter_court', {});
    expect(early.code).toBe('cooldown');
    expect(early.reason).toMatchObject({
      key: 'sys.city.reject.court_cooldown',
      params: { n: 30 },
    });
    expect(courtView(g.world, g.content)?.door.cooldownLeft).toBeGreaterThan(0);
    // a command runs on the next tick: the last tick before the end is still refused
    const end = entered + 30 * TICKS_PER_GAME_MINUTE;
    g.step(end - 2 - g.world.meta.tick);
    const last = run(g, events, 'city.enter_court', {});
    expect(last.code).toBe('cooldown');
    expect(last.reason).toMatchObject({ params: { n: 1 } });
    expect(g.world.meta.tick).toBe(end - 1);
    expect(run(g, events, 'city.enter_court', {}).ok).toBe(true);
    expect(player(g)?.mapId).toBe(COURT);
  });

  it('shows the player going through a door at both ends (identity_door)', () => {
    const { g, events } = game();
    setFlag(g, events, 'feature.inner_court', true);
    teleport(g, events, OUTPOST, AT_DOOR);
    const p = player(g);
    const before = { x: p?.x, y: p?.y };
    expect(run(g, events, 'city.enter_court', {}).ok).toBe(true);
    const shown = () =>
      events.filter(
        (e): e is Extract<AnyWorldEvent, { kind: 'identity.exposed' }> =>
          e.kind === 'identity.exposed',
      );
    expect(shown().map((e) => e.data)).toEqual([
      { kind: 'identity_door', mapId: OUTPOST, x: before.x, y: before.y },
    ]);
    expect(run(g, events, 'city.leave_court', {}).ok).toBe(true);
    const out = player(g);
    expect(out?.mapId).toBe(OUTPOST);
    expect(shown().map((e) => e.data)).toEqual([
      { kind: 'identity_door', mapId: OUTPOST, x: before.x, y: before.y },
      { kind: 'identity_door', mapId: OUTPOST, x: out?.x, y: out?.y },
    ]);
    // a refused entry shows nothing
    const n = shown().length;
    teleport(g, events, OUTPOST, { x: 46.5, y: 39.5 });
    expect(run(g, events, 'city.enter_court', {}).code).toBe('no_door');
    expect(shown().length).toBe(n);
  });
});

describe('storage (city_building 2.2: what is stored in the court is not dropped)', () => {
  it('moves an instanced piece and a qualified stack in and out with their records', () => {
    const { g, events } = inCourt();
    const weapon = instancedItem(g.content);
    let id = '';
    withCtx(g, (ctx) => {
      id = addItem(ctx, 'player', weapon, 1, 'test', { marks: 7, signature: 'tester' })[0] ?? '';
      addItem(ctx, 'player', 'herb', 4, 'test', { sedTier: 1 });
    });
    const record = structuredClone(holdingOf(g.world, 'player').instances?.[id]);
    expect(record?.marks).toBe(7);
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: weapon, count: 1 }).ok).toBe(
      true,
    );
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: 'herb', count: 4 }).ok).toBe(
      true,
    );
    expect(countItem(g.world, 'player', weapon)).toBe(0);
    expect(holdingOf(g.world, STORE).instances?.[id]).toEqual(record);
    expect(stackCount(holdingOf(g.world, STORE), 'herb', { sedTier: 1 })).toBe(4);
    expect(run(g, events, 'city.withdraw', { siteId: COURT, itemId: weapon, count: 1 }).ok).toBe(
      true,
    );
    expect(run(g, events, 'city.withdraw', { siteId: COURT, itemId: 'herb', count: 4 }).ok).toBe(
      true,
    );
    expect(holdingOf(g.world, 'player').instances?.[id]).toEqual(record);
    expect(stackCount(holdingOf(g.world, 'player'), 'herb', { sedTier: 1 })).toBe(4);
    expect(countItem(g.world, STORE, weapon)).toBe(0);
  });

  it('stops at the storage cap and needs the player inside', () => {
    const { g, events } = inCourt();
    withCtx(g, (ctx) => addItem(ctx, 'player', 'grain', 260));
    const cap = courtView(g.world, g.content)?.storage.cap ?? 0;
    expect(cap).toBe(200);
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: 'grain', count: cap }).ok).toBe(
      true,
    );
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: 'grain', count: 1 }).code).toBe(
      'storage_full',
    );
    expect(run(g, events, 'city.leave_court', {}).ok).toBe(true);
    expect(run(g, events, 'city.withdraw', { siteId: COURT, itemId: 'grain', count: 1 }).code).toBe(
      'not_here',
    );
  });

  it('keeps stored goods through a death: the drop bag takes from the pack only', () => {
    const { g, events } = inCourt({ chain: DOOR_CHAIN });
    const owner = courtDef(g.content).court?.displayOwner ?? '';
    withCtx(g, (ctx) => addItem(ctx, 'player', 'grain', 80));
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: 'grain', count: 40 }).ok).toBe(
      true,
    );
    expect(run(g, events, 'city.display_put', { itemId: 'grain' }).ok).toBe(true);
    withCtx(g, (ctx) => {
      dropBag(ctx, ctx.world.slices.world.playerId, { mapId: OUTPOST, x: 40, y: 40 });
    });
    // a quarter of the 39 in the pack fell; the court's storage and display kept theirs
    expect(countItem(g.world, 'player', 'grain')).toBe(39 - Math.floor(39 / 4));
    expect(countItem(g.world, STORE, 'grain')).toBe(40);
    expect(countItem(g.world, owner, 'grain')).toBe(1);
  });
});

describe('the display (catalog_relics_lore.md 1.7)', () => {
  it('holds pieces under its own owner, fills the shelf, and takes a day to give one back', () => {
    const { g, events } = inCourt();
    const owner = courtDef(g.content).court?.displayOwner ?? '';
    const weapon = instancedItem(g.content);
    let id = '';
    withCtx(g, (ctx) => {
      id = addItem(ctx, 'player', weapon, 1, 'test', { marks: 3 })[0] ?? '';
      addItem(ctx, 'player', 'herb', 5);
    });
    const record = structuredClone(holdingOf(g.world, 'player').instances?.[id]);
    const put = run(g, events, 'city.display_put', { itemId: weapon, instanceId: id });
    expect(put.ok).toBe(true);
    expect(countItem(g.world, 'player', weapon)).toBe(0);
    expect(holdingOf(g.world, owner).instances?.[id]).toEqual(record);
    expect(run(g, events, 'city.display_put', { itemId: 'herb' }).ok).toBe(true);
    expect(run(g, events, 'city.display_put', { itemId: 'herb' }).ok).toBe(true);
    // the first tier has the shelf of 3
    const full = run(g, events, 'city.display_put', { itemId: 'herb' });
    expect(full.code).toBe('display_full');
    expect(run(g, events, 'city.display_put', { itemId: 'herb', caseId: 'cabinet' }).code).toBe(
      'no_case',
    );
    expect(countItem(g.world, 'player', 'herb')).toBe(3);
    expect(courtView(g.world, g.content)?.display.cases).toEqual([
      { id: 'shelf', slots: 3, used: 3 },
    ]);

    // taking down: still on display (and in its slot) until a day has passed
    const entry = displayEntries(g.world).find((e) => e.instanceId === id);
    if (!entry) throw new Error('no entry');
    const take = run(g, events, 'city.display_take', { entryId: entry.id });
    expect(take.ok).toBe(true);
    expect(take.reason).toMatchObject({
      key: 'sys.city.info.display_taking',
      params: { t: TICKS_PER_GAME_DAY },
    });
    expect(run(g, events, 'city.display_take', { entryId: entry.id }).code).toBe('pending');
    const due = entry.takeDue ?? 0;
    g.step(due - g.world.meta.tick - 1);
    expect(holdingOf(g.world, owner).instances?.[id]).toEqual(record);
    expect(run(g, events, 'city.display_put', { itemId: 'herb' }).code).toBe('display_full');
    g.step(TICKS_PER_GAME_HOUR + 1);
    expect(displayEntries(g.world).some((e) => e.id === entry.id)).toBe(false);
    expect(countItem(g.world, owner, weapon)).toBe(0);
    // it comes off into the court's storage, record whole
    expect(holdingOf(g.world, STORE).instances?.[id]).toEqual(record);
    expect(events.filter((e) => e.kind === 'city.court_display').map((e) => e.data.op)).toEqual([
      'put',
      'put',
      'put',
      'taking',
      'taken',
    ]);
    expect(run(g, events, 'city.display_put', { itemId: 'herb' }).ok).toBe(true);
  });

  it('needs the player in the court', () => {
    const { g, events } = inCourt();
    withCtx(g, (ctx) => addItem(ctx, 'player', 'herb', 1));
    expect(run(g, events, 'city.leave_court', {}).ok).toBe(true);
    expect(run(g, events, 'city.display_put', { itemId: 'herb' }).code).toBe('not_here');
    expect(run(g, events, 'city.display_take', { entryId: 'nope' }).code).toBe('not_here');
  });

  it('keeps a stack key through the display and back into storage', () => {
    const { g, events } = inCourt();
    const owner = courtDef(g.content).court?.displayOwner ?? '';
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'herb', 2);
      addItem(ctx, 'player', 'herb', 1, 'test', { sedTier: 1 });
    });
    expect(
      run(g, events, 'city.display_put', { itemId: 'herb', qualifiers: { sedTier: 1 } }).ok,
    ).toBe(true);
    expect(stackCount(holdingOf(g.world, owner), 'herb', { sedTier: 1 })).toBe(1);
    expect(stackCount(holdingOf(g.world, 'player'), 'herb', {})).toBe(2);
    const entry = displayEntries(g.world)[0];
    expect(entry?.qualifiers).toEqual({ sedTier: 1 });
    expect(run(g, events, 'city.display_take', { entryId: entry?.id ?? '' }).ok).toBe(true);
    g.step(TICKS_PER_GAME_DAY + TICKS_PER_GAME_HOUR);
    expect(stackCount(holdingOf(g.world, STORE), 'herb', { sedTier: 1 })).toBe(1);
    expect(countItem(g.world, owner, 'herb')).toBe(0);
  });

  it('starts a take-down only with room in storage, and holds that room back', () => {
    const { g, events } = inCourt();
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'grain', 210);
      addItem(ctx, 'player', 'herb', 1);
    });
    expect(run(g, events, 'city.display_put', { itemId: 'herb' }).ok).toBe(true);
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: 'grain', count: 200 }).ok).toBe(
      true,
    );
    const entry = displayEntries(g.world)[0];
    expect(run(g, events, 'city.display_take', { entryId: entry?.id ?? '' }).code).toBe(
      'storage_full',
    );
    expect(entry?.takeDue).toBeUndefined();
    expect(run(g, events, 'city.withdraw', { siteId: COURT, itemId: 'grain', count: 1 }).ok).toBe(
      true,
    );
    expect(run(g, events, 'city.display_take', { entryId: entry?.id ?? '' }).ok).toBe(true);
    // the freed unit is held for the piece coming down
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: 'grain', count: 1 }).code).toBe(
      'storage_full',
    );
    g.step(TICKS_PER_GAME_DAY + TICKS_PER_GAME_HOUR);
    expect(countItem(g.world, STORE, 'herb')).toBe(1);
    expect(courtView(g.world, g.content)?.storage).toEqual({ used: 200, cap: 200 });
  });

  it('a displayed piece turns no item key: the door reads only the player', () => {
    const content = buildContent();
    const keyDoor = door('shown', {
      keys: [{ type: 'item', itemId: 'crystal_carapace', label: 'carapace' }],
    });
    content.doors = [...content.doors, keyDoor];
    const { g, events } = inCourt({ content, chain: DOOR_CHAIN });
    withCtx(g, (ctx) => addItem(ctx, 'player', 'crystal_carapace', 1));
    expect(keysMet(g.world, keyDoor, g.content)).toBe(true);
    expect(run(g, events, 'city.display_put', { itemId: 'crystal_carapace' }).ok).toBe(true);
    expect(keysMet(g.world, keyDoor, g.content)).toBe(false);
    expect(run(g, events, 'doors.open', { doorId: 'shown' }).code).toBe('no_key');
  });

  it('counts tainted pieces in the court as a view field only', () => {
    const { g, events } = inCourt();
    const tainted = g.content.items.find((i) => i.tags?.includes('tainted'));
    if (!tainted) throw new Error('no tainted item');
    withCtx(g, (ctx) => addItem(ctx, 'player', tainted.id, 4));
    expect(courtView(g.world, g.content)?.tainted).toBe(0);
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: tainted.id, count: 2 }).ok).toBe(
      true,
    );
    expect(run(g, events, 'city.display_put', { itemId: tainted.id }).ok).toBe(true);
    // two stored and one displayed count; the one still in the pack does not
    expect(countItem(g.world, 'player', tainted.id)).toBe(1);
    expect(courtView(g.world, g.content)?.tainted).toBe(3);
  });
});

describe('garden and the granary expansion (feature.court_expansion_1)', () => {
  function placeGarden(g: Engine, events: AnyWorldEvent[]) {
    const spot = findSpot(g.world, g.content, COURT, 'court_garden');
    if (!spot) throw new Error('no spot for a garden');
    return run(g, events, 'city.place', { siteId: COURT, defId: 'court_garden', ...spot });
  }

  it('caps the plots by tier (3, then 5) and grows 2 herb and 2 grain a plot a day', () => {
    const { g, events } = inCourt();
    withCtx(g, (ctx) => addItem(ctx, 'player', 'wood', 50));
    // a blight on the court's key: the court's output ignores modifiers (immuneToModifiers)
    for (const target of ['harvest', 'production'] as const)
      expect(
        run(g, events, 'modifier.register', {
          target,
          key: COURT,
          factor: 0,
          untilTick: g.world.meta.tick + 10 * TICKS_PER_GAME_DAY,
          source: 'test',
          visibility: 'public',
          note: 'blight',
        }).ok,
      ).toBe(true);
    for (let i = 0; i < 3; i++) expect(placeGarden(g, events).ok).toBe(true);
    const limit = previewPlacement(g.world, g.content, COURT, 'court_garden', 15, 22);
    expect(limit).toMatchObject({ ok: false, code: 'limit' });
    expect(!limit.ok && limit.reason).toMatchObject({ params: { max: 3 } });
    setFlag(g, events, EXPANSION, true);
    expect(placeGarden(g, events).ok).toBe(true);
    expect(placeGarden(g, events).ok).toBe(true);
    const capped = previewPlacement(g.world, g.content, COURT, 'court_garden', 15, 22);
    expect(!capped.ok && capped.reason).toMatchObject({ params: { max: 5 } });
    expect(courtView(g.world, g.content)?.limits).toEqual([
      { buildingId: 'court_garden', built: 5, max: 5 },
    ]);
    // once built, each plot gives 2 herb and 2 grain a day
    const day = () => Math.floor(g.world.meta.tick / TICKS_PER_GAME_DAY);
    g.step((day() + 2) * TICKS_PER_GAME_DAY + 30 * TICKS_PER_GAME_MINUTE - g.world.meta.tick);
    const site = g.world.slices.city.sites[COURT];
    expect(site?.buildings.filter((b) => b.status === 'active').length).toBe(5);
    const herb = countItem(g.world, STORE, 'herb');
    const grain = countItem(g.world, STORE, 'grain');
    g.step(3 * TICKS_PER_GAME_DAY);
    expect(countItem(g.world, STORE, 'herb') - herb).toBe(5 * 2 * 3);
    expect(countItem(g.world, STORE, 'grain') - grain).toBe(5 * 2 * 3);
  });

  it('adds the cabinet of 6 and the second-level store of 1,200 with the flag', () => {
    const { g, events } = inCourt();
    const site = g.world.slices.city.sites[COURT];
    if (!site) throw new Error('no court site');
    const store: BuildingInstance = {
      id: 'bld_test_store',
      defId: 'court_store',
      x: 30,
      y: 19,
      w: 2,
      h: 2,
      status: 'active',
      progress: 2,
      condition: 100,
      workers: 0,
      placedDay: 0,
      placedBy: 'player',
    };
    site.buildings.push(store);
    expect(courtTier(courtDef(g.content), g.world.meta.flags)?.id).toBe('initial');
    expect(courtView(g.world, g.content)?.storage.cap).toBe(200 + 300);
    withCtx(g, (ctx) => addItem(ctx, 'player', 'grain', 600));
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: 'grain', count: 500 }).ok).toBe(
      true,
    );
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: 'grain', count: 1 }).code).toBe(
      'storage_full',
    );
    setFlag(g, events, EXPANSION, true);
    const view = courtView(g.world, g.content);
    expect(view?.tier).toBe('granary');
    expect(view?.storage.cap).toBe(200 + 1200);
    expect(view?.display.cases).toEqual([
      { id: 'shelf', slots: 3, used: 0 },
      { id: 'cabinet', slots: 6, used: 0 },
    ]);
    expect(run(g, events, 'city.deposit', { siteId: COURT, itemId: 'grain', count: 100 }).ok).toBe(
      true,
    );
    withCtx(g, (ctx) => addItem(ctx, 'player', 'herb', 10));
    for (let i = 0; i < 9; i++)
      expect(run(g, events, 'city.display_put', { itemId: 'herb' }).ok).toBe(true);
    expect(run(g, events, 'city.display_put', { itemId: 'herb' }).code).toBe('display_full');
    expect(displayEntries(g.world).filter((e) => e.caseId === 'cabinet').length).toBe(6);
    // the settlement has no court block: its limits stay the building's own
    const outpost = g.content.city_sites.find((s) => s.id === OUTPOST);
    expect(outpost && courtTier(outpost, g.world.meta.flags)).toBeUndefined();
  });

  it('reads an older save without the new court fields', () => {
    const first = game();
    const old = JSON.parse(JSON.stringify(first.g.world)) as typeof first.g.world;
    const court = old.slices.city.court as { display?: unknown; lastEnterTick?: unknown };
    delete court.display;
    delete court.lastEnterTick;
    expect(Object.keys(old.slices.city.court)).toEqual(['returnTo']);
    const g = Engine.resume(old, first.g.content, first.g.systems);
    const events: AnyWorldEvent[] = [];
    g.onEvents((evs) => {
      for (const e of evs) events.push(e);
    });
    expect(displayEntries(g.world)).toEqual([]);
    expect(courtView(g.world, g.content)?.door.cooldownLeft).toBe(0);
    setFlag(g, events, 'feature.inner_court', true);
    teleport(g, events, OUTPOST, AT_DOOR);
    expect(run(g, events, 'city.enter_court', {}).ok).toBe(true);
    withCtx(g, (ctx) => addItem(ctx, 'player', 'herb', 1));
    expect(run(g, events, 'city.display_put', { itemId: 'herb' }).ok).toBe(true);
  });
});
