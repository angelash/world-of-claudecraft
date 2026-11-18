// The act-1 cast and the resident templates (PK-M1-28; catalog_characters_lotha.md 2.1,
// 3.1, 3.4, 3.6, 6): every named person of the act has a card with a map, a schedule, one
// to three roles and a line pack id; the door-marked children carry door_mark; Ash's and
// Yeyu's bodies belong to other systems; the 17 act-1 templates generate their residents
// with the template id the line packs read; the hunters' and miners' schedules cross maps.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { validateNpcContent } from '../src/content/packs/npc';
import type { ContentMap } from '../src/core/contracts';
import { createGame } from '../src/game/create';
import { residentPackId } from '../src/systems/dialogue/lines/packs';
import { speakerLayers } from '../src/systems/dialogue/speak';
import { speakerView } from '../src/systems/dialogue/topics/talk';
import { cardOf, npcEntityId, personaById } from '../src/systems/npc';
import { resolvePlaceOn } from '../src/systems/npc/places';
import { scheduleOf, segmentAt } from '../src/systems/npc/schedule';
import { placementsOf, residentRowProblems } from '../src/systems/npc/templates';
import type { PersonaCard, ResidentTemplate } from '../src/systems/npc/types';
import { getEntity } from '../src/systems/world';
import { runInTick, game as talkGame } from './dialogue_topics_harness';

const C: ContentMap = buildContent();

/** Act-1 named people with a line pack (catalog_dialogue_lines_act1.md 1.2, sections 3 to 5). */
const ACT1_SPEAKERS = [
  'yeyu',
  'shiya',
  'ron',
  'oola',
  'dris',
  'nera',
  'cassian',
  'martha',
  'bron',
  'ash',
  'moss',
  'lina',
  'hock',
  'isa',
  'toma',
  'bertha',
  'greta',
  'noi',
  'tess',
  'barga',
  'gaspar',
  'nick',
  'gorn',
  'ako',
  'boro',
  'barto',
  'jed',
  'vick',
  'seg_oneeye',
  'viro',
  'popo',
  'owen',
  'dora',
  'ed',
  'ped',
  'lisa',
  'simon',
  'marg',
  'ulf_lange',
  'knut_naumann',
  'kas_ropebridge',
];
/** Act-1 named people without a line pack of their own (catalog_characters_lotha.md 3.6). */
const ACT1_QUIET = ['fritz_kolb', 'lene_mahler', 'wilma_ascher'];

/** The resident templates the act-1 lines file writes for (catalog_dialogue_lines_act1.md 6). */
const ACT1_TEMPLATES = [
  'tpl_tenant_farmer',
  'tpl_miner',
  'tpl_woodcutter',
  'tpl_herb_woman',
  'tpl_peddler',
  'tpl_caravan_guard',
  'tpl_town_guard',
  'tpl_militia',
  'tpl_tax_collector',
  'tpl_adventurer_fe',
  'tpl_adventurer_d',
  'tpl_scavenger',
  'tpl_smuggler',
  'tpl_bandit',
  'tpl_hidden_gatefolk',
  'tpl_street_urchin',
  'tpl_village_priest',
];

const card = (id: string): PersonaCard => {
  const p = personaById(C, id);
  if (!p) throw new Error(`no card ${id}`);
  return p;
};

