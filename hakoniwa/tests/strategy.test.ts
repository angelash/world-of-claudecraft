// Strategy (SLG) system: continent content, the dormant-until-feature.slg rule, founding
// the nation behind the autonomy gate (D-044), diplomacy with utility acceptance and
// truces (D-049), ruler.policy permissions and fallbacks, manual battles through the
// warfare kernel, the conclave, the release index (D-043) and determinism.

import { describe, expect, it } from 'vitest';
import { buildContent, validateContent } from '../src/content';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as strategyPack } from '../src/content/packs/strategy';
import { pack as warfarePack } from '../src/content/packs/warfare';
import { pack as worldPack } from '../src/content/packs/world';
import type { AnyWorldEvent, CommandKind, FlagValue } from '../src/core/contracts';
import type { Engine } from '../src/core/engine';
import { worldHash } from '../src/core/save';
import { calendarAt, tickAtDay } from '../src/core/time';
import { createGame } from '../src/game/create';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import {
  continentView,
  diplomacyView,
  nationView,
  releaseIndex,
  system as strategy,
} from '../src/systems/strategy';
import { system as warfare } from '../src/systems/warfare';
import { system as world } from '../src/systems/world';

const PACKS = [inventoryPack, strategyPack, warfarePack, worldPack];
const content = buildContent(PACKS);

function game(seed = 11): Engine {
  return createGame({ seed, content, systems: [modifiers, world, inventory, warfare, strategy] });
}

function flags(g: Engine, values: Record<string, FlagValue>): void {
  for (const [key, value] of Object.entries(values)) g.queue('flag.set', { key, value });
  g.step(1);
}

