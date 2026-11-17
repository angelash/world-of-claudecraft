// The dispute runner (PK-M1-46; act1_borderstone.md 4; npc_society_ai.md 9; builtin_ai.md
// 5.8; quests_and_events.md 3.6): the decision utility and its fallback pick, outcome
// selection, the runner's stages, decision points (week, window, after, unless, deadline,
// a chooser's answer through disputes.decide), settlement (by week, by condition, forced at
// the act's end) and the chain quest it closes, save and resume, the content checks, and
// the acceptance of the plan row and VS-08 for the three Must disputes of act 1: a headless
// run over 20 seeds with no player brings each to a legal ending with no deadlock, and the
// player's interventions change the endings.

import { describe, expect, it } from 'vitest';
import { buildContent, validateContent } from '../src/content';
import { disputeProblems, pack as disputesPack } from '../src/content/packs/disputes';
import { Engine, worldHash } from '../src/core';
import type { AnyWorldEvent, CommandSource, ContentMap, FlagValue } from '../src/core/contracts';
import { defaultRegistry } from '../src/core/registry';
import { Rng } from '../src/core/rng';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import { createGame } from '../src/game/create';
import { guardSystems, registryFor } from '../src/game/flag_guard';
import { allSystems } from '../src/game/registry';
import {
  DECISION_WEIGHTS,
  type DecisionPointDef,
  type DisputeDef,
  decisionMenu,
  decisionUtility,
  system as disputes,
  fallbackPick,
  legalEndings,
  legalOptions,
  MUST_KEEP_PENALTY,
  openDecisions,
  optionInputs,
  selectOutcomes,
  termValue,
} from '../src/systems/disputes';
import { actWeekStartTick, type QuestDef } from '../src/systems/quests';
import { attachSkipHandlers } from '../src/systems/travel/skip_registry';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

// ---------------------------------------------------------------------------
// harness: the narrative systems plus the disputes system, guarded by the registry, with
// an hour-coarse clock (the long time-skip tier) so a whole act runs in a few thousand steps

const CONTENT = narrativeContent();
const D01 = 'q_a1_d01_tax_and_bandits';
const D02 = 'q_a1_d02_witch_trial';
const D04 = 'q_a1_d04_forest_dispute';
const MUST = [D01, D02, D04];
const SCRIPT: CommandSource = { type: 'script', script: 'test' };
const NPC_BRAIN: CommandSource = { type: 'system', system: 'npc' };

function strideSystem(state: { on: boolean }): GameSystem {
  return {
    id: 'zz_stride',
    order: 1,
    clock(world) {
      if (!state.on) return null;
      const t = world.meta.tick;
      return { stride: TICKS_PER_GAME_HOUR - (t % TICKS_PER_GAME_HOUR), hold: null };
    },
  };
}

interface Lean {
  g: Engine;
  events: AnyWorldEvent[];
  /** the hour-coarse clock: off steps tick by tick (the per-tick path of normal play) */
  stride: { on: boolean };
}

/** A lean game in act 1 from `startTick` (the prologue's length), the clock hour-coarse. */
function lean(opts: { seed?: number; startTick?: number; content?: ContentMap } = {}): Lean {
  const content = opts.content ?? CONTENT;
  const stride = { on: true };
  const systems = [
    ...guardSystems(
      attachSkipHandlers([...NARRATIVE_SYSTEMS, disputes]),
      registryFor(content),
      'throw',
    ),
    otherTeamsStub,
    strideSystem(stride),
  ];
  const g = Engine.create(opts.seed ?? 7, content, systems, { aiMode: 'off' });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  const start = opts.startTick ?? 0;
  if (start > g.tick + 1) g.step(start - g.tick - 1);
  stride.on = false;
  g.queue('flag.set', { key: 'seal_unrest', value: 10 }, SCRIPT);
  g.queue('flag.set', { key: 'act', value: 'act1' }, SCRIPT);
  g.step(1);
  stride.on = true;
  return { g, events, stride };
}

/** The tick act week `week` starts (plus `hours`) in this game's act. */
function weekTick(g: Engine, week: number, hours = 0): number {
  const st = g.world.slices.quests.clock;
  if (!st) throw new Error('the act clock has not started');
  return actWeekStartTick(st.startDay, week, st.startTick) + hours * TICKS_PER_GAME_HOUR;
}

function runTo(l: Lean, tick: number): void {
  while (l.g.tick < tick) l.g.step(1);
}

function toWeek(l: Lean, week: number, hours = 1): void {
  runTo(l, weekTick(l.g, week, hours));
}

/** A player-side fact (what a node quest of PK-M1-33 writes), set through the script channel. */
function set(l: Lean, key: string, value: FlagValue): void {
  l.g.queue('flag.set', { key, value }, SCRIPT);
  l.g.step(1);
}

const flags = (g: Engine): Record<string, FlagValue> => g.world.meta.flags;
const state = (g: Engine, id: string) => g.world.slices.disputes.disputes[id];
const quest = (g: Engine, id: string) => g.world.slices.quests.quests[id];

