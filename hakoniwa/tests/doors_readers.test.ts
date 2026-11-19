// PK-M1-56, the first batch of door effect readers: the past-life differences of
// prologue_antechamber.md 2.2 (price band, night sight, the bandage, the rumour's source
// tag, the hearth's cooking door and menu), the talent door's potential line and its seen
// flag (act1_borderstone.md 5.3), the catch-up of old saves (the abyss summon, the new
// features and the gift door), the door card's fields (ux_and_onboarding.md 9.2, 9.3, 9.5:
// five danger bands, the cost preview, the shown exclusion counterparts, the "where to
// find" link), the shapeshift door's spring purification (act1_borderstone.md 7.2), the
// door as an identity exposure (builtin_ai.md 5.6 identity_door), the door-resonance
// channel and the validator rules of the new fields. One test per effect, and with no
// effect the behaviour is what it was.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { validateDoors, validateReaders } from '../src/content/packs/doors';
import type { Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import { createGame } from '../src/game/create';
import { appraise } from '../src/systems/cognition/appraise';
import { revokeAbility, unitOf } from '../src/systems/combat';
import {
  corridorView,
  doorReaders,
  nightSightRadius,
  openDoor,
  priceBand,
  purifyOffer,
  resonanceSteps,
  rumorSourceTag,
} from '../src/systems/doors';
import { raiseHint, setState } from '../src/systems/doors/state';
import type { DoorDef, DoorReaders } from '../src/systems/doors/types';
import { addItem, countItem } from '../src/systems/inventory';
import { registerModifier } from '../src/systems/modifiers';
import { npcEntityId } from '../src/systems/npc/personas';
import {
  door,
  events,
  flags,
  lastResult,
  makeGame,
  open,
  setFlags,
  withCtx,
} from './doors_harness';

function doorOf(g: Engine, id: string): DoorDef {
  const d = g.content.doors.find((x) => x.id === id);
  if (!d) throw new Error(`no door ${id}`);
  return d;
}

function state(g: Engine, id: string): string | undefined {
  return g.world.slices.doors.doors[id]?.state;
}

/** A shipped game where the prologue picked this past life (its door opens on its own). */
function pastLife(life: string): Engine {
  const g = makeGame();
  setFlags(g, { p_past_life_door: life });
  return g;
}

const playerUnit = (g: Engine) => unitOf(g.world, g.world.slices.world.playerId);

describe('past-life readers (prologue 2.2)', () => {
  it('abacus: trading shows the rough purchase-price band; without it nothing', () => {
    const plain = makeGame();
    expect(priceBand(plain.world, plain.content, 100)).toBeNull();
    const g = pastLife('abacus');
    expect(state(g, 'past_life_abacus')).toBe('opened');
    expect(flags(g)['feature.price_band']).toBe(true);
    // the shipped spread (a user decision, progress.md 4): 0.2 gives 80 to 120 around 100
    expect(doorReaders(g.content).priceBand?.spread).toBe(0.2);
    expect(priceBand(g.world, g.content, 100)).toEqual({ lo: 80, hi: 120 });
    // outward to whole coins: 33 at 0.15 is 28.05 to 37.95, so 28 to 38
    const content = {
      ...g.content,
      door_readers: { priceBand: { feature: 'price_band', spread: 0.15 } },
    } as ContentMap;
    expect(priceBand(g.world, content, 33)).toEqual({ lo: 28, hi: 38 });
    // a good with no base price has no band
    expect(priceBand(g.world, g.content, 0)).toBeNull();
  });

  it('nightlight: the night sight radius of the data; without it the night keeps its own', () => {
    const plain = makeGame();
    expect(nightSightRadius(plain.world, plain.content)).toBeNull();
    const g = pastLife('nightlight');
    expect(flags(g)['feature.night_sight']).toBe(true);
    // the shipped radius (a user decision, progress.md 4): 12 tiles, the day's radius
    expect(nightSightRadius(g.world, g.content)).toBe(12);
  });

  it('whitecoat: the bandage is the first-aid skill, a heal over eight seconds', () => {
    const g = pastLife('whitecoat');
    expect(state(g, 'past_life_whitecoat')).toBe('opened');
    expect(playerUnit(g)?.abilities).toContain('sk_door_firstaid');
    const skill = g.content.abilities.find((a) => a.id === 'sk_door_firstaid');
    const aura = skill?.effects.find((e) => e.type === 'aura');
    expect(aura && 'aura' in aura ? aura.aura : undefined).toBe('aur_door_firstaid');
    const hot = g.content.auras.find((a) => a.id === 'aur_door_firstaid');
    expect(hot?.duration).toBe(8);
    expect(hot?.periodic?.heal).toBeDefined();
    // another past life does not get it
    expect(playerUnit(pastLife('abacus'))?.abilities).not.toContain('sk_door_firstaid');
  });

  it('notes: a retold rumour carries its teller and "may be distorted"; a seen one does not', () => {
    const plain = makeGame();
    expect(rumorSourceTag(plain.world, plain.content, { from: 'nera', hops: 2 })).toBeNull();
    const g = pastLife('notes');
    expect(flags(g)['feature.rumor_source']).toBe(true);
    expect(rumorSourceTag(g.world, g.content, { from: 'nera', hops: 1 })).toEqual({
      from: 'nera',
      mayDistort: true,
    });
    expect(rumorSourceTag(g.world, g.content, { from: 'seen', hops: 0 })).toEqual({
      from: 'seen',
      mayDistort: false,
    });
  });

  it('hearth: the cooking door is open from the start with no rank, seal or count, and the menu', () => {
    const g = pastLife('hearth');
    const other = pastLife('abacus');
    expect(state(g, 'past_life_hearth')).toBe('opened');
    expect(state(g, 'craft_cooking')).toBe('opened');
    expect(flags(g)['door.craft_cooking']).toBe(true);
    expect(flags(g)['feature.craft_cooking']).toBe(true);
    // the gift moves neither the rank value, the seal nor the door count (thousand_doors 14)
    const s = g.world.slices.doors;
    const o = other.world.slices.doors;
    expect(s.rankPoints).toBe(o.rankPoints);
    expect(s.sealPoints).toBe(o.sealPoints);
    expect(flags(g).doors_opened).toBe(flags(other).doors_opened);
    expect(events(g, 'door.opened').map((e) => e.data.doorId)).toContain('craft_cooking');
    // the first three pages of the otherworld menu
    const pid = g.world.slices.world.playerId;
    expect(countItem(g.world, pid, 'lb_otherworld_menu')).toBe(1);
    expect(countItem(other.world, pid, 'lb_otherworld_menu')).toBe(0);
    expect(state(other, 'craft_cooking')).not.toBe('opened');
  });
});

describe('the talent door potential line (act1 5.3)', () => {
  const WANT: Record<string, string> = {
    ron: '统帅',
    shiya: '猎王',
    barto: '守城',
    viro: '谋士',
    toma: '千里眼',
    isa: '证人',
    noi: '门感',
    popo: '好运',
    dris: '不屈',
    simon: '沃土',
  };

  it('reads the potential of the ten act-1 persons only with the door open', () => {
    const g = createGame({ seed: 5, aiMode: 'off' });
    g.step(2);
    const pid = g.world.slices.world.playerId;
    const talent = g.content.doors.find((d) => d.code === 'door_talent_sight');
    expect(talent?.effects).toContainEqual({ type: 'feature', feature: 'appraise_talent' });
    for (const id of Object.keys(WANT)) {
      expect(g.world.slices.world.entities[npcEntityId(id)], id).toBeDefined();
      expect(appraise(g.world, g.content, pid, npcEntityId(id), 'skill')?.potential, id).toBe(
        undefined,
      );
    }
    withCtx(g, (ctx) => {
      if (talent) openDoor(ctx, talent);
    });
    for (const [id, potential] of Object.entries(WANT))
      expect(appraise(g.world, g.content, pid, npcEntityId(id), 'skill')?.potential, id).toBe(
        potential,
      );
  });

  it('a potential the player reads is seen (npc.<id>.potential_seen); without the door not', () => {
    const g = createGame({ seed: 5, aiMode: 'off' });
    g.step(2);
    const pid = g.world.slices.world.playerId;
    const ron = g.world.slices.world.entities[npcEntityId('ron')];
    if (!ron) throw new Error('no ron');
    const look = () => {
      g.queue('world.teleport', { entityId: pid, mapId: ron.mapId, x: ron.x + 1, y: ron.y });
      g.step(1);
      const r = g.world.slices.world.entities[npcEntityId('ron')];
      g.queue('cognition.appraise', { observerId: pid, targetId: npcEntityId('ron') });
      g.step(1);
      return r;
    };
    look();
    expect(lastResult(g, 'cognition.appraise')?.ok).toBe(true);
    expect(g.world.meta.flags['npc.ron.potential_seen']).toBeUndefined();
    g.queue('flag.set', { key: 'feature.appraise_talent', value: true });
    g.step(1);
    look();
    expect(lastResult(g, 'cognition.appraise')?.ok).toBe(true);
    expect(g.world.meta.flags['npc.ron.potential_seen']).toBe(true);
  });
});

describe('the catch-up of old saves (the abyss summon, PK-M1-26)', () => {
  it('a fresh opening notes what the door gave; the catch-up then finds nothing', () => {
    const g = makeGame();
    withCtx(g, (ctx) => openDoor(ctx, doorOf(g, 'vocation_warlock')));
    expect(playerUnit(g)?.abilities).toContain('sk_lok_summonremnant');
    expect(g.world.slices.doors.granted?.vocation_warlock).toContain(
      'ability:sk_lok_summonremnant',
    );
    // something else takes it away while the door stays open (a jam, a story): it stays away
    withCtx(g, (ctx) =>
      revokeAbility(ctx, ctx.world.slices.world.playerId, 'sk_lok_summonremnant'),
    );
    g.step(40);
    expect(playerUnit(g)?.abilities).not.toContain('sk_lok_summonremnant');
  });

  it('a save from before PK-M1-26 gets the summon once, never twice', () => {
    const g = makeGame();
    withCtx(g, (ctx) => openDoor(ctx, doorOf(g, 'vocation_warlock')));
    // the old save: the door open, the summon missing, nothing noted
    withCtx(g, (ctx) => {
      revokeAbility(ctx, ctx.world.slices.world.playerId, 'sk_lok_summonremnant');
      delete ctx.world.slices.doors.granted;
    });
    expect(playerUnit(g)?.abilities).not.toContain('sk_lok_summonremnant');
    g.step(20);
    expect(playerUnit(g)?.abilities).toContain('sk_lok_summonremnant');
    expect(g.world.slices.doors.granted?.vocation_warlock).toContain(
      'ability:sk_lok_summonremnant',
    );
    withCtx(g, (ctx) =>
      revokeAbility(ctx, ctx.world.slices.world.playerId, 'sk_lok_summonremnant'),
    );
    g.step(40);
    expect(playerUnit(g)?.abilities).not.toContain('sk_lok_summonremnant');
  });

  it('an old save with a past life open gets its new feature and the hearth its cooking door', () => {
    const g = pastLife('hearth');
    const a = pastLife('abacus');
    // the save from before PK-M1-56: the door open, the new effects absent, nothing noted
    withCtx(g, (ctx) => {
      setState(ctx, 'craft_cooking', 'hidden');
      ctx.setFlag('door.craft_cooking', false);
      ctx.setFlag('feature.craft_cooking', false);
      delete ctx.world.slices.doors.granted;
    });
    withCtx(a, (ctx) => {
      ctx.setFlag('feature.price_band', false);
      delete ctx.world.slices.doors.granted;
    });
    g.step(20);
    a.step(20);
    expect(state(g, 'craft_cooking')).toBe('opened');
    expect(flags(g)['feature.craft_cooking']).toBe(true);
    expect(flags(a)['feature.price_band']).toBe(true);
  });

  it('a closed door gives nothing back, and an unopened one nothing at all', () => {
    const g = makeGame();
    g.step(20);
    expect(playerUnit(g)?.abilities).not.toContain('sk_lok_summonremnant');
    expect(g.world.slices.doors.granted).toBeUndefined();
    withCtx(g, (ctx) => openDoor(ctx, doorOf(g, 'vocation_druid')));
    expect(playerUnit(g)?.abilities).toContain('sk_dru_wrath');
    g.queue('doors.close', { doorId: 'vocation_druid' });
    g.step(1);
    expect(state(g, 'vocation_druid')).toBe('closed');
    expect(g.world.slices.doors.granted?.vocation_druid).toBeUndefined();
    g.step(40);
    expect(playerUnit(g)?.abilities).not.toContain('sk_dru_wrath');
    expect(flags(g)['feature.spring_purify']).toBe(false);
  });
});

/** The catalog's danger column (catalog_doors.md 6) for every data door. */
const CATALOG_DANGER: Record<string, string> = {
  awaken: 'none',
  past_life_abacus: 'low',
  past_life_nightlight: 'low',
  past_life_whitecoat: 'low',
  past_life_wrench: 'low',
  past_life_notes: 'low',
  past_life_hearth: 'low',
  past_life_signpost: 'low',
  past_life_podium: 'low',
  tide_sight: 'none',
  pact: 'none',
  talent_sight: 'none',
  inner_garden: 'none',
  vocation_warrior: 'none',
  vocation_hunter: 'low',
  vocation_druid: 'low',
  vocation_warlock: 'high',
  restraint: 'none',
  false_record: 'medium',
  beyond_door: 'none',
  vocation_rogue: 'low',
  vocation_mage: 'low',
  vocation_priest: 'medium',
  settlement: 'none',
  trade_pact: 'low',
  messenger: 'none',
  awaken_talent: 'medium',
  wayfaring: 'low',
  wayfaring_advanced: 'low',
  vocation_paladin: 'medium',
  thousand_legions: 'none',
  echoes: 'low',
  clear_flow: 'low',
  resonance: 'medium',
  vocation_shaman: 'low',
  founding: 'none',
  soul_ferry: 'high',
  thousand_paths: 'medium',
  breach: 'extreme',
  ascent: 'none',
  true_name: 'high',
  dominion: 'extreme',
  last: 'none',
  craft_mining: 'none',
  craft_logging: 'none',
  craft_herbalism: 'none',
  craft_alchemy: 'none',
  craft_cooking: 'none',
  craft_leatherworking: 'none',
  craft_weaponcrafting: 'none',
  garden_granary: 'none',
  truth_flaw: 'none',
};

describe('the door card fields (ux 9.2, 9.3, 9.5)', () => {
  it('every door shows its catalog danger band as 1 (none) to 5 (extreme)', () => {
    const g = makeGame();
    const view = corridorView(g.world, g.content, true);
    expect(Object.fromEntries(view.map((d) => [d.id, d.dangerBand]))).toEqual(CATALOG_DANGER);
    const level = { none: 1, low: 2, medium: 3, high: 4, extreme: 5 } as Record<string, number>;
    for (const d of view) expect(d.dangerLevel, d.id).toBe(level[d.dangerBand ?? '']);
  });

  it('the cost preview is the opening blockage and fatigue, and opening adds it', () => {
    const g = makeGame();
    const card = (id: string) => corridorView(g.world, g.content, true).find((d) => d.id === id);
    expect(card('vocation_warlock')?.costPreview).toEqual({ clog: 10, fatigue: 0 });
    expect(card('vocation_druid')?.costPreview).toEqual({ clog: 0, fatigue: 0 });
    withCtx(g, (ctx) => {
      addItem(ctx, ctx.world.slices.world.playerId, 'dian_core', 1, 'test');
    });
    g.step(20);
    open(g, 'vocation_warlock');
    expect(state(g, 'vocation_warlock')).toBe('opened');
    expect(flags(g).blockage).toBe(10);
  });

  it('the abyss door costs its blockage in act 1 only (6.2 "第一幕握住澱核")', () => {
    const g = makeGame();
    setFlags(g, { act: 'act3' });
    const card = corridorView(g.world, g.content, true).find((d) => d.id === 'vocation_warlock');
    expect(card?.costPreview).toEqual({ clog: 0, fatigue: 0 });
    withCtx(g, (ctx) => openDoor(ctx, doorOf(g, 'vocation_warlock')));
    expect(flags(g).blockage ?? 0).toBe(0);
  });

  it('a door without an opening cost leaves blockage and fatigue as they were', () => {
    const g = makeGame(3, [door('zz_plain')]);
    setFlags(g, { 'test.zz_plain': true });
    open(g, 'zz_plain');
    expect(state(g, 'zz_plain')).toBe('opened');
    expect(g.world.slices.doors.blockage ?? 0).toBe(0);
    expect(g.world.slices.doors.fatigue ?? 0).toBe(0);
  });

  it('lists the exclusion counterpart only once it is shown, and only in its act', () => {
    const g = makeGame();
    withCtx(g, (ctx) => {
      raiseHint(ctx, 'vocation_druid', 2);
    });
    const card = (id: string) => corridorView(g.world, g.content).find((d) => d.id === id);
    // the abyss door is unseen: no word of it (9.2)
    expect(card('vocation_druid')?.exclusiveWith).toEqual([]);
    withCtx(g, (ctx) => {
      raiseHint(ctx, 'vocation_warlock', 2);
    });
    expect(card('vocation_druid')?.exclusiveWith).toEqual(['vocation_warlock']);
    expect(card('vocation_warlock')?.exclusiveWith).toEqual(['vocation_druid']);
    // the act lock of X2 holds in act 1 only
    setFlags(g, { act: 'act2' });
    expect(card('vocation_druid')?.exclusiveWith).toEqual([]);
  });

  it('a key links to its quest once the player has taken the quest up', () => {
    const g = makeGame();
    withCtx(g, (ctx) => {
      raiseHint(ctx, 'vocation_druid', 3);
    });
    const keys = () =>
      corridorView(g.world, g.content).find((d) => d.id === 'vocation_druid')?.keys;
    const herb = () => keys()?.find((k) => k.kind === 'item');
    expect(herb()?.label).toBe('鹿泉的净泉草');
    expect(herb()?.link).toBeUndefined();
    // a quest the player only missed (an outcome written without them) is no link
    setFlags(g, { 'quest.q_a1_s23_deer_spring': 'expired' });
    expect(herb()?.link).toBeUndefined();
    setFlags(g, { 'quest.q_a1_s23_deer_spring': 'active' });
    expect(herb()?.link).toEqual({ kind: 'quest', id: 'q_a1_s23_deer_spring' });
    // a key whose data names no quest has no link
    expect(keys()?.find((k) => k.kind === 'alt')?.link).toBeUndefined();
  });
});

describe('the shapeshift door purifies the north spring (act1 7.2)', () => {
  function atSpring(): Engine {
    const g = createGame({ seed: 5, aiMode: 'off' });
    g.step(2);
    const cfg = doorReaders(g.content).springPurify;
    const place = cfg?.places[0];
    const map = g.content.maps.find((m) => m.id === place?.mapId);
    const loc = map?.locations.find((l) => l.id === place?.location);
    if (!cfg || !place || !loc) throw new Error('no spring in the data');
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.queue('flag.set', { key: cfg.weekFlag, value: 3 });
    g.step(2);
    g.queue('flag.set', { key: cfg.var, value: 40 });
    g.queue('world.teleport', {
      entityId: g.world.slices.world.playerId,
      mapId: place.mapId,
      x: loc.x + Math.floor(loc.w / 2),
      y: loc.y + Math.floor(loc.h / 2),
    });
    g.step(2);
    return g;
  }

  function purify(g: Engine) {
    g.queue('doors.purify', {});
    g.step(1);
    return lastResult(g, 'doors.purify');
  }

  function grant(g: Engine): NonNullable<DoorReaders['springPurify']> {
    const cfg = doorReaders(g.content).springPurify;
    if (!cfg) throw new Error('no purification data');
    g.queue('flag.set', { key: `feature.${cfg.feature}`, value: true });
    g.step(1);
    return cfg;
  }

  it('the shapeshift door gives the purification of a1_town_dian, -10 a week', () => {
    const g = makeGame();
    const cfg = doorReaders(g.content).springPurify;
    expect(doorOf(g, 'vocation_druid').effects).toContainEqual({
      type: 'feature',
      feature: cfg?.feature,
    });
    expect(cfg).toMatchObject({ var: 'a1_town_dian', amount: -10, min: 0, weekFlag: 'act_week' });
  });

  it('without the door nothing is offered and the command refuses', () => {
    const g = atSpring();
    const cfg = doorReaders(g.content).springPurify;
    expect(purifyOffer(g.world, g.content)).toBeNull();
    expect(purify(g)?.code).toBe('locked');
    expect(flags(g)[cfg?.var ?? '']).toBe(40);
  });

  it('lowers the town sediment by the data amount once a week, at the spring only', () => {
    const g = atSpring();
    const cfg = grant(g);
    expect(purifyOffer(g.world, g.content)).toMatchObject({ ready: true, block: null });
    expect(purify(g)?.ok).toBe(true);
    expect(flags(g)[cfg.var]).toBe(30);
    expect(events(g, 'doors.purified').at(-1)?.data).toMatchObject({ from: 40, to: 30 });
    // once a week
    expect(purifyOffer(g.world, g.content)).toMatchObject({ ready: false, block: 'done' });
    expect(purify(g)?.code).toBe('done');
    expect(flags(g)[cfg.var]).toBe(30);
    // the next week again (the week's own rise lands first)
    g.queue('flag.set', { key: cfg.weekFlag, value: 4 });
    g.step(2);
    const before = Number(flags(g)[cfg.var]);
    expect(purify(g)?.ok).toBe(true);
    expect(flags(g)[cfg.var]).toBe(before - 10);
    // away from the spring: no offer and a refusal
    g.queue('world.teleport', {
      entityId: g.world.slices.world.playerId,
      mapId: 'borderstone',
      x: 5,
      y: 5,
    });
    g.queue('flag.set', { key: cfg.weekFlag, value: 5 });
    g.step(2);
    expect(purifyOffer(g.world, g.content)).toBeNull();
    expect(purify(g)?.code).toBe('not_here');
  });

  it('never goes below the floor, and refuses a clear spring', () => {
    const g = atSpring();
    const cfg = grant(g);
    g.queue('flag.set', { key: cfg.var, value: 4 });
    g.step(1);
    expect(purify(g)?.ok).toBe(true);
    expect(flags(g)[cfg.var]).toBe(0);
    // the next week, once its own rise has landed, the spring is wiped clean
    g.queue('flag.set', { key: cfg.weekFlag, value: 4 });
    g.step(2);
    g.queue('flag.set', { key: cfg.var, value: 0 });
    g.step(1);
    expect(purify(g)?.code).toBe('clear');
    expect(flags(g)[cfg.var]).toBe(0);
  });

  it('refuses outside its act and before the first week', () => {
    const g = atSpring();
    const cfg = grant(g);
    g.queue('flag.set', { key: 'act', value: 'act2' });
    g.step(1);
    expect(purify(g)?.code).toBe('not_now');
    expect(flags(g)[cfg.var]).toBe(40);
    // before the first week of its week flag (the act clock writes act_week from 1, so the
    // reading is checked on a week flag nothing has written yet)
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.step(1);
    const unset = { ...g.content, door_readers: { springPurify: { ...cfg, weekFlag: 'zz_week' } } };
    expect(purifyOffer(g.world, unset as ContentMap)).toMatchObject({ block: 'not_now' });
    expect(purifyOffer(g.world, g.content)).toMatchObject({ block: null });
  });
});

describe('the door as an identity exposure (builtin_ai 5.6 identity_door)', () => {
  it('a real death: the body goes into a door where it falls and comes out where it reforms', () => {
    const g = makeGame();
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 40.5 });
    g.step(1);
    g.queue('combat.spawn', {
      monsterId: 'black_ridge',
      mapId: 'seal_ruins',
      x: 33.6,
      y: 40.5,
      level: 11,
    });
    g.step(1);
    const u = g.world.slices.combat.units.player;
    if (u) u.hp = 1;
    for (let i = 0; i < 2000 && events(g, 'combat.player_returned').length === 0; i++) g.step(1);
    const died = events(g, 'entity.died').find((e) => e.data.id === 'player');
    const back = events(g, 'combat.player_returned').at(-1);
    if (!died || !back) throw new Error('the player did not fall and return');
    // exactly two: in at the fall, out at the return (a monster's death is none)
    expect(events(g, 'identity.exposed').map((e) => e.data)).toEqual([
      { kind: 'identity_door', mapId: died.data.mapId, x: died.data.x, y: died.data.y },
      { kind: 'identity_door', mapId: back.data.toMap, x: back.data.toX, y: back.data.toY },
    ]);
  });

  it('another entity dying exposes nothing', () => {
    const g = makeGame();
    withCtx(g, (ctx) => {
      ctx.emit('entity.died', { id: 'mon_x', kind: 'monster', mapId: 'seal_ruins', x: 1, y: 1 });
    });
    g.step(1);
    expect(events(g, 'identity.exposed')).toEqual([]);
  });
});

