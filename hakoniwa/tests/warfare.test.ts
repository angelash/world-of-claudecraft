// Warfare (RTS) system: scenario content, the war.pending handshake, manual battle
// stepping, orders and hero abilities, the 20 percent single-cast cap (D-012), the
// general.order AI request with its fallback, auto-resolve determinism and the end-of-
// battle events and flags.

import { describe, expect, it } from 'vitest';
import { buildContent, validateContent } from '../src/content';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as warfarePack } from '../src/content/packs/warfare';
import { pack as worldPack } from '../src/content/packs/world';
import type { AnyWorldEvent, CommandKind } from '../src/core/contracts';
import type { Engine } from '../src/core/engine';
import { createGame } from '../src/game/create';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import {
  autoResolve,
  battleView,
  buildFieldSetup,
  estimatePower,
  latestResult,
  system as warfare,
} from '../src/systems/warfare';
import { kernelData } from '../src/systems/warfare/data';
import { CAST_KILL_CAP, castAbility } from '../src/systems/warfare/heroes';
import { createBattleState, stepBattle } from '../src/systems/warfare/kernel';
import { system as world } from '../src/systems/world';

const PACKS = [inventoryPack, warfarePack, worldPack];
const content = buildContent(PACKS);

function game(seed = 7): Engine {
  return createGame({ seed, content, systems: [modifiers, world, inventory, warfare] });
}

function lastResult(g: Engine, kind: CommandKind) {
  const r = [...g.world.recent]
    .reverse()
    .find(
      (e): e is Extract<AnyWorldEvent, { kind: 'command.result' }> =>
        e.kind === 'command.result' && e.data.kind === kind,
    );
  return r?.data;
}

function events<K extends AnyWorldEvent['kind']>(g: Engine, kind: K) {
  return g.world.recent.filter((e) => e.kind === kind) as Extract<AnyWorldEvent, { kind: K }>[];
}

function pend(g: Engine, scenarioId: string): void {
  g.queue('flag.set', { key: 'war.pending', value: scenarioId });
  g.step(1);
}

describe('warfare content', () => {
  it('validates units, abilities and scenarios', () => {
    expect(validateContent(content, PACKS)).toEqual([]);
    expect(content.regiment_types.length).toBeGreaterThanOrEqual(20);
    const ids = content.battle_scenarios.map((s) => s.id);
    for (const id of ['act2_city_defense', 'act3_ash_line', 'act3_north_raid', 'act5_final_war']) {
      expect(ids).toContain(id);
    }
  });
});

