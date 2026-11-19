// PK-M1-30 (content_act1_bestiary_01): the act-1 bestiary, nest lords, dungeon-only monsters,
// boss arenas, dungeon and nest records, and the spawn groups that place them
// (catalog_bestiary.md 3, 4.1, 4.2, 4.11, 5, 6; catalog_dungeons_bosses.md 3.1;
// combat_and_classes.md 10.8, 11; map_briefs.md A1 to A10). The rows below pin the data to the
// catalogs; the engine cases run the shipped content through world, combat and dungeons.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import type { ContentMap } from '../src/core/contracts';
import type { Engine } from '../src/core/engine';
import { createGame } from '../src/game/create';
import { system as combat } from '../src/systems/combat';
import type { MonsterDef } from '../src/systems/combat/types';
import { system as dungeons } from '../src/systems/dungeons';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { flagListMet, system as world } from '../src/systems/world';
import type { MapDef } from '../src/systems/world/types';

const content: ContentMap = buildContent();
const mon = (id: string): MonsterDef => {
  const m = content.monsters.find((x) => x.id === id);
  if (!m) throw new Error(`no monster ${id}`);
  return m;
};
const map = (id: string): MapDef => {
  const m = content.maps.find((x) => x.id === id);
  if (!m) throw new Error(`no map ${id}`);
  return m;
};

/** id, family, rank (n normal, e elite, r rare, b boss), level range: the catalog rows. */
const ROWS: [string, string, string, number, number][] = [
  // bestiary 4.1 (lotha)
  ['field_hare', 'beast', 'n', 1, 3],
  ['greyelm_deer', 'beast', 'n', 3, 7],
  ['forest_boar', 'beast', 'n', 3, 6],
  ['ironpine_bear', 'beast', 'n', 8, 12],
  ['northern_elk', 'beast', 'n', 10, 14],
  ['ashhorn_deer', 'beast', 'n', 6, 10],
  ['rust_beetle', 'burrower', 'n', 7, 11],
  ['greybrook_crayfish', 'beast', 'n', 8, 12],
  ['oldwatch_sentinel', 'undead', 'n', 7, 9],
  ['gravefield_wisp', 'elemental', 'n', 9, 12],
  ['greyroad_smuggler', 'humanoid', 'n', 6, 12],
  // bestiary 4.2 (waste, outer rim; bone_vulture and greyshard_fence held to the act bands)
  ['waste_jackal', 'beast', 'n', 8, 14],
  ['bone_vulture', 'beast', 'n', 10, 15],
  ['shard_louse', 'burrower', 'n', 9, 13],
  ['waste_scavenger', 'humanoid', 'n', 5, 14],
  ['gully_digger', 'humanoid', 'n', 8, 14],
  ['greyshard_fence', 'humanoid', 'n', 15, 20],
  ['ashtide_vanguard', 'elemental', 'n', 50, 56],
  // catalog_dungeons_bosses 3.1
  ['vein_grub', 'burrower', 'n', 6, 9],
  ['grayroad_foreman', 'humanoid', 'e', 11, 11],
  ['coinmouth_rat', 'burrower', 'n', 5, 7],
  ['tally_rat_crone', 'burrower', 'e', 8, 8],
  ['glyph_shade', 'elemental', 'n', 10, 13],
  ['ash_page_swarm', 'elemental', 'n', 12, 14],
  ['ash_scroll_drift', 'elemental', 'b', 14, 14],
  // bestiary 5 (the named) and 6 (nest lords)
  ['red_sock', 'beast', 'r', 7, 7],
  ['three_toes', 'beast', 'r', 10, 10],
  ['bell_weeper', 'undead', 'r', 9, 9],
  ['ironbelly', 'burrower', 'r', 13, 13],
  ['toll_taker', 'beast', 'r', 14, 14],
  ['old_louse', 'burrower', 'r', 13, 13],
  ['furrow_rat_queen', 'burrower', 'b', 8, 8],
  ['rust_matron', 'burrower', 'b', 13, 13],
];
const RANK: Record<string, string> = { n: 'normal', e: 'elite', r: 'rare', b: 'boss' };

