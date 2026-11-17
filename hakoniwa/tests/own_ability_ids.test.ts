// Own ability and aura numbering (PK-M1-26: RE-27, D-071; catalog_abilities_talents.md
// 2, 3, 4.5 and 7.3): every ability and aura id of the data is the catalog's `sk_` or
// `aur_` id with the catalog's display name; the rename table registers every old id as
// rename version 2; a save written before the renumbering loads with the new ids wherever
// the combat slice and the combat events hold one, while the payload words that merely
// spell like an old id (the cast op `interrupted`, a warfare hero ability `charge`, the
// item `ash_spirits`) stay; and the act 1 imports of content_act1_abilities_01 (the
// equipment aura, the contract fiend of the abyss pact door, the downed state aura) are in
// the data, wired and usable.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import { pack as combatPack } from '../src/content/packs/combat';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import {
  applyRenames,
  ContainerBackend,
  checkRenameTable,
  createMigrator,
  type IdRename,
  loadSlot,
  MemoryStorage,
  RENAME_VERSION,
  RENAMES,
  RenameSet,
  type RenameTable,
  RunSaver,
  type SliceOwner,
} from '../src/core/save';
import type { SystemContext } from '../src/core/system';
import type { World } from '../src/core/world';
import { COMBAT_ID_FIELDS, system as combat, grantAbility, grantPool } from '../src/systems/combat';
import type { AbilityDef, AuraDef, MonsterDef } from '../src/systems/combat/types';
import { system as doors } from '../src/systems/doors';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { system as world } from '../src/systems/world';
import { extract } from '../tools/content/catalog/mapping';
import { parseTables, rowId } from '../tools/content/catalog/markdown';
import { code, displayName } from '../tools/content/catalog/parsers';
import {
  dataFields,
  deathStateAuras,
  equipmentAuras,
  fiendSkills,
  fiendTemplates,
} from '../tools/content/mappings/abilities_talents';

const ROOT = join(__dirname, '..');
const CATALOG = 'docs/40_design/content/catalog_abilities_talents.md';
const MD = readFileSync(join(ROOT, CATALOG), 'utf8');
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(join(ROOT, 'data', file), 'utf8')) as T;
const ABILITIES = read<AbilityDef[]>('combat/abilities.json');
const AURAS = read<AuraDef[]>('combat/auras.json');
const MONSTERS = read<MonsterDef[]>('combat/monsters.json');

/** The act 1 rows content_act1_abilities_01 imported (catalog 3.3, 4.5 and 7.3). */
const IMPORTED_ABILITIES = ['sk_lok_summonremnant', 'sk_mon_remnantbar', 'sk_mon_remnantquake'];
const IMPORTED_AURAS = ['aur_ember_door', 'aur_st_downed_weak'];
/**
 * Catalog ids later packages import with the system that applies them (catalog 4.5 and 7.7):
 * the rank pressure of one rank and the blood pact (PK-M1-11), the sediment illness and the
 * injuries (PK-M1-51).
 */
const LATER_AURAS = [
  'aur_st_presence_unease',
  'aur_lok_remnantpact',
  'aur_st_sed_spot',
  'aur_st_sed_fever',
  'aur_st_sed_crystal',
  'aur_st_injury_light',
  'aur_st_injury_maimed_arm',
  'aur_st_injury_maimed_leg',
  'aur_st_injury_backlash',
  'aur_st_injury_relapse',
];

interface Mapped {
  from: string;
  to: string;
  name: string;
}

/** The mapping tables of a catalog section (2 for abilities, 3.2 for auras): old id first. */
function catalogMap(section: (path: string[]) => boolean): Mapped[] {
  const out: Mapped[] = [];
  for (const t of parseTables(MD)) {
    if (!section(t.headingPath) || t.headers[0] !== '旧 ID' || t.headers[2] !== '新 ID') continue;
    for (const row of t.rows) {
      const from = rowId(row);
      const to = code(row.cells[2] ?? '');
      const name = displayName(row.cells[3] ?? '');
      if (from && to && name) out.push({ from, to, name });
    }
  }
  return out;
}

const ABILITY_MAP = catalogMap((p) => p.some((h) => /^2\.\d+ /.test(h)));
const AURA_MAP = catalogMap((p) => p.some((h) => h.startsWith('3.2 ')));

