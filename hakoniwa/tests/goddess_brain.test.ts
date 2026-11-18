// The goddess brain (builtin_ai.md 8.2 to 8.4; catalog_goddess_interventions.md 1.3, 5;
// PK-M1-20): the persona tables load clean; the score keeps every term by name; the dawn plan
// takes at most three acts above the do-nothing baseline, each validated by the arbiter, with
// her scheme's next step and an open written act lifted; schemes are adopted by their score,
// advance on her act, and are replanned then dropped when a step stalls; the act budget, the
// end reserve and the density limit hold her back; Janu dreams by doors opened.

import { describe, expect, it } from 'vitest';
import { Engine, ok, worldHash } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import {
  adoptionScore,
  brainConfig,
  densityOn,
  keepsReserve,
  overspent,
  personaOf,
  personaProblems,
  planDay,
  schemeDef,
  scoreAction,
  stepSchemes,
} from '../src/systems/goddess';
import { mapById, spawnEntity } from '../src/systems/world';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'pk20b.believer': { tags: string[]; mapId: string };
    'pk20b.run': Record<string, never>;
  }
}

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

/** A function to run inside a tick with the real system context (the brain needs one). */
let job: ((ctx: SystemContext) => void) | null = null;

const probe: GameSystem = {
  id: 'zz_pk20_brain',
  order: 999,
  commands: {
    'pk20b.believer'(ctx, d) {
      spawnEntity(ctx, {
        kind: 'npc',
        name: '信徒',
        mapId: d.mapId,
        ...at(ctx.content, d.mapId, 'plaza'),
        faction: 'town',
        appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
        tags: ['npc', ...d.tags],
      });
      return ok();
    },
    'pk20b.run'(ctx) {
      job?.(ctx);
      job = null;
      return ok();
    },
  },
};

/** The last result of a `goddess.act` command. */
function lastAct(g: Engine) {
  const e = [...g.world.recent]
    .reverse()
    .find((x) => x.kind === 'command.result' && x.data.kind === 'goddess.act');
  return e?.kind === 'command.result' ? e.data : undefined;
}

/** Run `fn` with a live context in the next tick and return its result. */
function inTick<T>(g: Engine, fn: (ctx: SystemContext) => T): T {
  let out: T | undefined;
  job = (ctx) => {
    out = fn(ctx);
  };
  g.queue('pk20b.run', {});
  g.step(1);
  return out as T;
}

function game(seed = 5): Engine {
  const g = Engine.create(seed, narrativeContent(), [...NARRATIVE_SYSTEMS, otherTeamsStub, probe], {
    aiMode: 'off',
  });
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('flag.set', { key: 'a1_wake_ruins', value: true });
  g.queue('world.teleport', {
    entityId: 'player',
    mapId: 'borderstone',
    ...at(g.content, 'borderstone', 'plaza'),
  });
  g.queue('pk20b.believer', { tags: ['priest', 'faction:church'], mapId: 'borderstone' });
  g.queue('pk20b.believer', { tags: ['priest', 'faction:church'], mapId: 'wallenburg' });
  g.queue('pk20b.believer', { tags: ['priest', 'faction:church'], mapId: 'wallenburg' });
  g.step(2);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  return g;
}

describe('persona tables', () => {
  it('load clean and carry the catalog values', () => {
    const c = narrativeContent();
    expect(personaProblems(c)).toEqual([]);
    const eluen = personaOf(c, 'eluen');
    expect(eluen?.kpi).toEqual({
      faith_share: 0.35,
      church_cover: 0.25,
      hero_glory: 0.2,
      heresy_purged: 0.2,
    });
    expect(eluen?.traits.face).toBe(0.95);
    expect(eluen?.interest).toEqual([null, 0, 0.4, 0.8, 0.9, 1]);
    expect(eluen?.acts.act1).toMatchObject({ budget: 900, reserve: 3000 });
    expect(personaOf(c, 'merca')?.acts.act1).toMatchObject({ budget: 400, reserve: 6000 });
    expect(personaOf(c, 'janu')?.dawn).toBe(false);
    // a broken table is reported
    if (!eluen) throw new Error('eluen missing');
    const bad = { ...c, goddessPersonas: [{ ...eluen, traits: { ...eluen.traits, war: 2 } }] };
    expect(personaProblems(bad)).toContain('persona eluen: trait war must be 0 to 1');
  });
});

