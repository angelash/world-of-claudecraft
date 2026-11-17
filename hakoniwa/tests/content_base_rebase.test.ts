// The data rebase batch content_base_rebase_01 (PK-M0-30; content_review.md 9.1): item
// prices on the catalogs' values (C45), crystal drops by tier and the guaranteed rare item
// (C46), the vow-light door's marker under its registry name with the old spelling
// migrating from saves (C91), and the data rows the batch verifies: the final boss level
// (C30, progression_and_pacing.md 18.2), spring herb and wool (C40, C41), the dreg's
// display name (X16), the persona id alias table, and the English names D-075 and D-082
// replaced (sleepscale, Hoarmane, Moon Cistern).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { pack as combatPack } from '../src/content/packs/combat';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import { defaultRegistry } from '../src/core/registry';
import { applyRenames, RENAMES, RenameSet } from '../src/core/save';
import { keptItems } from '../src/game/autoplay/goods';
import { system as combat } from '../src/systems/combat';
import { doorState, system as doors } from '../src/systems/doors';
import { isIllegal } from '../src/systems/economy/market';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { system as world } from '../src/systems/world';
import { extract } from '../tools/content/catalog/mapping';
import { loadValidationInput, ROOT } from '../tools/content/inputs';
import { crystalPrice, crystals } from '../tools/content/mappings/gathering_crafting';
import { balanceFindings, tierForLevel } from '../tools/content/validators/balance';
import { defaultNameLists, nameFindings } from '../tools/content/validators/names';
import type { ValidationInput } from '../tools/content/validators/types';

type Row = Record<string, unknown> & { id: string };

const content = buildContent();
const table = (name: string): Row[] => (content as unknown as Record<string, Row[]>)[name] ?? [];
const item = (id: string): Row => {
  const r = table('items').find((x) => x.id === id);
  if (!r) throw new Error(`no item ${id}`);
  return r;
};
const monster = (id: string): Row => {
  const r = table('monsters').find((x) => x.id === id);
  if (!r) throw new Error(`no monster ${id}`);
  return r;
};
interface Loot {
  itemId: string;
  chance: number;
  min?: number;
  max?: number;
}
const lootOf = (id: string) => (monster(id).loot ?? []) as Loot[];

/** Item values of the batch (copper), with the design row each one follows. */
const PRICES: Record<string, number> = {
  // catalog_equipment.md 3.9
  rusty_shortsword: 8,
  recruit_longsword: 150,
  hunters_bow: 225,
  oak_staff: 225,
  grey_fang_dagger: 300,
  ash_cleaver: 3000,
  crystal_spine_blade: 75000,
  red_fang_gauntlet: 2400000,
  dented_round_shield: 90,
  worn_leather_vest: 120,
  wolfhide_boots: 72,
  spider_silk_gloves: 108,
  bone_helm: 288,
  raven_quill_charm: 900,
  black_ridge_mantle: 6000,
  sewer_waders: 2400,
  cultist_robe: 18000,
  ashen_plate: 960000,
  drake_scale_leggings: 600000,
  // catalog_consumables_magitools.md 1.4 (spring_herb, ash_spirits, door_charm already matched)
  minor_healing_potion: 50,
  healing_potion: 500,
  greater_healing_potion: 2000,
  minor_mana_potion: 80,
  mana_potion: 3000,
  stoneskin_draught: 400,
  spring_herb: 30,
  ash_spirits: 60,
  door_charm: 200,
  // catalog_gathering_crafting.md 3.4, 3.7 (purchase price of unrefined grades), 3.9
  drake_scale: 3000,
  dian_shard: 10,
  sludge_glob: 1,
  crystal_small_raw: 75,
  crystal_medium_raw: 1000,
  crystal_large_raw: 25000,
  crystal_king_raw: 1000000,
};

/** Unrefined crystal per tier (catalog_bestiary.md 1.3: 晶1 to 晶5). */
const GRADE: Record<number, string> = {
  1: 'dian_shard',
  2: 'crystal_small_raw',
  3: 'crystal_medium_raw',
  4: 'crystal_large_raw',
  5: 'crystal_king_raw',
};
const CRYSTALS = new Set(Object.values(GRADE));