describe('the catalog numbering in the data', () => {
  it('maps all 123 abilities and 84 auras of the first round, each to its own new id', () => {
    expect(ABILITY_MAP).toHaveLength(123);
    expect(AURA_MAP).toHaveLength(84);
    expect(new Set(ABILITY_MAP.map((m) => m.from)).size).toBe(123);
    expect(new Set(ABILITY_MAP.map((m) => m.to)).size).toBe(123);
    expect(new Set(AURA_MAP.map((m) => m.from)).size).toBe(84);
    expect(new Set(AURA_MAP.map((m) => m.to)).size).toBe(84);
    expect(ABILITY_MAP.every((m) => m.to.startsWith('sk_'))).toBe(true);
    expect(AURA_MAP.every((m) => m.to.startsWith('aur_'))).toBe(true);
  });

  it('holds exactly the catalog ids plus the act 1 imports, all prefixed', () => {
    expect(ABILITIES.map((a) => a.id).sort()).toEqual(
      [...ABILITY_MAP.map((m) => m.to), ...IMPORTED_ABILITIES].sort(),
    );
    expect(AURAS.map((a) => a.id).sort()).toEqual(
      [...AURA_MAP.map((m) => m.to), ...IMPORTED_AURAS, ...LATER_AURAS].sort(),
    );
    expect(ABILITIES.filter((a) => !a.id.startsWith('sk_'))).toEqual([]);
    expect(AURAS.filter((a) => !a.id.startsWith('aur_'))).toEqual([]);
  });

  it("carries the catalog's display names (the two main-project names renamed)", () => {
    const abilityName = new Map(ABILITIES.map((a) => [a.id, a.name]));
    const auraName = new Map(AURAS.map((a) => [a.id, a.name]));
    for (const m of ABILITY_MAP) expect(abilityName.get(m.to), m.to).toBe(m.name);
    for (const m of AURA_MAP) expect(auraName.get(m.to), m.to).toBe(m.name);
    expect(abilityName.get('sk_pal_oathstrike')).toBe('誓击');
    expect(abilityName.get('sk_pri_rendingwail')).toBe('裂空啸');
    const names = JSON.stringify([ABILITIES, AURAS]);
    expect(names).not.toContain('十字军打击');
    expect(names).not.toContain('心灵尖啸');
  });

  it('references only current ids: class lists, monsters, doors, items and companions', () => {
    const ab = new Set(ABILITIES.map((a) => a.id));
    const au = new Set(AURAS.map((a) => a.id));
    const old = new Set([...ABILITY_MAP, ...AURA_MAP].map((m) => m.from));
    const classes = read<{ abilities: { id: string }[] }[]>('combat/classes.json');
    for (const c of classes) for (const a of c.abilities) expect(ab.has(a.id), a.id).toBe(true);
    for (const m of MONSTERS) {
      const mech = m.mechanics;
      for (const id of [
        ...(m.abilities ?? []),
        ...(mech?.phases ?? []).flatMap((p) => p.abilities ?? []),
      ])
        expect(ab.has(id), `${m.id} ${id}`).toBe(true);
      for (const id of [
        ...(mech?.passives ?? []),
        ...(mech?.enrage ? [mech.enrage.aura] : []),
        ...(mech?.ramp ? [mech.ramp.aura] : []),
        ...(mech?.onHit ?? []).map((h) => h.aura),
        ...(mech?.phases ?? []).flatMap((p) => (p.aura ? [p.aura] : [])),
      ])
        expect(au.has(id), `${m.id} ${id}`).toBe(true);
    }
    const items =
      read<{ id: string; use?: { effect?: string; ability?: string } }[]>('combat/items.json');
    for (const it of items)
      if (it.use?.effect === 'aura') expect(au.has(it.use.ability ?? ''), it.id).toBe(true);
    // the items keep their own ids: only the auras they apply were renumbered
    expect(items.find((i) => i.id === 'ash_spirits')?.use?.ability).toBe('aur_item_ashspirits');
    const companions = read<{ id: string; avoid?: string[] }[]>('party/companions.json');
    for (const c of companions)
      for (const id of c.avoid ?? []) expect(ab.has(id), `${c.id} ${id}`).toBe(true);
    const doorRows =
      read<{ effects: { abilities?: string[]; aura?: string }[] }[]>('doors/doors.json');
    for (const d of doorRows)
      for (const f of d.effects) {
        for (const id of f.abilities ?? []) expect(ab.has(id), id).toBe(true);
        if (f.aura) expect(au.has(f.aura), f.aura).toBe(true);
      }
    // no data file under combat/, doors/ or party/ still names an old id at a reference
    const text = JSON.stringify([classes, MONSTERS, items, companions, doorRows]);
    const leftover = [...old].filter(
      (id) =>
        text.includes(`"abilities":["${id}"`) ||
        text.includes(`"aura":"${id}"`) ||
        text.includes(`"avoid":["${id}"`),
    );
    expect(leftover).toEqual([]);
  });
});

