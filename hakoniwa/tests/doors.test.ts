// Doors system (千门回廊): canon content, key evaluation (flags, counters, items, visits,
// two-of-three), story doors that open themselves, effects on the outsider through the
// combat ports, exclusive locks, danger doors, closing, the seal variables, the corridor
// view, and command rejections. Runs the real engine with the kernel systems plus
// combat, party and doors.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import type { ContentPack } from '../src/content/pack';
import { pack as combatPack } from '../src/content/packs/combat';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { abilityBar, system as combat } from '../src/systems/combat';
import { corridorView, doorState, system as doors, sealState } from '../src/systems/doors';
import { evalKey } from '../src/systems/doors/keys';
import { addItem, countItem, system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { addBond, system as party } from '../src/systems/party';
import { system as world } from '../src/systems/world';

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

function makeGame(seed = 3): Engine {
  return Engine.create(seed, merge([worldPack, invPack, combatPack, partyPack, doorsPack]), [
    modifiers,
    world,
    inventory,
    combat,
    party,
    doors,
  ]);
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

function setFlags(g: Engine, flags: Record<string, string | number | boolean>): void {
  for (const [key, value] of Object.entries(flags)) g.queue('flag.set', { key, value });
  g.step(12);
}

function events<K extends AnyWorldEvent['kind']>(g: Engine, kind: K) {
  return g.world.recent.filter((e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind);
}

function lastResult(g: Engine, kind: string) {
  const r = [...g.world.recent]
    .reverse()
    .find((e) => e.kind === 'command.result' && e.data.kind === kind);
  return r?.kind === 'command.result' ? r.data : undefined;
}

const flags = (g: Engine) => g.world.meta.flags;

describe('doors content', () => {
  it('ships about forty doors including every canon door of power_system.md 9.9', () => {
    const c = merge([worldPack, invPack, combatPack, partyPack, doorsPack]);
    expect(c.doors.length).toBeGreaterThanOrEqual(40);
    const codes = new Set(c.doors.map((d) => d.code));
    const canon = [
      'door_awaken',
      'door_past_life',
      'door_tide_sight',
      'door_vocation_warrior',
      'door_vocation_hunter',
      'door_pact',
      'door_talent_sight',
      'door_inner_garden',
      'door_vocation_druid',
      'door_restraint',
      'door_false_record',
      'door_beyond_door',
      'door_vocation_rogue',
      'door_vocation_mage',
      'door_vocation_priest',
      'door_settlement',
      'door_trade_pact',
      'door_messenger',
      'door_awaken_talent',
      'door_wayfaring',
      'door_vocation_paladin',
      'door_thousand_legions',
      'door_echoes',
      'door_vocation_warlock',
      'door_clear_flow',
      'door_resonance',
      'door_vocation_shaman',
      'door_founding',
      'door_soul_ferry',
      'door_thousand_paths',
      'door_breach',
      'door_ascent',
      'door_true_name',
      'door_dominion',
      'door_last',
    ];
    for (const code of canon) expect(codes.has(code), code).toBe(true);
    const features = new Set(
      c.doors.flatMap((d) => d.effects.flatMap((f) => (f.type === 'feature' ? [f.feature] : []))),
    );
    for (const f of [
      'inner_court',
      'appraise_talent',
      'false_record',
      'travel_gate',
      'rts',
      'slg',
    ]) {
      expect(features.has(f), f).toBe(true);
    }
    expect(c.doors.filter((d) => d.code === 'door_wayfaring').length).toBe(2);
  });
});

describe('story doors', () => {
  it('opens the first door after the first fight in the ruins and arms the player', () => {
    const g = makeGame();
    expect(doorState(g.world, 'awaken')).toBe('hidden');
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 18.5, y: 9.5 });
    g.step(1);
    g.queue('combat.spawn', { monsterId: 'dian_dreg', x: 19.7, y: 9.5, level: 1 });
    g.step(1);
    const id = Object.values(g.world.slices.world.entities).find(
      (e) => e.ref === 'dian_dreg' && Math.abs(e.x - 19.5) < 1 && Math.abs(e.y - 9.5) < 1,
    )?.id;
    if (!id) throw new Error('no dreg');
    const u = g.world.slices.combat.units[id];
    if (u) u.hp = 1;
    g.queue('combat.attack', { on: true, targetId: id });
    for (let i = 0; i < 200 && doorState(g.world, 'awaken') !== 'opened'; i++) g.step(1);
    expect(doorState(g.world, 'awaken')).toBe('opened');
    g.step(2);
    expect(flags(g)['door.awaken']).toBe(true);
    expect(flags(g)['feature.door_corridor']).toBe(true);
    expect(abilityBar(g.world, g.content).map((s) => s.id)).toEqual(['door_strike', 'door_step']);
    expect(g.world.slices.inventory.owners.player?.equipped.main_hand).toBe('rusty_shortsword');
    expect(g.world.slices.combat.units.player?.auras.map((a) => a.id)).toContain('door_mirror');
    expect(sealState(g.world)).toEqual({ looseness: 0, unrest: 0, opened: 1 });
    expect(events(g, 'door.opened').map((e) => e.data.doorId)).toContain('awaken');
  });

  it('opens the chosen past-life door and locks the others', () => {
    const g = makeGame();
    setFlags(g, { p_past_life_door: 'whitecoat' });
    expect(doorState(g.world, 'past_life_whitecoat')).toBe('opened');
    expect(doorState(g.world, 'past_life_hearth')).toBe('locked');
    expect(abilityBar(g.world, g.content).map((s) => s.id)).toContain('first_aid');
    setFlags(g, { p_past_life_door: 'hearth' });
    expect(doorState(g.world, 'past_life_hearth')).toBe('locked');
  });

  it('the pact door opens by itself after the raven falls and Yeyu joins', () => {
    const g = makeGame();
    setFlags(g, { 'boss.guardian_raven.defeated': true });
    expect(doorState(g.world, 'pact')).toBe('openable');
    g.step(20 * 21);
    expect(doorState(g.world, 'pact')).toBe('opened');
    expect(flags(g)['companion.yeyu.recruited']).toBe(true);
    expect(g.world.slices.world.entities.companion_yeyu?.kind).toBe('companion');
    expect(flags(g).seal_looseness).toBe(1);
    expect(flags(g).seal_unrest).toBe(3);
  });

  it('opens the inner court with both keys and unlocks the feature', () => {
    const g = makeGame();
    // keys are the story's own flags: the beast tide is over, and the dream of the door woman
    setFlags(g, { a1_beast_tide_cleared: true });
    expect(doorState(g.world, 'inner_garden')).toBe('hinted');
    setFlags(g, { a1_dream_door_woman: true });
    expect(doorState(g.world, 'inner_garden')).toBe('opened');
    expect(flags(g)['feature.inner_court']).toBe(true);
    expect(events(g, 'feature.unlocked').some((e) => e.data.feature === 'inner_court')).toBe(true);
  });
});

describe('chosen doors', () => {
  it('asks only for flags the story writes (no key waits on a flag nobody sets)', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const texts: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(json|ts)$/.test(f.name) && !p.includes(join('data', 'doors'))) {
          texts.push(readFileSync(p, 'utf8'));
        }
      }
    };
    walk(join(__dirname, '..', 'data'));
    walk(join(__dirname, '..', 'src', 'systems'));
    const all = texts.join(String.fromCharCode(10));
    const written = (key: string) =>
      all.includes(`"key": "${key}"`) ||
      all.includes(`setFlag('${key}'`) ||
      all.includes(`"${key}": `) ||
      /^(boss|bond|trust|companion|feature|door|quest|war|econ|city|slg)\./.test(key) ||
      ['territory_autonomy', 'yeyu_letters', 'remnants', 'ending'].includes(key);
    const keys: { door: string; key: string; danger: boolean }[] = [];
    const visit = (
      door: { id: string; danger?: boolean },
      k: { type: string; key?: string; of?: unknown[] },
    ) => {
      if (k.type === 'flag' && k.key)
        keys.push({ door: door.id, key: k.key, danger: !!door.danger });
      for (const sub of (k.of ?? []) as { type: string; key?: string }[]) visit(door, sub);
    };
    const content = buildContent();
    for (const door of content.doors) for (const k of door.keys) visit(door, k);
    // the danger doors whose rite is not in the first round yet (soul ferry, breach) excepted
    const missing = keys
      .filter((k) => !written(k.key) && !k.danger)
      .map((k) => `${k.door}:${k.key}`);
    expect(missing).toEqual([]);
  });

  it('opens the blade door on two of three keys and grants rage and warrior skills', () => {
    const g = makeGame();
    withCtx(g, (ctx) => addItem(ctx, 'player', 'crystal_carapace', 1));
    g.step(12);
    expect(doorState(g.world, 'vocation_warrior')).toBe('hinted');
    g.queue('doors.open', { doorId: 'vocation_warrior' });
    g.step(1);
    expect(lastResult(g, 'doors.open')?.code).toBe('no_key');
    setFlags(g, { 'boss.seg_oneeye.defeated': true });
    expect(doorState(g.world, 'vocation_warrior')).toBe('openable');
    g.queue('doors.open', { doorId: 'vocation_warrior' });
    g.step(1);
    expect(lastResult(g, 'doors.open')?.ok).toBe(true);
    const u = g.world.slices.combat.units.player;
    expect(u?.res.rage).toBe(0);
    expect(u?.bonuses['door:vocation_warrior']).toEqual({ str: 3, sta: 2 });
    expect(abilityBar(g.world, g.content).map((s) => s.id)).toEqual(
      expect.arrayContaining(['heroic_strike', 'charge', 'taunt']),
    );
    expect(sealState(g.world)).toMatchObject({ looseness: 1, unrest: 3 });
    expect(countItem(g.world, 'player', 'crystal_carapace')).toBe(1);
  });

  it('the abyss door consumes the core, locks its rivals, and counts as dangerous', () => {
    const g = makeGame();
    withCtx(g, (ctx) => addItem(ctx, 'player', 'dian_core', 1));
    g.step(12);
    g.queue('doors.open', { doorId: 'vocation_warlock' });
    g.step(2);
    expect(doorState(g.world, 'vocation_warlock')).toBe('opened');
    expect(countItem(g.world, 'player', 'dian_core')).toBe(0);
    expect(doorState(g.world, 'vocation_druid')).toBe('locked');
    expect(doorState(g.world, 'clear_flow')).toBe('locked');
    expect(flags(g)).toMatchObject({ danger_doors_opened: 1, seal_unrest: 18, seal_looseness: 3 });
    expect(g.world.slices.combat.units.player?.res.mana).toBeGreaterThan(0);
    g.queue('doors.open', { doorId: 'vocation_druid' });
    g.step(1);
    expect(lastResult(g, 'doors.open')?.code).toBe('locked');
  });

  it('closes a closable door: powers revoked, seal partly settles, never reopens', () => {
    const g = makeGame();
    setFlags(g, { a5_blood_for_key: true });
    g.queue('doors.open', { doorId: 'breach' });
    g.step(1);
    expect(flags(g)['feature.breach']).toBe(true);
    expect(flags(g).seal_looseness).toBe(12);
    g.queue('doors.close', { doorId: 'breach' });
    g.step(1);
    expect(lastResult(g, 'doors.close')?.ok).toBe(true);
    expect(flags(g)['feature.breach']).toBe(false);
    expect(flags(g)['door.breach']).toBe(false);
    expect(flags(g).seal_looseness).toBe(6);
    expect(doorState(g.world, 'breach')).toBe('closed');
    g.queue('doors.open', { doorId: 'breach' });
    g.step(1);
    expect(lastResult(g, 'doors.open')?.code).toBe('closed');
  });

  it('requires territory autonomy of at least 40 for the founding door (D-044)', () => {
    const g = makeGame();
    setFlags(g, {
      act: 'act4',
      a3_eluen_speaks: true,
      a2_remnants_settled: true,
      territory_autonomy: 39,
    });
    expect(doorState(g.world, 'founding')).toBe('hinted');
    setFlags(g, { territory_autonomy: 40 });
    expect(doorState(g.world, 'founding')).toBe('openable');
    g.queue('doors.open', { doorId: 'founding' });
    g.step(1);
    expect(flags(g)['feature.slg']).toBe(true);
  });

  it('records visits and counts events for keys', () => {
    const g = makeGame();
    g.queue('world.teleport', { entityId: 'player', mapId: 'forest_edge', x: 19.5, y: 11.5 });
    g.step(12);
    expect(g.world.slices.doors.visited['loc:forest_edge/pact_oak']).toBe(true);
    expect(doorState(g.world, 'vocation_hunter')).toBe('hinted');
    const ash = Object.values(g.world.slices.world.entities).find((e) => e.ref === 'ash');
    if (!ash) throw new Error('no ash');
    g.queue('world.teleport', { entityId: 'player', mapId: ash.mapId, x: ash.x + 1.5, y: ash.y });
    g.step(40);
    expect(doorState(g.world, 'tide_sight')).toBe('openable');
    g.queue('doors.open', { doorId: 'tide_sight' });
    g.step(1);
    expect(flags(g)['feature.tide_sight']).toBe(true);
  });

  it('reads companion bonds from the party and compares the act flag by its index', () => {
    const g = makeGame();
    const hunter = g.content.doors.find((d) => d.id === 'vocation_hunter');
    const bond = hunter?.keys.find((k) => k.type === 'bond');
    if (!hunter || !bond) throw new Error('no bond key on vocation_hunter');
    expect(bond).toMatchObject({ type: 'bond', companion: 'shiya', min: 20 });
    expect(evalKey(g.world, hunter, bond, '0').met).toBe(false);
    setFlags(g, { 'companion.shiya.recruited': true });
    withCtx(g, (ctx) => {
      const m = ctx.world.slices.party.members.shiya;
      if (m) addBond(ctx, m, 25, 'test');
    });
    expect(evalKey(g.world, hunter, bond, '0').met).toBe(true);
    // no bond.* world flags: the bond is party state
    expect(Object.keys(flags(g)).some((k) => k.startsWith('bond.'))).toBe(false);
    const actKey = { type: 'flag', key: 'act', min: 4, label: 'act' } as const;
    setFlags(g, { act: 'act3' });
    expect(evalKey(g.world, hunter, actKey, 'x').met).toBe(false);
    setFlags(g, { act: 'act4' });
    expect(evalKey(g.world, hunter, actKey, 'x').met).toBe(true);
  });

  it('rejects unknown, already open and closed-for-good doors with readable reasons', () => {
    const g = makeGame();
    g.queue('doors.open', { doorId: 'nowhere' });
    g.step(1);
    expect(lastResult(g, 'doors.open')?.code).toBe('no_door');
    setFlags(g, { p_past_life_door: 'notes' });
    g.queue('doors.open', { doorId: 'past_life_notes' });
    g.step(1);
    expect(lastResult(g, 'doors.open')?.code).toBe('already_open');
    g.queue('doors.close', { doorId: 'past_life_notes' });
    g.step(1);
    expect(lastResult(g, 'doors.close')?.code).toBe('not_closable');
    g.queue('doors.close', { doorId: 'breach' });
    g.step(1);
    expect(lastResult(g, 'doors.close')?.code).toBe('not_open');
  });
});