/** Bosses whose drops their own catalog (dungeons and bosses, characters) sets. */
const BOSS_OWNED = ['crystal_mother', 'dian_colossus', 'crystal_centipede', 'faceless_king'];

describe('C45: item prices', () => {
  it('every rebased item holds its catalog value', () => {
    const got = Object.fromEntries(Object.keys(PRICES).map((id) => [id, item(id).value]));
    expect(got).toEqual(PRICES);
  });

  let real: ValidationInput;
  beforeAll(() => {
    real = loadValidationInput({ milestone: 0 });
  }, 120_000);

  it('V6 finds no item off its price formula or material band', () => {
    const prices = balanceFindings(real).filter((f) => f.table === 'items');
    expect(prices.map((f) => f.message)).toEqual([]);
  });
});

describe('C46: crystal drops by tier', () => {
  it('the four unrefined grades come from catalog 3.7: tainted, lawful markets refuse them', () => {
    const md = readFileSync(join(ROOT, crystals.catalog), 'utf8');
    const ids = [
      'crystal_small_raw',
      'crystal_medium_raw',
      'crystal_large_raw',
      'crystal_king_raw',
    ];
    const ex = extract(md, crystals, ids);
    expect(ex.missing).toEqual([]);
    for (const rec of ex.records) {
      const row = item(rec.id as string);
      expect(row, row.id).toMatchObject({ ...rec, kind: 'material' });
      expect(row.tags, row.id).toEqual(['tainted']);
    }
    expect(ex.records.map((r) => r.name)).toEqual([
      '小晶（灰）',
      '中晶（灰）',
      '大晶（灰）',
      '王晶（灰）',
    ]);
    expect(crystalPrice('收购 2.5 金')).toBe(25000);
    expect(crystalPrice('1.2 银')).toBe(120);
    expect(crystalPrice('有价无市')).toBeUndefined();
    const kept = keptItems(content);
    for (const id of [...ids, 'dian_shard']) {
      expect(isIllegal(content.economy_config, item(id) as never), id).toBe(true);
      // the autoplayer never carries contraband to a merchant
      expect(kept.has(id), id).toBe(true);
    }
  });

  it('no non-boss monster of level 10 and up drops a crystal below its tier', () => {
    const judged: string[] = [];
    for (const m of table('monsters')) {
      const lo = m.minLevel as number;
      if (m.rank === 'boss' || BOSS_OWNED.includes(m.id) || lo < 10) continue;
      // the tier of the range's lower end (catalog_bestiary.md 1.3)
      const tier = tierForLevel(lo) as number;
      const want = GRADE[Math.min(5, tier + (m.rank === 'rare' ? 1 : 0))];
      for (const l of (m.loot ?? []) as Loot[]) {
        if (!CRYSTALS.has(l.itemId)) continue;
        expect(l.itemId, m.id).toBe(want);
        judged.push(m.id);
      }
    }
    expect(judged.sort()).toEqual(
      [
        'ash_elemental',
        'black_ridge',
        'crystal_centipede_young',
        'dian_spirit',
        'disciple_cultist',
        'disciple_guide',
        'faceless_soldier',
        'sewer_sludge',
        'waste_ghoul',
      ].sort(),
    );
  });

  it('pins the rebased loot rows: grade changed, chance and counts kept', () => {
    expect(lootOf('black_ridge')).toEqual([
      { itemId: 'black_ridge_mantle', chance: 1 },
      { itemId: 'crystal_medium_raw', chance: 1, min: 2, max: 4 },
    ]);
    expect(lootOf('dian_spirit')).toEqual([{ itemId: 'crystal_small_raw', chance: 0.6 }]);
    expect(lootOf('sewer_sludge')).toEqual([
      { itemId: 'sludge_glob', chance: 0.6 },
      { itemId: 'crystal_small_raw', chance: 0.3 },
    ]);
    expect(lootOf('crystal_centipede_young')).toEqual([
      { itemId: 'crystal_medium_raw', chance: 0.6, min: 1, max: 2 },
    ]);
    expect(lootOf('disciple_cultist')).toEqual([
      { itemId: 'cultist_robe', chance: 0.05 },
      { itemId: 'mana_potion', chance: 0.1 },
      { itemId: 'crystal_medium_raw', chance: 0.4 },
    ]);
    expect(lootOf('waste_ghoul')).toEqual([
      { itemId: 'bone_shard', chance: 0.6 },
      { itemId: 'crystal_medium_raw', chance: 0.5 },
    ]);
    expect(lootOf('ash_elemental')).toEqual([
      { itemId: 'ash_essence', chance: 0.5 },
      { itemId: 'crystal_large_raw', chance: 0.6 },
    ]);
    expect(lootOf('disciple_guide')).toEqual([
      { itemId: 'crystal_king_raw', chance: 1, min: 2, max: 4 },
    ]);
    expect(lootOf('faceless_soldier')).toEqual([
      { itemId: 'crystal_king_raw', chance: 0.8, min: 1, max: 3 },
    ]);
    // level 8 to 11 straddles T1 and T2: the shard stays (catalog_bestiary.md 1.3)
    expect(lootOf('waste_wraith').map((l) => l.itemId)).toContain('dian_shard');
  });
});

