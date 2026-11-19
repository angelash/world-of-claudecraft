// Scripted divine acts and Merca's coin (catalog_goddess_interventions.md 4.1, 9 and 10;
// builtin_ai.md 8.3 "写定神行节点"; PK-M1-20): the prologue's acts are observed from the flags
// the prologue scenes write; the coin's first use lands DB-A1-01 (her manifestation); the coin
// trade runs on points, novelty, the exchange rate, one gift a day and a ledger with credit,
// interest and overdue reactions; the tide omens land before the tide night; the dream at the
// door plays through and lands DB-A1-05.

import { describe, expect, it } from 'vitest';
import { Engine, ok } from '../src/core';
import { contentKey } from '../src/core/content_key';
import type { ContentMap } from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import { beatReport, beatWindow, noveltyFactor, offeringTier } from '../src/systems/goddess';
import { addItem } from '../src/systems/inventory';
import { activeModifiers } from '../src/systems/modifiers';
import { actClockState, nightCandidates } from '../src/systems/quests/act_clock';
import { actDef } from '../src/systems/quests/acts';
import { mapById, spawnEntity } from '../src/systems/world';
import { NARRATIVE_SYSTEMS, narrativeContent, playScene } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'pk20.give': { item: string; count?: number };
    'pk20.oola': Record<string, never>;
  }
}

const giver: GameSystem = {
  id: 'zz_pk20_giver',
  order: 999,
  commands: {
    'pk20.give'(ctx, d) {
      addItem(ctx, 'player', d.item, d.count ?? 1, 'test');
      return ok();
    },
    'pk20.oola'(ctx) {
      // the herb woman at home (the npc system spawns her in the game)
      spawnEntity(ctx, {
        kind: 'npc',
        name: 'oola',
        ref: 'oola',
        mapId: 'borderstone',
        ...at(ctx.content, 'borderstone', 'orphanage'),
        faction: 'town',
        appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
        tags: ['npc', 'healer'],
      });
      return ok();
    },
  },
};

/**
 * The middle of a named place, read from the map data (never a literal: the maps move, see
 * PK-M1-35 and data/world/map_shifts.json). A map without that place gives its first one.
 */
function at(content: ContentMap, mapId: string, loc: string): { x: number; y: number } {
  const map = mapById(content, mapId);
  const l = map?.locations.find((x) => x.id === loc) ?? map?.locations[0];
  if (!l) throw new Error(`no places on ${mapId}`);
  return { x: l.x + Math.floor(l.w / 2), y: l.y + Math.floor(l.h / 2) };
}

function act1(seed = 5, flags: Record<string, string | number | boolean> = {}): Engine {
  const g = Engine.create(seed, narrativeContent(), [...NARRATIVE_SYSTEMS, giver], {
    aiMode: 'off',
  });
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('flag.set', { key: 'a1_wake_ruins', value: true });
  for (const [k, v] of Object.entries(flags)) g.queue('flag.set', { key: k, value: v });
  g.queue('world.teleport', {
    entityId: 'player',
    mapId: 'borderstone',
    ...at(g.content, 'borderstone', 'plaza'),
  });
  g.step(2);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  return g;
}

/** The slot of a pack line's text key (the key without its line index), or null. */
function slotOf(text: unknown): string | null {
  const key = (text as { key?: unknown } | undefined)?.key;
  return typeof key === 'string' ? key.replace(/\.\d+$/, '') : null;
}

function beat(g: Engine, code: string) {
  return beatReport({ world: g.world, content: g.content }).find((b) => b.code === code);
}

function lastResult(g: Engine, kind: string) {
  const e = [...g.world.recent]
    .reverse()
    .find((x) => x.kind === 'command.result' && x.data.kind === kind);
  return e?.kind === 'command.result' ? e.data : undefined;
}

/** Dialogue lines emitted after the given length of the recent-event ring. */
function linesSince(g: Engine, from: number) {
  return g.world.recent.slice(from).filter((e) => e.kind === 'dialogue.line');
}