/** Species the maps cannot hold yet (a hub town, a quest gate, the act 5 battle line). */
const UNPLACED = [
  'gravefield_wisp',
  'oldwatch_sentinel',
  'bell_weeper',
  'red_sock',
  'ashtide_vanguard',
];

function placed(id: string): boolean {
  if (content.maps.some((m) => m.spawns.some((s) => s.kind === 'monster' && s.ref === id)))
    return true;
  return (content.waves ?? []).some((w) => w.groups.some((g) => g.monster === id));
}

describe('the act-1 bestiary rows (bestiary 3 to 6, dungeon catalog 3.1)', () => {
  it('ships every row with its family, layer and level band', () => {
    for (const [id, family, rank, lo, hi] of ROWS) {
      const m = mon(id);
      expect(m.family, id).toBe(family);
      expect(m.rank ?? 'normal', id).toBe(RANK[rank]);
      expect([m.minLevel, m.maxLevel], id).toEqual([lo, hi]);
    }
  });

  it('places every row on a map or in a wave, except the listed ones', () => {
    const missing = ROWS.map((r) => r[0]).filter((id) => !placed(id));
    expect(missing.sort()).toEqual([...UNPLACED].sort());
  });

  it('gives the named the rare layer of progression 18.2 and the rumour scale of 2.7', () => {
    for (const id of [
      'split_ear',
      'black_ridge',
      'red_sock',
      'three_toes',
      'bell_weeper',
      'ironbelly',
      'toll_taker',
      'old_louse',
    ]) {
      const m = mon(id);
      expect([m.hpMult, m.dmgMult, m.xpMult], id).toEqual([1.27, 1.07, 1.5]);
      expect(m.mechanics?.rumorScale, id).toEqual({ perLevel: 0.06, max: 0.3 });
    }
  });

  it('gives the nest lords the lair layer at their party (5.5, 18.2)', () => {
    // 8 x min(1, party / 2.5)^0.8 / 2.3 (the lair rows of 18.2 take a full party of 2.5): the
    // queen with two (player and Yeyu), the matron at a full party
    expect([mon('furrow_rat_queen').hpMult, mon('furrow_rat_queen').dmgMult]).toEqual([2.91, 1.2]);
    expect([mon('rust_matron').hpMult, mon('rust_matron').dmgMult]).toEqual([3.48, 1.2]);
    expect(mon('furrow_rat_queen').tier).toBeUndefined();
    expect(mon('furrow_rat_queen').loot?.map((l) => l.itemId)).toEqual([
      'crystal_medium_raw',
      'eq_furrow_queen_charm',
    ]);
    expect(mon('rust_matron').loot?.map((l) => l.itemId)).toEqual([
      'crystal_medium_raw',
      'eq_rustmatron_buckler',
    ]);
  });

  it('writes the registry fields the catalogs name (combat 11; PK-M1-12 requests)', () => {
    expect(mon('dian_dreg').mechanics?.ashPuddle).toBeDefined();
    for (const id of ['dian_boar', 'forest_boar', 'red_sock'])
      expect(mon(id).mechanics?.charge, id).toBeDefined();
    for (const id of [
      'wandering_bones',
      'waste_wraith',
      'oldwatch_sentinel',
      'bell_weeper',
      'gravefield_wisp',
    ])
      expect(mon(id).mechanics?.nightOnly, id).toEqual({ mode: 'spawn' });
    expect(mon('dian_wolf').mechanics?.purifyTo).toBe('grey_wolf');
    expect(mon('ashhorn_deer').mechanics?.purifyTo).toBe('greyelm_deer');
    expect(mon('three_toes').mechanics?.purifyTo).toBe('greyelm_deer');
    expect(mon('three_toes').mechanics?.lureFlee).toBe(true);
    for (const id of ['rust_beetle', 'ironbelly', 'rust_matron'])
      expect(mon(id).mechanics?.ambushEmerge, id).toBeDefined();
    for (const id of ['waste_jackal', 'toll_taker']) {
      expect(mon(id).mechanics?.caravanRaid, id).toBe(true);
      expect(mon(id).mechanics?.pilfer?.take, id).toBe('consumable');
    }
    expect(mon('coinmouth_rat').mechanics?.pilfer?.take).toBe('coin');
    expect(mon('shard_louse').mechanics?.crystalEat?.items).toEqual(['dian_shard']);
    expect(mon('greybrook_crayfish').mechanics?.canSwim).toBe(true);
    expect(mon('glyph_shade').mechanics?.phasesThroughObstacles).toBe(true);
    expect(mon('vein_grub').mechanics?.deathThroes).toBeDefined();
    expect(mon('tally_rat_crone').mechanics?.desperateHeal?.belowPct).toBe(0.2);
  });

  it('writes the 4.11 component tags of the act-1 species', () => {
    const tags: Record<string, string[]> = {
      dian_dreg: ['essence'],
      dian_rat: ['bone'],
      grey_wolf: ['fang', 'hide'],
      dian_wolf: ['fang'],
      dian_boar: ['fang'],
      edge_spider: ['silk', 'carapace'],
      wandering_bones: ['bone', 'ash'],
      dian_colossus: ['heart'],
      field_hare: ['meat', 'hide'],
      greyelm_deer: ['meat', 'horn', 'hide'],
      ironpine_bear: ['meat', 'fang', 'hide'],
      ashhorn_deer: ['horn', 'hide', 'meat'],
      waste_jackal: ['fang', 'hide', 'meat'],
      bone_vulture: ['feather', 'bone', 'hide', 'meat'],
      forest_boar: ['meat', 'hide', 'fang'],
      northern_elk: ['meat', 'horn', 'hide'],
      rust_beetle: ['carapace'],
      greybrook_crayfish: ['carapace', 'meat'],
      oldwatch_sentinel: ['ash'],
      gravefield_wisp: ['essence'],
      shard_louse: ['carapace'],
      ashtide_vanguard: ['essence'],
      raven_flock: ['feather'],
      split_ear: ['fang', 'hide'],
      burrow_worm: ['carapace'],
      waste_wraith: ['ash'],
      black_ridge: ['hide', 'meat'],
      dian_spirit: ['essence'],
      crystal_mother: ['carapace'],
      furrow_rat_queen: ['bone', 'heart'],
    };
    for (const [id, want] of Object.entries(tags))
      expect(mon(id).mechanics?.componentTags, id).toEqual(want);
    // people are not skinned (2.9)
    for (const id of ['greyroad_smuggler', 'waste_scavenger', 'gully_digger', 'grayroad_foreman'])
      expect(mon(id).mechanics?.componentTags, id).toBeUndefined();
  });
});

