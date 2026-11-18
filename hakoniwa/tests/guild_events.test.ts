// The dynamic event kernel (PK-M1-47; catalog_quests_acts1_3.md 3, 5.7; quests_and_events.md
// 2.2, 3.8): triggers, omens, precursors, the arbiter's density (catalog 3.2), the rumor and
// comedy engines, the director's menu, the commission hooks; and the measured density over
// twenty seeds of act 1 and of a stressed set, inside the ranges of catalog 3.2.

import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { directorItems } from '../src/content/packs/guild';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { calendarAt, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../src/core/time';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import type { BoardDef, CommissionDef, DynamicEventDef } from '../src/systems/guild/types';
import { conditionHolds } from '../src/systems/quests';
import {
  BASE,
  emit,
  flags,
  type G,
  gs,
  guildGame,
  hours,
  nextWeek,
  set,
  today,
  withCognition,
} from './guild_harness';

const ev = (id: string): DynamicEventDef => {
  const e = BASE.dynamicEvents.find((x) => x.id === id);
  if (!e) throw new Error(`no event ${id}`);
  return e;
};
const landed = (t: G, id?: string) =>
  t.events.filter(
    (e) => e.kind === 'dynamic_event.landed' && (id === undefined || e.data.eventId === id),
  ) as Extract<AnyWorldEvent, { kind: 'dynamic_event.landed' }>[];
const dayOf = (e: AnyWorldEvent): number => calendarAt(e.tick).dayIndex;

/** A content with these events only (and optionally these commissions and boards). */
function only(
  events: DynamicEventDef[],
  extra: { commissions?: CommissionDef[]; guildBoards?: BoardDef[] } = {},
): ContentMap {
  return { ...BASE, dynamicEvents: events, ...extra } as ContentMap;
}

const synth = (over: Partial<DynamicEventDef> & { id: string }): DynamicEventDef => ({
  category: 'settlement',
  source: 'npc',
  title: over.id,
  acts: [1],
  maps: ['borderstone'],
  severity: 'minor',
  ...over,
});

describe('triggers and omens', () => {
  it('lands a once event when its condition holds, writing its flags', () => {
    const t = guildGame();
    set(t, 'seal_unrest', 90);
    hours(t, 2);
    expect(landed(t, 'ev_a1_tide_omens')).toHaveLength(0);
    set(t, 'seal_unrest', 91);
    hours(t, 2);
    expect(landed(t, 'ev_a1_tide_omens')).toHaveLength(1);
    expect(flags(t.g).a1_tide_omen).toBe(true);
    expect(flags(t.g)['ev.ev_a1_tide_omens']).toBe('ended');
    expect(flags(t.g)['ev.ev_a1_tide_omens.count']).toBe(1);
    hours(t, 48);
    expect(landed(t, 'ev_a1_tide_omens')).toHaveLength(1);
  });

  it('announces the beast season three days ahead, then runs its prices and extra postings', () => {
    const t = guildGame();
    while (Number(flags(t.g).act_week ?? 0) < 8) nextWeek(t);
    const omen = t.events.find((e) => e.kind === 'dynamic_event.omen');
    expect(omen?.kind === 'dynamic_event.omen' && omen.data.eventId).toBe('ev_a1_beast_season');
    expect(flags(t.g)['ev.ev_a1_beast_season']).toBe('omen');
    expect(landed(t, 'ev_a1_beast_season')).toHaveLength(0);
    hours(t, 24 * 4);
    const l = landed(t, 'ev_a1_beast_season');
    expect(l).toHaveLength(1);
    const o = omen as AnyWorldEvent;
    expect(dayOf(l[0] as AnyWorldEvent) - dayOf(o)).toBeGreaterThanOrEqual(3);
    expect(flags(t.g)['ev.ev_a1_beast_season']).toBe('active');
    const salt = t.g.world.slices.modifiers.active.find(
      (m) => m.source === 'ev_a1_beast_season' && m.key === 'salt',
    );
    expect(salt).toMatchObject({ target: 'price', factor: 1.2, visibility: 'public' });
    hours(t, 24 * 36);
    expect(flags(t.g)['ev.ev_a1_beast_season']).toBe('ended');
    expect(gs(t.g).events.active).toHaveLength(0);
  });

  it("adds the event's extra postings of its kinds at the refill while it runs", () => {
    const base = BASE.commissions.find((c) => c.id === 'cmm_a1_wolf_cull') as CommissionDef;
    const many: CommissionDef[] = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      id: `cmm_a1_t${i}`,
      boards: ['board_t'],
    }));
    const board: BoardDef = {
      ...(BASE.guildBoards[0] as BoardDef),
      id: 'board_t',
      refill: [4, 4],
      cap: 4,
    };
    const season = synth({
      id: 'ev_a1_season_t',
      category: 'weather',
      when: 'act_week >= 2',
      once: true,
      days: 30,
      hooks: { board: { bonus: 2, kinds: ['subjugate'] } },
    });
    const t = guildGame({ content: only([season], { commissions: many, guildBoards: [board] }) });
    const up = () => Object.values(gs(t.g).postings).filter((p) => p.state === 'posted').length;
    expect(up()).toBe(4);
    nextWeek(t);
    // week 2: the season lands during the first hour, the refill ran at the week start
    nextWeek(t);
    expect(up()).toBe(6);
  });
});

