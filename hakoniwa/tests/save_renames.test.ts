// The rename table (release_engineering.md 5.5, 7.6 and 10.4, PK-M0-18): the shipped
// data/registry/renames.json is sound and carries every alias of the variable registry;
// the rename engine lands each alias spelling on the name the registry itself resolves;
// every entry, written into a save under its old id, loads with no trace of the old id;
// removed ids fold into money by their refund; entries apply by rename version; a second
// pass changes nothing.

import { describe, expect, it } from 'vitest';
import type { ContentMap, FlagValue } from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import { defaultRegistry, type FlagRegistry } from '../src/core/registry';
import {
  applyRenames,
  ContainerBackend,
  checkRenameTable,
  type FlagRename,
  type FlagValueRename,
  type IdField,
  type IdRename,
  loadSlot,
  MemoryStorage,
  migrateSnapshot,
  RENAME_VERSION,
  RENAMES,
  type RenameEntry,
  RenameSet,
  type RenameTable,
  RunSaver,
  registryRenames,
  serializeWorld,
} from '../src/core/save';
import type { World } from '../src/core/world';

const REGISTRY = defaultRegistry();
const RUN = 'r-0123abcd';

/** Keys tried for the slots of a pattern until the registry resolves the name. */
const SAMPLE_KEYS = [
  'oola',
  'yui',
  'eluen',
  'merca',
  'north',
  'east',
  'bs_chapel',
  'chapel',
  'academy',
  'lotha',
  'answers',
  'courtyard_object',
  'talent_sight',
  'founding',
  'mudlane',
  'free',
  'blade',
  'appraise',
  'lb_report_978_copy',
  'awakened',
  'dead',
  'q_a1_m01_fall',
  'stage',
  'k3',
  'E01',
  'dian_known',
];

const slots = (p: string): string[] => p.match(/<[^<>]+>/g) ?? [];

function fill(pattern: string, keys: readonly string[]): string {
  let i = 0;
  return pattern.replace(/<[^<>]+>/g, () => keys[i++] ?? '');
}

/** A concrete spelling of a pattern the registry resolves as a plain rename, or null. */
function instance(pattern: string, reg: FlagRegistry = REGISTRY): string | null {
  const n = slots(pattern).length;
  if (n === 0) return pattern;
  const tries: string[][] = n === 1 ? SAMPLE_KEYS.map((k) => [k]) : [];
  if (n === 2) for (const a of SAMPLE_KEYS) for (const b of SAMPLE_KEYS) tries.push([a, b]);
  for (const keys of tries) {
    const name = fill(pattern, keys);
    const r = reg.resolve(name);
    if (r?.alias && r.condition === null && !r.name.includes('<')) return name;
  }
  return null;
}

/** A registered member of a value-alias key (`prefix.*` names a family). */
function member(flag: string): string {
  if (!flag.endsWith('.*')) return flag;
  const fam = REGISTRY.data.families.find((f) => f.name.replace(/<[^<>]+>.*$/, '*') === flag);
  if (!fam) throw new Error(`no family for ${flag}`);
  return fill(
    fam.name,
    fam.slots.map((s) => s.keys?.[0] ?? 'oola'),
  );
}

function kernelWorld(): World {
  const e = Engine.create(7, {} as ContentMap, [], { aiMode: 'off' });
  e.step(3);
  return e.world;
}

function same(a: RenameEntry, b: RenameEntry): boolean {
  const { since: _a, ...x } = a;
  const { since: _b, ...y } = b;
  return JSON.stringify(x, Object.keys(x).sort()) === JSON.stringify(y, Object.keys(y).sort());
}

// ---------------------------------------------------------------------------