describe('the door resonance channel (door_resonance)', () => {
  it('reads the steps of the active modifiers on a map, 0 without any, capped at 3', () => {
    const g = makeGame();
    expect(resonanceSteps(g.world, 'borderstone')).toBe(0);
    const add = (n: number) =>
      withCtx(g, (ctx) => {
        registerModifier(ctx, {
          target: 'door_resonance',
          key: 'borderstone',
          add: n,
          untilTick: ctx.tick + 1000,
          source: `test${n}`,
          visibility: 'hidden',
          note: 'test',
        });
      });
    add(1);
    expect(resonanceSteps(g.world, 'borderstone')).toBe(1);
    expect(resonanceSteps(g.world, 'forest_edge')).toBe(0);
    add(5);
    expect(resonanceSteps(g.world, 'borderstone')).toBe(3);
  });
});

describe('the validator rules of the new fields', () => {
  const BASE = buildContent();
  const withDoors = (extra: DoorDef[]) =>
    validateDoors({ ...BASE, doors: [...BASE.doors, ...extra] } as ContentMap);

  it('the shipped doors and readers pass', () => {
    expect(validateDoors(BASE)).toEqual([]);
    expect(validateReaders(BASE)).toEqual([]);
  });

  it('refuses a missing or unknown danger band and a bad opening cost', () => {
    const none = { ...door('vd1') } as Partial<DoorDef>;
    delete none.dangerBand;
    expect(withDoors([none as DoorDef])).toContain('door vd1: danger band missing or unknown');
    expect(withDoors([door('vd2', { dangerBand: 'huge' as never })])).toContain(
      'door vd2: danger band missing or unknown',
    );
    expect(withDoors([door('vd3', { openCost: { blockage: 120 } })])).toContain(
      'door vd3: open cost blockage out of range or unknown',
    );
    expect(withDoors([door('vd4', { openCost: { seal: 1 } as never })])).toContain(
      'door vd4: open cost seal out of range or unknown',
    );
  });

  it('refuses a link to no quest and a link on a nested key', () => {
    expect(
      withDoors([
        door('vl1', { keys: [{ type: 'flag', key: 'act', label: 'a', link: 'q_none' }] }),
      ]),
    ).toContain('door vl1: key link q_none is no quest');
    expect(
      withDoors([
        door('vl2', {
          keys: [
            {
              type: 'any',
              label: 'a',
              of: [{ type: 'flag', key: 'act', label: 'b', link: 'q_a1_m07_spring' }],
            },
          ],
        }),
      ]),
    ).toContain('door vl2: link on a nested key');
  });

  it('refuses a door effect on itself, on no door, or on a door that gives a door', () => {
    expect(withDoors([door('ve1', { effects: [{ type: 'door', doorId: 've1' }] })])).toContain(
      'door ve1: door effect on unknown or own door ve1',
    );
    expect(withDoors([door('ve2', { effects: [{ type: 'door', doorId: 'zz_none' }] })])).toContain(
      'door ve2: door effect on unknown or own door zz_none',
    );
    expect(
      withDoors([door('ve3', { effects: [{ type: 'door', doorId: 'past_life_hearth' }] })]),
    ).toContain('door ve3: door effect on past_life_hearth, which gives a door itself');
  });

  it('checks the readers: features some door gives, numbers in range, places, names', () => {
    const bad = (r: DoorReaders) => validateReaders({ ...BASE, door_readers: r } as ContentMap);
    expect(bad({ priceBand: { feature: 'zz_none', spread: 0.2 } })).toContain(
      'door readers priceBand: feature zz_none is given by no door',
    );
    expect(bad({ priceBand: { feature: 'price_band', spread: 1.5 } })).toContain(
      'door readers priceBand: spread not between 0 and 1',
    );
    expect(bad({ nightSight: { feature: 'night_sight', radius: 0 } })).toContain(
      'door readers nightSight: radius not above 0',
    );
    const spring = doorReaders(BASE).springPurify;
    if (!spring) throw new Error('no purification data');
    expect(
      bad({ springPurify: { ...spring, places: [{ mapId: 'borderstone', location: 'zz' }] } }),
    ).toContain('door readers springPurify: map borderstone has no zz');
    expect(bad({ springPurify: { ...spring, var: 'zz_unregistered_var' } })).toContain(
      'door readers springPurify: unregistered zz_unregistered_var',
    );
    expect(bad({ springPurify: { ...spring, when: 'act ==' } })).toContain(
      'door readers springPurify: condition does not parse: act ==',
    );
    expect(bad({ springPurify: { ...spring, amount: 0 } })).toContain(
      'door readers springPurify: no amount',
    );
  });
});

describe('no effect: behaviour as before', () => {
  it('a game with none of the doors reads nothing and moves no cost', () => {
    const g = makeGame();
    g.step(30);
    expect(priceBand(g.world, g.content, 50)).toBeNull();
    expect(nightSightRadius(g.world, g.content)).toBeNull();
    expect(rumorSourceTag(g.world, g.content, { from: 'nera', hops: 1 })).toBeNull();
    expect(purifyOffer(g.world, g.content)).toBeNull();
    expect(g.world.slices.doors.granted).toBeUndefined();
    expect(g.world.slices.doors.purifiedWeek).toBeUndefined();
    expect(events(g, 'identity.exposed')).toEqual([]);
    expect(flags(g).blockage ?? 0).toBe(0);
  });
});