describe('the arbiter (catalog 3.2)', () => {
  it('runs at most two severe events in one settlement, seven days apart', () => {
    const severe = [1, 2, 3].map((i) =>
      synth({ id: `ev_a1_sev_${i}`, severity: 'severe', when: 'act_week >= 1', days: 20 }),
    );
    const t = guildGame({ content: only(severe) });
    hours(t, 24 * 30);
    const l = landed(t);
    expect(l.length).toBeGreaterThanOrEqual(2);
    const days = l.map(dayOf).sort((a, b) => a - b);
    for (let i = 1; i < days.length; i++)
      expect((days[i] as number) - (days[i - 1] as number)).toBeGreaterThanOrEqual(7);
    // the third waits for a slot: two run for 20 days, so it lands when the first ends
    expect(days[2]).toBeGreaterThanOrEqual((days[0] as number) + 20);
  });

  it('drops an event held longer than the defer limit', () => {
    const block = synth({
      id: 'ev_a1_block',
      severity: 'severe',
      when: 'act_week >= 1',
      once: true,
      days: 40,
    });
    const block2 = synth({
      id: 'ev_a1_block2',
      severity: 'severe',
      when: 'act_week >= 1',
      once: true,
      days: 40,
    });
    const late = synth({ id: 'ev_a1_late', severity: 'severe', when: 'act_week >= 1', once: true });
    const t = guildGame({ content: only([block, block2, late]) });
    hours(t, 24 * 30);
    // held by the two running severe events past the defer limit: dropped (it may trigger
    // again later, and is held again while they run)
    expect(landed(t, 'ev_a1_late')).toHaveLength(0);
    expect(gs(t.g).events.dropped.ev_a1_late).toBeGreaterThanOrEqual(1);
    expect(t.events.some((e) => e.kind === 'dynamic_event.dropped')).toBe(true);
  });

  it('keeps fourteen days between two tides in one region, each with a three-day omen', () => {
    const t = guildGame({ act: 'act2', content: only([ev('ev_a1_tide_rim')]) });
    set(t, 'seal_unrest', 85);
    hours(t, 24 * 45);
    const l = landed(t, 'ev_a1_tide_rim');
    expect(l.length).toBeGreaterThanOrEqual(2);
    const days = l.map(dayOf);
    for (let i = 1; i < days.length; i++)
      expect((days[i] as number) - (days[i - 1] as number)).toBeGreaterThanOrEqual(14);
    const omens = t.events.filter((e) => e.kind === 'dynamic_event.omen').map(dayOf);
    days.forEach((d, i) => {
      expect(d - (omens[i] as number)).toBeGreaterThanOrEqual(3);
    });
    // the tide posts the night watch as an emergency on the borderstone board
    const watch = Object.values(gs(t.g).postings).filter(
      (p) => p.template === 'cmm_a1_night_watch',
    );
    expect(watch.length).toBeGreaterThanOrEqual(1);
    expect(watch.every((p) => p.emergency)).toBe(true);
    expect(t.g.world.slices.modifiers.active.some((m) => m.source === 'ev_a1_tide_rim')).toBe(true);
    // no tide in act 1: the system version is for acts 2 and 3
    const a1 = guildGame({ content: only([ev('ev_a1_tide_rim')]) });
    set(a1, 'seal_unrest', 85);
    hours(a1, 24 * 10);
    expect(landed(a1)).toHaveLength(0);
  });

  it('a goddess leads no tide before act 3; a search waits for its precursor', () => {
    const godTide = synth({
      id: 'ev_a1_god_tide',
      category: 'tide',
      source: 'goddess',
      severity: 'severe',
      acts: [2, 3],
      when: 'act_week >= 1',
      omen: { days: 3 },
    });
    const t2 = guildGame({ act: 'act2', content: only([godTide]) });
    hours(t2, 24 * 8);
    expect(landed(t2)).toHaveLength(0);
    const t3 = guildGame({ act: 'act3', content: only([godTide]) });
    hours(t3, 24 * 8);
    expect(landed(t3)).toHaveLength(1);

    const patrol = synth({ id: 'ev_a1_patrol', when: 'zz_patrol', once: true });
    const search = synth({
      id: 'ev_a1_search',
      category: 'search',
      when: 'act_week >= 1',
      once: true,
      precursor: { event: 'ev_a1_patrol', withinDays: 7 },
    });
    const t = guildGame({ content: only([patrol, search]) });
    hours(t, 24 * 3);
    expect(landed(t, 'ev_a1_search')).toHaveLength(0);
    set(t, 'zz_patrol', true);
    hours(t, 3);
    expect(landed(t).map((e) => e.data.eventId)).toEqual(['ev_a1_patrol', 'ev_a1_search']);
  });

  it('yields to a dispute window, keeps its weekday, and rolls its chance on its own stream', () => {
    const yielding = synth({
      id: 'ev_a1_yield',
      when: 'act_week >= 1',
      once: true,
      yieldWhile: 'zz_window',
    });
    const t = guildGame({ content: only([yielding]) });
    set(t, 'zz_window', true);
    hours(t, 24 * 3);
    expect(landed(t)).toHaveLength(0);
    set(t, 'zz_window', false);
    hours(t, 2);
    expect(landed(t)).toHaveLength(1);

    // no cooldown: a weekday event still lands once on its day (never twice a day)
    const market = synth({ id: 'ev_a1_market_t', weekday: 3 });
    const w = guildGame({ content: only([market]) });
    hours(w, 24 * 21);
    const wd = landed(w).map((e) => calendarAt(e.tick).weekday);
    expect(wd.length).toBe(3);
    expect(new Set(wd)).toEqual(new Set([3]));

    const chancy = synth({ id: 'ev_a1_chance_t', chance: 0.3, when: 'act_week >= 1' });
    const run = (seed: number) => {
      const c = guildGame({ seed, content: only([chancy]) });
      hours(c, 24 * 40);
      return landed(c).map(dayOf);
    };
    const a = run(7);
    expect(run(7)).toEqual(a);
    expect(a.length).toBeGreaterThan(3);
    expect(a.length).toBeLessThan(30);
    expect(new Set(a).size).toBe(a.length); // one roll a day
  });

  it('makes a template urgent while it runs and re-prices the untaken postings', () => {
    const tide = synth({
      id: 'ev_a1_urgent_t',
      when: 'zz_urgent',
      once: true,
      days: 10,
      hooks: { urgent: ['cmm_a1_wolf_cull'] },
    });
    const t = guildGame({ content: only([tide]) });
    t.g.queue('gh.post', { templateId: 'cmm_a1_wolf_cull', board: 'board_borderstone_guild' });
    t.g.step(2);
    const before = Object.values(gs(t.g).postings).filter(
      (p) => p.template === 'cmm_a1_wolf_cull' && p.state === 'posted',
    );
    expect(before.every((p) => !p.urgent && p.reward === 240)).toBe(true);
    set(t, 'zz_urgent', true);
    hours(t, 2);
    const after = Object.values(gs(t.g).postings).filter(
      (p) => p.template === 'cmm_a1_wolf_cull' && p.state === 'posted',
    );
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((p) => p.urgent && p.reward === 360 && p.cut === 54)).toBe(true);
    // only while it runs (catalog 5.6 "期间"): plain pay again once it ends
    hours(t, 24 * 11);
    expect(flags(t.g)['ev.ev_a1_urgent_t']).toBe('ended');
    const later = Object.values(gs(t.g).postings).filter(
      (p) => p.template === 'cmm_a1_wolf_cull' && p.state === 'posted',
    );
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((p) => !p.urgent && p.reward === 240 && p.cut === 36)).toBe(true);
  });

  it('posts its emergencies with its omen, once per board, up until its day', () => {
    const t = guildGame({ act: 'act2', content: only([ev('ev_a1_tide_rim')]) });
    set(t, 'seal_unrest', 85);
    hours(t, 2);
    const omen = t.events.find((e) => e.kind === 'dynamic_event.omen');
    expect(omen?.kind === 'dynamic_event.omen' && omen.data.eventId).toBe('ev_a1_tide_rim');
    const watch = Object.values(gs(t.g).postings).filter(
      (p) => p.template === 'cmm_a1_night_watch',
    );
    expect(watch).toHaveLength(1);
    expect(watch[0]).toMatchObject({ emergency: true, board: 'board_borderstone_guild' });
    expect(watch[0]?.untilDay).toBe(omen?.kind === 'dynamic_event.omen' ? omen.data.landDay : -1);
    // the watch is gone the day after the tide
    hours(t, 24 * 5);
    expect(watch[0]?.state).toBe('withdrawn');
  });

  it('applies its omen effects at the announcement and its end effects when it runs out', () => {
    const storm = synth({
      id: 'ev_a1_storm_t',
      category: 'disaster',
      source: 'world',
      when: 'zz_storm',
      once: true,
      omen: { days: 3, effects: [{ type: 'flag', key: 'zz_omen_seen', value: true }] },
      days: 2,
      effects: [{ type: 'flag', key: 'zz_struck', value: true }],
      end: [{ type: 'flag', key: 'zz_cleared', value: true }],
    });
    const t = guildGame({ content: only([storm]) });
    set(t, 'zz_storm', true);
    hours(t, 2);
    expect(flags(t.g).zz_omen_seen).toBe(true);
    expect(flags(t.g).zz_struck).toBeUndefined();
    hours(t, 24 * 3);
    expect(flags(t.g).zz_struck).toBe(true);
    expect(flags(t.g).zz_cleared).toBeUndefined();
    hours(t, 24 * 3);
    expect(flags(t.g).zz_cleared).toBe(true);
    // the omen counts whole game days from the announcement, to the tick
    const o = t.events.find((e) => e.kind === 'dynamic_event.omen') as AnyWorldEvent;
    const l = landed(t)[0] as AnyWorldEvent;
    expect(l.tick - o.tick).toBeGreaterThanOrEqual(3 * TICKS_PER_GAME_DAY);
  });

  it('an announced event keeps its slot: a later severe event cannot take it', () => {
    const tide = synth({
      id: 'ev_a1_tide_t',
      category: 'tide',
      source: 'settlement',
      severity: 'severe',
      when: 'zz_tide',
      once: true,
      omen: { days: 3 },
      days: 1,
    });
    const riot = synth({ id: 'ev_a1_riot_t', severity: 'severe', when: 'zz_riot', once: true });
    const t = guildGame({ content: only([tide, riot]) });
    set(t, 'zz_tide', true);
    hours(t, 2);
    // the riot would start within seven days of the announced tide: it waits
    set(t, 'zz_riot', true);
    hours(t, 24 * 6);
    expect(landed(t).map((e) => e.data.eventId)).toEqual(['ev_a1_tide_t']);
    hours(t, 24 * 6);
    const l = landed(t);
    expect(l.map((e) => e.data.eventId)).toEqual(['ev_a1_tide_t', 'ev_a1_riot_t']);
    expect(dayOf(l[1] as AnyWorldEvent) - dayOf(l[0] as AnyWorldEvent)).toBeGreaterThanOrEqual(7);
  });

  it('waits out a long dispute window instead of dropping', () => {
    const yielding = synth({
      id: 'ev_a1_yield_long',
      when: 'act_week >= 1',
      once: true,
      yieldWhile: 'zz_window',
    });
    const t = guildGame({ content: only([yielding]) });
    set(t, 'zz_window', true);
    hours(t, 24 * 20);
    expect(landed(t)).toHaveLength(0);
    expect(gs(t.g).events.dropped.ev_a1_yield_long).toBeUndefined();
    set(t, 'zz_window', false);
    hours(t, 2);
    expect(landed(t)).toHaveLength(1);
  });
});