describe('the act-1 cast (PK-M1-28)', () => {
  it('gives each of the 44 act-1 named people a card, a map, a schedule, roles and a pack id', () => {
    expect(ACT1_SPEAKERS).toHaveLength(41);
    for (const id of [...ACT1_SPEAKERS, ...ACT1_QUIET]) {
      const p = card(id);
      expect(
        C.maps.some((m) => m.id === p.map),
        `${id} map`,
      ).toBe(true);
      const segs = Array.isArray(p.schedule)
        ? p.schedule
        : C.npcSchedules.find((s) => s.id === p.schedule)?.segments;
      expect(segs?.length, `${id} schedule`).toBeGreaterThan(0);
      expect(p.roles?.length ?? 0, `${id} roles`).toBeGreaterThanOrEqual(1);
      expect(p.roles?.length ?? 0, `${id} roles`).toBeLessThanOrEqual(3);
    }
    expect(validateNpcContent(C)).toEqual([]);
  });

  it('writes the catalog potentials and roles of the act-1 audit', () => {
    const potentials: Record<string, string> = {
      nera: '商才',
      oola: '医手',
      cassian: '证人',
      martha: '守城',
      bron: '治吏',
      hock: '学士',
      barga: '巧匠',
      ako: '斥候',
      seg_oneeye: '统帅',
      knut_naumann: '巧匠',
      kas_ropebridge: '千里眼',
      fritz_kolb: '巧匠',
    };
    for (const [id, v] of Object.entries(potentials)) expect(card(id).potential, id).toBe(v);
    expect(card('seg_oneeye').roles).toEqual(['rival', 'recruit', 'general']);
    expect(card('ulf_lange').roles).toEqual(['info', 'giver']);
    expect(card('yeyu').roles).toEqual(['recruit', 'keyholder', 'witness']);
    expect(card('ash').roles).toEqual(['keyholder', 'trainer', 'witness']);
  });

  it('tags the door-marked children with door_mark, and no other act-1 person', () => {
    const g = createGame({ content: C, seed: 3, aiMode: 'off', flagPolicy: 'off' });
    for (const id of ['noi', 'tess'])
      expect(getEntity(g.world, npcEntityId(id))?.tags, id).toContain('door_mark');
    for (const id of [...ACT1_SPEAKERS, ...ACT1_QUIET].filter((x) => x !== 'noi' && x !== 'tess'))
      expect(card(id).tags, id).not.toContain('door_mark');
  });

  it('keeps Yeyu and Ash as minds and trust flags without an NPC body', () => {
    const g = createGame({ content: C, seed: 3, aiMode: 'off', flagPolicy: 'off' });
    const npcs = g.world.slices.npc.npcs;
    for (const id of ['yeyu', 'ash']) {
      expect(npcs[id]?.gone, id).toBe('absent');
      expect(getEntity(g.world, npcEntityId(id)), id).toBeUndefined();
    }
    expect(g.world.meta.flags['trust.yeyu']).toBe(40);
    expect(g.world.meta.flags['trust.ash']).toBe(50);
    // a recruited Yeyu stays bodiless here: the companion roster spawns her
    g.queue('flag.set', { key: 'companion.yeyu.recruited', value: true });
    g.step(1);
    expect(getEntity(g.world, npcEntityId('yeyu'))).toBeUndefined();
    expect(npcs.yeyu?.gone).toBe('absent');
    // act 1 knows her only as the dislocated K0 of characters.md 3.1 (her own topics still open)
    expect(card('yeyu').knowledge).toBe('K0');
    // Ash is the gatekeeper the town has never heard of, not a hidden identity
    expect(card('ash').concealed).toBeUndefined();
  });

  it('spawns Yeyu as an NPC once her card loses the body field', () => {
    const npcs = C.npcs.map((p) => {
      if (p.id !== 'yeyu') return p;
      const { body: _body, ...rest } = p;
      return rest;
    });
    const g = createGame({ content: { ...C, npcs }, seed: 3, aiMode: 'off', flagPolicy: 'off' });
    expect(g.world.slices.npc.npcs.yeyu?.gone).toBeNull();
    expect(getEntity(g.world, npcEntityId('yeyu'))?.mapId).toBe('seal_ruins_depths');
    g.queue('flag.set', { key: 'companion.yeyu.recruited', value: true });
    g.step(1);
    expect(g.world.slices.npc.npcs.yeyu?.gone).toBe('recruited');
  });

  it('opens a talk with the Ash of the combat fixture now that he has a card', () => {
    const g = createGame({ content: C, seed: 3, aiMode: 'off', flagPolicy: 'off' });
    const ash = getEntity(g.world, 'fixture_ash');
    if (!ash) throw new Error('no ash fixture');
    expect(ash.ref).toBe('ash');
    g.queue('world.teleport', { entityId: 'player', mapId: ash.mapId, x: ash.x + 1, y: ash.y });
    g.step(1);
    g.queue('dialogue.talk', { npcId: 'fixture_ash' });
    g.step(1);
    const opened = g.world.recent.filter((e) => e.kind === 'dialogue.opened');
    expect(opened.map((e) => (e.data as { npcRef: string }).npcRef)).toContain('ash');
  });

  it('puts the One-Eye gang on its own maps and the courier at the south gate', () => {
    expect(card('seg_oneeye')).toMatchObject({ map: 'old_outpost', home: 'ruined_tower' });
    expect(card('knut_naumann').map).toBe('brokenspan_post');
    expect(card('kas_ropebridge')).toMatchObject({ map: 'brokenspan_post', home: 'broken_bridge' });
    expect(card('ulf_lange')).toMatchObject({ map: 'borderstone', home: 'post_station' });
    // the foreman is captured in act 1 and works for the village from act 2
    expect(card('fritz_kolb').hideWhen).toEqual(['act IN (prologue, act1)']);
  });

  it("sends Seg to the ash road every seventh night until the gang's fate is settled", () => {
    const p = card('seg_oneeye');
    expect(p.pursuits).toEqual([
      expect.objectContaining({
        id: 'meet_contact',
        at: 'borderstone_north:ash_road_head',
        from: 21,
        everyDays: 7,
        abandon: 'a1_oneeye_fate IN (absorbed, destroyed, scattered)',
      }),
    ]);
    const g = createGame({ content: C, seed: 3, aiMode: 'off', flagPolicy: 'off' });
    const view = cardOf(g.world.slices.npc, C, 'seg_oneeye');
    if (!view) throw new Error('no seg card');
    const place = resolvePlaceOn(C, view, 'borderstone_north:ash_road_head');
    expect(place && `${place.mapId}:${place.loc.id}`).toBe('borderstone_north:ash_road_head');
  });
});