describe('battle lifecycle', () => {
  it('only starts the scenario named by war.pending', () => {
    const g = game();
    g.queue('war.start', { scenarioId: 'act2_city_defense' });
    g.step(1);
    expect(lastResult(g, 'war.start')).toMatchObject({ ok: false, code: 'not_pending' });
    pend(g, 'act2_city_defense');
    g.queue('war.start', { scenarioId: 'act3_ash_line' });
    g.step(1);
    expect(lastResult(g, 'war.start')).toMatchObject({ ok: false, code: 'not_pending' });
    g.queue('war.start', { scenarioId: 'act2_city_defense' });
    g.step(1);
    expect(lastResult(g, 'war.start')?.ok).toBe(true);
    expect(events(g, 'war.battle_started')[0]?.data).toMatchObject({
      scenario: 'act2_city_defense',
      mode: 'manual',
    });
    g.queue('war.start', { scenarioId: 'act2_city_defense' });
    g.step(1);
    expect(lastResult(g, 'war.start')).toMatchObject({ ok: false, code: 'battle_active' });
  });

  it('steps a manual battle every 4 ticks and obeys player orders', () => {
    const g = game();
    pend(g, 'act2_city_defense');
    g.queue('war.start', { scenarioId: 'act2_city_defense' });
    g.step(1);
    const v0 = battleView(g.world, g.content);
    expect(v0?.regiments.some((r) => r.team === 'enemy')).toBe(true);
    g.queue('war.order', { unitId: 'door_guard', kind: 'move', x: 6.5, y: 4.5 });
    g.queue('war.order', { unitId: 'rats_well', kind: 'move', x: 6.5, y: 4.5 });
    g.queue('war.order', { unitId: 'door_guard', kind: 'formation', formation: 'square' });
    g.step(1);
    const results = g.world.recent.filter(
      (e) => e.kind === 'command.result' && e.data.kind === 'war.order',
    );
    expect(results.map((e) => e.kind === 'command.result' && e.data.ok)).toEqual([
      true,
      false,
      false,
    ]);
    const t0 = battleView(g.world, g.content)?.time ?? 0;
    g.step(40);
    const v = battleView(g.world, g.content);
    expect(v?.time).toBeCloseTo(t0 + 2, 5);
    const guard = v?.regiments.find((r) => r.id === 'door_guard');
    expect(guard?.order).toMatchObject({ kind: 'move' });
    expect(guard && Math.hypot(guard.x - 14, guard.y - 11)).toBeGreaterThan(0.5);
  });

  it('casts hero abilities with cooldowns', () => {
    const g = game();
    pend(g, 'act2_city_defense');
    g.queue('war.start', { scenarioId: 'act2_city_defense' });
    g.step(1);
    g.queue('war.hero_ability', { heroId: 'player', abilityId: 'inspire' });
    g.step(1);
    expect(lastResult(g, 'war.hero_ability')?.ok).toBe(true);
    expect(events(g, 'war.hero_ability_used')[0]?.data).toMatchObject({
      heroId: 'player',
      abilityId: 'inspire',
    });
    g.queue('war.hero_ability', { heroId: 'player', abilityId: 'inspire' });
    g.step(1);
    expect(lastResult(g, 'war.hero_ability')).toMatchObject({ ok: false, code: 'cannot_cast' });
    g.queue('war.hero_ability', { heroId: 'player', abilityId: 'firestorm' });
    g.step(1);
    expect(lastResult(g, 'war.hero_ability')?.ok).toBe(false);
  });

  it('auto-resolves the pending battle and reports it through events and flags', () => {
    const g = game();
    pend(g, 'act3_bone_field');
    g.queue('war.auto_resolve', {});
    g.step(1);
    expect(lastResult(g, 'war.auto_resolve')?.ok).toBe(true);
    const ended = events(g, 'battle.ended');
    expect(ended).toHaveLength(1);
    expect(ended[0]?.data.scenario).toBe('act3_bone_field');
    const victor = ended[0]?.data.victor;
    const flag = g.world.meta.flags['war.act3_bone_field.result'];
    expect(flag).toBe(victor === 'player' ? 'win' : victor === 'enemy' ? 'lose' : 'draw');
    expect(g.world.meta.flags['war.pending']).toBe('');
    expect(g.world.slices.warfare.battle).toBeNull();
    expect(latestResult(g.world, 'act3_bone_field')?.victor).toBe(victor);
    const report = events(g, 'war.battle_report')[0]?.data;
    expect(report?.regiments.length).toBeGreaterThan(0);
    if (victor === 'player') expect(g.world.meta.flags['war.first_battle_won']).toBe(true);
  });

  it('withdrawing loses the battle', () => {
    const g = game();
    pend(g, 'act3_ash_line');
    g.queue('war.start', { scenarioId: 'act3_ash_line' });
    g.step(1);
    g.queue('war.retreat', {});
    g.step(1);
    expect(g.world.meta.flags['war.act3_ash_line.result']).toBe('lose');
    expect(events(g, 'battle.ended')[0]?.data.victor).toBe('enemy');
  });

  it('keeps the finished battle readable with its outcome until the next one starts', () => {
    const g = game();
    pend(g, 'act3_bone_field');
    g.queue('war.auto_resolve', {});
    g.step(1);
    expect(g.world.slices.warfare.battle).toBeNull();
    const after = battleView(g.world, g.content);
    expect(after?.scenarioId).toBe('act3_bone_field');
    expect(after?.outcome?.victor).toBe(events(g, 'battle.ended')[0]?.data.victor);
    expect(after?.outcome?.reason.length).toBeGreaterThan(0);
    g.step(5);
    expect(battleView(g.world, g.content)?.outcome).not.toBeNull();
    // the next battle replaces it
    pend(g, 'act3_ash_line');
    g.queue('war.start', { scenarioId: 'act3_ash_line' });
    g.step(1);
    const next = battleView(g.world, g.content);
    expect(next?.scenarioId).toBe('act3_ash_line');
    expect(next?.outcome).toBeNull();
    // a kill_hero objective names its hero in the view (the capture of the archbishop)
    expect(next?.objectives.find((o) => o.kind === 'kill_hero')?.heroId).toBe('severin');
  });

  it('files general.order requests and applies their fallback plan; stale plans are dropped', () => {
    const g = game();
    pend(g, 'act3_bone_field');
    g.queue('war.start', { scenarioId: 'act3_bone_field' });
    g.step(1);
    const req = events(g, 'ai.requested').find((e) => e.data.role === 'general.order');
    expect(req?.data.agentId).toBe('bone_walker');
    g.step(2);
    const plan = lastResult(g, 'war.general_plan');
    expect(plan?.ok).toBe(true);
    expect(plan?.source.type).toBe('fallback');
    const b = g.world.slices.warfare.battle;
    expect(b?.plans.enemy?.source).toBe('rule');
    g.queue('war.general_plan', {
      battleId: b?.id ?? '',
      team: 'enemy',
      generalId: 'bone_walker',
      planId: 'hold',
      revision: (b?.revision ?? 0) - 1,
    });
    g.step(1);
    expect(lastResult(g, 'war.general_plan')).toMatchObject({ ok: false, code: 'stale' });
  });
});

