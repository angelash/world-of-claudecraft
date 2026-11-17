// The records slice across saves (PK-M1-48; release_engineering.md 5.5): a save round trip
// through the loader (migrate, renames, validateWorld with the records slice check) plays on
// exactly like the run that never stopped, a letter on the road included; a save from
// before the records system loads, validates and gets its slice on first use with the
// retroactive grants; the slice check refuses broken slices; renamed content ids reach the
// slice through its idFields; and the act 1 count's letter of the shipped content picks its
// wording from the world when it is sent.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as recordsPack } from '../src/content/packs/records';
import { pack as worldPack } from '../src/content/packs/world';
import type { CommandSource, ContentMap, FlagValue } from '../src/core/contracts';
import {
  migrateSnapshot,
  RENAME_VERSION,
  RENAMES,
  type SliceOwner,
  serializeWorld,
  validateWorld,
  worldHash,
} from '../src/core/save';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import type { World } from '../src/core/world';
import { createGame, resumeGame } from '../src/game/create';
import { system as inventory } from '../src/systems/inventory';
import {
  type DeedDef,
  emptyRecordsSlice,
  inbox,
  type LetterDef,
  readRecords,
  system as records,
  validateRecordsSlice,
} from '../src/systems/records';
import { system as world } from '../src/systems/world';

const SCRIPT: CommandSource = { type: 'script', script: 'test' };
const OWNERS: SliceOwner[] = [records];

const DEEDS: DeedDef[] = [
  { id: 'deed_grow_one', name: '一', cls: 'grow', act: 1, fame: 5, when: 'a1_guild_registered' },
  {
    id: 'deed_grow_two',
    name: '二',
    cls: 'grow',
    act: 1,
    fame: 10,
    when: 'a1_ash_met',
    reward: { pillar: true },
  },
];
const LETTERS: LetterDef[] = [
  {
    id: 'ltr_a1_road',
    act: 1,
    senderName: '远方',
    seal: 'private',
    subject: '路上的信',
    transitHours: 5,
    deliver: { when: 'a1_ash_met' },
    body: [{ id: 'p1', text: '一路平安' }],
  },
];
const FIXTURE: ContentPack = {
  id: 'records_save_fixture',
  tables: {
    deeds: DEEDS,
    titles: [],
    codexEntries: [],
    letters: LETTERS,
    recordsConfig: recordsPack.tables.recordsConfig,
  },
};

function merge(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs) {
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  }
  return out as unknown as ContentMap;
}

const CONTENT = merge([worldPack, invPack, FIXTURE]);
const SYSTEMS = [world, inventory, records];

function game(content = CONTENT) {
  return createGame({ seed: 9, content, systems: SYSTEMS, flagPolicy: 'throw' });
}

function setFlags(g: ReturnType<typeof game>, flags: Record<string, FlagValue>): void {
  for (const [key, value] of Object.entries(flags)) g.queue('flag.set', { key, value }, SCRIPT);
}

/** Save and load through the loader, as a slot load does. */
function roundTrip(w: World): World {
  const { world: loaded } = migrateSnapshot(serializeWorld(w), RENAME_VERSION, { owners: OWNERS });
  return loaded;
}