function ofKind<K extends AnyWorldEvent['kind']>(
  evs: readonly AnyWorldEvent[],
  kind: K,
): Extract<AnyWorldEvent, { kind: K }>[] {
  return evs.filter((e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind);
}

const def = (id: string): DisputeDef => {
  const d = CONTENT.disputes.find((x) => x.id === id);
  if (!d) throw new Error(`no dispute ${id}`);
  return d;
};

// ---------------------------------------------------------------------------
// a synthetic dispute for the runner's mechanics

const ZZ = 'zz_dispute';

function zzChain(): QuestDef {
  return {
    id: ZZ,
    act: 'act1',
    kind: 'dispute',
    title: 'zz',
    desc: 'zz',
    stages: [
      {
        id: 'run',
        desc: 'zz',
        objectives: [{ type: 'flag', when: `dispute.${ZZ}.by == player`, label: 'x' }],
      },
    ],
    trigger: 'zz_start',
    byOther: { when: `dispute.${ZZ}.by == world` },
    rewards: [{ type: 'xp', amount: 100, reason: 'quest' }],
  };
}

function zzDispute(over: Partial<DisputeDef> = {}): DisputeDef {
  return {
    id: ZZ,
    act: 'act1',
    code: 'ZZ-01',
    parties: ['moss', 'gorn'],
    span: { from: 1, to: 6 },
    stages: [
      { id: 'calm', label: 'x', escalation: 1, week: 1 },
      { id: 'heat', label: 'x', escalation: 3, week: 3 },
      { id: 'cooled', label: 'x', escalation: 0, week: 1, when: 'zz_cooled' },
    ],
    decisions: [
      {
        id: 'first',
        label: 'x',
        actor: 'moss',
        week: 2,
        hours: 10,
        unless: 'zz_skip',
        band: 0,
        options: [
          {
            id: 'go',
            label: 'x',
            terms: { stance: 0.9, relation: 0.5, safety: 0.5, values: 0.5 },
            effects: [{ type: 'flag', key: 'zz_went', value: true }],
          },
          {
            id: 'wait',
            label: 'x',
            terms: { stance: 0.1, relation: 0.5, safety: 0.5, values: 0.5 },
          },
        ],
      },
      {
        id: 'second',
        label: 'x',
        actor: 'gorn',
        after: 'first',
        when: 'zz_went',
        hours: 5,
        band: 0,
        options: [
          { id: 'yes', label: 'x', terms: { stance: 1, relation: 1, safety: 1, values: 1 } },
          { id: 'no', label: 'x', terms: { stance: 0, relation: 0, safety: 0, values: 0 } },
        ],
      },
      {
        id: 'late',
        label: 'x',
        actor: 'gorn',
        week: 3,
        until: 4,
        when: 'zz_trigger',
        options: [
          { id: 'ok', label: 'x', terms: { stance: 1, relation: 1, safety: 1, values: 1 } },
        ],
      },
    ],
    settle: { week: 6, when: 'zz_settle_now' },
    outcomes: [
      {
        id: 'won',
        label: 'x',
        by: 'player',
        when: 'zz_player_fact',
        effects: [{ type: 'flag', key: 'zz_result', value: 'won' }],
      },
      {
        id: 'world_way',
        label: 'x',
        by: 'world',
        default: true,
        effects: [{ type: 'flag', key: 'zz_result', value: 'default' }],
      },
      {
        id: 'extra',
        label: 'x',
        by: 'world',
        stack: true,
        when: `dispute.${ZZ}.choice.second == yes`,
        effects: [{ type: 'add', key: 'zz_extra', amount: 1 }],
      },
    ],
    ...over,
  };
}

/** The real content plus the synthetic chain, its flags in the registry. */
function zzContent(d: DisputeDef = zzDispute()): ContentMap {
  const base = narrativeContent();
  const reg = structuredClone(defaultRegistry().data);
  for (const name of [
    'zz_went',
    'zz_skip',
    'zz_trigger',
    'zz_settle_now',
    'zz_player_fact',
    'zz_cooled',
    'zz_start',
  ])
    reg.vars.push({
      name,
      kind: 'flag',
      scope: 'global',
      range: null,
      step: null,
      default: false,
      values: null,
      aliases: [],
      writers: ['content'],
      readers: ['content'],
      derive: null,
      monotone: false,
      act: null,
      visibility: 'hidden',
      ai: 'none',
      label: '',
      source: 'test',
    });
  for (const [name, kind] of [
    ['zz_result', 'enum'],
    ['zz_extra', 'int'],
  ] as const)
    reg.vars.push({
      name,
      kind,
      scope: 'global',
      range: null,
      step: null,
      default: null,
      values: null,
      aliases: [],
      writers: ['content'],
      readers: ['content'],
      derive: null,
      monotone: false,
      act: null,
      visibility: 'hidden',
      ai: 'none',
      label: '',
      source: 'test',
    });
  return {
    ...base,
    registry: reg,
    quests: [...base.quests, zzChain()],
    disputes: [d],
  } as ContentMap;
}

// ---------------------------------------------------------------------------

describe('the decision utility (builtin_ai.md 5.8)', () => {
  it('weighs stance 0.35, relation 0.25, safety 0.20, values 0.15, and -100 for a must-keep', () => {
    expect(DECISION_WEIGHTS).toEqual({ stance: 0.35, relation: 0.25, safety: 0.2, values: 0.15 });
    const one = (k: 'stance' | 'relation' | 'safety' | 'values') =>
      decisionUtility('x', {
        stance: 0,
        relation: 0,
        safety: 0,
        values: 0,
        breaks: false,
        [k]: 1,
      }).score;
    expect([one('stance'), one('relation'), one('safety'), one('values')]).toEqual([
      0.35, 0.25, 0.2, 0.15,
    ]);
    // the four weights sum to 0.95: the best an option can score
    const all = decisionUtility('x', {
      stance: 1,
      relation: 1,
      safety: 1,
      values: 1,
      breaks: false,
    });
    expect(all.score).toBe(0.95);
    const broken = decisionUtility('x', {
      stance: 1,
      relation: 1,
      safety: 1,
      values: 1,
      breaks: true,
    });
    expect(broken.score).toBe(0.95 - MUST_KEEP_PENALTY);
    expect(broken.terms.map((t) => t.name)).toEqual([
      'stance',
      'relation',
      'safety',
      'values',
      'must_keep',
    ]);
  });

  it('reads a term as a base plus the adjustments that hold, clamped to 0..1', () => {
    const holds = (w: string) => w === 'yes';
    expect(termValue(0.4, holds)).toBe(0.4);
    expect(termValue(1.7, holds)).toBe(1);
    expect(
      termValue(
        {
          base: 0.5,
          add: [
            { when: 'yes', value: 0.3 },
            { when: 'no', value: 0.4 },
          ],
        },
        holds,
      ),
    ).toBeCloseTo(0.8);
    expect(termValue({ base: 0.2, add: [{ when: 'yes', value: -0.5 }] }, holds)).toBe(0);
  });

  it('offers the options whose condition holds, trimmed to written ones when one is offered', () => {
    const p: DecisionPointDef = {
      id: 'p',
      label: 'x',
      actor: 'moss',
      week: 1,
      options: [
        { id: 'a', label: 'x', terms: { stance: 1, relation: 1, safety: 1, values: 1 } },
        {
          id: 'b',
          label: 'x',
          when: 'gate',
          terms: { stance: 0, relation: 0, safety: 0, values: 0 },
        },
        {
          id: 'c',
          label: 'x',
          when: 'fixed_gate',
          fixed: true,
          terms: { stance: 0, relation: 0, safety: 0, values: 0 },
        },
      ],
    };
    const menu = (on: string[]) => legalOptions(p, (w) => on.includes(w)).map((o) => o.id);
    expect(menu([])).toEqual(['a']);
    expect(menu(['gate'])).toEqual(['a', 'b']);
    // a written option trims the menu, even below a better scoring one
    expect(menu(['gate', 'fixed_gate'])).toEqual(['c']);
    expect(fallbackPick(p, (w) => w === 'fixed_gate').chosen?.id).toBe('c');
    const breaking = {
      ...p,
      options: [{ ...(p.options[0] as DecisionPointDef['options'][0]), breaks: 'oath' }],
    };
    expect(
      optionInputs(breaking.options[0] as DecisionPointDef['options'][0], (w) => w === 'oath')
        .breaks,
    ).toBe(true);
  });

  it('picks the top option, ties by id, and draws inside the band from the stream given', () => {
    const terms = (s: number) => ({ stance: s, relation: 0, safety: 0, values: 0 });
    const p: DecisionPointDef = {
      id: 'p',
      label: 'x',
      actor: 'moss',
      week: 1,
      options: [
        { id: 'b', label: 'x', terms: terms(1) },
        { id: 'a', label: 'x', terms: terms(1) },
        { id: 'c', label: 'x', terms: terms(0.5) },
      ],
    };
    // no stream: the plain top pick, ties by id ascending
    expect(fallbackPick(p, () => false).chosen?.id).toBe('a');
    // band 0: never a draw
    expect(fallbackPick({ ...p, band: 0 }, () => false, new Rng({ s: 1 })).draw).toBe(-1);
    // inside the band both top options win sometimes; c (half the score) never does
    const seen = new Set<string>();
    for (let s = 1; s <= 40; s++) {
      const pick = fallbackPick(p, () => false, new Rng({ s }));
      seen.add(pick.chosen?.id ?? '');
      expect(pick.draw).toBeGreaterThanOrEqual(0);
    }
    expect([...seen].sort()).toEqual(['a', 'b']);
    // the same stream state gives the same pick
    expect(fallbackPick(p, () => false, new Rng({ s: 9 })).chosen?.id).toBe(
      fallbackPick(p, () => false, new Rng({ s: 9 })).chosen?.id,
    );
  });
});

describe('outcome selection', () => {
  const d = zzDispute();
  it('takes the first holding row, else the default, plus the stacking rows that hold', () => {
    const sel = (on: string[]) => selectOutcomes(d, (w) => on.includes(w));
    expect(sel([])).toMatchObject({ ending: 'world_way', by: 'world', stacked: [] });
    expect(sel(['zz_player_fact'])).toMatchObject({ ending: 'won', by: 'player' });
    const both = sel(['zz_player_fact', `dispute.${ZZ}.choice.second == yes`]);
    expect(both?.stacked.map((o) => o.id)).toEqual(['extra']);
    // a player-made stacking row makes the settlement the player's
    const stackedByPlayer: DisputeDef = {
      ...d,
      outcomes: d.outcomes.map((o) => (o.stack ? { ...o, by: 'player' as const } : o)),
    };
    expect(
      selectOutcomes(stackedByPlayer, (w) => w === `dispute.${ZZ}.choice.second == yes`),
    ).toMatchObject({ ending: 'world_way', by: 'player' });
    expect(legalEndings(d)).toEqual(['won', 'world_way']);
  });
});

// ---------------------------------------------------------------------------

describe('the runner', () => {
  it('walks stages, opens a point at its week, lets the fallback decide at the deadline', () => {
    const l = lean({ content: zzContent() });
    toWeek(l, 1);
    expect(flags(l.g)[`dispute.${ZZ}.stage`]).toBe('calm');
    expect(flags(l.g)[`dispute.${ZZ}.escalation`]).toBe(1);
    toWeek(l, 2);
    const opened = ofKind(l.events, 'dispute.decision_opened');
    expect(opened.map((e) => [e.data.pointId, e.data.actor, e.data.options])).toEqual([
      ['first', 'moss', ['go', 'wait']],
    ]);
    expect(openDecisions(l.g.world, 'moss').map((o) => o.point)).toEqual(['first']);
    expect(openDecisions(l.g.world, 'gorn')).toEqual([]);
    const due = opened[0]?.data.dueTick ?? 0;
    expect(due - (opened[0]?.tick ?? 0)).toBe(10 * TICKS_PER_GAME_HOUR);
    runTo(l, due + 1);
    // the fallback chose go; second followed at once and was decided too (5 hours later)
    runTo(l, due + 6 * TICKS_PER_GAME_HOUR);
    const decided = ofKind(l.events, 'dispute.decided').map((e) => [
      e.data.pointId,
      e.data.optionId,
      e.data.source,
    ]);
    expect(decided).toEqual([
      ['first', 'go', 'fallback'],
      ['second', 'yes', 'fallback'],
    ]);
    expect(flags(l.g).zz_went).toBe(true);
    expect(flags(l.g)[`dispute.${ZZ}.choice.first`]).toBe('go');
    // the late point's window passes without its condition: dropped
    toWeek(l, 5);
    expect(state(l.g, ZZ)?.dropped).toEqual(['late']);
    expect(flags(l.g)[`dispute.${ZZ}.stage`]).toBe('heat');
    toWeek(l, 6);
    expect(state(l.g, ZZ)).toMatchObject({ ending: 'world_way', by: 'world', stacked: ['extra'] });
    expect(flags(l.g)).toMatchObject({
      [`dispute.${ZZ}.ending`]: 'world_way',
      [`dispute.${ZZ}.by`]: 'world',
      [`dispute.${ZZ}.escalation`]: 0,
      zz_result: 'default',
      zz_extra: 1,
    });
    expect(l.g.world.slices.disputes.open).toEqual([]);
    // the chain quest never started: the world got there first, a closed record
    l.g.step(2);
    expect(quest(l.g, ZZ)?.status).toBe('by_other');
  });

  it('takes a chooser answer before the deadline, and refuses the player and bad answers', () => {
    const l = lean({ content: zzContent() });
    toWeek(l, 2);
    l.g.queue('disputes.decide', { disputeId: ZZ, pointId: 'first', optionId: 'go' });
    l.g.queue(
      'disputes.decide',
      { disputeId: ZZ, pointId: 'first', optionId: 'nonsense' },
      NPC_BRAIN,
    );
    l.g.queue('disputes.decide', { disputeId: ZZ, pointId: 'nowhere', optionId: 'go' }, NPC_BRAIN);
    l.g.step(1);
    const codes = ofKind(l.events, 'command.result')
      .filter((e) => e.data.kind === 'disputes.decide')
      .map((e) => e.data.code);
    expect(codes).toEqual(['not_allowed', 'bad_option', 'no_decision']);
    // the menu the brain sees: legal options with their rule utilities
    const menu = decisionMenu(
      {
        world: l.g.world,
        content: l.g.content,
        tick: l.g.tick,
        flag: (k: string) => l.g.world.meta.flags[k],
      } as never,
      ZZ,
      'first',
    );
    expect(menu.map((o) => o.id)).toEqual(['go', 'wait']);
    expect(menu[0]?.utility).toBeGreaterThan(menu[1]?.utility ?? 1);
    // the NPC brain picks the lower one before the deadline: it stands
    l.g.queue('disputes.decide', { disputeId: ZZ, pointId: 'first', optionId: 'wait' }, NPC_BRAIN);
    l.g.step(1);
    expect(
      ofKind(l.events, 'dispute.decided').map((e) => [e.data.optionId, e.data.source]),
    ).toEqual([['wait', 'chooser']]);
    // wait does not write zz_went: second (after first, when zz_went) is dropped at once
    expect(state(l.g, ZZ)?.dropped).toEqual(['second']);
    expect(flags(l.g).zz_went).toBeUndefined();
  });

  it('drops a point when the player stepped in, and every point that follows it', () => {
    const l = lean({ content: zzContent() });
    set(l, 'zz_skip', true);
    toWeek(l, 2, 2);
    expect(state(l.g, ZZ)?.dropped).toEqual(['first', 'second']);
    expect(ofKind(l.events, 'dispute.decision_dropped').map((e) => e.data.pointId)).toEqual([
      'first',
      'second',
    ]);
  });

  it('opens a windowed point when its condition comes to hold inside the window', () => {
    const l = lean({ content: zzContent() });
    toWeek(l, 3, 5);
    expect(openDecisions(l.g.world).map((o) => o.point)).not.toContain('late');
    set(l, 'zz_trigger', true);
    l.g.step(1);
    expect(ofKind(l.events, 'dispute.decision_opened').map((e) => e.data.pointId)).toContain(
      'late',
    );
  });

  it('settles early when its condition holds, decides what is open first, and the player gets the chain', () => {
    const l = lean({ content: zzContent() });
    set(l, 'zz_start', true);
    l.g.step(2);
    expect(quest(l.g, ZZ)?.status).toBe('active');
    toWeek(l, 2, 1);
    expect(openDecisions(l.g.world).map((o) => o.point)).toEqual(['first']);
    set(l, 'zz_player_fact', true);
    set(l, 'zz_settle_now', true);
    l.g.step(2);
    expect(state(l.g, ZZ)).toMatchObject({ ending: 'won', by: 'player' });
    expect(ofKind(l.events, 'dispute.decided').map((e) => e.data.pointId)).toEqual([
      'first',
      'second',
    ]);
    expect(l.g.world.slices.disputes.open).toEqual([]);
    // the stage written last stays; the escalation goes back to 0
    expect(flags(l.g)[`dispute.${ZZ}.escalation`]).toBe(0);
    l.g.step(12);
    expect(quest(l.g, ZZ)?.status).toBe('done');
    expect(
      ofKind(l.events, 'dispute.settled').map((e) => [e.data.ending, e.data.by, e.data.forced]),
    ).toEqual([['won', 'player', false]]);
  });

  it('a condition stage overrides the week stages while it holds', () => {
    const l = lean({ content: zzContent() });
    toWeek(l, 3, 2);
    expect(flags(l.g)[`dispute.${ZZ}.stage`]).toBe('heat');
    set(l, 'zz_cooled', true);
    l.g.step(1);
    expect(flags(l.g)[`dispute.${ZZ}.stage`]).toBe('cooled');
    expect(ofKind(l.events, 'dispute.stage').map((e) => [e.data.stage, e.data.escalation])).toEqual(
      [
        ['calm', 1],
        ['heat', 3],
        ['cooled', 0],
      ],
    );
  });

  it('settles by force once the world is past the dispute act', () => {
    const l = lean({ content: zzContent() });
    toWeek(l, 2, 2);
    set(l, 'act', 'act2');
    l.g.step(1);
    expect(state(l.g, ZZ)?.ending).toBe('world_way');
    expect(ofKind(l.events, 'dispute.settled').map((e) => e.data.forced)).toEqual([true]);
    expect(l.g.world.slices.disputes.open).toEqual([]);
  });

  it('resumes from a save with an open decision to the same world as an uninterrupted run', () => {
    const a = lean({ content: zzContent(), seed: 3 });
    const b = lean({ content: zzContent(), seed: 3 });
    toWeek(b, 2, 4);
    expect(openDecisions(b.g.world).length).toBe(1);
    const saved = JSON.parse(JSON.stringify(b.g.world));
    const c = Engine.resume(saved, b.g.content, b.g.systems, { aiMode: 'off' });
    const end = weekTick(a.g, 7);
    runTo(a, end);
    while (c.tick < end) c.step(1);
    expect(worldHash(c.world)).toBe(worldHash(a.g.world));
    expect(c.world.slices.disputes).toEqual(a.g.world.slices.disputes);
  });

  it('steps tick by tick in normal play: the deadline and a moved flag on their own ticks', () => {
    // a deadline that falls between two poll ticks
    const base = zzDispute();
    const first = { ...(base.decisions[0] as DecisionPointDef), hours: 10.0025 };
    const l = lean({
      content: zzContent({ ...base, decisions: [first, ...base.decisions.slice(1)] }),
    });
    // hour-coarse to the last hour of week 1, then the per-tick path (no time skip)
    runTo(l, weekTick(l.g, 2) - TICKS_PER_GAME_HOUR);
    l.stride.on = false;
    const start = weekTick(l.g, 2);
    runTo(l, start + 2);
    // the act week turned: the point opened on that same tick
    const opened = ofKind(l.events, 'dispute.decision_opened').find(
      (e) => e.data.pointId === 'first',
    );
    expect(opened?.tick).toBe(start);
    expect(flags(l.g)[`dispute.${ZZ}.stage`]).toBe('calm');
    const due = opened?.data.dueTick ?? 0;
    expect(due % 10).not.toBe(0);
    // the deadline is met on its own tick, not at the next poll
    runTo(l, due + 1);
    const decided = ofKind(l.events, 'dispute.decided').find((e) => e.data.pointId === 'first');
    expect(decided?.tick).toBe(due);
    // a flag moved between polls: the windowed point opens on the next tick
    runTo(l, weekTick(l.g, 3) + 3);
    l.g.queue('flag.set', { key: 'zz_trigger', value: true }, SCRIPT);
    const at = l.g.tick + 1;
    l.g.step(2);
    const late = ofKind(l.events, 'dispute.decision_opened').find((e) => e.data.pointId === 'late');
    expect(at % 10).not.toBe(0);
    expect(late?.tick).toBeGreaterThanOrEqual(at);
    expect(late?.tick).toBeLessThanOrEqual(at + 1);
  });
});

// ---------------------------------------------------------------------------

describe('the content checks', () => {
  it('pass the shipped disputes and chains', () => {
    const content = buildContent();
    expect(disputesPack.validate?.(content) ?? []).toEqual([]);
    expect(validateContent(content).filter((p) => /dispute|q_a1_d0/.test(p))).toEqual([]);
    expect(content.disputes.map((d) => d.id)).toEqual(MUST);
  });

  it('catch a dispute that could wait forever or that names things that are not there', () => {
    const content = { ...zzContent() };
    const probs = (over: Partial<DisputeDef>) => disputeProblems(zzDispute(over), content);
    expect(probs({})).toEqual([]);
    const base = zzDispute();
    expect(probs({ outcomes: base.outcomes.filter((o) => !o.default) }).join('\n')).toContain(
      'needs exactly one default ending (has 0)',
    );
    expect(
      probs({
        outcomes: [...base.outcomes, { id: 'd2', label: 'x', by: 'world', default: true }],
      }).join('\n'),
    ).toContain('has 2');
    const firstPoint = base.decisions[0] as DecisionPointDef;
    const conditional = {
      ...firstPoint,
      options: firstPoint.options.map((o) => ({ ...o, when: 'zz_trigger' })),
    };
    expect(probs({ decisions: [conditional] }).join('\n')).toContain('every option is conditional');
    expect(probs({ decisions: [{ ...firstPoint, after: 'second' }] }).join('\n')).toContain(
      'names exactly one of week and after',
    );
    const reversed = [base.decisions[1], base.decisions[0]] as DecisionPointDef[];
    expect(probs({ decisions: reversed }).join('\n')).toContain('which must come before it');
    expect(probs({ decisions: [{ ...firstPoint, actor: 'nobody_at_all' }] }).join('\n')).toContain(
      'unknown person nobody_at_all',
    );
    expect(probs({ parties: ['nobody_at_all'] }).join('\n')).toContain('unknown party');
    expect(probs({ stages: [{ id: 'x', label: 'x', escalation: 4 }] }).join('\n')).toContain(
      'escalation outside 0 to 3',
    );
    expect(probs({ span: { from: 3, to: 20 } }).join('\n')).toContain('bad span');
    expect(probs({ decisions: [{ ...firstPoint, id: 'Bad-Id' }] }).join('\n')).toContain(
      'not a lowercase name segment',
    );
    expect(
      probs({
        decisions: [{ ...firstPoint, id: 'a_very_long_decision_point_name_beyond_the_cap' }],
      }).join('\n'),
    ).toContain('longer than 64');
    expect(probs({ settle: { week: 6, when: 'a AND' } }).join('\n')).toContain('settle');
    expect(disputeProblems(zzDispute({ id: 'q_a1_m01_fall' }), content).join('\n')).toContain(
      'is not a dispute chain',
    );
    expect(disputeProblems(zzDispute({ id: 'zz_nothing' }), content).join('\n')).toContain(
      'no chain quest',
    );
    expect(probs({ settle: { week: 20 } }).join('\n')).toContain('bad settle week');
    const noByOther = {
      ...content,
      quests: content.quests.map((q) => (q.id === ZZ ? { ...q, byOther: undefined } : q)),
    } as ContentMap;
    expect(disputeProblems(zzDispute(), noByOther).join('\n')).toContain('needs a byOther');
  });
});

// ---------------------------------------------------------------------------
// acceptance: the three Must disputes of act 1 (roadmap 5.1, VS-08, plan row PK-M1-46)

/** The no-intervention endings (act1_borderstone.md 4.1, 4.2, 4.4 event chains). */
const DEFAULT_ENDINGS: Record<string, string> = {
  [D01]: 'fled',
  [D02]: 'convicted',
  [D04]: 'broken',
};

/** Act exit variables each Must dispute writes by its end (act1_borderstone.md 12). */
const EXIT_VARS: Record<string, string[]> = {
  [D01]: [
    'a1_moss_fate',
    'a1_dian_trade',
    'a1_oneeye_fate',
    'a1_old_watch',
    'a1_viro_status',
    'a1_tax_rate',
  ],
  [D02]: ['a1_oola_fate', 'a1_cassian_report'],
  [D04]: ['a1_shiya_family', 'a1_forest_accord'],
};

/** A seeded no-intervention run: a prologue of 0 to 13 days, seal_unrest drift from doors. */
function seededRun(seed: number): Lean {
  const rng = new Rng({ s: seed * 7919 + 13 });
  const startTick = tickAtDay(rng.int(0, 13), rng.int(7, 18));
  const l = lean({ seed, startTick });
  // the other writers of seal_unrest (doors, quest effects) bring the tide forward or not
  const bumps = rng.int(0, 3);
  for (let i = 0; i < bumps; i++) {
    toWeek(l, rng.int(2, 7), rng.int(1, 20));
    const cur = Number(flags(l.g).seal_unrest ?? 0);
    set(l, 'seal_unrest', Math.min(100, cur + rng.int(5, 20)));
  }
  toWeek(l, 11, 2);
  return l;
}

/** Settled on a legal ending, nothing left open, settled by week 11, exit variables written. */
function expectSettledLegally(l: Lean, id: string): void {
  const d = def(id);
  const st = state(l.g, id);
  expect(st?.ending, id).toBeDefined();
  expect(legalEndings(d), id).toContain(st?.ending);
  expect(['player', 'world'], id).toContain(st?.by);
  for (const p of d.decisions) {
    const done = st?.chosen[p.id] !== undefined || st?.dropped.includes(p.id);
    expect(done, `${id} ${p.id}`).toBe(true);
  }
  expect(
    l.g.world.slices.disputes.open.filter((o) => o.dispute === id),
    id,
  ).toEqual([]);
  expect(st?.settledTick ?? Number.POSITIVE_INFINITY, id).toBeLessThanOrEqual(weekTick(l.g, 11));
  expect(flags(l.g)[`dispute.${id}.ending`], id).toBe(st?.ending);
  expect(flags(l.g)[`dispute.${id}.by`], id).toBe(st?.by);
  for (const v of EXIT_VARS[id] ?? []) expect(flags(l.g)[v], `${id} ${v}`).toBeDefined();
}

/** The values a flag took, in order, with their ticks. */
function history(l: Lean, key: string): [FlagValue, number][] {
  return ofKind(l.events, 'flag.changed')
    .filter((e) => e.data.key === key)
    .map((e) => [e.data.value, e.tick]);
}

describe('acceptance: 20 seeds with no player', () => {
  it('brings every Must dispute to its default ending, no deadlock, settled by week 11', () => {
    const spread: Record<string, Record<string, number>> = {};
    const tideWeeks: Record<string, number> = {};
    const count = (bag: Record<string, number>, key: string) => {
      bag[key] = (bag[key] ?? 0) + 1;
    };
    for (let seed = 1; seed <= 20; seed++) {
      const l = seededRun(seed);
      l.g.step(2);
      for (const id of MUST) {
        expectSettledLegally(l, id);
        const st = state(l.g, id);
        expect(st?.by, `${id} seed ${seed}`).toBe('world');
        expect(st?.ending, `${id} seed ${seed}`).toBe(DEFAULT_ENDINGS[id]);
        // the chain quest never started (no player in town): the world got there first
        expect(quest(l.g, id)?.status, `${id} seed ${seed}`).toBe('by_other');
        const s = spread[id] ?? {};
        spread[id] = s;
        count(s, st?.ending ?? '');
        for (const [p, o] of Object.entries(st?.chosen ?? {})) count(s, `${p}=${o}`);
      }
      // the tide night reads the forest dispute settled and Moss still in office
      const tide = ofKind(l.events, 'act.night')[0];
      expect(tide, `seed ${seed}`).toBeDefined();
      count(tideWeeks, String(tide?.data.week));
      const forest = ofKind(l.events, 'dispute.settled').find((e) => e.data.disputeId === D04);
      expect(forest?.tick, `seed ${seed}`).toBe(tide?.tick);
      const moss = history(l, 'a1_moss_fate');
      expect(
        moss.map(([v]) => v),
        `seed ${seed}`,
      ).toEqual(['in_power', 'fled']);
      expect(moss[0]?.[1] ?? 0).toBeLessThan(tide?.tick ?? 0);
      expect(moss[1]?.[1] ?? 0).toBeGreaterThan(tide?.tick ?? 0);
      // the trial at week 8: convicted before the transfer, Oola is in custody on the tide night
      const fate = history(l, 'a1_oola_fate');
      expect(fate.map(([v]) => v)).toEqual(['convicted']);
      expect(fate[0]?.[1] ?? 0).toBeLessThan(tide?.tick ?? 0);
      expect(flags(l.g).church_suspicion).toBe(15);
    }
    console.log(
      `[disputes] 20 seeds, no player: ${JSON.stringify(spread)}; tide weeks ${JSON.stringify(tideWeeks)}`,
    );
    expect(Object.keys(tideWeeks).length).toBeGreaterThan(1);
  });

  it('runs the same in the real game with every system, the registry guard on', () => {
    const stride = { on: true };
    const g = createGame({
      seed: 11,
      aiMode: 'off',
      flagPolicy: 'throw',
      systems: [...allSystems(), strideSystem(stride)],
    });
    stride.on = false;
    g.queue('flag.set', { key: 'act', value: 'act1' }, SCRIPT);
    g.step(2);
    stride.on = true;
    const l: Lean = { g, events: [], stride };
    g.onEvents((evs) => l.events.push(...evs));
    const t0 = performance.now();
    toWeek(l, 11, 2);
    for (const id of MUST) {
      expectSettledLegally(l, id);
      expect(state(g, id), id).toMatchObject({ ending: DEFAULT_ENDINGS[id], by: 'world' });
    }
    console.log(
      `[disputes] real game to week 11: ${Math.round(performance.now() - t0)} ms, endings ${MUST.map((id) => state(g, id)?.ending).join(', ')}`,
    );
    const ids = g.systems.map((s) => s.id);
    expect(ids.indexOf('disputes')).toBeGreaterThan(ids.indexOf('quests'));
  });
});

// The player's interventions below are the facts the node quests of PK-M1-33 write (the
// "产出与写入" column of catalog 5.3), set at the weeks the nodes open; the runner turns
// them into different decisions and endings.

/** Register in town (the chains start), then run with the given interventions. */
function withPlayer(seed: number, plan: (l: Lean) => void): Lean {
  const l = lean({ seed });
  set(l, 'quest.q_a1_m03_register', 'done');
  l.g.step(2);
  for (const id of MUST) expect(quest(l.g, id)?.status, id).toBe('active');
  plan(l);
  toWeek(l, 11, 2);
  l.g.step(12);
  return l;
}

const xpOf = (l: Lean) => ofKind(l.events, 'xp.awarded').map((e) => e.data.amount);

describe('acceptance: the player changes the endings', () => {
  it('tax and bandits: Owen escorted, three pieces of evidence and the confrontation arrest Moss', () => {
    const l = withPlayer(1, (x) => {
      toWeek(x, 5);
      set(x, 'a1_owen_escorted', true);
      toWeek(x, 6, 3);
      set(x, 'a1_moss_evidence', 3);
      set(x, 'a1_moss_exposed', true);
      set(x, 'a1_moss_fate', 'arrested');
    });
    expectSettledLegally(l, D01);
    expect(state(l.g, D01)).toMatchObject({ ending: 'exposed', by: 'player' });
    expect(flags(l.g)).toMatchObject({
      a1_moss_fate: 'arrested',
      a1_tax_rate: 'tenth',
      a1_dian_trade: 'stopped',
      a1_permit_revoked: true,
      'rep.bs_commons': 30,
    });
    // Owen was escorted inside his window: he did not leave at the end of week 6
    expect(flags(l.g).a1_owen_left).toBeUndefined();
    expect(
      ofKind(l.events, 'quest.default')
        .filter((e) => e.data.step === 'owen_leaves')
        .map((e) => [e.data.week, e.data.applied]),
    ).toEqual([[7, false]]);
    // Moss was in custody by week 8: he never got to his cart
    expect(state(l.g, D01)?.dropped).toContain('moss_cart');
    // the chain is the player's: done, with the chain settlement experience
    expect(quest(l.g, D01)?.status).toBe('done');
    expect(xpOf(l)).toContain(600);
  });

  it('tax and bandits: absorbing the band and stopping the cart; the cart alone pays nothing', () => {
    const l = withPlayer(2, (x) => {
      toWeek(x, 7);
      set(x, 'a1_oneeye_fate', 'absorbed');
      toWeek(x, 10, 30);
      set(x, 'a1_moss_intercepted', true);
    });
    expectSettledLegally(l, D01);
    expect(state(l.g, D01)).toMatchObject({
      ending: 'in_power',
      by: 'player',
      stacked: ['band_absorbed'],
    });
    expect(flags(l.g)).toMatchObject({
      a1_moss_fate: 'in_power',
      a1_old_watch: 'camp',
      a1_viro_status: 'fled_wallenburg',
    });
    // the band was the player's before week 8: Viro had no raid to make
    expect(state(l.g, D01)?.dropped).toContain('viro_raid');
    // absorbing the band is a credited ending (catalog 5.3)
    expect(quest(l.g, D01)?.status).toBe('done');
    // stopping the cart alone keeps Moss in office, which the catalog does not pay for
    const cart = withPlayer(3, (x) => {
      toWeek(x, 10, 30);
      set(x, 'a1_moss_intercepted', true);
    });
    expect(state(cart.g, D01)).toMatchObject({ ending: 'in_power', by: 'player' });
    expect(state(cart.g, D01)?.chosen.moss_cart).toBe('flee_south');
    expect(quest(cart.g, D01)?.status).toBe('by_other');
    expect(xpOf(cart)).not.toContain(600);
  });

  it('witch trial: the spring and the trust of Isa make her testify and Cassian clear Oola', () => {
    const l = withPlayer(4, (x) => {
      toWeek(x, 3);
      set(x, 'a1_spring_source_found', true);
      set(x, 'trust.isa', 70);
    });
    expectSettledLegally(l, D02);
    expect(state(l.g, D02)?.chosen).toMatchObject({
      isa_testify: 'testify',
      cassian_verdict: 'clear',
    });
    expect(state(l.g, D02)).toMatchObject({ ending: 'cleared', by: 'player' });
    expect(flags(l.g)).toMatchObject({
      a1_oola_fate: 'cleared',
      a1_isa_will_testify: true,
      a1_cassian_report: 'cleared',
      'npc.cassian.doubt': 2,
    });
    expect(flags(l.g).church_suspicion).toBeUndefined();
    expect(quest(l.g, D02)?.status).toBe('done');
    expect(xpOf(l)).toContain(550);
  });

  it('witch trial: the spring alone is one piece; Isa keeps silent and the trial convicts', () => {
    const l = withPlayer(5, (x) => {
      toWeek(x, 3);
      set(x, 'a1_spring_source_found', true);
    });
    expect(state(l.g, D02)?.chosen).toMatchObject({
      isa_testify: 'keep_silent',
      cassian_verdict: 'convict',
    });
    expect(state(l.g, D02)).toMatchObject({ ending: 'convicted', by: 'world' });
    expect(quest(l.g, D02)?.status).toBe('by_other');
  });

  it('witch trial: a bribe frees Oola without the chain reward, and keeps Moss in office', () => {
    const l = withPlayer(6, (x) => {
      toWeek(x, 7, 2);
      set(x, 'a1_oola_bribed', true);
      set(x, 'a1_oola_fate', 'cleared');
    });
    expectSettledLegally(l, D02);
    expectSettledLegally(l, D01);
    expect(state(l.g, D02)).toMatchObject({ ending: 'bribed', by: 'player' });
    expect(flags(l.g).a1_cassian_report).toBe('unresolved');
    // the catalog pays the chain for clearing or hiding her, not for a bribe
    expect(quest(l.g, D02)?.status).toBe('by_other');
    // the disputes bite: Moss holds the player's secret and a fat purse, and stays
    expect(state(l.g, D01)?.chosen.moss_cart).toBe('stay_put');
    expect(state(l.g, D01)).toMatchObject({ ending: 'in_power', by: 'world' });
    expect(flags(l.g).a1_moss_fate).toBe('in_power');
  });

  it('witch trial: a jailbreak after the verdict hides Oola', () => {
    const l = withPlayer(7, (x) => {
      toWeek(x, 8, 12);
      set(x, 'a1_oola_jailbroken', true);
      set(x, 'a1_oola_fate', 'fled');
    });
    expectSettledLegally(l, D02);
    expect(state(l.g, D02)?.chosen.cassian_verdict).toBe('convict');
    expect(state(l.g, D02)).toMatchObject({ ending: 'hidden', by: 'player' });
    // Cassian's week 8 report already said convicted
    expect(flags(l.g).a1_cassian_report).toBe('convicted');
    expect(quest(l.g, D02)?.status).toBe('done');
  });

  it('witch trial: while the main-line trial quest runs, the verdict waits for its scene', () => {
    const l = withPlayer(8, (x) => {
      // A1-M09 started before the trial week (the quest writes quest.<id> = active)
      toWeek(x, 7);
      set(x, 'quest.q_a1_m09_trial', 'active');
      toWeek(x, 9, 3);
      expect(openDecisions(x.g.world).map((o) => o.point)).not.toContain('cassian_verdict');
      // the trial scene convicts in front of the player at week 9
      set(x, 'a1_oola_fate', 'convicted');
      set(x, 'quest.q_a1_m09_trial', 'done');
    });
    expectSettledLegally(l, D02);
    // the dispute did not try her a second time, nor add its own suspicion
    expect(state(l.g, D02)?.dropped).toEqual(
      expect.arrayContaining(['cassian_verdict', 'boro_storm']),
    );
    expect(state(l.g, D02)).toMatchObject({ ending: 'convicted', by: 'world' });
    expect(flags(l.g).church_suspicion).toBeUndefined();
    expect(flags(l.g).a1_cassian_report).toBe('convicted');
  });

  it('witch trial: a pact broken before the trial brings Boro onto the stage', () => {
    // no shipped content breaks the forest pact before week 8 (the blood debt comes after
    // the verdict); this stands in for an earlier escalation to check the brawl path
    const l = withPlayer(9, (x) => {
      toWeek(x, 7, 60);
      set(x, 'a1_forest_accord', 'broken');
    });
    expectSettledLegally(l, D02);
    expect(state(l.g, D02)?.chosen).toMatchObject({
      cassian_verdict: 'convict',
      boro_storm: 'storm',
    });
    expect(state(l.g, D02)).toMatchObject({ ending: 'brawl', by: 'world' });
    expect(flags(l.g)).toMatchObject({ a1_oola_fate: 'fled', a1_trial_brawl: true });
  });

  it('forest dispute: the pact, the den and the saved logger restore the accord', () => {
    const l = withPlayer(10, (x) => {
      toWeek(x, 3);
      set(x, 'a1_logger_saved', true);
      toWeek(x, 5);
      set(x, 'a1_forest_pact_proof', true);
      set(x, 'a1_wolf_den', 'cleared');
    });
    expectSettledLegally(l, D04);
    expect(state(l.g, D04)).toMatchObject({ ending: 'restored', by: 'player' });
    expect(state(l.g, D04)?.dropped).toEqual(['gorn_council', 'boro_revenge']);
    expect(flags(l.g)).toMatchObject({ a1_forest_accord: 'restored', a1_shiya_family: 'in_town' });
    expect(flags(l.g)[`dispute.${D04}.stage`]).toBe('truce');
    expect(quest(l.g, D04)?.status).toBe('done');
    expect(xpOf(l)).toContain(400);
  });

  it('forest dispute: the pact alone convinces Gorn to stay and brings a truce', () => {
    const l = withPlayer(11, (x) => {
      toWeek(x, 5);
      set(x, 'a1_forest_pact_proof', true);
    });
    expectSettledLegally(l, D04);
    expect(state(l.g, D04)?.chosen.gorn_council).toBe('stay');
    expect(state(l.g, D04)?.dropped).toEqual(['boro_revenge']);
    expect(state(l.g, D04)).toMatchObject({ ending: 'partial', by: 'player' });
    expect(flags(l.g).a1_forest_accord).toBe('partial');
    expect(quest(l.g, D04)?.status).toBe('done');
  });

  it('forest dispute: siding with the loggers expels the slope, which the chain does not pay', () => {
    const l = withPlayer(12, (x) => {
      toWeek(x, 4);
      set(x, 'a1_eastslope_expelled', true);
    });
    expectSettledLegally(l, D04);
    expect(state(l.g, D04)).toMatchObject({ ending: 'expelled', by: 'player' });
    expect(flags(l.g)).toMatchObject({
      a1_shiya_family: 'left',
      a1_gorn_decision: 'leave',
      a1_forest_accord: 'broken',
    });
    expect(quest(l.g, D04)?.status).toBe('by_other');
  });

  it('forest dispute: a town turned against the slope sends Gorn east on his own', () => {
    const l = withPlayer(13, (x) => {
      toWeek(x, 6);
      set(x, 'rep.bs_eastslope', -40);
    });
    expectSettledLegally(l, D04);
    expect(state(l.g, D04)?.chosen.gorn_council).toBe('leave');
    expect(state(l.g, D04)).toMatchObject({ ending: 'expelled', by: 'world' });
    expect(flags(l.g).a1_shiya_family).toBe('left');
  });

  it('the NPC brain answers a decision point before its deadline (the seam of PK-M1-18)', () => {
    const l = lean({ seed: 14 });
    toWeek(l, 8, 1);
    expect(openDecisions(l.g.world, 'boro').map((o) => o.point)).toEqual(['boro_revenge']);
    // Boro's brain holds back: no blood debt, the two sides keep a truce nobody paid for
    l.g.queue(
      'disputes.decide',
      { disputeId: D04, pointId: 'boro_revenge', optionId: 'hold_back' },
      NPC_BRAIN,
    );
    l.g.step(1);
    toWeek(l, 11, 2);
    l.g.step(2);
    expectSettledLegally(l, D04);
    expect(state(l.g, D04)).toMatchObject({ ending: 'partial', by: 'world' });
    expect(
      ofKind(l.events, 'dispute.decided')
        .filter((e) => e.data.pointId === 'boro_revenge')
        .map((e) => e.data.source),
    ).toEqual(['chooser']);
    expect(quest(l.g, D04)?.status).toBe('by_other');
  });

  it('reaches at least two different endings for every Must dispute (VS-08)', () => {
    const endings: Record<string, Set<string>> = {};
    const note = (l: Lean) => {
      for (const id of MUST) {
        const seen = endings[id] ?? new Set<string>();
        endings[id] = seen;
        seen.add(state(l.g, id)?.ending ?? '');
      }
    };
    note(withPlayer(21, () => {}));
    note(
      withPlayer(22, (x) => {
        toWeek(x, 3);
        set(x, 'a1_spring_source_found', true);
        set(x, 'trust.isa', 70);
        toWeek(x, 5);
        set(x, 'a1_forest_pact_proof', true);
        toWeek(x, 10, 30);
        set(x, 'a1_moss_intercepted', true);
      }),
    );
    for (const id of MUST) expect(endings[id]?.size ?? 0, id).toBeGreaterThanOrEqual(2);
    expect([...(endings[D01] ?? [])].sort()).toEqual(['fled', 'in_power']);
    expect([...(endings[D02] ?? [])].sort()).toEqual(['cleared', 'convicted']);
    expect([...(endings[D04] ?? [])].sort()).toEqual(['broken', 'partial']);
  });
});

describe('the act clock and the chains together', () => {
  it('lets the weekly default development and the runner work on the same weeks', () => {
    const l = lean({ seed: 12 });
    toWeek(l, 7, 2);
    const steps = ofKind(l.events, 'quest.default')
      .filter((e) => e.data.questId === D01)
      .map((e) => [e.data.step, e.data.week, e.data.applied]);
    expect(steps).toEqual([
      ['standing', 1, true],
      ['tax_notice', 1, true],
      ['first_levy', 2, true],
      ['owen_robbed', 3, true],
      ['owen_petition', 4, true],
      ['well_tax', 5, true],
      ['tax_protest', 7, true],
      ['owen_leaves', 7, true],
    ]);
    expect(flags(l.g)).toMatchObject({
      a1_tax_rate: 'sixth',
      a1_moss_fate: 'in_power',
      a1_oneeye_fate: 'active',
      a1_owen_left: true,
      a1_ako_framed: true,
      a1_witch_trial_started: true,
    });
    expect(ofKind(l.events, 'dispute.decision_opened').map((e) => e.data.pointId)).toEqual([
      'isa_testify',
      'gorn_council',
    ]);
    expect(state(l.g, D02)?.chosen.isa_testify).toBe('keep_silent');
    // a time skip of two days steps hour by hour: Gorn's council resolves inside it
    runTo(l, l.g.tick + 2 * TICKS_PER_GAME_DAY);
    expect(state(l.g, D04)?.chosen.gorn_council).toBe('stay');
    expect(flags(l.g)[`dispute.${D04}.stage`]).toBe('exodus_talk');
  });
});