describe('boss arenas (combat 10.8; PK-M1-12 requests)', () => {
  it('stands the raven stones at locations of the nest shaft map', () => {
    const terrain = mon('guardian_raven').mechanics?.terrain ?? [];
    expect(terrain.map((t) => t.at)).toEqual(['raven_stone_w', 'raven_stone_e', 'raven_stone_s']);
    for (const t of terrain) expect(t.offset, t.object).toBeUndefined();
    const depths = map('seal_ruins_depths');
    for (const t of terrain)
      expect(
        depths.locations.some((l) => l.id === t.at),
        t.at,
      ).toBe(true);
  });

  it('gives the colossus its ash-rain cover, the street breakables, the core and the dregs', () => {
    const m = mon('dian_colossus').mechanics;
    const town = map('borderstone');
    const cover = (m?.terrain ?? []).filter((t) => t.role === 'cover').map((t) => t.at);
    expect(cover).toEqual(['cover_north_gate', 'cover_eaves_1', 'cover_eaves_2', 'cover_eaves_3']);
    const breakables = (m?.terrain ?? []).filter((t) => t.role === 'breakable').map((t) => t.at);
    expect(breakables).toEqual(['orphanage_hut_1', 'orphanage_fence_1']);
    for (const id of [...cover, ...breakables, 'north_spring_square', 'orphanage_street'])
      expect(
        town.locations.some((l) => l.id === id),
        id,
      ).toBe(true);
    expect(m?.breakableParts).toEqual([expect.objectContaining({ id: 'dian_core', phase: 2 })]);
    const collapse = m?.phases?.find((p) => p.name === '崩解');
    expect(collapse?.onEnter?.[0]).toEqual({
      do: 'adds',
      monster: 'dian_dreg',
      count: 2,
      at: 'ring',
    });
  });
});

