// Content id decoupling (RE-12): the data that replaced ids written in systems. Map roles
// (respawn, story acts, atlas exemption), site roles and the city item config, the goddess
// roster (court seats, roles, record writers), the opening act, nation roles, the
// competitor's market and the autoplayer's route table, each with its load-time check.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { pack as cityPack } from '../src/content/packs/city';
import { pack as economyPack } from '../src/content/packs/economy';
import { pack as goddessPack } from '../src/content/packs/goddess';
import { pack as strategyPack } from '../src/content/packs/strategy';
import type { ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { indexData } from '../src/editor/quests/flag_index';
import { ROUTES, routeProblems } from '../src/game/autoplay/routes';
import { courtSite, foodValue, siteByRole } from '../src/systems/city';
import {
  goddessByRole,
  goddessIdOf,
  isGoddessId,
  recordWriterFor,
  rosterProblems,
  seatedGoddesses,
} from '../src/systems/goddess';
import type { GoddessDef } from '../src/systems/goddess/types';
import { currentActId, openingAct, openingActId } from '../src/systems/quests';
import { verdictFor } from '../src/systems/scenes';
import { nationByRole } from '../src/systems/strategy/conclave';
import { isAtlasExempt, mapRoleProblems, mapStoryActs, respawnMap } from '../src/systems/world';

const content = buildContent();

/** A copy of the content with one table replaced (the rest shared, never mutated). */
function withTable<K extends keyof ContentMap>(table: K, value: ContentMap[K]): ContentMap {
  return { ...content, [table]: value };
}

describe('map roles', () => {
  it('names the respawn maps by role', () => {
    expect(respawnMap(content, 'door')?.id).toBe('inner_court');
    expect(respawnMap(content, 'wake')?.id).toBe('seal_ruins');
    expect(respawnMap({ maps: content.maps.filter((m) => !m.respawn) }, 'door')).toBeUndefined();
  });

  it('gives a persona the story acts of its home map', () => {
    expect(mapStoryActs(content, 'borderstone')).toEqual(['act1']);
    expect(mapStoryActs(content, 'wallenburg')).toEqual(['act2']);
    expect(mapStoryActs(content, 'forest_edge')).toEqual([]);
    expect(mapStoryActs(content, 'no_such_map')).toEqual([]);
  });

  it('exempts only the test map from the atlas', () => {
    expect(content.maps.filter(isAtlasExempt).map((m) => m.id)).toEqual(['testfield']);
  });

  it('accepts the real maps and rejects a role claimed twice or an unknown act', () => {
    expect(mapRoleProblems(content)).toEqual([]);
    const twice = content.maps.map((m) =>
      m.id === 'forest_edge' ? { ...m, respawn: 'door' as const } : m,
    );
    expect(mapRoleProblems({ ...content, maps: twice })).toContain(
      'maps inner_court, forest_edge: respawn role door claimed twice',
    );
    const badAct = content.maps.map((m) =>
      m.id === 'borderstone' ? { ...m, storyActs: ['act9'] } : m,
    );
    expect(mapRoleProblems({ ...content, maps: badAct })).toContain(
      'map borderstone: unknown story act act9',
    );
  });
});

describe('site roles and the city item config', () => {
  it('finds the village core and the court from data', () => {
    expect(siteByRole(content, 'village_core')?.id).toBe('old_outpost');
    expect(courtSite(content)?.id).toBe('inner_court');
    expect(courtSite(content)?.arrivalLocation).toBe('court_arrival');
  });

  it('values food by the config (bread feeds 1.3)', () => {
    expect(foodValue({ bread: 10, grain: 5, wood: 99 }, content.city_config)).toBe(18);
    expect(content.city_config.staple).toBe('grain');
  });

  it('rejects two village cores and config goods that are no items', () => {
    const v = (c: ContentMap) => cityPack.validate?.(c) ?? [];
    expect(v(content)).toEqual([]);
    const twoCores = content.city_sites.map((s) => ({ ...s, roles: ['village_core' as const] }));
    expect(v(withTable('city_sites', twoCores))).toContain(
      'city: role village_core held by 2 sites (want exactly 1)',
    );
    const badCfg = {
      ...content.city_config,
      staple: 'wood',
      slowUse: [{ itemId: 'nope', perHead: 1 }],
    };
    const problems = v(withTable('city_config', badCfg));
    expect(problems).toContain('city config: unknown item nope');
    expect(problems).toContain('city config: staple wood is not a food');
  });
});

describe('the goddess roster', () => {
  it('seats five goddesses in order and leaves Janu outside the court', () => {
    expect(seatedGoddesses(content).map((g) => g.id)).toEqual([
      'eluen',
      'valda',
      'merca',
      'sylvie',
      'moira',
    ]);
    expect(content.goddesses.find((g) => g.id === 'janu')?.courtSeat).toBeUndefined();
  });

  it('hands out the story roles and the record by data', () => {
    expect(goddessByRole(content, 'fate_director')?.id).toBe('moira');
    expect(goddessByRole(content, 'offering')?.id).toBe('merca');
    expect(goddessByRole(content, 'offering')?.token).toBe('merca_coin');
    expect(recordWriterFor(content, 'janu_restored')?.id).toBe('janu');
    expect(recordWriterFor(content, 'rule_merca')?.id).toBe('moira');
  });

  it('checks goddess ids against the persona cards', () => {
    expect(isGoddessId(content, 'sylvie')).toBe(true);
    expect(goddessIdOf(content, 'sylvie')).toBe('sylvie');
    expect(goddessIdOf(content, 'nobody')).toBeUndefined();
  });

  it('accepts the real roster and rejects shared seats, two directors and broken conditions', () => {
    expect(rosterProblems(content)).toEqual([]);
    expect(goddessPack.validate?.(content)).toEqual([]);
    const mutate = (fn: (g: GoddessDef) => GoddessDef) =>
      rosterProblems({ ...content, goddesses: content.goddesses.map(fn) });
    expect(
      mutate((g) =>
        g.id === 'valda' && g.courtSeat ? { ...g, courtSeat: { ...g.courtSeat, seat: 1 } } : g,
      ),
    ).toContain('goddesses: two goddesses share a court seat');
    expect(mutate((g) => (g.id === 'eluen' ? { ...g, roles: ['fate_director'] } : g))).toContain(
      'goddesses: role fate_director held by 2 goddesses (want exactly 1)',
    );
    expect(mutate((g) => (g.id === 'janu' ? { ...g, actsWhen: 'a AND' } : g)).length).toBe(1);
    expect(mutate((g) => (g.id === 'merca' ? { ...g, token: 'no_coin' } : g))).toContain(
      'goddess merca: unknown token item no_coin',
    );
    expect(mutate((g) => (g.id === 'janu' ? { ...g, record: { kind: 'divine' } } : g))).toContain(
      'goddesses: 2 default record writers (want exactly 1)',
    );
  });

  it('judges a goddess added in data alone by her seat rule', () => {
    const aster = {
      ...(content.goddesses[0] as GoddessDef),
      id: 'aster',
      courtSeat: {
        seat: 6,
        crisis: { id: 'aster_crisis', bonus: 'aster_bonus' },
        verdict: { judgedAt: 1, voluntary: { any: [{ when: 'aster_yields' }] } },
      },
    } as GoddessDef;
    const roster = { goddesses: [...content.goddesses, aster] };
    const court = { strength: {}, presented: {}, mitigated: {} };
    expect(verdictFor('aster', [], court, {}, roster)).toBe('refuse');
    expect(verdictFor('aster', ['fact'], court, {}, roster)).toBe('judged');
    expect(verdictFor('aster', ['fact'], court, { aster_yields: true }, roster)).toBe('voluntary');
    expect(verdictFor('aster', [], court, { aster_yields: true }, roster)).toBe('refuse');
    expect(verdictFor('aster', [], court, { a6_patron: 'aster' }, roster)).toBe('contend');
    expect(
      seatedGoddesses(roster)
        .map((g) => g.id)
        .at(-1),
    ).toBe('aster');
  });
});

describe('the editor flag index sees the goddess data', () => {
  it('lists the gaze alias and yield flags as writes and her gates as reads', () => {
    const refs = indexData('goddess/goddesses.json', content.goddesses);
    const writes = refs.filter((r) => r.kind === 'write').map((r) => `${r.key}:${r.via}`);
    expect(writes).toEqual(
      expect.arrayContaining([
        'goddess.eluen.gaze:gazeFlag',
        'goddess.moira.gaze:gazeFlag',
        'a6_spring_memory:yieldFlag',
      ]),
    );
    const reads = refs.filter((r) => r.kind === 'read').map((r) => `${r.key}:${r.via}`);
    expect(reads).toEqual(
      expect.arrayContaining([
        'seal_looseness:actsWhen',
        'a1_dream_door_woman:appearsWhen',
        'a1_oola_fate:bonus',
        'court.valda.duel:when',
      ]),
    );
  });
});

describe('acts, nations and the market', () => {
  it('opens on the lowest-index act and defaults the act flag to it', () => {
    expect(openingAct(content)?.id).toBe('prologue');
    expect(openingAct(content)?.introScene).toBe('prologue');
    expect(openingActId({ acts: [] })).toBe('');
    expect(currentActId({ flag: () => undefined, content })).toBe('prologue');
    expect(currentActId({ flag: () => 'act3', content })).toBe('act3');
  });

  it('names the conclave nations by role and rejects a second church', () => {
    const ctx = { content } as unknown as SystemContext;
    expect(nationByRole(ctx, 'church')).toBe('holy_see');
    expect(nationByRole(ctx, 'summit_key')).toBe('empire');
    const twoChurches = content.slg_nations.map((n) => ({ ...n, roles: ['church' as const] }));
    expect(strategyPack.validate?.(withTable('slg_nations', twoChurches))).toContain(
      `slg_nations: role church held by ${twoChurches.length} nations (want exactly 1)`,
    );
  });

  it("checks the competitor's offering market", () => {
    expect(content.economy_config.competitor.marketId).toBe('wallenburg');
    const cfg = {
      ...content.economy_config,
      competitor: { ...content.economy_config.competitor, marketId: 'atlantis' },
    };
    expect(economyPack.validate?.(withTable('economy_config', cfg))).toContain(
      'economy: competitor market atlantis unknown',
    );
  });
});

describe("the autoplayer's route table", () => {
  it('catches a broken scene rule, preference, map, item and route name', () => {
    const broken = {
      ...ROUTES,
      huntingMaps: ['no_map'],
      keptItems: ['no_item'],
      scenes: {
        prefer: { ...ROUTES.scenes.prefer, patron: ['nobody'] },
        routes: { ...ROUTES.scenes.routes, not_an_ending: {} },
        rules: [{ scene: 'no_scene', pick: ['stay'] }],
      },
    };
    const problems = routeProblems(content, broken);
    expect(problems).toContain('autoplay prefer: node patron has no choice nobody');
    expect(problems).toContain('autoplay route not_an_ending: not an ending id');
    expect(problems).toContain('autoplay rule: unknown scene no_scene');
    expect(problems).toContain('autoplay: unknown map no_map');
    expect(problems).toContain('autoplay: unknown item no_item');
  });
});