describe('cross-map schedules (map_briefs.md 1.10)', () => {
  const at = (id: string, hour: number) => {
    const g = createGame({ content: C, seed: 3, aiMode: 'off', flagPolicy: 'off' });
    const view = cardOf(g.world.slices.npc, C, id);
    if (!view) throw new Error(`no card ${id}`);
    const seg = segmentAt(scheduleOf(C, view), hour);
    const place = resolvePlaceOn(C, view, seg.at);
    return place && `${place.mapId}:${place.loc.id}`;
  };

  it('sends the hunters into the forest edge camp from 5 to 11', () => {
    for (const id of ['shiya', 'gorn', 'boro'])
      expect(at(id, 6), id).toBe('forest_edge:hunter_camp');
    expect(at('gorn', 13)).toBe('borderstone:east_slope');
  });

  it('sends the loggers to the logging site and the miners to the mine camp', () => {
    expect(at('gaspar', 9)).toBe('forest_edge:logging_site');
    expect(at('res_tpl_miner_1', 9)).toBe('borderstone_north:mine_camp');
    expect(at('res_tpl_miner_1', 22)).toBe('borderstone:miners_shack');
  });

  it('sends the smugglers onto the ash road at night and the foreman to the mine camp', () => {
    expect(at('res_tpl_smuggler_1', 22)).toBe('borderstone_north:ash_road_head');
    expect(at('res_tpl_smuggler_1', 2)).toBe('borderstone_north:ash_road_head');
    expect(at('res_tpl_smuggler_1', 8)?.startsWith('brokenspan_post:')).toBe(true);
    expect(at('fritz_kolb', 9)).toBe('borderstone_north:mine_camp');
    expect(at('fritz_kolb', 22)).toBe('old_outpost:village_center');
  });
});