describe('prologue acts (DB-A0)', () => {
  it('observes the scripted prologue acts from the flags the scenes write', () => {
    const g = Engine.create(3, narrativeContent(), NARRATIVE_SYSTEMS, { aiMode: 'off' });
    g.step(1);
    for (const key of ['p_interview_done', 'p_discarded', 'p_caught'])
      g.queue('flag.set', { key, value: true });
    g.queue('flag.set', { key: 'p_coin_terms', value: 'three_percent' });
    g.step(2);
    for (const code of ['DB-A0-01', 'DB-A0-02', 'DB-A0-03', 'DB-A0-04'])
      expect(beat(g, code), code).toMatchObject({ state: 'done', by: 'observed' });
    // the coin lent and the catch are divine acts in the miracle ledger, seen by the player
    const prologue = g.world.slices.goddess.ledger.filter((e) => e.act === 'prologue');
    expect(prologue.map((e) => `${e.goddess}:${e.action}:${e.origin}:${e.seen}`).sort()).toEqual([
      'janu:dream:beat:true',
      'merca:blessing:beat:true',
    ]);
  });
});

describe('the coin trade (catalog 9, DB-A1-01)', () => {
  it('prices offerings by tier, novelty and the coin terms', () => {
    const c = narrativeContent();
    const rules = c.offeringRules[0];
    if (!rules) throw new Error('no offering rules');
    const item = (id: string) => c.items.find((i) => i.id === id);
    const sweets = item('otherworld_sweets');
    const honey = item('honey');
    const grain = item('grain');
    if (!sweets || !honey || !grain) throw new Error('items missing');
    expect(offeringTier(rules, sweets)).toEqual({ tier: 'novelty', base: 6, novelty: true });
    expect(offeringTier(rules, honey).tier).toBe('luxury');
    expect(offeringTier(rules, grain).tier).toBe('staple');
    expect([1, 2, 3, 4, 5, 20].map((n) => noveltyFactor(rules, n))).toEqual([
      2,
      1,
      1,
      0.8,
      0.8 ** 2,
      0.25,
    ]);
  });

  it('lands her manifestation on the first use, then trades for a gift a day on her ledger', () => {
    const g = act1(5, { p_merca_valuation: 'mid', p_coin_terms: 'three_percent' });
    g.queue('pk20.give', { item: 'merca_coin' });
    g.step(1);
    const t0 = g.world.recent.length;
    g.queue('goddess.coin', {});
    g.step(1);
    expect(lastResult(g, 'goddess.coin')?.ok).toBe(true);
    expect(beat(g, 'DB-A1-01')).toMatchObject({ state: 'done', by: 'observed' });
    // the narration of the scene and her own line, both content text
    const said = linesSince(g, t0).map((e) => (e.kind === 'dialogue.line' ? e.data : null));
    // a line of her own coin-first slot (the batch has several; the seeded draw picks one)
    expect(said[0]?.text).toEqual({
      key: contentKey('divineBeats', 'div_beat_a1_coin_first', 'narration'),
    });
    expect(said).toHaveLength(2);
    expect(slotOf(said[1]?.text)).toBe('c.line_packs.ln_merca.slots.react_coin_first');
    expect(said[1]?.speakerId).toBe('merca');
    const manifest = g.world.slices.goddess.ledger.at(-1);
    expect(manifest).toMatchObject({ goddess: 'merca', seen: true, origin: 'beat' });
    // a second use answers with her greeting through the coin, no second manifestation
    const t1 = g.world.recent.length;
    g.queue('goddess.coin', {});
    g.step(1);
    const greet = linesSince(g, t1).find((e) => e.kind === 'dialogue.line');
    expect(slotOf(greet?.kind === 'dialogue.line' ? greet.data.text : undefined)).toBe(
      'c.line_packs.ln_merca.slots.greet_neutral_coin',
    );
    // an offering of Earth: 6 points, twice for the first of its kind, at the 0.8 rate
    g.queue('pk20.give', { item: 'otherworld_sweets', count: 2 });
    g.queue('goddess.offer', { itemId: 'otherworld_sweets', want: 'blessing' });
    g.step(1);
    expect(lastResult(g, 'goddess.offer')?.ok).toBe(true);
    expect(g.world.meta.flags['offering_novelty.otherworld_sweets']).toBe(1);
    // the flag holds whole points, the account the fraction
    expect(g.world.slices.goddess.offerings?.exact).toBe(3.6);
    expect(g.world.meta.flags.merca_ledger).toBe(4);
    expect(activeModifiers(g.world, 'xp', 'player').some((m) => m.source === 'merca')).toBe(true);
    expect(g.world.slices.goddess.goddesses.merca?.relation).toBe(6);
    // the same day: the offering is kept on the ledger, no second gift
    g.queue('goddess.offer', { itemId: 'otherworld_sweets', want: 'intel' });
    g.step(1);
    const kept = lastResult(g, 'goddess.offer');
    expect(kept?.ok).toBe(true);
    expect(kept?.reason).toMatchObject({ key: 'sys.goddess.info.offering_kept' });
    expect(g.world.meta.flags['intel.merca.salt_hoard']).toBeUndefined();
    expect(g.world.slices.goddess.offerings?.exact).toBeCloseTo(3.6 + 6 * 1 * 0.8);
    // the next day the intel goes out
    g.step(tickAtDay(1, 1, 0) - g.tick);
    g.queue('pk20.give', { item: 'grain' });
    g.queue('goddess.offer', { itemId: 'grain', want: 'intel' });
    g.step(1);
    expect(g.world.meta.flags['intel.merca.salt_hoard']).toBe(true);
    // her scheme of the first customer has advanced past the coin, the offering and the intel
    const scheme = g.world.slices.goddess.brains?.merca?.plans.find(
      (p) => p.scheme === 'div_plan_merca_first_customer',
    );
    const ended = g.world.slices.goddess.brains?.merca?.ended.map((e) => e.scheme) ?? [];
    expect(scheme ? scheme.index >= 3 : ended.includes('div_plan_merca_first_customer')).toBe(true);
  });

  it('lends up to the credit, then reminds of an overdue debt and thanks when it clears', () => {
    const g = act1(6, { p_merca_valuation: 'low', p_coin_terms: 'first_free' });
    g.queue('pk20.give', { item: 'merca_coin' });
    g.queue('pk20.give', { item: 'relic_badge' });
    g.step(1);
    // a tight valuation gives no credit: a gift past the ledger is refused, the offering kept
    g.queue('goddess.offer', { itemId: 'grain', want: 'blessing' });
    g.queue('pk20.give', { item: 'grain' });
    g.queue('goddess.offer', { itemId: 'grain', want: 'blessing' });
    g.step(1);
    expect(activeModifiers(g.world, 'xp', 'player').some((m) => m.source === 'merca')).toBe(false);
    // an overdue debt: the reminder line and her relation down, once a week
    g.queue('flag.set', { key: 'merca_ledger', value: -20 });
    g.step(tickAtDay(1, 0, 5) - g.tick);
    const fired = g.world.recent.filter(
      (e) => e.kind === 'goddess.reacted' && e.data.rowId === 'div_react_merca_05',
    );
    expect(fired.length).toBe(1);
    expect(g.world.slices.goddess.goddesses.merca?.relation).toBe(-2);
    g.queue('flag.set', { key: 'merca_ledger', value: 5 });
    g.step(tickAtDay(2, 0, 5) - g.tick);
    expect(
      g.world.recent.some(
        (e) => e.kind === 'goddess.reacted' && e.data.rowId === 'div_react_merca_06',
      ),
    ).toBe(true);
    expect(g.world.slices.goddess.goddesses.merca?.relation).toBe(3);
  });

  it('draws interest on a negative ledger every 30 days by the coin terms', () => {
    const g = act1(7, { p_merca_valuation: 'high', p_coin_terms: 'three_percent' });
    g.queue('flag.set', { key: 'merca_ledger', value: -10 });
    g.step(tickAtDay(31, 0, 5) - g.tick);
    // 3 percent of 10, rounded up to a whole point
    expect(g.world.meta.flags.merca_ledger).toBe(-11);
    const free = act1(7, { p_merca_valuation: 'high', p_coin_terms: 'interest_free' });
    free.queue('flag.set', { key: 'merca_ledger', value: -10 });
    free.step(tickAtDay(31, 0, 5) - free.tick);
    expect(free.world.meta.flags.merca_ledger).toBe(-10);
  }, 300_000);
});