// ---------------------------------------------------------------------------

function doorGame(): Engine {
  const merged: Record<string, unknown> = {};
  for (const p of [worldPack, invPack, combatPack, partyPack, doorsPack])
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = merged[k];
      merged[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  return Engine.create(3, merged as unknown as ContentMap, [
    modifiers,
    world,
    inventory,
    combat,
    party,
    doors,
  ]);
}

describe('C91: the vow-light door marker', () => {
  const REGISTRY = defaultRegistry();

  it('the door reads the registry name; the old spelling is an alias in the rename table', () => {
    const door = table('doors').find((d) => d.id === 'vocation_paladin');
    expect(door?.keys).toEqual([
      expect.objectContaining({ type: 'flag', key: 'a3_vow_kept_reed_bridge' }),
    ]);
    expect((door as { danger?: unknown }).danger).toBeUndefined();
    expect(REGISTRY.resolve('a3_danger_door_vow')?.name).toBe('a3_vow_kept_reed_bridge');
    expect(REGISTRY.isCanonical('a3_vow_taken')).toBe(true);
    expect(RENAMES.entries).toContainEqual({
      since: 1,
      kind: 'flag',
      from: 'a3_danger_door_vow',
      to: 'a3_vow_kept_reed_bridge',
    });
    // no data file still writes or reads the old spelling
    const dataDir = join(ROOT, 'data');
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? e.name.startsWith('_')
            ? []
            : files(join(dir, e.name))
          : e.name.endsWith('.json') && !['renames.json', 'vars.json'].includes(e.name)
            ? [join(dir, e.name)]
            : [],
      );
    const hits = files(dataDir).filter((f) =>
      readFileSync(f, 'utf8').includes('a3_danger_door_vow'),
    );
    expect(hits).toEqual([]);
  });

  it('an old save holding the old spelling loads under the registry name', () => {
    const g = doorGame();
    g.world.meta.flags.a3_danger_door_vow = true;
    g.world.meta.flags.a3_vow_taken = true;
    applyRenames(g.world, new RenameSet(RENAMES, 0, REGISTRY));
    expect(g.world.meta.flags.a3_danger_door_vow).toBeUndefined();
    expect(g.world.meta.flags.a3_vow_kept_reed_bridge).toBe(true);
    // the vow itself is a separate variable and keeps its name
    expect(g.world.meta.flags.a3_vow_taken).toBe(true);
  });

  it('opening the door with the kept vow does not count as a dangerous door', () => {
    const g = doorGame();
    g.queue('flag.set', { key: 'act', value: 'act3' });
    g.queue('flag.set', { key: 'a3_vow_kept_reed_bridge', value: true });
    g.step(12);
    expect(doorState(g.world, 'vocation_paladin')).toBe('openable');
    g.queue('doors.open', { doorId: 'vocation_paladin' });
    g.step(2);
    expect(doorState(g.world, 'vocation_paladin')).toBe('opened');
    expect(g.world.meta.flags.danger_doors_opened ?? 0).toBe(0);
  });
});