describe('ids the code names', () => {
  /** Every `sk_` or `aur_` string literal under src/ (the state auras the systems apply). */
  function literals(dir: string, out: { file: string; id: string }[] = []) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) literals(path, out);
      else if (name.endsWith('.ts') && !name.endsWith('.generated.ts')) {
        const text = readFileSync(path, 'utf8');
        for (const m of text.matchAll(/['"`]((?:sk|aur)_[a-z0-9_]+)['"`]/g))
          out.push({ file: relative(ROOT, path), id: m[1] as string });
      }
    }
    return out;
  }

  it('exist in the data (an unknown aura id would apply nothing)', () => {
    const known = new Set([...ABILITIES, ...AURAS].map((r) => r.id));
    const found = literals(join(ROOT, 'src'));
    expect(found.map((f) => f.id).sort()).toEqual(
      expect.arrayContaining([
        'aur_mon_schoollock',
        'aur_st_downed_weak',
        'aur_st_presence_paralysis',
        'aur_st_presence_pressure',
        'aur_st_revival_fatigue',
      ]),
    );
    expect(found.filter((f) => !known.has(f.id))).toEqual([]);
  });
});

describe('the rename table (rename version 2)', () => {
  const v2 = RENAMES.entries.filter((e): e is IdRename => e.since === 2);

  it('registers every old ability and aura id under its kind, and nothing else', () => {
    expect(checkRenameTable(RENAMES)).toEqual([]);
    expect(RENAME_VERSION).toBeGreaterThanOrEqual(2);
    const pairs = (kind: string) =>
      v2
        .filter((e) => e.kind === kind)
        .map((e) => `${e.from}>${e.to}`)
        .sort();
    expect(pairs('ability')).toEqual(ABILITY_MAP.map((m) => `${m.from}>${m.to}`).sort());
    expect(pairs('aura')).toEqual(AURA_MAP.map((m) => `${m.from}>${m.to}`).sort());
    expect(v2.every((e) => e.kind === 'ability' || e.kind === 'aura')).toBe(true);
    expect(v2.some((e) => e.removed)).toBe(false);
    // the merged id: one old spelling, two kinds, two targets
    expect(v2.filter((e) => e.from === 'door_step').map((e) => `${e.kind}:${e.to}`)).toEqual([
      'ability:sk_door_step',
      'aura:aur_door_dodge',
    ]);
    // a damage or heal event names an aura on a periodic tick, a pulse or thorns: those
    // auras (and only those) are listed before the ability's catch-all over combat events
    const fields = RENAMES.eventFields ?? [];
    expect(fields.map((f) => `${f.kind} ${f.event} ${f.key}`)).toEqual([
      'aura combat.aura auraId',
      'aura combat.damage abilityId',
      'aura combat.heal abilityId',
      'ability combat.* abilityId',
      'aura item.used ability',
    ]);
    const oldOf = new Map(AURA_MAP.map((m) => [m.to, m.from]));
    const ticking = (test: (a: AuraDef) => boolean) =>
      AURAS.filter((a) => oldOf.has(a.id) && test(a))
        .map((a) => oldOf.get(a.id))
        .sort();
    expect([...(fields[1]?.ids ?? [])].sort()).toEqual(
      ticking((a) => !!(a.periodic?.damage || a.pulse || a.thorns)),
    );
    expect([...(fields[2]?.ids ?? [])].sort()).toEqual(ticking((a) => !!a.periodic?.heal));
    expect([fields[0]?.ids, fields[3]?.ids, fields[4]?.ids]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('rejects malformed event fields', () => {
    const t = (eventFields: unknown): RenameTable =>
      ({ version: 1, entries: [], eventFields }) as unknown as RenameTable;
    expect(checkRenameTable(t('x'))).toEqual(['eventFields is not an array']);
    expect(checkRenameTable(t([{ kind: 'flag', event: 'a.*', key: 'k' }]))).toEqual([
      'eventFields 0: needs an id kind, an event and a key',
    ]);
    expect(checkRenameTable(t([{ kind: 'ability', event: '', key: 'abilityId' }]))).toEqual([
      'eventFields 0: needs an id kind, an event and a key',
    ]);
    expect(checkRenameTable(t([{ kind: 'ability', event: 'combat.*', key: 'abilityId' }]))).toEqual(
      [],
    );
    expect(
      checkRenameTable(t([{ kind: 'aura', event: 'combat.damage', key: 'abilityId', ids: [3] }])),
    ).toEqual(['eventFields 0: needs an id kind, an event and a key']);
  });

  it('renames a scoped kind in events only under its fields; other kinds anywhere', () => {
    const table: RenameTable = {
      version: 1,
      eventFields: [{ kind: 'ability', event: 'combat.*', key: 'abilityId' }],
      entries: [
        { since: 1, kind: 'ability', from: 'heal', to: 'sk_pri_heal' },
        { since: 1, kind: 'item', from: 'old_blade', to: 'eq_new_blade' },
      ],
    };
    const set = new RenameSet(table, 0, { isCanonical: () => true });
    expect(set.eventId('combat.cast', 'abilityId', 'heal')).toBe('sk_pri_heal');
    // table order decides between two kinds under one key
    const ordered = new RenameSet(
      {
        version: 1,
        eventFields: [
          { kind: 'aura', event: 'combat.damage', key: 'abilityId' },
          { kind: 'ability', event: 'combat.*', key: 'abilityId' },
        ],
        entries: [
          { since: 1, kind: 'ability', from: 'rend', to: 'sk_war_rend' },
          { since: 1, kind: 'aura', from: 'rend', to: 'aur_war_rend' },
          { since: 1, kind: 'ability', from: 'jab', to: 'sk_mon_jab' },
        ],
      },
      0,
      { isCanonical: () => true },
    );
    expect(ordered.eventId('combat.damage', 'abilityId', 'rend')).toBe('aur_war_rend');
    expect(ordered.eventId('combat.cast', 'abilityId', 'rend')).toBe('sk_war_rend');
    expect(ordered.eventId('combat.damage', 'abilityId', 'jab')).toBe('sk_mon_jab');
    // a field limited to some old ids lets the others fall through to the next field
    const limited = new RenameSet(
      {
        version: 1,
        eventFields: [
          { kind: 'aura', event: 'combat.damage', key: 'abilityId', ids: ['rend'] },
          { kind: 'ability', event: 'combat.*', key: 'abilityId' },
        ],
        entries: [
          { since: 1, kind: 'ability', from: 'rend', to: 'sk_war_rend' },
          { since: 1, kind: 'aura', from: 'rend', to: 'aur_war_rend' },
          { since: 1, kind: 'ability', from: 'wing_clip', to: 'sk_hun_wingclip' },
          { since: 1, kind: 'aura', from: 'wing_clip', to: 'aur_hun_wingclip' },
        ],
      },
      0,
      { isCanonical: () => true },
    );
    expect(limited.eventId('combat.damage', 'abilityId', 'rend')).toBe('aur_war_rend');
    expect(limited.eventId('combat.damage', 'abilityId', 'wing_clip')).toBe('sk_hun_wingclip');
    expect(set.eventId('combat.heal', 'kind', 'heal')).toBeNull();
    expect(set.eventId('war.hero_ability_used', 'abilityId', 'heal')).toBeNull();
    expect(set.anyId('heal')).toBeNull();
    expect(set.eventId('any.event', 'reason', 'old_blade')).toBe('eq_new_blade');
    const w = Engine.create(1, {} as ContentMap, [], { aiMode: 'off' }).world;
    const push = (kind: string, data: unknown) =>
      w.recent.push({ kind, tick: 0, seq: w.recent.length + 1, data } as AnyWorldEvent);
    push('combat.cast', { abilityId: 'heal', op: 'heal' });
    push('combat.loot', { items: [{ itemId: 'old_blade', count: 1 }], tags: ['heal'] });
    push('war.hero_ability_used', { abilityId: 'heal' });
    applyRenames(w, set);
    expect(w.recent.map((e) => e.data)).toEqual([
      { abilityId: 'sk_pri_heal', op: 'heal' },
      { items: [{ itemId: 'eq_new_blade', count: 1 }], tags: ['heal'] },
      { abilityId: 'heal' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// A game of the combat packs (as in tests/combat.test.ts)

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

const SYSTEMS = [modifiers, world, inventory, combat, party, doors];

function makeGame(seed = 7): Engine {
  return Engine.create(
    seed,
    merge([worldPack, invPack, combatPack, partyPack, doorsPack]),
    SYSTEMS,
  );
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

const units = (w: World) => w.slices.combat.units;

describe('a save written before the renumbering', () => {
  /** Write the old ids into a live world, the way a rename version 1 save holds them. */
  function oldSave(): { g: Engine; monster: string } {
    const g = makeGame();
    g.step(2);
    const w = g.world;
    const tick = w.meta.tick;
    const p = units(w).player;
    const monster = Object.keys(units(w)).find((id) => units(w)[id]?.monsterId);
    const m = monster ? units(w)[monster] : undefined;
    if (!p || !m || !monster) throw new Error('no units');
    p.auras = [
      { id: 'door_mirror', sourceId: 'player', expires: 0, stacks: 1, lvl: 1, origin: 'door' },
      { id: 'door_step', sourceId: 'player', expires: tick + 100, stacks: 1, lvl: 1 },
      { id: 'door_fatigue', sourceId: 'player', expires: tick + 400, stacks: 1, lvl: 1 },
    ];
    p.cds = { door_strike: tick + 10, door_step: tick + 5 };
    p.abilities = ['door_step', 'first_aid'];
    p.cast = { abilityId: 'door_strike', targetId: null, start: tick, end: tick + 2, x: 0, y: 0 };
    m.auras = [{ id: 'enrage', sourceId: monster, expires: 0, stacks: 1, lvl: 1 }];
    m.phaseAbilities = ['dian_fist', 'ash_shell'];
    const push = (kind: string, data: unknown) =>
      w.recent.push({ kind, tick, seq: w.meta.seq + w.recent.length, data } as AnyWorldEvent);
    push('combat.cast', { casterId: 'player', abilityId: 'door_strike', op: 'interrupted' });
    push('combat.aura', {
      targetId: 'player',
      auraId: 'interrupted',
      sourceId: monster,
      op: 'applied',
      stacks: 1,
    });
    const hit = (abilityId: string) => ({
      sourceId: 'player',
      targetId: monster,
      abilityId,
      amount: 1,
      absorbed: 0,
      school: 'physical',
      outcome: 'hit',
    });
    push('combat.damage', hit('heroic_strike'));
    push('combat.damage', hit('rend'));
    push('combat.damage', hit('dian_rot'));
    push('combat.damage', hit('wing_clip'));
    push('combat.heal', {
      sourceId: 'player',
      targetId: 'player',
      abilityId: 'renew',
      amount: 3,
      overheal: 0,
      crit: false,
    });
    push('item.used', {
      ownerId: 'player',
      itemId: 'ash_spirits',
      effect: 'aura',
      ability: 'ash_spirits',
    });
    push('war.hero_ability_used', { battleId: 'b', heroId: 'h', abilityId: 'charge', felled: 0 });
    push('combat.loot', {
      ownerId: 'player',
      victimId: monster,
      items: [{ itemId: 'ash_spirits', count: 1 }],
      money: 0,
    });
    return { g, monster };
  }

  async function saveAndLoad(w: World, renameVersion: number): Promise<World> {
    const backend = new ContainerBackend(new MemoryStorage(), {
      now: () => 0,
      writer: { id: 'w-test', name: 'test' },
      autoCollect: false,
    });
    const saver = new RunSaver({
      backend,
      runId: 'r-0123abcd',
      versions: { gameVersion: 'test', contentVersion: 'c-test', renameVersion, build: 'test' },
    });
    const res = await saver.save(
      { world: w, drainLog: () => [] },
      { slot: 'quick', savedAt: '2026-11-17T00:00:00.000Z', summary: { act: '', map: '' } },
    );
    if (!res.ok) throw new Error(res.reason);
    const owners = SYSTEMS as unknown as SliceOwner[];
    return (await loadSlot(backend, 'quick', createMigrator({ owners }))).world;
  }

  it('the combat system declares where its slice holds ids', () => {
    expect(combat.idFields).toBe(COMBAT_ID_FIELDS);
    expect(COMBAT_ID_FIELDS.map((f) => `${f.kind} ${f.path}`)).toEqual([
      'aura units.*.auras.*.id',
      'ability units.*.cds.@keys',
      'ability units.*.cast.abilityId',
      'ability units.*.abilities.*',
      'ability units.*.phaseAbilities.*',
      'ability units.*.rack.*',
      'ability units.*.rackOff.*',
      'monster units.*.monsterId',
      'item bags.*.items.*.itemId',
    ]);
  });

  it('loads with the new ids in the combat slice and the combat events', async () => {
    const { g, monster } = oldSave();
    const w = await saveAndLoad(g.world, 1);
    const p = units(w).player;
    expect(p?.auras.map((a) => a.id)).toEqual([
      'aur_door_mirror',
      'aur_door_dodge',
      'aur_st_revival_fatigue',
    ]);
    expect(Object.keys(p?.cds ?? {}).sort()).toEqual(['sk_door_step', 'sk_door_strike']);
    expect(p?.abilities).toEqual(['sk_door_step', 'sk_door_firstaid']);
    expect(p?.cast?.abilityId).toBe('sk_door_strike');
    expect(units(w)[monster]?.auras.map((a) => a.id)).toEqual(['aur_st_enrage']);
    expect(units(w)[monster]?.phaseAbilities).toEqual(['sk_mon_dianfist', 'sk_mon_ashshell']);
    const data = (kind: string) =>
      w.recent.filter((e) => e.kind === kind).map((e) => e.data as Record<string, unknown>);
    expect(data('combat.cast').at(-1)).toMatchObject({
      abilityId: 'sk_door_strike',
      op: 'interrupted',
    });
    expect(data('combat.aura').at(-1)).toMatchObject({ auraId: 'aur_mon_schoollock' });
    // a direct hit names the ability; a periodic tick names the aura, also an aura that no
    // ability shares a spelling with
    // (the aura of `wing_clip` only slows, so a damage event of that spelling is the hit)
    expect(
      data('combat.damage')
        .slice(-4)
        .map((d) => d.abilityId),
    ).toEqual(['sk_war_heroicstrike', 'aur_war_rend', 'aur_mon_dianrot', 'sk_hun_wingclip']);
    expect(data('combat.heal').at(-1)).toMatchObject({ abilityId: 'aur_pri_renew' });
    expect(data('item.used').at(-1)).toMatchObject({
      itemId: 'ash_spirits',
      ability: 'aur_item_ashspirits',
    });
    // words that only spell like an old id stay: a hero ability, an item
    expect(data('war.hero_ability_used').at(-1)).toMatchObject({ abilityId: 'charge' });
    expect(data('combat.loot').at(-1)).toMatchObject({
      items: [{ itemId: 'ash_spirits', count: 1 }],
    });
    // and the game plays on with them
    const resumed = Engine.resume(w, g.content, g.systems);
    resumed.step(40);
    const auras = units(resumed.world).player?.auras.map((a) => a.id) ?? [];
    expect(auras).toContain('aur_door_mirror');
    expect(auras).toContain('aur_st_revival_fatigue');
  });

  it('a save under rename version 2 is left as it is', async () => {
    const { g } = oldSave();
    const w = await saveAndLoad(g.world, 2);
    expect(units(w).player?.auras.map((a) => a.id)).toEqual([
      'door_mirror',
      'door_step',
      'door_fatigue',
    ]);
  });
});

// ---------------------------------------------------------------------------

describe('the act 1 imports (content_act1_abilities_01)', () => {
  it('extracts the catalog rows the batch imported, with the data fields of 3.3', () => {
    expect(extract(MD, equipmentAuras).records).toEqual([
      {
        id: 'aur_ember_door',
        name: '余烬门扉',
        kind: 'buff',
        duration: 3,
        mods: { damageTaken: -0.5 },
        dispellable: false,
      },
    ]);
    expect(extract(MD, fiendTemplates).records.map((r) => [r.id, r.name])).toEqual([
      ['fiend_colossus_remnant', '巨像残意'],
    ]);
    expect(extract(MD, fiendSkills).records.map((r) => [r.id, r.name, r.ai])).toEqual([
      ['sk_lok_summonremnant', '唤起巨像残意', 'summon'],
      ['sk_mon_remnantbar', '拦门', 'taunt'],
      ['sk_mon_remnantquake', '残震', 'aoe'],
    ]);
    expect(extract(MD, deathStateAuras, ['aur_st_downed_weak']).records).toEqual([
      { id: 'aur_st_downed_weak', name: '倒地虚弱' },
    ]);
    expect(dataFields('`kind: buff`、`mods.damageTaken: -0.5`、`dispellable: false`、无')).toEqual({
      kind: 'buff',
      mods: { damageTaken: -0.5 },
      dispellable: false,
    });
  });

  it('puts the batch rows in the data as the catalog writes them', () => {
    const aura = (id: string) => AURAS.find((a) => a.id === id);
    expect(aura('aur_ember_door')).toMatchObject({
      kind: 'buff',
      duration: 3,
      mods: { damageTaken: -0.5 },
      dispellable: false,
    });
    // the downed weakness keeps the quantity the revive borrowed from spring_weakness
    // (combat 15.2: damage dealt -20%, 120 seconds); the spring toll itself took the combat
    // doc's numbers in PK-M1-11 (15.3)
    expect(aura('aur_st_downed_weak')).toMatchObject({
      kind: 'debuff',
      duration: 120,
      mods: { damageDealt: -0.2 },
      dispellable: false,
    });
    const fiend = MONSTERS.find((m) => m.id === 'fiend_colossus_remnant');
    expect(fiend).toMatchObject({
      family: 'demon',
      faction: 'pact',
      minLevel: 1,
      maxLevel: 60,
      hpMult: 1.2,
      dmgMult: 0.6,
      armorMult: 1.5,
      abilities: ['sk_mon_remnantbar', 'sk_mon_remnantquake'],
    });
    const skill = (id: string) => ABILITIES.find((a) => a.id === id);
    expect(skill('sk_lok_summonremnant')?.effects).toEqual([
      { type: 'summon', monster: 'fiend_colossus_remnant', count: 1 },
    ]);
    expect(skill('sk_mon_remnantbar')).toMatchObject({ range: 6, cooldown: 8, ai: 'taunt' });
    expect(skill('sk_mon_remnantquake')).toMatchObject({ radius: 3, cooldown: 10, ai: 'aoe' });
    const record = JSON.parse(
      readFileSync(join(ROOT, 'data', '_batches', 'content_act1_abilities_01.json'), 'utf8'),
    ) as { status: string; added: string[] };
    expect(record.status).toBe('promoted');
    expect(record.added.sort()).toEqual(
      [...IMPORTED_AURAS, 'fiend_colossus_remnant', ...IMPORTED_ABILITIES].sort(),
    );
  });

  it('the act 1 abyss pact door grants the remnant, and the summon brings one to the fight', () => {
    const doorRows =
      read<{ id: string; effects: { type: string; abilities?: string[] }[] }[]>('doors/doors.json');
    const warlock = doorRows.find((d) => d.id === 'vocation_warlock');
    expect(warlock?.effects.find((f) => f.type === 'abilities')?.abilities).toContain(
      'sk_lok_summonremnant',
    );
    const g = makeGame();
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
    g.step(1);
    withCtx(g, (ctx) => {
      grantAbility(ctx, 'player', 'sk_lok_summonremnant');
      grantPool(ctx, 'player', 'door:test', 'mana', 300);
    });
    const fiends = () =>
      Object.values(units(g.world)).filter((u) => u.monsterId === 'fiend_colossus_remnant');
    g.queue('combat.cast', { abilityId: 'sk_lok_summonremnant' });
    g.step(80);
    expect(fiends()).toHaveLength(1);
    const pet = fiends()[0];
    expect(pet).toMatchObject({ side: 'ally', summonerId: 'player' });
    expect(pet?.level).toBe(units(g.world).player?.level);
    // one at a time: a second summon while it stands brings no other
    withCtx(g, (ctx) => {
      const p = ctx.world.slices.combat.units.player;
      if (p) p.cds = {};
    });
    const finished = () =>
      g.world.recent.filter(
        (e) =>
          e.kind === 'combat.cast' &&
          e.data.abilityId === 'sk_lok_summonremnant' &&
          e.data.op === 'finish',
      ).length;
    const before = finished();
    g.queue('combat.cast', { abilityId: 'sk_lok_summonremnant' });
    g.step(80);
    expect(finished()).toBe(before + 1);
    expect(fiends()).toHaveLength(1);
  });
});