describe('the shipped rename table', () => {
  it('is sound and gives the rename version saves are written with', () => {
    expect(checkRenameTable(RENAMES)).toEqual([]);
    expect(RENAME_VERSION).toBe(RENAMES.version);
    expect(RENAME_VERSION).toBeGreaterThanOrEqual(1);
    expect(RENAMES.entries.length).toBeGreaterThan(300);
  });

  it('carries every alias of the variable registry (append missing ones with a new version)', () => {
    const want = registryRenames(REGISTRY, RENAME_VERSION);
    const missing = want.filter((w) => !RENAMES.entries.some((e) => same(e, w)));
    expect(
      missing,
      `add to data/registry/renames.json:\n${missing.map((m) => JSON.stringify(m)).join(',\n')}`,
    ).toEqual([]);
    // Version 1 is the registry migration: flag spellings, id keys, quest ids, values.
    const kinds = new Set(RENAMES.entries.map((e) => e.kind));
    for (const k of ['flag', 'flag_value', 'quest', 'npc', 'faction'])
      expect(kinds.has(k)).toBe(true);
  });

  it('rejects malformed tables', () => {
    const bad = (entries: unknown[], version = 2) => checkRenameTable({ version, entries });
    expect(bad([{ since: 3, kind: 'item', from: 'a', to: 'b' }])[0]).toMatch(/since/);
    expect(
      bad([
        { since: 1, kind: 'item', from: 'a', to: 'b' },
        { since: 2, kind: 'item', from: 'a', to: 'c' },
      ])[0],
    ).toMatch(/duplicate/);
    expect(
      bad([
        { since: 1, kind: 'item', from: 'a', to: 'b' },
        { since: 2, kind: 'item', from: 'b', to: 'c' },
      ])[0],
    ).toMatch(/renamed again/);
    expect(bad([{ since: 1, kind: 'item', from: 'a', to: 'b', removed: true }])[0]).toMatch(
      /removed and renamed/,
    );
    expect(bad([{ since: 1, kind: 'item', from: 'a', to: 'b', refund: { copper: 1 } }])[0]).toMatch(
      /refund without removed/,
    );
    expect(bad([{ since: 1, kind: 'flag', from: 'a', to: 'b.<x>' }])[0]).toMatch(/unfilled/);
    expect(bad([{ since: 1, kind: 'flag_value', flag: 'a', from: 'x' }])[0]).toMatch(/flag_value/);
    expect(
      bad([
        { since: 1, kind: 'flag_value', flag: 'f', from: 'x', to: 'y' },
        { since: 1, kind: 'flag_value', flag: 'f', from: 'y', to: 'z' },
      ])[0],
    ).toMatch(/renamed again/);
    expect(checkRenameTable({ version: -1, entries: [] })).toEqual(['bad version']);
  });
});