describe('act 1 written acts (DB-A1)', () => {
  it('lands the tide omens in the week before the tide night that comes', () => {
    // the tide waits for the last dark moon of weeks 8 to 10, or comes at the first one once
    // the seal is restless enough (the act clock's night rule)
    for (const [flags, which] of [
      [{}, 'last'],
      [{ seal_unrest: 100 }, 'first'],
    ] as const) {
      const g = act1(8, flags);
      const def = g.content.divineBeats.find((b) => b.code === 'DB-A1-04');
      const rule = actDef(g.content, 'act1')?.clock?.nights?.find((r) => r.id === 'tide');
      const clock = actClockState(g.world);
      if (!def || !rule || !clock) throw new Error('no DB-A1-04 or tide rule');
      const nights = nightCandidates(rule, clock.startDay, clock.startTick);
      expect(nights.length, which).toBeGreaterThan(1);
      const tide = (which === 'first' ? nights[0] : nights.at(-1))?.tick ?? 0;
      const ctx = { world: g.world, content: g.content, tick: g.tick } as never;
      const win = beatWindow(ctx, def);
      expect(win, which).toEqual({ from: tide - 7 * TICKS_PER_GAME_DAY, to: tide });
      if (!win) return;
      g.step(win.to - g.tick - TICKS_PER_GAME_HOUR);
      expect(beat(g, 'DB-A1-04'), which).toMatchObject({ state: 'done', times: 3 });
      const omens = g.world.slices.goddess.ledger.filter(
        (e) => e.goddess === 'sylvie' && e.action === 'omen' && e.origin === 'beat',
      );
      expect(omens.map((e) => e.mapId)).toEqual(['forest_edge', 'borderstone', 'borderstone']);
      expect(
        omens.every((e) => e.tick >= win.from && e.tick < win.to),
        which,
      ).toBe(true);
    }
  }, 600_000);

  it('files the appraisal rumor in her archive and opens the deer only for a fond Sylvie', () => {
    const g = act1(9);
    const before = g.world.slices.goddess.goddesses.eluen?.sightWeight ?? 0;
    g.queue('flag.set', { key: 'a1_cassian_appraise', value: true });
    g.step(1);
    expect(beat(g, 'DB-A1-06')).toMatchObject({ state: 'done' });
    expect(g.world.slices.goddess.goddesses.eluen?.sightWeight).toBeGreaterThan(before);
    // DB-A1-07 waits for a fond Sylvie (prologue impression 2 or more)
    g.step(tickAtDay(30, 0, 0) - g.tick);
    expect(beat(g, 'DB-A1-07')?.state).toBe('waiting');
  }, 300_000);

  it('lands the salt season when the salt dispute reaches its second stage', () => {
    const g = act1(10);
    g.queue('flag.set', { key: 'dispute.q_a1_d03_salt_and_potions.escalation', value: 2 });
    g.step(TICKS_PER_GAME_HOUR + 1);
    expect(beat(g, 'DB-A1-08')).toMatchObject({ state: 'done', by: 'fallback' });
    const keys = activeModifiers(g.world, 'price', 'borderstone:salt').map((m) => m.factor);
    expect(keys).toContain(1.2);
    expect(activeModifiers(g.world, 'price', 'borderstone:medicine').length).toBeGreaterThan(0);
  });

  it('lands Moira’s written coincidence once in its window, twice for a curious Moira', () => {
    for (const [interest, times] of [
      [0, 1],
      [2, 2],
    ] as const) {
      const g = act1(12, { 'goddess.moira.interest': interest });
      g.step(TICKS_PER_GAME_DAY * 75);
      expect(beat(g, 'DB-A1-02'), `interest ${interest}`).toMatchObject({ state: 'done', times });
      const written = g.world.slices.goddess.ledger.filter(
        (e) => e.goddess === 'moira' && e.action === 'coincidence' && e.origin === 'beat',
      );
      expect(written.length).toBe(times);
      expect(g.world.slices.director.history.map((h) => h.item)).toContain(
        'ev_a1_moira_coincidence',
      );
    }
  }, 600_000);

  it('dreams to Oola in weeks 2 to 6 and guides a fond Sylvie’s player to the deer spring', () => {
    // without Oola in the world no other dream of Sylvie's lands it
    const none = act1(13, { 'goddess.sylvie.impression': 2 });
    none.step(TICKS_PER_GAME_DAY * 46 - none.tick);
    expect(beat(none, 'DB-A1-03')?.state).toBe('missed');
    const g = act1(13, { 'goddess.sylvie.impression': 2 });
    const toOola: number[] = [];
    g.onEvents((events, world) => {
      for (const e of events)
        if (
          e.kind === 'goddess.acted' &&
          e.data.goddessId === 'sylvie' &&
          e.data.action === 'dream'
        )
          if (world.slices.world.entities[e.data.targetId ?? '']?.ref === 'oola')
            toOola.push(e.tick);
    });
    g.queue('pk20.oola', {});
    g.step(1);
    g.step(TICKS_PER_GAME_DAY * 34 - g.tick);
    // her planned dream to Oola, or the executor's at the window's middle, lands it unseen
    expect(beat(g, 'DB-A1-03')?.state).toBe('done');
    expect(toOola.length).toBeGreaterThan(0);
    const dreams = g.world.slices.goddess.ledger.filter(
      (e) => e.goddess === 'sylvie' && e.action === 'dream' && toOola.includes(e.tick),
    );
    expect(dreams.length).toBe(toOola.length);
    expect(dreams.every((e) => e.seen === false)).toBe(true);
    // the deer leads the player who stands on the forest's edge
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'forest_edge',
      ...at(g.content, 'forest_edge', 'deer_spring'),
    });
    g.step(TICKS_PER_GAME_DAY * 30);
    expect(beat(g, 'DB-A1-07')).toMatchObject({ state: 'done' });
    const guide = g.world.slices.goddess.ledger.find(
      (e) => e.goddess === 'sylvie' && e.action === 'div_sylvie_beast_guide',
    );
    expect(guide).toMatchObject({ mapId: 'forest_edge', seen: true });
  }, 600_000);

  it('keeps the points of an intel she has none of', () => {
    const g = act1(14, { p_merca_valuation: 'high', p_coin_terms: 'interest_free' });
    g.queue('pk20.give', { item: 'merca_coin' });
    g.queue('pk20.give', { item: 'otherworld_sweets' });
    g.step(1);
    // every piece of her intel is sold already
    for (const i of g.content.mercaIntel)
      g.queue('flag.set', { key: `intel.merca.${i.id}`, value: true });
    g.queue('goddess.offer', { itemId: 'otherworld_sweets', want: 'intel' });
    g.step(1);
    expect(g.world.slices.goddess.offerings?.exact).toBe(12);
    expect(lastResult(g, 'goddess.offer')?.reason).toMatchObject({
      key: 'sys.goddess.info.offering_no_intel',
    });
  });

  it('plays the dream at the door through and lands DB-A1-05', () => {
    const g = act1(11, { a1_beast_tide_cleared: true });
    g.queue('flag.set', { key: 'quest.q_a1_m12_tide', value: 'done' });
    g.step(2);
    // sleep the eight hours of the quest, then the dream plays
    for (let i = 0; i < 20 && !g.world.slices.scenes.current; i++) g.step(TICKS_PER_GAME_HOUR);
    expect(g.world.slices.scenes.current?.sceneId).toBe('cut_a1_dream');
    // the dream's question menu reopens until the player stops asking (cut_a1_dream `ask`):
    // ask the written questions, then `enough`; the free question never closes the menu
    playScene(g, (_s, node, ids) =>
      node === 'ask' ? (ids.find((id) => id !== 'free') ?? 'enough') : undefined,
    );
    g.step(2);
    expect(g.world.meta.flags.a1_dream_door_woman).toBe(true);
    expect(beat(g, 'DB-A1-05')).toMatchObject({ state: 'done', by: 'observed' });
    const dream = g.world.slices.goddess.ledger.find(
      (e) => e.goddess === 'janu' && e.action === 'dream' && e.act === 'act1',
    );
    expect(dream).toMatchObject({ seen: true, origin: 'beat' });
    // Janu's scheme (catch the one who fell through) reads the dream at her next round
    g.step(TICKS_PER_GAME_DAY);
    expect(g.world.slices.goddess.brains?.janu?.ended.map((e) => [e.scheme, e.how])).toContainEqual(
      ['div_plan_janu_catch', 'done'],
    );
  });
});