/** Step to just after the next game midnight (one strategy day). */
function nextDay(g: Engine, days = 1): void {
  for (let i = 0; i < days; i++) {
    const day = calendarAt(g.tick).dayIndex + 1;
    g.step(tickAtDay(day, 0, 1) - g.tick);
  }
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

function founded(seed = 11): Engine {
  const g = game(seed);
  flags(g, { 'feature.slg': true, territory_autonomy: 45, act: 'act4' });
  g.queue('slg.found_nation', { name: '庭外之国' });
  g.step(1);
  return g;
}

describe('strategy content', () => {
  it('validates a connected continent of about thirty provinces and seven powers', () => {
    expect(validateContent(content, PACKS)).toEqual([]);
    expect(content.slg_provinces.length).toBeGreaterThanOrEqual(28);
    expect(content.slg_nations.map((n) => n.id).sort()).toEqual(
      ['empire', 'holy_see', 'league', 'lothar', 'nightrealm', 'silva', 'windfang'].sort(),
    );
    const v = continentView(
      createGame({ seed: 1, content, systems: [modifiers, world, inventory, warfare, strategy] })
        .world,
      content,
    );
    expect(v.provinces.find((p) => p.id === 'ash_border')?.owner).toBe('lothar');
    expect(v.provinces.find((p) => p.id === 'ash_middle')?.owner).toBeNull();
  });
});

describe('daily step', () => {
  it('stays dormant before feature.slg but writes the release index', () => {
    const g = game();
    nextDay(g);
    expect(events(g, 'ai.requested').filter((e) => e.data.role === 'ruler.policy')).toHaveLength(0);
    expect(typeof g.world.meta.flags.release_index).toBe('number');
    expect(g.world.meta.flags.release_index).toBe(g.world.slices.strategy.releaseIndex);
    g.queue('slg.move_army', { armyId: 'lothar_north', to: 'wallenburg' });
    g.step(1);
    expect(lastResult(g, 'slg.move_army')).toMatchObject({ ok: false, code: 'dormant' });
  });

  it('computes the release index as the population-weighted autonomy minus divine reliance', () => {
    const g = game();
    nextDay(g);
    const s = g.world.slices.strategy;
    let w = 0;
    let t = 0;
    for (const n of content.slg_nations) {
      const pop = content.slg_provinces
        .filter((p) => p.owner === n.id)
        .reduce((a, p) => a + p.population, 0);
      w += pop * (n.autonomy - n.divineReliance);
      t += pop;
    }
    expect(s.releaseIndex).toBe(Math.round(w / t));
    expect(releaseIndex(s, g.world.meta.flags, g.world.slices.modifiers)).toBe(s.releaseIndex);
  });

  it('files quarterly ruler.policy requests whose fallbacks pass permission checks', () => {
    const g = game();
    flags(g, { 'feature.slg': true });
    nextDay(g, 28);
    const reqs = events(g, 'ai.requested').filter((e) => e.data.role === 'ruler.policy');
    expect(reqs.map((e) => e.data.agentId).sort()).toEqual(
      content.slg_nations.map((n) => n.id).sort(),
    );
    nextDay(g);
    const policies = g.world.recent.filter((e) => e.kind === 'slg.policy');
    expect(policies.length).toBeGreaterThan(0);
  });
});

describe('ruler.policy permissions', () => {
  it('rejects the player, stale revisions and P4 intents', () => {
    const g = game();
    flags(g, { 'feature.slg': true });
    const rev = g.world.slices.strategy.nations.empire?.revision ?? 0;
    g.queue('slg.ruler_policy', { nationId: 'empire', intent: 'develop', revision: rev });
    g.step(1);
    expect(lastResult(g, 'slg.ruler_policy')).toMatchObject({ ok: false, code: 'not_yours' });
    const script = { type: 'script', script: 'test' } as const;
    g.queue(
      'slg.ruler_policy',
      { nationId: 'empire', intent: 'develop', revision: rev - 1 },
      script,
    );
    g.step(1);
    expect(lastResult(g, 'slg.ruler_policy')).toMatchObject({ ok: false, code: 'stale' });
    g.queue(
      'slg.ruler_policy',
      { nationId: 'empire', intent: 'seize_capital' as 'develop', revision: rev },
      script,
    );
    g.step(1);
    expect(lastResult(g, 'slg.ruler_policy')).toMatchObject({ ok: false, code: 'forbidden' });
    g.queue('slg.ruler_policy', { nationId: 'empire', intent: 'develop', revision: rev }, script);
    g.step(1);
    expect(lastResult(g, 'slg.ruler_policy')?.ok).toBe(true);
    expect(g.world.slices.strategy.nations.empire?.revision).toBe(rev + 1);
    // P3 needs a target and respects the cooldown
    g.queue(
      'slg.ruler_policy',
      { nationId: 'empire', intent: 'declare_war', revision: rev + 1 },
      script,
    );
    g.step(1);
    expect(lastResult(g, 'slg.ruler_policy')).toMatchObject({ ok: false, code: 'bad_target' });
  });
});

describe('founding and diplomacy', () => {
  it('opens the founding gate only with feature.slg and territory autonomy of 40', () => {
    const g = game();
    g.queue('slg.found_nation', {});
    g.step(1);
    expect(lastResult(g, 'slg.found_nation')).toMatchObject({ ok: false, code: 'locked' });
    flags(g, { 'feature.slg': true, territory_autonomy: 39 });
    g.queue('slg.found_nation', {});
    g.step(1);
    expect(lastResult(g, 'slg.found_nation')).toMatchObject({ ok: false, code: 'autonomy' });
    flags(g, { territory_autonomy: 40 });
    g.queue('slg.found_nation', { name: '门之国' });
    g.step(1);
    expect(lastResult(g, 'slg.found_nation')?.ok).toBe(true);
    expect(g.world.meta.flags['slg.nation_founded']).toBe(true);
    expect(events(g, 'slg.nation_founded')[0]?.data.provinces).toContain('ash_border');
    const v = nationView(g.world, content, 'player');
    expect(v?.name).toBe('门之国');
    expect(v?.provinces.map((p) => p.id)).toEqual(['ash_border', 'ash_rim']);
    g.queue('slg.found_nation', {});
    g.step(1);
    expect(lastResult(g, 'slg.found_nation')).toMatchObject({ ok: false, code: 'already' });
  });

  it('lets AI powers accept or refuse by utility', () => {
    const g = founded();
    g.queue('slg.diplomacy', { to: 'league', action: 'trade' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')?.ok).toBe(true);
    g.queue('slg.diplomacy', { to: 'holy_see', action: 'alliance' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')).toMatchObject({ ok: false, code: 'refused' });
    g.queue('slg.diplomacy', { to: 'empire', action: 'recognize' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')?.ok).toBe(true);
    expect(g.world.slices.strategy.nations.player?.recognizedBy).toContain('empire');
    const row = diplomacyView(g.world, content).find((r) => r.nation === 'league');
    expect(row?.treaties).toContain('trade');
    g.queue('slg.diplomacy', { from: 'empire', to: 'lothar', action: 'declare_war' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')).toMatchObject({ ok: false, code: 'not_yours' });
  });

  it('enforces the truce after peace (D-049): this act and at least one season', () => {
    const g = founded();
    g.queue('slg.diplomacy', { to: 'lothar', action: 'declare_war' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')?.ok).toBe(true);
    expect(events(g, 'slg.war_declared')[0]?.data).toMatchObject({
      attacker: 'player',
      defender: 'lothar',
    });
    const s = g.world.slices.strategy;
    g.queue('slg.diplomacy', { to: 'lothar', action: 'peace' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')).toMatchObject({ ok: false, code: 'refused' });
    const lothar = s.nations.lothar;
    if (lothar) lothar.warWeariness = 50;
    g.queue('slg.diplomacy', { to: 'lothar', action: 'peace' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')?.ok).toBe(true);
    expect(s.wars).toHaveLength(0);
    g.queue('slg.diplomacy', { to: 'lothar', action: 'declare_war' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')).toMatchObject({ ok: false, code: 'truce' });
    // a new act alone is not enough while the season has not passed
    flags(g, { act: 'act5' });
    g.queue('slg.diplomacy', { to: 'lothar', action: 'declare_war' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')).toMatchObject({ ok: false, code: 'truce' });
    for (const t of s.truces) t.untilDay = s.day;
    g.queue('slg.diplomacy', { to: 'lothar', action: 'declare_war' });
    g.step(1);
    expect(lastResult(g, 'slg.diplomacy')?.ok).toBe(true);
  });
});

describe('war on the continent', () => {
  it('routes a player battle through war.pending and applies the manual result', () => {
    const g = founded();
    g.queue('slg.set_battle_mode', { mode: 'manual' });
    g.queue('slg.diplomacy', { to: 'lothar', action: 'declare_war' });
    g.step(1);
    const s = g.world.slices.strategy;
    const north = s.armies.lothar_north;
    if (!north) throw new Error('missing army');
    north.province = 'ash_border';
    north.path = [];
    const before = Object.values(s.armies)
      .filter((a) => a.province === 'ash_border')
      .reduce((t, a) => t + a.regiments.reduce((x, r) => x + r.count, 0), 0);
    nextDay(g);
    const pending = String(g.world.meta.flags['war.pending'] ?? '');
    expect(pending.startsWith('slg_')).toBe(true);
    expect(s.pendingBattle?.province).toBe('ash_border');
    expect(s.armies.player_guard?.frozen).toBe(true);
    g.queue('war.auto_resolve', {});
    g.step(1);
    expect(lastResult(g, 'war.auto_resolve')?.ok).toBe(true);
    expect(s.pendingBattle).toBeNull();
    const battle = events(g, 'slg.battle')[0]?.data;
    expect(battle?.manual).toBe(true);
    expect(battle?.provinceId).toBe('ash_border');
    const after = ['lothar_north', 'player_guard']
      .map((id) => s.armies[id])
      .reduce((t, a) => t + (a?.regiments.reduce((x, r) => x + r.count, 0) ?? 0), 0);
    expect(after).toBeLessThan(before);
    expect(Object.values(s.armies).every((a) => !a.frozen)).toBe(true);
  });

  it('auto-resolves AI battles and moves armies along links', () => {
    const g = founded();
    g.queue('slg.move_army', { armyId: 'player_guard', to: 'wallenburg' });
    g.step(1);
    expect(lastResult(g, 'slg.move_army')).toMatchObject({ ok: false, code: 'no_path' });
    g.queue('slg.diplomacy', { to: 'lothar', action: 'declare_war' });
    g.queue('slg.move_army', { armyId: 'player_guard', to: 'wallenburg' });
    g.step(1);
    expect(lastResult(g, 'slg.move_army')?.ok).toBe(true);
    expect(g.world.slices.strategy.armies.player_guard?.path).toEqual(['wallenburg']);
    nextDay(g, 5);
    const s = g.world.slices.strategy;
    const guard = s.armies.player_guard;
    const fought = events(g, 'slg.battle').length > 0;
    expect(
      fought ||
        guard?.province === 'wallenburg' ||
        (s.provinces.wallenburg?.siege?.progress ?? 0) > 0,
    ).toBe(true);
  });
});

describe('conclave', () => {
  it('runs the staged conclave from the narrative flag and writes its result', () => {
    const g = founded();
    g.queue('slg.diplomacy', { to: 'league', action: 'trade' });
    flags(g, { 'slg.convene': true });
    expect(g.world.slices.strategy.conference?.stage).toBe('invite');
    g.queue('slg.convene', {});
    g.step(1);
    expect(lastResult(g, 'slg.convene')).toMatchObject({ ok: false, code: 'ongoing' });
    nextDay(g, 12);
    expect(g.world.meta.flags['slg.conclave_done']).toBe(true);
    const result = g.world.meta.flags['slg.summit_result'];
    expect(['alliance', 'divided', 'crusade', 'broken']).toContain(result);
    const ev = events(g, 'slg.conclave_result')[0]?.data;
    expect(ev?.result).toBe(result);
    expect(Object.keys(ev?.stances ?? {})).toHaveLength(7);
    g.queue('slg.convene', {});
    g.step(1);
    expect(lastResult(g, 'slg.convene')).toMatchObject({ ok: false, code: 'done' });
  });
});

describe('determinism', () => {
  it('repeats the same continent for the same seed and commands', () => {
    const run = () => {
      const g = founded(5);
      g.queue('slg.diplomacy', { to: 'lothar', action: 'declare_war' });
      g.queue('slg.move_army', { armyId: 'player_guard', to: 'wallenburg' });
      g.step(1);
      nextDay(g, 4);
      return worldHash(g.world);
    };
    expect(run()).toBe(run());
  });
});