describe('the rename engine agrees with the registry', () => {
  const set = new RenameSet(RENAMES, 0, REGISTRY);

  /** Every spelling the registry knows as an alias of something else. */
  function spellings(): string[] {
    const out = new Set<string>();
    const data = REGISTRY.data;
    for (const v of [...data.vars, ...data.families]) {
      for (const a of v.aliases) {
        const eq = a.indexOf('=');
        const from = eq > 0 ? a.slice(0, eq) : a;
        const name = instance(from);
        if (name) out.add(name);
      }
    }
    for (const p of data.patternAliases) {
      const name = instance(p.from);
      if (name) out.add(name);
    }
    for (const c of data.conversions) {
      const name = instance(c.from);
      if (name) out.add(name);
    }
    // Key aliases and old quest ids inside family names.
    const keyed: [string, Record<string, string>][] = [
      ...Object.entries(data.keyAliases),
      ['quest', data.questIds],
    ];
    for (const f of data.families) {
      f.slots.forEach((slot, i) => {
        const domain = slot.domain ?? slot.name;
        for (const [d, table] of keyed) {
          if (d !== domain) continue;
          for (const old of Object.keys(table)) {
            const keys = f.slots.map((s, j) => (j === i ? old : (s.keys?.[0] ?? 'oola')));
            out.add(fill(f.name, keys));
          }
        }
      });
    }
    return [...out].sort();
  }

  it('lands every alias spelling on the registry name, with its conversion', () => {
    const names = spellings();
    expect(names.length).toBeGreaterThan(400);
    let renamed = 0;
    for (const name of names) {
      const r = REGISTRY.resolve(name);
      const step = set.renameFlag(name);
      if (!r?.alias || r.condition !== null || r.name.includes('<')) {
        expect(step, name).toBeNull();
        continue;
      }
      expect(step?.name, name).toBe(r.name);
      const v = 10;
      const converted = step ? v * step.scale + step.offset : v;
      expect(converted, name).toBe(REGISTRY.canonicalWrite(r, v));
      renamed++;
    }
    expect(renamed).toBeGreaterThan(400);
  });

  it('leaves registered names alone and maps value aliases like the registry', () => {
    for (const v of REGISTRY.data.vars.slice(0, 200)) expect(set.renameFlag(v.name)).toBeNull();
    // Condition aliases read a condition; there is no value to move under a new name.
    for (const name of ['bond.oola.20', 'bond.yui.40']) {
      expect(REGISTRY.resolve(name)?.condition, name).not.toBeNull();
      expect(set.renameFlag(name), name).toBeNull();
    }
    for (const [flag, table] of Object.entries(REGISTRY.data.valueAliases)) {
      const name = member(flag);
      expect(REGISTRY.isCanonical(name), name).toBe(true);
      for (const from of Object.keys(table)) {
        expect(set.flagValue(name, from), `${name} ${from}`).toBe(
          REGISTRY.canonicalValue(name, from),
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------

/** Ids of every kind, held the ways a slice holds them (declared like a system would). */
const PROBE_FIELDS: IdField[] = [
  { path: 'byKey.@keys', kind: 'quest' },
  { path: 'list.*', kind: 'quest' },
  { path: 'records.*.id', kind: 'quest' },
  { path: 'npcs.@keys', kind: 'npc' },
  { path: 'factions.*', kind: 'faction' },
];

describe('every entry loads with no trace of its old id', () => {
  /**
   * One save per entry through the container, read back by the loader with a probe slice
   * owner (the production default has no owners until the systems declare idFields).
   */
  async function roundTrip(world: World, owners = [{ id: 'probe', idFields: PROBE_FIELDS }]) {
    const backend = new ContainerBackend(new MemoryStorage(), {
      now: () => 0,
      writer: { id: 'w-test', name: 'test' },
      autoCollect: false,
    });
    const saver = new RunSaver({
      backend,
      runId: RUN,
      versions: { gameVersion: 'test', contentVersion: 'c-test', renameVersion: 0, build: 'test' },
    });
    const res = await saver.save(
      { world, drainLog: () => [] },
      { slot: 'quick', savedAt: '2026-11-16T00:00:00.000Z', summary: { act: '', map: '' } },
    );
    if (!res.ok) throw new Error(res.reason);
    const { createMigrator } = await import('../src/core/save');
    return (await loadSlot(backend, 'quick', createMigrator({ owners }))).world;
  }

  it('flag entries: the old spelling is gone, the new one holds the converted value', async () => {
    const flags = RENAMES.entries.filter((e): e is FlagRename => e.kind === 'flag');
    let checked = 0;
    for (const e of flags) {
      const old = instance(e.from);
      if (!old) continue;
      const step = new RenameSet(RENAMES, 0, REGISTRY).renameFlag(old);
      if (!step) continue; // an alias shadowed by an earlier one with the same spelling
      const w = kernelWorld();
      w.meta.flags[old] = 12;
      w.recent.push({
        kind: 'flag.changed',
        tick: 1,
        seq: 1,
        data: { key: old, value: 12, previous: 2 },
      });
      const out = await roundTrip(w);
      expect(Object.keys(out.meta.flags), old).not.toContain(old);
      expect(out.meta.flags[step.name], old).toBe(12 * step.scale + step.offset);
      const ev = out.recent.find((x) => x.kind === 'flag.changed');
      expect(ev?.kind === 'flag.changed' && ev.data.key, old).toBe(step.name);
      checked++;
    }
    expect(checked).toBeGreaterThan(280);
  }, 120_000);

  it('id entries: gone from flag names and from every declared slice field', async () => {
    const ids = RENAMES.entries.filter(
      (e): e is IdRename => e.kind !== 'flag' && e.kind !== 'flag_value',
    );
    expect(ids.length).toBeGreaterThan(40);
    for (const e of ids) {
      const w = kernelWorld();
      const family = REGISTRY.data.families.find((f) =>
        f.slots.some(
          (s) => (s.domain ?? s.name) === e.kind && (!s.keys || s.keys.includes(e.to as string)),
        ),
      );
      const flagName = family
        ? fill(
            family.name,
            family.slots.map((s) =>
              (s.domain ?? s.name) === e.kind ? e.from : (s.keys?.[0] ?? 'oola'),
            ),
          )
        : null;
      if (flagName) w.meta.flags[flagName] = 3;
      const slot: Record<string, unknown> = {};
      if (e.kind === 'quest') {
        slot.byKey = { [e.from]: { stage: 2 } };
        slot.list = ['keep', e.from];
        slot.records = [{ id: e.from }];
      } else if (e.kind === 'npc') {
        slot.npcs = { [e.from]: 1 };
      } else if (e.kind === 'faction') {
        slot.factions = { a: e.from };
      }
      (w.slices as unknown as Record<string, unknown>).probe = slot;
      const out = await roundTrip(w);
      const text = JSON.stringify([
        out.meta.flags,
        (out.slices as unknown as Record<string, unknown>).probe,
      ]);
      expect(
        text.includes(`"${e.from}"`) ||
          text.includes(`.${e.from}"`) ||
          text.includes(`.${e.from}.`),
        `${e.kind} ${e.from}`,
      ).toBe(false);
      expect(text, `${e.kind} ${e.from}`).toContain(e.to as string);
    }
  }, 120_000);

  it('flag_value entries: the old spelling of the value is gone', async () => {
    const values = RENAMES.entries.filter((e): e is FlagValueRename => e.kind === 'flag_value');
    expect(values.length).toBeGreaterThan(50);
    for (const e of values) {
      const name = member(e.flag);
      const w = kernelWorld();
      w.meta.flags[name] = e.from;
      const out = await roundTrip(w);
      expect(out.meta.flags[name], `${name} ${e.from}`).toBe(e.to);
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------

describe('removed ids, versions and conflicts', () => {
  const TABLE: RenameTable = {
    version: 3,
    entries: [
      { since: 2, kind: 'item', from: 'old_blade', to: 'eq_new_blade' },
      {
        since: 3,
        kind: 'item',
        from: 'sample_retired_item',
        removed: true,
        refund: { copper: 12 },
      },
      { since: 3, kind: 'item', from: 'free_gift', removed: true },
      { since: 2, kind: 'flag', from: 'old_counter', to: 'new_counter', scale: 2, offset: 1 },
    ],
  };
  const NAMES = { isCanonical: (n: string) => n === 'new_counter' || n === 'kept' };
  const INVENTORY: IdField[] = [
    { path: 'owners.*.items.@keys', kind: 'item', refund: { money: 'money' }, merge: 'sum' },
    { path: 'owners.*.equipped.*', kind: 'item', refund: { money: 'money' } },
  ];

  interface Inventory {
    owners: Record<
      string,
      { money: number; items: Record<string, number>; equipped: Record<string, string> }
    >;
  }

  function world(): World {
    const w = kernelWorld();
    w.meta.flags.old_counter = 5;
    w.meta.flags.kept = true;
    (w.slices as unknown as Record<string, unknown>).inventory = {
      owners: {
        player: {
          money: 100,
          items: { old_blade: 1, sample_retired_item: 2, potion: 3, free_gift: 4 },
          equipped: { main: 'sample_retired_item', off: 'old_blade' },
        },
      },
    };
    return w;
  }

  it('folds removed items into money by their refund and renames the rest', () => {
    const w = world();
    const report = applyRenames(w, new RenameSet(TABLE, 0, NAMES), [
      { slice: 'inventory', fields: INVENTORY },
    ]);
    const inv = (w.slices as unknown as Record<string, Inventory>).inventory.owners.player;
    expect(inv.items).toEqual({ eq_new_blade: 1, potion: 3 });
    expect(inv.equipped).toEqual({ off: 'eq_new_blade' });
    expect(inv.money).toBe(100 + 12 * 2 + 12 * 1);
    expect(report.removed.map((r) => [r.id, r.count, r.refunded])).toEqual([
      ['sample_retired_item', 2, 24],
      ['free_gift', 4, 0],
      ['sample_retired_item', 1, 12],
    ]);
    expect(w.meta.flags).toMatchObject({ new_counter: 11, kept: true });
    expect(w.meta.flags.old_counter).toBeUndefined();
    expect(JSON.stringify(w)).not.toMatch(/old_blade|sample_retired_item|free_gift|old_counter/);
  });

  it('applies only the entries newer than the save', () => {
    const at2 = world();
    applyRenames(at2, new RenameSet(TABLE, 2, NAMES), [{ slice: 'inventory', fields: INVENTORY }]);
    const inv = (at2.slices as unknown as Record<string, Inventory>).inventory.owners.player;
    expect(inv.items).toEqual({ old_blade: 1, potion: 3 });
    expect(at2.meta.flags.old_counter).toBe(5);
    const at3 = world();
    const r3 = applyRenames(at3, new RenameSet(TABLE, 3, NAMES), [
      { slice: 'inventory', fields: INVENTORY },
    ]);
    expect([r3.flags, r3.ids, r3.removed.length]).toEqual([0, 0, 0]);
    expect(JSON.stringify(at3)).toBe(JSON.stringify(world()));
  });

  it('keeps a flag set under its current name over an old spelling, and counts meet', () => {
    const w = kernelWorld();
    w.meta.flags.old_counter = 5;
    w.meta.flags.new_counter = 40;
    (w.slices as unknown as Record<string, unknown>).inventory = {
      owners: { p: { money: 0, items: { old_blade: 2, eq_new_blade: 1 }, equipped: {} } },
    };
    const report = applyRenames(w, new RenameSet(TABLE, 0, NAMES), [
      { slice: 'inventory', fields: INVENTORY },
    ]);
    expect(w.meta.flags.new_counter).toBe(40);
    expect(report.conflicts).toEqual(['old_counter -> new_counter']);
    expect((w.slices as unknown as Record<string, Inventory>).inventory.owners.p.items).toEqual({
      eq_new_blade: 3,
    });
  });

  it('drops flags naming a removed id, renames ids in other events, and keeps a non-count meeting', () => {
    const w = kernelWorld();
    w.meta.flags['has.sample_retired_item'] = true;
    w.meta.flags['has.potion'] = true;
    w.recent.push({
      kind: 'command.result',
      tick: 2,
      seq: 2,
      data: { kind: 'x', ok: true, reason: 'old_blade', source: { type: 'player' } },
    });
    (w.slices as unknown as Record<string, unknown>).bonds = {
      trust: { old_blade: 30, eq_new_blade: 70 },
    };
    const names = { isCanonical: (n: string) => n.startsWith('has.') };
    const report = applyRenames(w, new RenameSet(TABLE, 0, names), [
      { slice: 'bonds', fields: [{ path: 'trust.@keys', kind: 'item' }] },
    ]);
    expect(w.meta.flags['has.sample_retired_item']).toBeUndefined();
    expect(w.meta.flags['has.potion']).toBe(true);
    expect(report.removed).toContainEqual({
      kind: 'flag',
      id: 'sample_retired_item',
      at: 'meta.flags.has.sample_retired_item',
      count: 1,
      refunded: 0,
    });
    const ev = w.recent.at(-1);
    expect(ev?.kind === 'command.result' && ev.data.reason).toBe('eq_new_blade');
    // Without merge 'sum' the entry already under the new name is kept.
    expect((w.slices as unknown as Record<string, unknown>).bonds).toEqual({
      trust: { eq_new_blade: 70 },
    });
    expect(report.conflicts).toEqual(['slices.bonds.trust.@keys: eq_new_blade kept']);
  });

  it('changes nothing on a second pass (old ids never come back)', async () => {
    const { readFileSync } = await import('node:fs');
    const { gunzipSync } = await import('node:zlib');
    const text = gunzipSync(readFileSync(`${__dirname}/fixtures/saves/v1/r0_act2.hks`)).toString(
      'utf8',
    );
    const once = migrateSnapshot(text, 0);
    expect(once.report.renames.flags).toBeGreaterThan(20);
    const twice = migrateSnapshot(serializeWorld(once.world), 0);
    expect(twice.report.renames.flags).toBe(0);
    expect(twice.report.renames.values).toBe(0);
    expect(serializeWorld(twice.world)).toBe(serializeWorld(once.world));
  });

  it('converts the values of renamed numeric aliases and canonical enum spellings', () => {
    const w = kernelWorld();
    const flags: Record<string, FlagValue> = {
      merca_favor: 2,
      a5_purge_route: '众生',
      'prologue.answers': 'E1',
    };
    Object.assign(w.meta.flags, flags);
    applyRenames(w, new RenameSet(RENAMES, 0, REGISTRY));
    const r = REGISTRY.resolve('merca_favor');
    expect(r?.name).toBe('goddess.merca.relation');
    expect(w.meta.flags['goddess.merca.relation']).toBe(REGISTRY.canonicalWrite(r as never, 2));
    expect(w.meta.flags.a5_purge_route).toBe('people');
    expect(w.meta.flags.p_answers).toBe('E1');
  });
});