describe('the rumor, comedy and director engines', () => {
  it('seeds the registration rumor at the guild, once per settlement and day for its bit', () => {
    const second = synth({
      id: 'ev_a1_crystal_again',
      category: 'rumor',
      source: 'cognition',
      when: 'zz_again',
      once: true,
      comedy: 'crystal',
      rumor: { topic: 'appraise', place: '公会', details: ['又一颗水晶没亮'], tellers: ['popo'] },
    });
    const t = guildGame({ content: only([ev('ev_a1_rumor_crystal_broke'), second]) });
    withCognition(t);
    set(t, 'quest.q_a1_m03_register', 'done');
    hours(t, 1);
    expect(landed(t, 'ev_a1_rumor_crystal_broke')).toHaveLength(1);
    const cog = t.g.world.slices.cognition;
    const rumor = Object.values(cog.rumors)[0];
    expect(rumor).toMatchObject({ topic: 'appraise', subject: 'player', mapId: 'borderstone' });
    expect(cog.holdings.lina?.[0]?.rumor).toBe(rumor?.id);
    // the same bit on the same day waits for the next day
    set(t, 'zz_again', true);
    hours(t, 2);
    expect(landed(t, 'ev_a1_crystal_again')).toHaveLength(0);
    hours(t, 24);
    const l = landed(t);
    expect(l).toHaveLength(2);
    expect(dayOf(l[1] as AnyWorldEvent)).toBeGreaterThan(dayOf(l[0] as AnyWorldEvent));
  });

  it('offers the director its events; the director chooses, the kernel settles', () => {
    const items = directorItems(BASE.dynamicEvents);
    const moira = items.find((i) => i.id === 'ev_a1_moira_coincidence');
    expect(moira?.kind).toBe('coincidence');
    // the director lands it as Moira's written coincidence (DB-A1-02, act weeks 3 to 10; the
    // act opens no other coincidence, act1_borderstone.md 7.5): once, inside that window
    const t = guildGame({ content: { ...BASE, directorMenu: items } as ContentMap });
    hours(t, 24 * 4);
    expect(landed(t, 'ev_a1_moira_coincidence')).toEqual([]);
    hours(t, 24 * 70);
    expect(landed(t, 'ev_a1_moira_coincidence').map((e) => e.data.via)).toEqual(['director']);
    expect(flags(t.g)['ev.ev_a1_moira_coincidence.count']).toBe(1);
    // once an act, twice when Moira's interest is 2 or more
    const req = moira?.requires ?? '';
    const holds = () =>
      conditionHolds({ world: t.g.world, tick: t.g.world.meta.tick } as never, req);
    expect(holds()).toBe(false);
    set(t, 'goddess.moira.interest', 2);
    expect(holds()).toBe(true);
    emit(t, 'director.move', {
      move: 'coincidence',
      itemId: 'ev_a1_moira_coincidence',
      tension: 10,
    });
    expect(flags(t.g)['ev.ev_a1_moira_coincidence.count']).toBe(2);
    expect(holds()).toBe(false);
    // a move of an ordinary menu item is not an event
    const before = landed(t).length;
    emit(t, 'director.move', { move: 'respite', itemId: 'div_dir_safe_camp', tension: 90 });
    expect(landed(t)).toHaveLength(before);
    expect(landed(t, 'ev_a1_moira_coincidence')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Measured density (acceptance: inside the ranges of catalog 3.2)

interface Density {
  events: number;
  weeks: number;
  maxSevere: number;
  minSevereGap: number;
  minTideGap: number;
  minOmenLead: number;
  maxComedyPerDay: number;
}

function measure(t: G, content: ContentMap): Density {
  const l = landed(t);
  const d: Density = {
    events: l.length,
    weeks: 0,
    maxSevere: 0,
    minSevereGap: Number.POSITIVE_INFINITY,
    minTideGap: Number.POSITIVE_INFINITY,
    minOmenLead: Number.POSITIVE_INFINITY,
    maxComedyPerDay: 0,
  };
  const def = (id: string) => content.dynamicEvents.find((e) => e.id === id) as DynamicEventDef;
  const severe = new Map<string, { start: number; end: number }[]>();
  const tides = new Map<string, number[]>();
  const comedy = new Map<string, number>();
  const omenDay = new Map<string, number[]>();
  for (const e of t.events)
    if (e.kind === 'dynamic_event.omen') {
      const list = omenDay.get(e.data.eventId) ?? [];
      list.push(dayOf(e));
      omenDay.set(e.data.eventId, list);
    }
  const seen = new Map<string, number>();
  for (const e of l) {
    const x = def(e.data.eventId);
    const day = dayOf(e);
    if (x.severity === 'severe' || x.severity === 'crisis') {
      const list = severe.get(e.data.mapId) ?? [];
      list.push({ start: day, end: day + Math.max(1, x.days ?? 0) });
      severe.set(e.data.mapId, list);
    }
    if (x.category === 'tide') {
      const list = tides.get(e.data.mapId) ?? [];
      list.push(day);
      tides.set(e.data.mapId, list);
    }
    if (x.comedy) {
      const k = `${e.data.mapId}/${x.comedy}/${day}`;
      comedy.set(k, (comedy.get(k) ?? 0) + 1);
    }
    if (x.category === 'tide' || x.category === 'disaster') {
      const n = seen.get(x.id) ?? 0;
      seen.set(x.id, n + 1);
      const o = omenDay.get(x.id)?.[n];
      if (o !== undefined) d.minOmenLead = Math.min(d.minOmenLead, day - o);
    }
  }
  for (const list of severe.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 0; i < list.length; i++) {
      const at = (list[i] as { start: number }).start;
      d.maxSevere = Math.max(d.maxSevere, list.filter((s) => s.start <= at && at < s.end).length);
      if (i > 0)
        d.minSevereGap = Math.min(d.minSevereGap, at - (list[i - 1] as { start: number }).start);
    }
  }
  for (const list of tides.values())
    for (let i = 1; i < list.length; i++)
      d.minTideGap = Math.min(d.minTideGap, (list[i] as number) - (list[i - 1] as number));
  for (const n of comedy.values()) d.maxComedyPerDay = Math.max(d.maxComedyPerDay, n);
  return d;
}

/** A stressed set: chance-driven severe settlement events, tides and comedy bits on top of the data. */
function stressed(): ContentMap {
  const stress: DynamicEventDef[] = [
    ...[1, 2, 3, 4].map((i) =>
      synth({
        id: `ev_a1_stress_${i}`,
        severity: 'severe',
        chance: 0.4,
        when: 'act_week >= 1',
        days: 20,
      }),
    ),
    synth({
      id: 'ev_a1_stress_tide',
      category: 'tide',
      source: 'settlement',
      severity: 'severe',
      maps: ['forest_edge'],
      chance: 0.5,
      when: 'act_week >= 1',
      omen: { days: 3 },
      days: 1,
    }),
    ...[1, 2].map((i) =>
      synth({
        id: `ev_a1_stress_joke_${i}`,
        category: 'rumor',
        source: 'cognition',
        chance: 0.8,
        when: 'act_week >= 1',
        comedy: 'crystal',
        rumor: { topic: 'appraise', place: '公会', details: ['水晶'], tellers: ['lina'] },
      }),
    ),
  ];
  return only([...BASE.dynamicEvents, ...stress]);
}

describe('measured density over twenty seeds', () => {
  const runAct1 = (seed: number, content: ContentMap): Density => {
    const t = guildGame({ seed, content });
    withCognition(t);
    const start = today(t.g);
    while (Number(flags(t.g).act_week ?? 0) < 12) nextWeek(t);
    hours(t, 24 * 6);
    const d = measure(t, content);
    d.weeks = (today(t.g) - start) / 7;
    return d;
  };

  it('stays inside catalog 3.2 for the act 1 data and for a stressed set', () => {
    const report: string[] = [];
    for (const [name, content] of [
      ['act1 data', BASE],
      ['stressed', stressed()],
    ] as const) {
      const all: Density[] = [];
      for (let seed = 1; seed <= 20; seed++) all.push(runAct1(seed * 7919, content));
      for (const d of all) {
        expect(d.maxSevere).toBeLessThanOrEqual(2);
        expect(d.minSevereGap).toBeGreaterThanOrEqual(7);
        expect(d.minTideGap).toBeGreaterThanOrEqual(14);
        expect(d.minOmenLead).toBeGreaterThanOrEqual(3);
        expect(d.maxComedyPerDay).toBeLessThanOrEqual(1);
      }
      const sum = all.reduce((a, d) => a + d.events, 0);
      const weeks = all.reduce((a, d) => a + d.weeks, 0);
      const fmt = (v: number) => (Number.isFinite(v) ? String(v) : 'none');
      report.push(
        `${name}: ${all.length} seeds, ${sum} events in ${weeks.toFixed(0)} weeks (${(sum / weeks).toFixed(2)} a week), ` +
          `max severe at once ${Math.max(...all.map((d) => d.maxSevere))}, ` +
          `min severe gap ${fmt(Math.min(...all.map((d) => d.minSevereGap)))} days, ` +
          `min tide gap ${fmt(Math.min(...all.map((d) => d.minTideGap)))} days, ` +
          `min omen lead ${fmt(Math.min(...all.map((d) => d.minOmenLead)))} days, ` +
          `max comedy bits a day ${Math.max(...all.map((d) => d.maxComedyPerDay))}`,
      );
      if (name === 'stressed') {
        expect(Math.max(...all.map((d) => d.maxSevere))).toBe(2);
        expect(Math.min(...all.map((d) => d.minTideGap))).toBeLessThan(Number.POSITIVE_INFINITY);
      }
    }
    if (process.env.PK47_DENSITY_REPORT)
      appendFileSync(process.env.PK47_DENSITY_REPORT, `${report.join('\n')}\n`);
  }, 600_000);
});

// ---------------------------------------------------------------------------
// The whole game (every system, the registry's write guard on)

describe('in the whole game', () => {
  it('registers, posts, takes and spreads its rumor with every system and the flag guard on', () => {
    const skip = { on: false };
    const strider: GameSystem = {
      id: 'zz_whole_stride',
      order: 1,
      clock(world) {
        if (!skip.on) return null;
        const t = world.meta.tick;
        return { stride: TICKS_PER_GAME_HOUR - (t % TICKS_PER_GAME_HOUR), hold: null };
      },
    };
    const g = createGame({ seed: 4711, systems: [...allSystems(), strider], flagPolicy: 'throw' });
    const events: AnyWorldEvent[] = [];
    g.onEvents((evs) => events.push(...evs));
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.step(3);
    g.queue('flag.set', { key: 'a1_guild_registered', value: true });
    g.queue('flag.set', { key: 'quest.q_a1_m03_register', value: 'done' });
    g.step(3);
    expect(g.world.meta.flags.guild_rank).toBe('f');
    const posted = Object.values(g.world.slices.guild.postings).filter((p) => p.state === 'posted');
    expect(posted.length).toBeGreaterThan(0);
    const guildPlace = g.content.maps
      .find((m) => m.id === 'borderstone')
      ?.locations.find((l) => l.id === 'guild');
    g.queue('world.teleport', {
      entityId: g.world.slices.world.playerId,
      mapId: 'borderstone',
      x: (guildPlace?.x ?? 0) + 1,
      y: (guildPlace?.y ?? 0) + 1,
    });
    g.step(2);
    const p = posted.find((x) => x.board === 'board_borderstone_guild' && x.rank !== 'd');
    if (!p) throw new Error('no F or E posting');
    g.queue('guild.accept', { postingId: p.id });
    g.step(2);
    expect(g.world.slices.quests.quests[p.id]?.status).toBe('active');
    skip.on = true;
    g.step(24 * 14 * TICKS_PER_GAME_HOUR);
    skip.on = false;
    g.step(2);
    // the registration rumor went into the real cognition engine, held by the receptionist
    expect(
      events.some(
        (e) => e.kind === 'dynamic_event.landed' && e.data.eventId === 'ev_a1_rumor_crystal_broke',
      ),
    ).toBe(true);
    const lina = g.world.slices.cognition.holdings.lina ?? [];
    expect(lina.some((h) => g.world.slices.cognition.rumors[h.rumor]?.topic === 'appraise')).toBe(
      true,
    );
    // two weeks later the boards were topped up twice and the untouched commission ran out
    expect(g.world.slices.quests.quests[p.id]?.status).toBe('expired');
    expect(g.world.meta.flags['guild.defaults']).toBe(1);
    expect(events.filter((e) => e.kind === 'guild.posted').length).toBeGreaterThan(posted.length);
  }, 300_000);
});