describe('the divine action score (pure)', () => {
  const facts = {
    weight: 8,
    gate: 1,
    mult: 1,
    kpi: 0.05,
    affinity: 0.95,
    scheme: true,
    beat: false,
    notice: false,
    interest: 0.5,
    playerRel: 1,
    onPlayerMap: true,
    cost: 2,
    power: 2000,
    sedimentRate: 0.01,
    denial: 0.6,
    visibility: 0.3,
    stealth: 0.6,
    caution: 0.7,
    uses7d: 1,
    hostile: false,
    hostileLeft: 1,
    overspent: false,
    jitter: 0.25,
  };

  it('names every term of builtin_ai 8.3', () => {
    const r = scoreAction(facts, { weightScale: 1 });
    const t = Object.fromEntries(r.terms.map((x) => [x.name, x.value]));
    expect(t.weight).toBe(8);
    expect(t.kpi).toBeCloseTo(0.5);
    expect(t.affinity).toBeCloseTo(2.85);
    expect(t.scheme).toBe(4);
    expect(t.interest).toBe(1);
    expect(t.power).toBeCloseTo(-0.02);
    expect(t.sediment).toBeCloseTo(-0.04);
    expect(t.visibility).toBeCloseTo(-0.378);
    expect(t.repeat).toBe(-2);
    expect(t.jitter).toBe(0.25);
    expect(r.total).toBeCloseTo(8 + 0.5 + 2.85 + 4 + 1 - 0.02 - 0.04 - 0.378 - 2 + 0.25, 5);
    // a hostile act pays for a spent budget; a beat lifts by 5; overspending costs 3
    const h = scoreAction({ ...facts, hostile: true, hostileLeft: 0.4 }, { weightScale: 1 });
    expect(h.total).toBeCloseTo(r.total - 3, 5);
    expect(scoreAction({ ...facts, beat: true }, { weightScale: 1 }).total).toBeCloseTo(
      r.total + 5,
      5,
    );
    expect(scoreAction({ ...facts, overspent: true }, { weightScale: 1 }).total).toBeCloseTo(
      r.total - 3,
      5,
    );
    // the player's map term only counts there
    expect(scoreAction({ ...facts, onPlayerMap: false }, { weightScale: 1 }).total).toBeCloseTo(
      r.total - 1,
      5,
    );
  });

  it('holds the act budget softly and the end reserve hard', () => {
    expect(overspent(500, 900, 0.5)).toBe(false);
    expect(overspent(700, 900, 0.5)).toBe(true);
    expect(overspent(1, 0, 0.1)).toBe(true);
    expect(keepsReserve(3000, 10, 27, 0, 3000)).toBe(false);
    expect(keepsReserve(3000, 10, 27, 1, 3000)).toBe(true);
  });
});