describe('save round trip', () => {
  it('validates, keeps the hash, and plays on like the run that never stopped', () => {
    const live = game();
    setFlags(live, { a1_guild_registered: true, a1_ash_met: true });
    live.step(3);
    live.queue('records.title.wear', { titleId: null });
    live.step(1);
    const before = readRecords(live.world);
    expect(before?.letters.ltr_a1_road?.state).toBe('transit');
    expect(Object.keys(before?.deeds ?? {}).sort()).toEqual(['deed_grow_one', 'deed_grow_two']);

    const loaded = roundTrip(structuredClone(live.world));
    expect(validateWorld(loaded, OWNERS)).toEqual([]);
    expect(worldHash(loaded)).toBe(worldHash(live.world));

    const resumed = resumeGame(loaded, { content: CONTENT, systems: SYSTEMS, flagPolicy: 'throw' });
    const ticks = 5 * TICKS_PER_GAME_HOUR + 10;
    live.step(ticks);
    resumed.step(ticks);
    expect(readRecords(resumed.world)?.letters.ltr_a1_road?.state).toBe('delivered');
    expect(worldHash(resumed.world)).toBe(worldHash(live.world));
    expect(inbox(resumed.world, resumed.content).map((l) => l.id)).toEqual(['ltr_a1_road']);
  });

  it('loads a save from before the records system and grants what its world already earned', () => {
    const g = game();
    setFlags(g, { a1_guild_registered: true });
    g.step(3);
    const old = structuredClone(g.world);
    delete (old.slices as { records?: unknown }).records;
    const loaded = roundTrip(old);
    expect(validateWorld(loaded, OWNERS)).toEqual([]);
    expect(readRecords(loaded)).toBeUndefined();
    const resumed = resumeGame(loaded, { content: CONTENT, systems: SYSTEMS, flagPolicy: 'throw' });
    resumed.step(1);
    const s = readRecords(resumed.world);
    expect(Object.keys(s?.deeds ?? {})).toEqual(['deed_grow_one']);
    expect(resumed.world.meta.flags['deed.deed_grow_one']).toBe(true);
  });

  it('grants the act 1 deeds and titles retroactively on the frozen act 2 sample', () => {
    const raw = gunzipSync(
      readFileSync(join(__dirname, 'fixtures', 'saves', 'v1', 'act2.hks')),
    ).toString('utf8');
    const { world: w } = migrateSnapshot(raw, 1, { owners: OWNERS });
    expect(validateWorld(w, OWNERS)).toEqual([]);
    expect(readRecords(w)).toBeUndefined();
    const g = resumeGame(w, { seed: 20261115, aiMode: 'off' });
    g.step(2);
    const s = readRecords(g.world);
    // the sample's world: registered, the tide held, the dream seen; Oola convicted
    expect(Object.keys(s?.deeds ?? {}).sort()).toEqual([
      'deed_grow_dream_door',
      'deed_grow_registered',
      'deed_hunt_tide_night',
    ]);
    expect(Object.keys(s?.titles ?? {}).sort()).toEqual([
      'title_guild_f_handwritten',
      'title_street_f_oddball',
    ]);
    // the codex starts from what the save already shows: the scenes seen, the items held
    const seen = Object.keys(w.meta.flags).filter(
      (k) => k.startsWith('scene.') && k.endsWith('.seen') && w.meta.flags[k] === true,
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(Object.keys(s?.codex.memories ?? {}).sort()).toEqual(
      seen.map((k) => k.slice(6, -5)).sort(),
    );
    const held = Object.entries(w.slices.inventory.owners[w.slices.world.playerId]?.items ?? {});
    expect(held.length).toBeGreaterThan(0);
    for (const [item, n] of held)
      expect(s?.codex.items[item]?.count, item).toBeGreaterThanOrEqual(n);
    expect(validateWorld(g.world, OWNERS)).toEqual([]);
  }, 120_000);
});

describe('a content update', () => {
  it('re-checks a loaded save once when the records content changed, never otherwise', () => {
    const g = game();
    setFlags(g, { a1_guild_registered: true, a1_martha_strike: true });
    g.step(3);
    const saved = serializeWorld(g.world);
    // the same content: the loaded world plays on exactly like the live one
    const same = migrateSnapshot(saved, RENAME_VERSION, { owners: OWNERS }).world;
    const sameRun = resumeGame(same, { content: CONTENT, systems: SYSTEMS, flagPolicy: 'throw' });
    sameRun.step(2);
    g.step(2);
    expect(worldHash(sameRun.world)).toBe(worldHash(g.world));
    // a newer build adds a deed whose condition the save already meets
    const added: DeedDef = {
      id: 'deed_feat_added',
      name: '后来才有的事迹',
      cls: 'feat',
      act: 1,
      fame: 0,
      feat: true,
      when: 'a1_martha_strike',
    };
    const newer = merge([
      worldPack,
      invPack,
      { ...FIXTURE, tables: { ...FIXTURE.tables, deeds: [...DEEDS, added] } },
    ]);
    const loaded = migrateSnapshot(saved, RENAME_VERSION, { owners: OWNERS }).world;
    const run = resumeGame(loaded, { content: newer, systems: SYSTEMS, flagPolicy: 'throw' });
    run.step(1);
    expect(readRecords(run.world)?.deeds.deed_feat_added).toBeDefined();
  });
});

describe('the slice check (validateSlice)', () => {
  it('accepts a fresh slice and a missing one, refuses broken shapes', () => {
    expect(validateRecordsSlice(emptyRecordsSlice())).toEqual([]);
    expect(validateRecordsSlice(undefined)).toEqual([]);
    expect(validateRecordsSlice(7)).toEqual(['not an object']);
    const bad = {
      ...emptyRecordsSlice(),
      dirty: 'yes',
      deeds: { deed_x: { tick: -1, grade: 'claimed' } },
      titles: { title_x: { tick: 1, lost: 'soon' } },
      worn: 3,
      pillar: [1],
      codex: { ...emptyRecordsSlice().codex, people: { bron: { first: 0, last: 0 } } },
      letters: { ltr_x: { state: 'lost', sent: 0, arrives: 0, body: [] } },
      mailDue: -2,
    };
    expect(validateRecordsSlice(bad)).toEqual([
      'dirty is not a boolean',
      'deed deed_x is not a record',
      'title title_x is not a record',
      'worn is not a title id or null',
      'pillar holds something other than deed ids',
      'codex.people bron is not a record',
      'letter ltr_x is not a record',
      'mailDue is not a tick or -1',
    ]);
  });

  it('refuses mail that would never arrive, a worn title not held and a missing fingerprint', () => {
    const s = emptyRecordsSlice();
    s.letters.ltr_a1_road = { state: 'transit', sent: 0, arrives: 50, body: [] };
    s.mailDue = 80;
    s.worn = 'title_guild_alpha';
    const bad = { ...s, content: undefined };
    expect(validateRecordsSlice(bad)).toEqual([
      'mailDue is later than a letter on the road',
      'worn is not a held title',
      'content is not a fingerprint',
    ]);
    s.mailDue = 50;
    s.worn = null;
    expect(validateRecordsSlice(s)).toEqual([]);
  });

  it('fails a load whose records slice is broken', () => {
    const g = game();
    g.step(2);
    const w = structuredClone(g.world);
    (w.slices.records as unknown as { deeds: unknown }).deeds = [];
    expect(() => roundTrip(w)).toThrow(/slices.records: deeds is not an object/);
  });
});

describe('renamed content ids (idFields)', () => {
  it('renames a deed id in the slice, the pillar and its mirror flag', () => {
    const renamed: ContentPack = {
      id: 'renamed',
      tables: {
        ...FIXTURE.tables,
        deeds: [DEEDS[0], { ...DEEDS[1], id: 'deed_grow_second' }] as DeedDef[],
      },
    };
    const g = game();
    setFlags(g, { a1_ash_met: true, 'feature.inner_court': true });
    g.step(3);
    g.queue('records.pillar.carve', { deedId: 'deed_grow_two' });
    g.step(1);
    expect(readRecords(g.world)?.pillar).toEqual(['deed_grow_two']);
    const table = {
      version: RENAMES.version + 1,
      entries: [
        ...RENAMES.entries,
        { since: RENAMES.version + 1, kind: 'deed', from: 'deed_grow_two', to: 'deed_grow_second' },
      ],
    };
    const { world: w, report } = migrateSnapshot(serializeWorld(g.world), RENAME_VERSION, {
      owners: OWNERS,
      table,
    });
    const s = readRecords(w);
    expect(Object.keys(s?.deeds ?? {})).toEqual(['deed_grow_second']);
    expect(s?.pillar).toEqual(['deed_grow_second']);
    expect(report.renames.ids).toBe(2);
    // the old flag still fits `deed.<deed>`, so the loader leaves it; the first settle
    // writes the mirror of the new id from the slice
    expect(w.meta.flags['deed.deed_grow_second']).toBeUndefined();
    const tick = s?.deeds.deed_grow_second?.tick;
    const content = merge([worldPack, invPack, renamed]);
    const resumed = resumeGame(w, { content, systems: SYSTEMS, flagPolicy: 'throw' });
    resumed.step(2);
    expect(resumed.world.meta.flags['deed.deed_grow_second']).toBe(true);
    // the renamed world plays on under the renamed content without granting it again
    expect(readRecords(resumed.world)?.deeds.deed_grow_second?.tick).toBe(tick);
  });
});

describe('the count letter of act 1 (act1_borderstone.md 9.4)', () => {
  const content = merge([worldPack, invPack, recordsPack]);

  for (const [credit, moss, para] of [
    ['player', 'arrested', ['credit_player', 'moss_arrested']],
    ['martha', 'fled', ['credit_martha', 'moss_fled']],
    ['light', 'in_power', ['credit_light', 'moss_in_power']],
    ['self_collapse', 'dead', ['credit_collapse', 'moss_dead']],
    ['player', 'puppet', ['credit_player', 'moss_puppet']],
  ] as const) {
    it(`is sent at week 11 with the ${credit} and ${moss} wording`, () => {
      const g = game(content);
      setFlags(g, { a1_bron_sees_mark: true, a1_tide_credit: credit, a1_moss_fate: moss });
      g.step(3);
      expect(readRecords(g.world)?.letters.ltr_a1_count).toBeUndefined();
      setFlags(g, { act_week: 11 });
      g.step(3);
      expect(readRecords(g.world)?.letters.ltr_a1_count).toMatchObject({
        state: 'delivered',
        body: ['salute', 'report', para[0], 'summons', para[1], 'closing'],
      });
      expect(g.world.meta.flags['letter.ltr_a1_count']).toBe('delivered');
      const view = inbox(g.world, g.content)[0];
      expect(view?.sender).toEqual({ key: 'c.letters.ltr_a1_count.sender_name' });
      expect(view?.subject).toEqual({ key: 'c.letters.ltr_a1_count.subject' });
    });
  }

  it('leaves the reeve out when his fate is not settled', () => {
    const g = game(content);
    setFlags(g, { a1_bron_sees_mark: true, a1_tide_credit: 'light', act_week: 12 });
    g.step(3);
    expect(readRecords(g.world)?.letters.ltr_a1_count?.body).toEqual([
      'salute',
      'report',
      'credit_light',
      'summons',
      'closing',
    ]);
  });
});
