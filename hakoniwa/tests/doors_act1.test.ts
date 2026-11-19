// PK-M1-32: the act 1 doors of catalog_doors.md 6 are all in the data (eighteen with the
// prologue's past-life variants apart), they pass the doors validator (21.6), the craft doors
// count gathering and making through the doors' own counters (5.6, 14), a craft door's mentor
// key holds its substitutes, and the routine route's act 1 opening count sits within 17.2.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { validateDoors } from '../src/content/packs/doors';
import { keysMet } from '../src/systems/doors/keys';
import type { DoorDef } from '../src/systems/doors/types';
import { makeGame, setFlags, withCtx } from './doors_harness';

/** The act 1 doors of catalog_doors.md 6 (序 is the prologue's past-life door). */
const ACT1 = [
  'awaken',
  'inner_garden',
  'tide_sight',
  'talent_sight',
  'vocation_warrior',
  'vocation_hunter',
  'vocation_druid',
  'vocation_warlock',
  'craft_mining',
  'craft_logging',
  'craft_herbalism',
  'craft_alchemy',
  'craft_cooking',
  'craft_leatherworking',
  'craft_weaponcrafting',
  'pact',
  'garden_granary',
  'truth_flaw',
];

/** thousand_doors.md 17.3, the routine route's act 1 doors (two vocation and two craft doors). */
const ROUTINE = [
  'awaken',
  'tide_sight',
  'pact',
  'vocation_warrior',
  'vocation_hunter',
  'talent_sight',
  'inner_garden',
  'truth_flaw',
  'craft_mining',
  'craft_cooking',
  'garden_granary',
];

const door = (g: ReturnType<typeof makeGame>, id: string): DoorDef => {
  const d = g.content.doors.find((x) => x.id === id);
  if (!d) throw new Error(`no door ${id}`);
  return d;
};

describe('the act 1 doors', () => {
  it('are all in the data, at act 1, segment 1, and pass the doors validator', () => {
    const content = buildContent();
    const ids = new Set(content.doors.filter((d) => d.act === 1).map((d) => d.id));
    expect([...ids].sort()).toEqual([...ACT1].sort());
    for (const id of ACT1) expect(content.doors.find((d) => d.id === id)?.segment, id).toBe(1);
    expect(validateDoors(content)).toEqual([]);
  });

  it('the routine route opens a number within three of 17.2 (eleven)', () => {
    const all = new Set(buildContent().doors.map((d) => d.id));
    const routine = ROUTINE.filter((id) => all.has(id));
    expect(routine).toEqual(ROUTINE);
    expect(Math.abs(routine.length - 11)).toBeLessThanOrEqual(3);
  });

  it('a craft door counts the pieces the player gathers and nobody else (5.6)', () => {
    const g = makeGame();
    const mining = door(g, 'craft_mining');
    setFlags(g, { 'taught.craft_mining.barga': true });
    expect(keysMet(g.world, mining, g.content)).toBe(false);
    withCtx(g, (ctx) => {
      for (let i = 0; i < 6; i++)
        ctx.emit('gather.done', { entityId: 'player', itemId: 'iron_ore', count: 3 });
      ctx.emit('gather.done', { entityId: 'player', itemId: 'iron_ore', count: 1 });
      ctx.emit('gather.done', { entityId: 'npc_x', itemId: 'iron_ore', count: 3 });
      ctx.emit('gather.done', { entityId: 'player', itemId: 'wood', count: 3 });
    });
    // 6 x 3 + 1 = 19 pieces of ore: one short
    expect(keysMet(g.world, mining, g.content)).toBe(false);
    withCtx(g, (ctx) => {
      ctx.emit('gather.done', { entityId: 'player', itemId: 'iron_ore', count: 1 });
    });
    expect(keysMet(g.world, mining, g.content)).toBe(true);
  });

  it('a making door counts craft.done of its item', () => {
    const g = makeGame();
    const leather = door(g, 'craft_leatherworking');
    setFlags(g, { 'taught.craft_leatherworking.gorn': true });
    withCtx(g, (ctx) => {
      for (let i = 0; i < 5; i++)
        ctx.emit('craft.done', { entityId: 'player', recipeId: 'r', itemId: 'leather', count: 1 });
    });
    expect(keysMet(g.world, leather, g.content)).toBe(true);
  });

  it('the mining mentor: Barga, or a substitute once he is gone (5.4)', () => {
    // the person data decides who is absent, so this one reads the full content's npcs
    const g = makeGame();
    const content = { ...g.content, npcs: buildContent().npcs };
    const mining = door(g, 'craft_mining');
    withCtx(g, (ctx) => {
      ctx.emit('gather.done', { entityId: 'player', itemId: 'iron_ore', count: 20 });
    });
    setFlags(g, { 'taught.craft_mining.grinda_hammerseal': true });
    expect(keysMet(g.world, mining, content)).toBe(false);
    setFlags(g, { 'npc.barga.dead': true });
    expect(keysMet(g.world, mining, content)).toBe(true);
  });

  it('the herbal mentors: Oola, or a substitute once her fate is decided and not cleared', () => {
    const g = makeGame();
    const herb = door(g, 'craft_herbalism');
    const content = { ...g.content, npcs: buildContent().npcs };
    withCtx(g, (ctx) => {
      ctx.emit('gather.done', { entityId: 'player', itemId: 'mat_greybane', count: 10 });
    });
    setFlags(g, { 'taught.craft_herbalism.rosa_oldwatch': true });
    expect(keysMet(g.world, herb, content)).toBe(false);
    setFlags(g, { a1_oola_fate: 'fled' });
    expect(keysMet(g.world, herb, content)).toBe(true);
  });

  it('door fields the corridor rules fix: truth doors stay open, craft doors jam (3.6, 6.2)', () => {
    const g = makeGame();
    expect(door(g, 'truth_flaw').closable).toBe(false);
    expect(door(g, 'garden_granary').closable).toBe(false);
    for (const id of ACT1.filter((x) => x.startsWith('craft_'))) {
      expect(door(g, id).jam, id).toBe('combat');
      expect(door(g, id).reveal?.length, id).toBe(1);
    }
    expect(door(g, 'truth_flaw').jam).toBe('never');
  });

  it('the canon doors read their deeds as history keys (catalog_deeds_titles.md 2.7)', () => {
    const g = makeGame();
    const deeds = (id: string) => JSON.stringify(door(g, id).keys);
    expect(deeds('tide_sight')).toContain('deed_grow_stand_before_ash');
    expect(deeds('pact')).toContain('deed_grow_spared');
    expect(deeds('vocation_warrior')).toContain('deed_grow_first_stance');
    const warrior = door(g, 'vocation_warrior');
    setFlags(g, { 'deed.deed_grow_first_stance': true, 'boss.split_ear.defeated': true });
    expect(keysMet(g.world, warrior, g.content)).toBe(true);
  });

  it('the flaw door wants the dream, Bron and the child, all three', () => {
    const g = makeGame();
    const flaw = door(g, 'truth_flaw');
    setFlags(g, { a1_dream_door_woman: true, a1_bron_sees_mark: true });
    expect(keysMet(g.world, flaw, g.content)).toBe(false);
    setFlags(g, { a1_orphan_mark_seen: true });
    expect(keysMet(g.world, flaw, g.content)).toBe(true);
  });
});