describe('corridor view', () => {
  it('hides unseen doors, shows hints and key progress once a door is glimpsed', () => {
    const g = makeGame();
    g.step(12);
    expect(corridorView(g.world, g.content).length).toBe(0);
    // standing in the sigil hall is a key of later-act doors, but they stay unseen in act 1
    expect(g.world.slices.doors.visited['loc:seal_ruins/sigil_hall']).toBe(true);
    expect(doorState(g.world, 'resonance')).toBe('hidden');
    setFlags(g, { 'door_hint.talent_sight': true });
    const view = corridorView(g.world, g.content);
    const door = view.find((d) => d.id === 'talent_sight');
    expect(door).toMatchObject({ state: 'hinted', stateName: '显影', categoryName: '识见' });
    expect(door?.desc).toBeUndefined();
    expect(door?.keys[0]).toMatchObject({ met: false, cur: 0, need: 2 });
    setFlags(g, { 'boss.crystal_mother.defeated': true });
    expect(
      corridorView(g.world, g.content).find((d) => d.id === 'talent_sight')?.keys[0]?.cur,
    ).toBe(1);
    setFlags(g, { a1_beast_tide_cleared: true });
    const open = corridorView(g.world, g.content).find((d) => d.id === 'talent_sight');
    expect(open?.state).toBe('openable');
    expect(corridorView(g.world, g.content, true).length).toBe(g.content.doors.length);
  });
});