describe('kernel', () => {
  const data = kernelData(content.regiment_types, content.hero_abilities);

  it('caps a single cast at 20 percent of the target regiment (D-012)', () => {
    const setup = buildFieldSetup({
      name: 'cap test',
      teams: {
        player: {
          regiments: [{ typeId: 'militia', count: 10 }],
          heroes: [
            {
              id: 'h',
              name: 'H',
              x: 14,
              y: 10,
              abilities: ['firestorm', 'charge'],
              level: 60,
              attack: 5000,
            },
          ],
        },
        enemy: { regiments: [{ typeId: 'levy', count: 300 }] },
      },
    });
    const state = createBattleState(setup, {
      id: 'b',
      scenarioId: 'cap',
      seed: 1,
      data,
      mode: 'manual',
    });
    const target = state.regiments.find((r) => r.team === 'enemy');
    const hero = state.heroes[0];
    if (!target || !hero) throw new Error('setup');
    target.x = 16;
    target.y = 10;
    const before = target.count;
    const res = castAbility(state, data, hero, 'firestorm', { targetId: target.id });
    expect(res.ok).toBe(true);
    expect(res.felled).toBeGreaterThan(0);
    expect(res.felled).toBeLessThanOrEqual(Math.floor(before * CAST_KILL_CAP));
    const mid = target.count;
    const res2 = castAbility(state, data, hero, 'charge', { targetId: target.id });
    expect(res2.ok).toBe(true);
    expect(res2.felled).toBeLessThanOrEqual(Math.floor(mid * CAST_KILL_CAP));
    expect(target.brokenUntil).toBeGreaterThan(state.time);
  });

  it('fights the act 3 climax with the player hero at the act band at least', () => {
    const content = buildContent();
    const setup = content.battle_scenarios.find((x) => x.id === 'act3_ash_line');
    if (!setup) throw new Error('no ash line');
    const data = kernelData(content.regiment_types, content.hero_abilities);
    const at = (playerLevel: number) =>
      createBattleState(setup, {
        id: 'b',
        scenarioId: setup.id,
        seed: 1,
        data,
        mode: 'manual',
        playerLevel,
      }).heroes.find((h) => h.id === 'player');
    // minLevel 45 (the top of the act 3 band): a story-level player fights as a level 45
    // hero, a stronger one as themselves
    expect(at(12)?.maxHp).toBe(200 + 60 * 45);
    expect(at(52)?.maxHp).toBe(200 + 60 * 52);
    // the act 5 climax floors the player hero at its band (55)
    const finale = content.battle_scenarios.find((x) => x.id === 'act5_final_war');
    if (!finale) throw new Error('no final war');
    const last = createBattleState(finale, {
      id: 'b3',
      scenarioId: finale.id,
      seed: 1,
      data,
      mode: 'manual',
      playerLevel: 12,
    }).heroes.find((h) => h.id === 'player');
    expect(last?.maxHp).toBe(200 + 60 * 55);
    // other scenarios keep the player's own level
    const bone = content.battle_scenarios.find((x) => x.id === 'act3_bone_field');
    if (!bone) throw new Error('no bone field');
    const hero = createBattleState(bone, {
      id: 'b2',
      scenarioId: bone.id,
      seed: 1,
      data,
      mode: 'manual',
      playerLevel: 12,
    }).heroes.find((h) => h.id === 'player');
    expect(hero?.maxHp).toBe(200 + 60 * 12);
  });

  it('resolves contact by expected value and routs broken regiments', () => {
    const setup = buildFieldSetup({
      name: 'clash',
      teams: {
        player: { regiments: [{ typeId: 'greywall_infantry', count: 150 }] },
        enemy: { regiments: [{ typeId: 'levy', count: 150 }] },
      },
    });
    const state = createBattleState(setup, {
      id: 'b',
      scenarioId: 'clash',
      seed: 9,
      data,
      mode: 'auto',
    });
    for (let i = 0; i < 3000 && !state.outcome; i++) stepBattle(state, data);
    expect(state.outcome?.victor).toBe('player');
    const levy = state.regiments.find((r) => r.team === 'enemy');
    expect(levy && (levy.state === 'rout' || levy.state === 'gone')).toBe(true);
  });

  it('auto-resolve is deterministic for the same seed and input', () => {
    const scenario = content.battle_scenarios.find((s) => s.id === 'act2_city_defense');
    if (!scenario) throw new Error('missing scenario');
    const input = {
      setup: scenario,
      units: content.regiment_types,
      abilities: content.hero_abilities,
      seed: 1234,
    };
    const a = autoResolve(input);
    const b = autoResolve(input);
    expect(b).toEqual(a);
    expect(a.seconds).toBeGreaterThan(0);
    expect(['player', 'enemy', 'draw']).toContain(a.victor);
  });

  it('estimates C-layer power monotonic in numbers and quality', () => {
    const u = content.regiment_types;
    const small = estimatePower(u, [{ typeId: 'militia', count: 100 }]);
    const large = estimatePower(u, [{ typeId: 'militia', count: 200 }]);
    const elite = estimatePower(u, [{ typeId: 'greywall_infantry', count: 100 }]);
    expect(Math.abs(large - small * 2)).toBeLessThan(1);
    expect(elite).toBeGreaterThan(small);
  });

  it('builds a field setup that every team can deploy on', () => {
    const setup = buildFieldSetup({
      name: 'field',
      terrain: 'forest',
      teams: {
        player: {
          regiments: [
            { typeId: 'militia', count: 50 },
            { typeId: 'hunters', count: 20 },
          ],
        },
        enemy: { regiments: [{ typeId: 'skeleton', count: 80 }] },
      },
    });
    expect(setup.rows).toHaveLength(setup.height);
    expect(setup.teams.player.regiments.every((r) => r.x < setup.width / 2)).toBe(true);
    expect(setup.teams.enemy.regiments.every((r) => r.x > setup.width / 2)).toBe(true);
    expect(Object.values(setup.legend)).toEqual(['forest']);
  });
});