describe('the dawn plan and the schemes', () => {
  it('adopts her scheme and plans at most three validated acts, the scheme step first', () => {
    const g = game();
    // the dawn round plans the day; the acts happen through it (from seven in the morning)
    g.step(tickAtDay(1, 0, 2) - g.tick);
    const agenda = g.world.slices.goddess.brains?.eluen?.agenda ?? [];
    expect(agenda.length).toBeGreaterThan(0);
    expect(agenda.every((x) => x.at >= tickAtDay(1, 7, 0) && x.at < tickAtDay(2, 0, 0))).toBe(true);
    g.step(tickAtDay(1, 20, 0) - g.tick);
    expect(g.world.slices.goddess.brains?.eluen?.agenda).toEqual([]);
    const eluen = g.world.slices.goddess.brains?.eluen;
    expect(eluen?.plans.map((p) => p.scheme)).toEqual(['div_plan_eluen_tend_flock']);
    // the first dawn: her gaze (the scheme's first step) went out, marked as the scheme's
    expect(eluen?.gaze?.mapId).toBe('wallenburg');
    const def = g.content.goddesses.find((x) => x.id === 'eluen');
    const s = g.world.slices.goddess.goddesses.eluen;
    if (!def || !s) throw new Error('eluen missing');
    // her acts of the first dawn are cooling down; plan the second with them ready
    s.cooldowns = {};
    const plan = inTick(g, (ctx) => planDay(ctx, def, s));
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(brainConfig(g.content).maxPerDay);
    expect(new Set(plan.map((x) => x.cmd.action)).size).toBe(plan.length);
    for (const p of plan) expect(p.score).toBeGreaterThanOrEqual(4);
    // her scheme's next step is the oracle on the bound map, lifted by the +4
    const oracle = plan.find((p) => p.cmd.action === 'oracle');
    expect(oracle?.cmd.origin).toBe('scheme');
    expect(oracle?.cmd.params?.targetId).toBeDefined();
    expect(oracle?.terms.find((t) => t.name === 'scheme')?.value).toBe(4);
    // the adoption score of the catalog values clears the threshold of 6
    const scheme = schemeDef(g.content, 'div_plan_eluen_tend_flock');
    if (!scheme) throw new Error('no scheme');
    const score = inTick(g, (ctx) =>
      adoptionScore(ctx, scheme, personaOf(g.content, 'eluen'), s.power),
    );
    expect(score).toBeGreaterThan(6);
  });

  it('stops at the act budget and keeps the end reserve, and holds a model to both', () => {
    const g = game();
    const def = g.content.goddesses.find((x) => x.id === 'merca');
    const s = g.world.slices.goddess.goddesses.merca;
    const row = personaOf(g.content, 'merca')?.acts.act1;
    if (!def || !s || !row) throw new Error('merca missing');
    s.cooldowns = {};
    expect(inTick(g, (ctx) => planDay(ctx, def, s)).length).toBeGreaterThan(0);
    // the budget spent: nothing of her own is left to plan
    const brain = g.world.slices.goddess.brains?.merca;
    if (!brain) throw new Error('no brain');
    brain.spent.act1 = row.budget;
    expect(inTick(g, (ctx) => planDay(ctx, def, s))).toEqual([]);
    // within budget, but a spend would break the reserve she keeps for the act's end
    brain.spent.act1 = 0;
    const power = s.power;
    s.power = row.reserve - def.power.daily * 90;
    expect(inTick(g, (ctx) => planDay(ctx, def, s))).toEqual([]);
    s.power = power;
    // a model's proposal past the budget is refused by the arbiter; within it, it goes
    brain.spent.act1 = row.budget;
    const propose = () =>
      g.world.inbox.push({
        kind: 'goddess.act',
        data: {
          goddessId: 'merca',
          action: 'price',
          revision: g.world.slices.goddess.goddesses.merca?.revision ?? 0,
          params: { mapId: 'borderstone', goods: 'salt', factor: 1.1 },
        },
        source: { type: 'ai', agentId: 'merca', requestId: 'p' },
      });
    propose();
    g.step(1);
    expect(lastAct(g)?.code).toBe('budget');
    brain.spent.act1 = 0;
    propose();
    g.step(2);
    expect(lastAct(g)?.ok).toBe(true);
    // her own choice is booked against the act
    expect(brain.spent.act1).toBeGreaterThan(0);
  });

  it('replans a stalled scheme twice, then drops it', () => {
    const g = game();
    g.step(tickAtDay(1, 0, 2) - g.tick);
    const brain = g.world.slices.goddess.brains?.moira;
    const run = brain?.plans.find((p) => p.scheme === 'div_plan_moira_first_outline');
    expect(run).toBeDefined();
    if (!run || !brain) return;
    const def = g.content.goddesses.find((x) => x.id === 'moira');
    const s = g.world.slices.goddess.goddesses.moira;
    if (!def || !s) throw new Error('moira missing');
    for (let i = 0; i < 3; i++) {
      run.deadlineTick = g.tick - 1;
      run.index = 0;
      inTick(g, (ctx) => stepSchemes(ctx, def, s, personaOf(g.content, 'moira')));
    }
    expect(brain.plans.some((p) => p.scheme === 'div_plan_moira_first_outline')).toBe(false);
    expect(brain.ended.at(-1)).toMatchObject({
      scheme: 'div_plan_moira_first_outline',
      how: 'aborted',
    });
  });

  it('is deterministic for the same seed and spends within the act budget', () => {
    const a = game(17);
    const b = game(17);
    a.step(TICKS_PER_GAME_DAY * 12);
    b.step(TICKS_PER_GAME_DAY * 12);
    expect(worldHash(a.world)).toBe(worldHash(b.world));
    const own = a.world.slices.goddess.ledger.filter(
      (e) => e.origin === 'plan' || e.origin === 'scheme',
    );
    expect(own.length).toBeGreaterThan(0);
    for (const id of ['eluen', 'merca', 'sylvie', 'moira']) {
      const spent = a.world.slices.goddess.brains?.[id]?.spent.act1 ?? 0;
      const budget = personaOf(a.content, id)?.acts.act1?.budget ?? 0;
      expect(spent, id).toBeLessThanOrEqual(budget);
    }
    // at most three of her own acts a day
    const perDay = new Map<string, number>();
    for (const e of own) {
      const k = `${e.goddess}:${Math.floor(e.tick / TICKS_PER_GAME_DAY)}`;
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(3);
  });
});

describe('the arbiter’s new limits', () => {
  it('refuses power past the density of a map (catalog 1.3)', () => {
    const g = game();
    g.queue('flag.set', { key: 'act', value: 'act3' });
    g.step(1);
    // the player's map takes at most 600 a week
    const tide = () => {
      const s = g.world.slices.goddess.goddesses.valda;
      if (s) s.cooldowns = {};
      g.world.slices.goddess.hostilityBudget = 99;
      g.queue('goddess.act', {
        goddessId: 'valda',
        action: 'monster_tide',
        revision: s?.revision ?? 0,
        params: { mapId: 'borderstone' },
      });
      g.step(1);
      const r = [...g.world.recent]
        .reverse()
        .find((e) => e.kind === 'command.result' && e.data.kind === 'goddess.act');
      return r?.kind === 'command.result' ? (r.data.ok ? 'ok' : r.data.code) : '';
    };
    expect(tide()).toBe('ok');
    expect(tide()).toBe('ok');
    expect(inTick(g, (ctx) => densityOn(ctx, 'borderstone').playerMap)).toBe(600);
    expect(tide()).toBe('density');
    // a week later the window has moved on
    g.step(7 * TICKS_PER_GAME_DAY + TICKS_PER_GAME_HOUR);
    expect(tide()).toBe('ok');
  });

  it('turns her gaze without a ledger entry and keeps sylvie’s dreams for her believers', () => {
    const g = game();
    const before = g.world.slices.goddess.ledger.length;
    const s = g.world.slices.goddess.goddesses.moira;
    g.queue('goddess.act', {
      goddessId: 'moira',
      action: 'div_all_gaze',
      revision: s?.revision ?? 0,
      params: { mapId: 'borderstone', days: 7 },
    });
    g.step(1);
    expect(g.world.slices.goddess.brains?.moira?.gaze?.mapId).toBe('borderstone');
    expect(g.world.slices.goddess.ledger.length).toBe(before);
    // a dream from one who is not bound to the player needs a sleeper of hers
    g.step(tickAtDay(1, 0, 1) - g.tick);
    const sy = g.world.slices.goddess.goddesses.sylvie;
    if (sy) sy.cooldowns = {};
    g.queue('goddess.act', {
      goddessId: 'sylvie',
      action: 'dream',
      revision: sy?.revision ?? 0,
      params: { mapId: 'borderstone', text: '……林子在喘气。' },
    });
    g.step(1);
    const r = [...g.world.recent]
      .reverse()
      .find((e) => e.kind === 'command.result' && e.data.kind === 'goddess.act');
    expect(r?.kind === 'command.result' && r.data.code).toBe('dream_target');
  });

  it('believes a written origin only from the kernel, and keeps data durations and weather', () => {
    const g = game();
    // a model may not pass its act off as a written one to slip the density limit
    g.world.slices.goddess.density = [
      { tick: g.tick, mapId: 'borderstone', power: 1190, playerMap: true },
    ];
    const s = g.world.slices.goddess.goddesses.merca;
    g.world.inbox.push({
      kind: 'goddess.act',
      data: {
        goddessId: 'merca',
        action: 'price',
        revision: s?.revision ?? 0,
        params: { mapId: 'borderstone', goods: 'salt', factor: 1.2 },
        origin: 'beat',
      },
      source: { type: 'ai', agentId: 'merca', requestId: 'x' },
    });
    g.step(1);
    const r = [...g.world.recent]
      .reverse()
      .find((e) => e.kind === 'command.result' && e.data.kind === 'goddess.act');
    expect(r?.kind === 'command.result' && r.data.code).toBe('density');
    // the kernel's own written act is outside the limit, and stays out of the density book
    g.world.inbox.push({
      kind: 'goddess.act',
      data: {
        goddessId: 'merca',
        action: 'price',
        revision: g.world.slices.goddess.goddesses.merca?.revision ?? 0,
        params: { mapId: 'borderstone', goods: 'salt', factor: 1.2 },
        origin: 'beat',
      },
      source: { type: 'system', system: 'goddess' },
    });
    const written = g.world.slices.goddess.ledger.length;
    g.step(1);
    // (a kernel command reports only a refusal)
    expect(g.world.slices.goddess.ledger.length).toBe(written + 1);
    expect(g.world.slices.goddess.ledger.at(-1)?.origin).toBe('beat');
    expect(g.world.slices.goddess.density?.length).toBe(1);
    // a model's later hour is not believed: it acts now and puts nothing on her agenda
    g.world.slices.goddess.density = [];
    const mm = g.world.slices.goddess.goddesses.merca;
    if (mm) mm.cooldowns = {};
    const before = g.world.slices.goddess.ledger.length;
    g.world.inbox.push({
      kind: 'goddess.act',
      data: {
        goddessId: 'merca',
        action: 'price',
        revision: mm?.revision ?? 0,
        params: { mapId: 'borderstone', goods: 'salt', factor: 1.1 },
        at: g.tick + 10 * TICKS_PER_GAME_DAY,
      },
      source: { type: 'ai', agentId: 'merca', requestId: 'y' },
    });
    g.step(1);
    expect(g.world.slices.goddess.ledger.length).toBe(before + 1);
    expect(g.world.slices.goddess.brains?.merca?.agenda ?? []).toEqual([]);
    // the kernel's later hour is kept on her agenda
    if (mm) mm.cooldowns = {};
    g.world.inbox.push({
      kind: 'goddess.act',
      data: {
        goddessId: 'merca',
        action: 'price',
        revision: mm?.revision ?? 0,
        params: { mapId: 'borderstone', goods: 'salt', factor: 1.1 },
        at: g.tick + 10 * TICKS_PER_GAME_DAY,
      },
      source: { type: 'system', system: 'goddess' },
    });
    g.step(1);
    expect(g.world.slices.goddess.brains?.merca?.agenda?.length).toBe(1);
    g.world.slices.goddess.density = [];
    // a discovery's production tag keeps the hours its data gives (a year), not a day
    const m = g.world.slices.goddess.goddesses.merca;
    if (m) m.cooldowns = {};
    g.queue('goddess.act', {
      goddessId: 'merca',
      action: 'div_merca_discovery',
      revision: m?.revision ?? 0,
      params: { mapId: 'borderstone' },
    });
    g.step(1);
    const tag = g.world.slices.modifiers.active.find((x) => x.target === 'resource_tag');
    expect(tag?.tag).toBe('honey');
    expect((tag?.untilTick ?? 0) - g.tick).toBeGreaterThan(8000 * TICKS_PER_GAME_HOUR);
    // the season's weather is forced and recorded on the weather channel
    g.queue('goddess.act', {
      goddessId: 'sylvie',
      action: 'weather',
      revision: g.world.slices.goddess.goddesses.sylvie?.revision ?? 0,
      params: { mapId: 'forest_edge' },
    });
    g.step(1);
    expect(g.world.slices.world.weather).toBe('rain');
    const rain = g.world.slices.modifiers.active.find(
      (x) => x.target === 'weather' && x.source === 'sylvie',
    );
    expect(rain?.tag).toBe('rain');
  });

  it('lets only the kernel speak a text key in her name', () => {
    const g = game();
    const key = { key: 'sys.goddess.line.manifest' } as const;
    const said = () =>
      g.world.recent.filter(
        (e) =>
          e.kind === 'dialogue.line' && e.data.speakerId === 'merca' && e.data.kind === 'divine',
      ).length;
    const before = said();
    g.world.inbox.push({
      kind: 'goddess.say',
      data: { goddessId: 'merca', text: key },
      source: { type: 'player' },
    });
    g.step(1);
    expect(said()).toBe(before);
    g.world.inbox.push({
      kind: 'goddess.say',
      data: { goddessId: 'merca', text: key },
      source: { type: 'system', system: 'goddess' },
    });
    g.step(1);
    expect(said()).toBe(before + 1);
  });

  it('lets Janu dream into the player once three doors opened', () => {
    const g = game(3);
    g.queue('flag.set', { key: 'seal_looseness', value: 20 });
    g.queue('flag.set', { key: 'a1_dream_door_woman', value: true });
    g.step(1);
    for (let i = 0; i < 3; i++) g.queue('stub.door', { doorId: `door_${i}` });
    g.step(tickAtDay(2, 0, 2) - g.tick);
    const dream = g.world.slices.goddess.ledger.find(
      (e) => e.goddess === 'janu' && e.action === 'dream' && e.origin === 'plan',
    );
    expect(dream).toMatchObject({ seen: true, mapId: 'borderstone' });
    expect(g.world.slices.goddess.brains?.janu?.doorsSinceDream).toBe(0);
  });
});