describe('rows the batch verifies', () => {
  it('C30: the final boss stands at level 60 with offset-0 party sync (progression 18.2)', () => {
    const king = monster('faceless_king');
    expect([king.minLevel, king.maxLevel]).toEqual([60, 60]);
    expect((king.mechanics as { partySync?: { offset?: number } }).partySync?.offset).toBe(0);
  });

  it('C40, C41, X16: spring herb, wool and the dreg', () => {
    expect(item('spring_herb')).toMatchObject({ name: '净泉草', kind: 'consumable' });
    expect(item('spring_herb').tags).toEqual(expect.arrayContaining(['herb', 'material']));
    expect(item('wool')).toMatchObject({ name: '羊毛', desc: '牧场剪下的羊毛，织坊的原料。' });
    expect(monster('dian_dreg').name).toBe('澱渣团');
  });

  it('the persona id alias table matches the registry and the rename table', () => {
    const md = readFileSync(join(ROOT, 'docs/50_tech/implementation_conventions.md'), 'utf8')
      .split('\r\n')
      .join('\n');
    const at = md.indexOf('**人物 ID 别名表**');
    const end = md.indexOf('\n\n', md.indexOf('| 人物 ID |', at));
    const fromDoc: Record<string, string> = {};
    for (const line of md.slice(md.indexOf('| 人物 ID |', at), end).split('\n').slice(2)) {
      const cells = line.split('|').map((c) => c.trim());
      const id = /^`([a-z_]+)`$/.exec(cells[1] ?? '')?.[1];
      if (!id) throw new Error(`bad row ${line}`);
      // aliases are the code spans before the first parenthesis of the second cell
      const head = (cells[2] ?? '').split('（')[0] ?? '';
      for (const m of head.matchAll(/`([a-z_]+)`/g)) fromDoc[m[1] as string] = id;
    }
    const npc = defaultRegistry().data.keyAliases.npc ?? {};
    expect(fromDoc).toEqual(npc);
    const renamed = Object.fromEntries(
      RENAMES.entries
        .filter((e) => e.kind === 'npc')
        .map((e) => [e.from, (e as { to?: string }).to]),
    );
    expect(renamed).toEqual(npc);
    // every alias names a person the data knows by its id
    const personas = new Set(table('npcs').map((p) => p.id));
    for (const id of ['oola', 'bron', 'martha', 'vick', 'luchen'])
      expect(personas.has(id), id).toBe(true);
  });

  it('sleepscale, Hoarmane, Moon Cistern: the replaced English names stay out', () => {
    const region = table('atlas_regions').find((r) => r.id === 'sleepscale');
    expect(region).toMatchObject({ name: '眠鳞山脉', slgRegion: 'sleepscale' });
    const works = defaultNameLists().find((l) => l.category === 'works');
    expect(works?.names).toEqual(expect.arrayContaining(['Dragonspine', 'Greymane', 'Moonwell']));
    // V10 flags them in content text
    const hits = nameFindings(
      {
        files: new Map([['probe.json', { note: '灰鬃部 Greymane 与 the moonwell' }]]),
        milestone: 0,
        names: works ? [works] : [],
      },
      [],
    );
    expect(hits.map((h) => h.message)).toEqual([
      "probe.json note: works name 'Greymane'",
      "probe.json note: works name 'Moonwell'",
    ]);
    // the art prompts use the D-082 English names (ids such as art_prop_moonwell stay)
    const specs = join(ROOT, 'assets/prompts/specs');
    const old = /(^|[^a-z_])(greymane|moonwell|dragonspine)([^a-z_]|$)/i;
    const stale: string[] = [];
    for (const f of readdirSync(specs).filter((n) => n.endsWith('.json'))) {
      const text = readFileSync(join(specs, f), 'utf8');
      for (const line of text.split('\n'))
        if (old.test(line) && !/^\s*"(id|ref)":/.test(line)) stale.push(`${f}: ${line.trim()}`);
    }
    expect(stale).toEqual([]);
  });
});