describe('dungeon and nest records (dungeon catalog 3.1; bestiary 6)', () => {
  const dg = (id: string) => (content.dungeons ?? []).find((d) => d.id === id);
  const nest = (id: string) => (content.nests ?? []).find((n) => n.id === id);

  it('gives the cellar its keeper, its crone and the three choices with the refused nurture', () => {
    const cellar = dg('dg_moon_cellar');
    expect(cellar?.coreBoss).toBe('tally_rat_crone');
    // the crone is an elite, not a boss: the floor names no boss (catalog 2: no boss count)
    expect(cellar?.floors[0]?.boss).toBeUndefined();
    expect(cellar?.choices?.nurture?.ownerRefuses).toBe(true);
    expect(cellar?.choices?.destroy?.days).toBe(1);
    expect(cellar?.choices?.purify?.days).toBe(3);
  });

  it('gives the old mine its core boss, its overflow toward Edgestone and act-3 choices', () => {
    const mine = dg('dg_old_mine');
    expect(mine?.coreBoss).toBe('crystal_mother');
    expect(mine?.overflowTo).toBe('borderstone');
    for (const c of ['nurture', 'destroy', 'purify'] as const)
      expect(mine?.choices?.[c]?.when, c).toBe('act.3.entered');
    expect(dg('dg_seal_ruins')?.overflowTo).toBe('borderstone');
  });

  it('records the furrow queen and rust matron nests on their maps', () => {
    const queen = nest('nest_furrow_rat_queen');
    expect(queen).toMatchObject({
      mapId: 'borderstone',
      location: 'old_granary',
      lord: 'furrow_rat_queen',
      stage: 2,
      when: 'act_week >= 4',
    });
    expect(nest('nest_rust_matron')).toMatchObject({
      mapId: 'rustridge_mine',
      location: 'old_miner_shed',
      lord: 'rust_matron',
      when: 'act.2.entered',
    });
  });

  it('gates every nest and cellar spawn on its mirrors and quests', () => {
    const town = map('borderstone');
    const gate = (m: MapDef, id: string) => m.spawns.find((s) => s.id === id)?.requiresFlags;
    const nestGate = (n: string) => [`dg.${n}.stage`, `!dg.${n}.cleared`, `!dg.${n}.collapsed`];
    expect(gate(town, 'bs_granary_rats')).toEqual(nestGate('nest_furrow_rat_queen'));
    expect(gate(town, 'bs_furrow_rat_queen')).toEqual(nestGate('nest_furrow_rat_queen'));
    const mine = map('rustridge_mine');
    for (const id of ['rm_shed_beetles', 'rm_rust_matron'])
      expect(gate(mine, id), id).toEqual(['act.2.entered', ...nestGate('nest_rust_matron')]);
    const cellar = [
      '!dg.dg_moon_cellar.cleared',
      '!dg.dg_moon_cellar.collapsed',
      '!a1_bell_tab_seen',
    ];
    expect(gate(town, 'bs_cellar_rats')).toEqual(['quest.q_a1_m04_hunt', ...cellar]);
    for (const id of ['bs_cellar_coin_rats', 'bs_cellar_crone'])
      expect(gate(town, id), id).toEqual(['quest.q_a1_s17_moon_cellar', ...cellar]);
    // a lord killed away from its nest comes back; a counted kill clears the gate instead
    for (const [m, id] of [
      [town, 'bs_furrow_rat_queen'],
      [mine, 'rm_rust_matron'],
    ] as const)
      expect(m.spawns.find((s) => s.id === id)?.respawnMinutes, id).toBe(1440);
    const queen = town.spawns.find((s) => s.id === 'bs_furrow_rat_queen');
    const read = (f: Record<string, unknown>) => (name: string) => f[name];
    const base = 'dg.nest_furrow_rat_queen';
    expect(flagListMet(queen?.requiresFlags, read({}))).toBe(false);
    expect(
      flagListMet(queen?.requiresFlags, read({ [`${base}.stage`]: 2, [`${base}.cleared`]: false })),
    ).toBe(true);
    expect(
      flagListMet(queen?.requiresFlags, read({ [`${base}.stage`]: 2, [`${base}.cleared`]: true })),
    ).toBe(false);
    expect(
      flagListMet(
        queen?.requiresFlags,
        read({ [`${base}.stage`]: 2, [`${base}.collapsed`]: true }),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// the shipped content in the engine

function play(seed = 3030): Engine {
  const g = createGame({ seed, content, systems: [modifiers, world, inventory, combat, dungeons] });
  g.step(1);
  return g;
}
function setFlag(g: Engine, key: string, value: string | number | boolean): void {
  g.queue('flag.set', { key, value });
  g.step(2);
}
function livingOn(g: Engine, mapId: string, ref: string): number {
  return Object.values(g.world.slices.world.entities).filter(
    (e) => e.mapId === mapId && e.ref === ref && e.alive,
  ).length;
}

describe('the shipped spawn groups in the engine', () => {
  it('raises the furrow queen in the old granary once its nest wakes in week four', () => {
    const g = play();
    expect(livingOn(g, 'borderstone', 'furrow_rat_queen')).toBe(0);
    expect(livingOn(g, 'borderstone', 'dian_rat')).toBe(0);
    setFlag(g, 'act_week', 3);
    g.step(60 * 20);
    expect(livingOn(g, 'borderstone', 'furrow_rat_queen')).toBe(0);
    setFlag(g, 'act_week', 4);
    g.step(60 * 20);
    expect(g.world.meta.flags['dg.nest_furrow_rat_queen.stage']).toBe(2);
    expect(livingOn(g, 'borderstone', 'furrow_rat_queen')).toBe(1);
    expect(livingOn(g, 'borderstone', 'dian_rat')).toBe(4);
  });

  it('fills the tavern cellar for the hunt commission and the cellar quest only', () => {
    const g = play();
    expect(livingOn(g, 'borderstone', 'coinmouth_rat')).toBe(0);
    expect(livingOn(g, 'borderstone', 'dian_rat')).toBe(0);
    setFlag(g, 'quest.q_a1_m04_hunt', 'active');
    expect(livingOn(g, 'borderstone', 'dian_rat')).toBe(4);
    expect(livingOn(g, 'borderstone', 'tally_rat_crone')).toBe(0);
    setFlag(g, 'quest.q_a1_s17_moon_cellar', 'active');
    expect(livingOn(g, 'borderstone', 'coinmouth_rat')).toBe(4);
    expect(livingOn(g, 'borderstone', 'tally_rat_crone')).toBe(1);
  });

  it('holds the iron-hemlock season groups to the beast season', () => {
    const g = play();
    expect(livingOn(g, 'ironhemlock_deep', 'ironpine_bear')).toBe(0);
    expect(livingOn(g, 'ironhemlock_deep', 'greyelm_deer')).toBe(0);
    expect(livingOn(g, 'ironhemlock_deep', 'ashhorn_deer')).toBe(0);
    setFlag(g, 'a1_beast_season', true);
    expect(livingOn(g, 'ironhemlock_deep', 'ironpine_bear')).toBe(1);
    expect(livingOn(g, 'ironhemlock_deep', 'greyelm_deer')).toBe(3);
    expect(livingOn(g, 'ironhemlock_deep', 'ashhorn_deer')).toBe(3);
  });
});