describe('resident templates (catalog_characters_lotha.md 6)', () => {
  const rows = new Map(C.npcResidents.map((r) => [r.id, r]));

  it('ships the 17 act-1 templates with band, knowledge, potential and unbelief', () => {
    for (const id of ACT1_TEMPLATES) {
      const t = rows.get(id);
      expect(t, id).toBeDefined();
      expect(t?.band, id).toMatch(/^L[34]$/);
      expect(t?.knowledge, id).toMatch(/^K[0-5]$/);
      expect(t?.potential?.codes.length ?? 0, id).toBeGreaterThan(0);
      expect(t?.unbelief, id).toBeDefined();
      expect(Array.isArray(t?.placements), id).toBe(true);
      expect(residentRowProblems(t as ResidentTemplate), id).toEqual([]);
    }
  });

  it('copies the catalog numbers of each template (catalog_characters_lotha.md 6)', () => {
    // band, levels, exaggeration, potential chance and codes, unbelief threshold, explanation
    // order and old-order dependence, as the two catalog tables write them
    type Row = [string, number, number, number, number, string[], number, string[], number];
    const catalog: Record<string, Row> = {
      tpl_tenant_farmer: [
        'L4',
        1,
        5,
        1.6,
        0.02,
        ['fertile', 'steward'],
        40,
        ['luck', 'miracle', 'sorcery'],
        0.4,
      ],
      tpl_miner: ['L4', 3, 9, 1.5, 0.02, ['craft', 'bulwark'], 45, ['gadget', 'luck'], 0.4],
      tpl_woodcutter: [
        'L4',
        3,
        7,
        1.5,
        0.02,
        ['huntking', 'bulwark'],
        45,
        ['luck', 'wounded'],
        0.5,
      ],
      tpl_herb_woman: [
        'L3',
        4,
        12,
        1.2,
        0.06,
        ['healhand', 'spiritsense'],
        30,
        ['miracle', 'sorcery'],
        0.2,
      ],
      tpl_peddler: ['L3', 3, 9, 1.7, 0.03, ['trade', 'luck'], 35, ['misreport', 'conspiracy'], 0.3],
      tpl_caravan_guard: [
        'L4',
        8,
        15,
        1.6,
        0.03,
        ['blade', 'scout'],
        50,
        ['wounded', 'cheat', 'hidden_identity'],
        0.5,
      ],
      tpl_town_guard: [
        'L4',
        6,
        12,
        1.4,
        0.03,
        ['bulwark', 'command'],
        50,
        ['misreport', 'luck'],
        0.6,
      ],
      tpl_militia: ['L4', 4, 8, 1.5, 0.03, ['command', 'bulwark'], 45, ['luck', 'miracle'], 0.4],
      tpl_tax_collector: [
        'L3',
        4,
        10,
        1.1,
        0.02,
        ['steward', 'trade'],
        65,
        ['cheat', 'conspiracy'],
        0.9,
      ],
      tpl_adventurer_fe: [
        'L4',
        1,
        9,
        1.8,
        0.04,
        ['blade', 'scout', 'luck'],
        45,
        ['wounded', 'cheat', 'hidden_identity'],
        0.4,
      ],
      tpl_adventurer_d: [
        'L3',
        10,
        14,
        1.5,
        0.03,
        ['blade', 'unbroken'],
        55,
        ['wounded', 'cheat'],
        0.5,
      ],
      tpl_scavenger: [
        'L4',
        3,
        12,
        1.5,
        0.04,
        ['luck', 'scout', 'farsight'],
        35,
        ['luck', 'sorcery'],
        0.1,
      ],
      tpl_smuggler: [
        'L4',
        6,
        14,
        1.4,
        0.03,
        ['scout', 'trade'],
        40,
        ['conspiracy', 'wounded'],
        0.2,
      ],
      tpl_bandit: ['L4', 5, 12, 1.7, 0.03, ['blade', 'command'], 35, ['wounded', 'luck'], 0.3],
      tpl_hidden_gatefolk: [
        'L4',
        1,
        8,
        1.2,
        0.12,
        ['doorsense', 'spiritsense', 'unbroken'],
        10,
        [],
        0,
      ],
      tpl_street_urchin: [
        'L4',
        1,
        4,
        2,
        0.04,
        ['scout', 'luck', 'farsight'],
        20,
        ['hidden_identity', 'miracle'],
        0.1,
      ],
      tpl_village_priest: [
        'L3',
        8,
        15,
        1.2,
        0.03,
        ['witness', 'teach'],
        55,
        ['miracle', 'sorcery', 'conspiracy'],
        0.8,
      ],
    };
    expect(Object.keys(catalog).sort()).toEqual([...ACT1_TEMPLATES].sort());
    for (const [
      id,
      [band, lo, hi, ex, chance, codes, threshold, explain, oldOrder],
    ] of Object.entries(catalog)) {
      const t = rows.get(id);
      expect(t, id).toMatchObject({
        band,
        level: [lo, hi],
        exaggerate: ex,
        potential: { chance, codes },
        unbelief: { threshold, explain, oldOrder },
      });
    }
  });

  it('numbers residents across placements so the line packs find the template', () => {
    const g = createGame({ content: C, seed: 3, aiMode: 'off', flagPolicy: 'off' });
    const residents = g.world.slices.npc.residents;
    const miners = Object.keys(residents).filter((id) => id.startsWith('res_tpl_miner_'));
    expect(miners.sort()).toEqual(['res_tpl_miner_1', 'res_tpl_miner_2', 'res_tpl_miner_3']);
    expect(residents.res_tpl_miner_1?.knowledge).toBe('K1');
    // two placements share one counter: 1 and 2 at the bridge post, 3 to 5 in the ash waste
    const scavengers = Object.keys(residents)
      .filter((id) => id.startsWith('res_tpl_scavenger_'))
      .sort();
    expect(scavengers).toEqual([1, 2, 3, 4, 5].map((n) => `res_tpl_scavenger_${n}`));
    expect(scavengers.map((id) => residents[id]?.map)).toEqual([
      'brokenspan_post',
      'brokenspan_post',
      'ash_waste',
      'ash_waste',
      'ash_waste',
    ]);
    // the first-round single-placement row keeps its ids
    expect(residents.res_bs_orphan_1?.map).toBe('borderstone');
    // no resident of an unplaced template
    expect(Object.keys(residents).some((id) => id.startsWith('res_tpl_bandit_'))).toBe(false);
    const h = talkGame();
    runInTick(h, (ctx) => {
      const layers = speakerLayers(ctx, 'res_tpl_miner_1');
      expect(layers.template).toBe('tpl_miner');
      expect(residentPackId(layers.template ?? '')).toBe('ln_tpl_miner');
      expect(speakerView(ctx, 'res_tpl_miner_1').tier).toBe('K1');
    });
  });

  it('refuses a broken template row', () => {
    const base = rows.get('tpl_miner') as ResidentTemplate;
    const bad = (patch: Partial<ResidentTemplate>) =>
      validateNpcContent({
        ...C,
        npcResidents: [
          ...C.npcResidents.filter((r) => r.id !== 'tpl_miner'),
          { ...base, ...patch },
        ],
      });
    expect(bad({ placements: undefined })).toContainEqual(
      expect.stringContaining('a catalog template lists its placements'),
    );
    expect(
      bad({ placements: [{ map: 'zz_nowhere', count: 1, homes: ['a'], works: ['b'] }] }),
    ).toContainEqual('resident tpl_miner: unknown map zz_nowhere');
    expect(
      bad({ placements: [{ map: 'borderstone', count: 1, homes: ['zz_hut'], works: ['guild'] }] }),
    ).toContainEqual('resident tpl_miner: unknown location zz_hut');
    expect(bad({ potential: { chance: 0.1, codes: ['zz_genius'] } })).toContainEqual(
      'resident tpl_miner: unknown potential zz_genius',
    );
    expect(bad({ knowledge: 'K9' as never })).toContainEqual(
      'resident tpl_miner: unknown knowledge tier K9',
    );
    expect(placementsOf({ ...base, placements: undefined, map: 'borderstone', count: 2 })).toEqual([
      { map: 'borderstone', count: 2, homes: [], works: [] },
    ]);
  });

  it('refuses an unknown body owner on a persona card', () => {
    const npcs = C.npcs.map((p) => (p.id === 'ash' ? { ...p, body: 'zz_ghost' as never } : p));
    expect(validateNpcContent({ ...C, npcs })).toContainEqual(
      'npc ash: unknown body owner zz_ghost',
    );
  });
});
