// The onboarding (ux_and_onboarding.md 17; PK-M1-23): the catalogue against the 17.5 table
// and the onboarding check of 23.2 (with a negative case per rule), the store and its save
// payload, the 17.3 and 17.4 scheduling, the trigger evaluation (act gating, timers, counts,
// prerequisites, window completions, the rewritten tut_p_listen), the card and glow models,
// the glossary's unlocks and reveal-stage rename, and the help window's card pages.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/client/hud/save_slots';
import { firstSentence, paragraphKeys, tutorialCard } from '../src/client/tutorial/card_model';
import {
  DESIGN_COUNTS,
  stepById,
  TUT_EVENT_KINDS,
  TUT_STEPS,
} from '../src/client/tutorial/catalog';
import {
  checkGlossary,
  checkTutorial,
  checkTutText,
  waitingSteps,
} from '../src/client/tutorial/check';
import {
  GLOSSARY,
  glossaryFlags,
  glossaryKeys,
  glossaryModel,
} from '../src/client/tutorial/glossary';
import { GLOW_STATIC_MS, glowFrame, glowSpan } from '../src/client/tutorial/glow_model';
import {
  CARD_GAP_MS,
  type SchedulerContext,
  STALE_MS,
  TutorialScheduler,
} from '../src/client/tutorial/scheduler';
import {
  endsWhenSeen,
  ev,
  flagCond,
  leaves,
  SESSION_SIGNALS,
  SIGNAL_SOURCES,
  seen,
  sig,
  step,
  story,
  TUT_SIGNALS,
  type TutSignal,
  type TutStep,
  type TutWindow,
  windowsOf,
} from '../src/client/tutorial/steps';
import { MUTED_KEY, parseSnapshot, TutorialStore } from '../src/client/tutorial/store';
import { type TutFrame, TutorialTriggers } from '../src/client/tutorial/triggers';
import { helpCardsModel } from '../src/client/windows/help_model';
import type { AnyWorldEvent, FlagValue } from '../src/core/contracts';
import { defaultRegistry } from '../src/core/registry/default';
import { eventKindsIn } from '../tools/tutorial/check_cli';

const ROOT = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const EVENT_KINDS = new Set(
  walk(join(ROOT, 'src')).flatMap((f) => eventKindsIn(readFileSync(f, 'utf8'))),
);
const TEXT_KEYS = new Set(
  readdirSync(join(ROOT, 'locales/zh-Hans'))
    .filter((f) => f.endsWith('.json') && !f.endsWith('.generated.json'))
    .flatMap((f) =>
      Object.keys(JSON.parse(readFileSync(join(ROOT, 'locales/zh-Hans', f), 'utf8'))),
    ),
);
const registry = defaultRegistry();
const isRegistered = (f: string) => registry.isRegistered(f);

function checkWith(steps: readonly TutStep[]) {
  return checkTutorial({
    steps,
    isRegistered,
    eventKinds: EVENT_KINDS,
    textKeys: TEXT_KEYS,
    counts: { p: steps.filter((s) => s.act === 'p').length, a1: 0, any: 0 },
  }).filter((f) => f.code !== 'count');
}

describe('catalogue against the 17.5 table', () => {
  it('carries the prologue 9, act 1 41 and any-time 15 steps with unique ids', () => {
    const per = { p: 0, a1: 0, any: 0 };
    for (const s of TUT_STEPS) per[s.act]++;
    expect(per).toEqual({ p: 9, a1: 41, any: 15 });
    expect(DESIGN_COUNTS).toEqual({ p: 9, a1: 41, any: 15 });
    expect(new Set(TUT_STEPS.map((s) => s.id)).size).toBe(65);
  });

  it('passes the onboarding check (23.2) with no finding', () => {
    const findings = checkTutorial({
      steps: TUT_STEPS,
      isRegistered,
      eventKinds: EVENT_KINDS,
      textKeys: TEXT_KEYS,
      counts: DESIGN_COUNTS,
    });
    expect(findings).toEqual([]);
    expect(
      checkGlossary({
        flags: glossaryFlags(),
        keys: glossaryKeys(),
        isRegistered,
        textKeys: TEXT_KEYS,
      }),
    ).toEqual([]);
  });

  it('keeps tut_p_reach out of the progress and the death review mandatory', () => {
    expect(stepById('tut_p_reach')?.progress).toBe(false);
    expect(TUT_STEPS.filter((s) => !s.progress).map((s) => s.id)).toEqual(['tut_p_reach']);
    expect(stepById('tut_a1_death')).toMatchObject({ skippable: false, mandatory: 'death_review' });
    expect(stepById('tut_a1_choice_key')).toMatchObject({ skippable: false, silent: true });
  });

  it('defers move and talk to the committed hint bar under its ids and keys', () => {
    expect(stepById('tut_p_move')).toMatchObject({ barId: 'move', barKey: 'ui.hud.hint.move' });
    expect(stepById('tut_p_interact')).toMatchObject({ barId: 'talk', barKey: 'ui.hud.hint.talk' });
  });
});

describe('the onboarding check catches each rule (negative cases)', () => {
  const ok = step({
    id: 'tut_p_probe',
    category: 'ops',
    methods: ['narr'],
    trigger: sig('falling'),
    done: seen(),
    silent: true,
  });
  it('a clean probe step has no finding', () => {
    expect(checkWith([ok])).toEqual([]);
  });
  it('an unregistered flag, in the trigger and through flag.changed', () => {
    const a = step({ ...ok, trigger: flagCond('not_a_registered_name') });
    expect(checkWith([a]).map((f) => f.code)).toEqual(['unregistered_flag']);
    const b = step({
      ...ok,
      trigger: ev('flag.changed', { field: 'key', op: 'eq', value: 'nope_flag' }),
    });
    expect(checkWith([b]).map((f) => f.detail)).toEqual(['trigger: nope_flag']);
  });
  it('an event kind the kernel does not declare', () => {
    const a = step({ ...ok, done: { kind: 'event', event: 'no.such_event' as never } });
    expect(checkWith([a]).map((f) => f.code)).toEqual(['unknown_event']);
  });
  it('a missing completion, a duplicate id, a bad id', () => {
    const a = { ...ok, done: undefined as never };
    expect(checkWith([a]).map((f) => f.code)).toContain('no_done');
    expect(checkWith([ok, ok]).map((f) => f.code)).toEqual(['duplicate_id']);
    expect(checkWith([step({ ...ok, id: 'tut_p_Bad' })]).map((f) => f.code)).toContain('bad_id');
  });
  it('missing text for a card, a bar and a notification', () => {
    const a = step({ ...ok, silent: false, methods: ['card', 'bar', 'notify'] });
    expect(
      checkWith([a])
        .filter((f) => f.code === 'missing_text')
        .map((f) => f.detail),
    ).toEqual(['tut.p_probe.bar', 'tut.p_probe.body', 'tut.p_probe.notify', 'tut.p_probe.title']);
  });
  it('silent with a shown method, shown with none, a glow without target, a bad prerequisite', () => {
    expect(
      checkWith([step({ ...ok, methods: ['bar'], barKey: 'ui.hud.hint.move' })]).map((f) => f.code),
    ).toEqual(['silent_shows']);
    expect(checkWith([step({ ...ok, silent: false })]).map((f) => f.code)).toEqual([
      'shows_nothing',
    ]);
    expect(
      checkWith([step({ ...ok, silent: false, methods: ['glow'] })]).map((f) => f.code),
    ).toEqual(['glow_target']);
    expect(checkWith([step({ ...ok, requires: 'tut_p_none' })]).map((f) => f.code)).toEqual([
      'unknown_requires',
    ]);
  });
  it('a count that differs from the 17.5 table', () => {
    const f = checkTutorial({
      steps: [ok],
      isRegistered,
      eventKinds: EVENT_KINDS,
      textKeys: TEXT_KEYS,
      counts: { p: 9, a1: 0, any: 0 },
    });
    expect(f.map((x) => [x.code, x.detail])).toEqual([['count', '1 steps, 17.5 lists 9']]);
  });
  it('the glossary half: an unregistered flag and a missing key', () => {
    const f = checkGlossary({
      flags: ['no_flag_here'],
      keys: ['ui.glossary.none.name'],
      isRegistered,
      textKeys: TEXT_KEYS,
    });
    expect(f.map((x) => x.code)).toEqual(['unregistered_flag', 'missing_text']);
  });
});

describe('TutorialStore and the save client segment (17.8)', () => {
  it('round-trips seen, done and the guidance level; drops what is not a step id', () => {
    const a = new TutorialStore({ guidance: 'brief' });
    a.markSeen('tut_a1_town');
    a.markDone('tut_a1_town');
    a.markDone('not a step');
    const snap = a.snapshot();
    expect(snap).toEqual({ v: 1, guidance: 'brief', seen: ['tut_a1_town'], done: ['tut_a1_town'] });
    const b = new TutorialStore();
    expect(b.restore(JSON.parse(JSON.stringify(snap)))).toBe(true);
    expect(b.isDone('tut_a1_town')).toBe(true);
    expect(b.guidance).toBe('brief');
  });

  it('a damaged or foreign payload restores as empty and keeps the level', () => {
    const s = new TutorialStore({ guidance: 'off' });
    s.markDone('tut_a1_town');
    expect(s.restore({ v: 99, done: ['tut_a1_town'] })).toBe(false);
    expect(s.isDone('tut_a1_town')).toBe(false);
    expect(s.guidance).toBe('off');
    expect(parseSnapshot({ v: 1, guidance: 'loud', seen: 'x', done: [1, 'tut_p_move'] })).toEqual({
      v: 1,
      guidance: 'full',
      seen: [],
      done: ['tut_p_move'],
    });
  });

  it('keeps the muted categories across saves in their own record (17.3)', () => {
    const kv = new MemoryStore();
    const a = new TutorialStore({ kv });
    a.mute('combat');
    expect(JSON.parse(kv.getItem(MUTED_KEY) as string)).toEqual({ v: 1, muted: ['combat'] });
    const b = new TutorialStore({ kv });
    expect(b.isMuted('combat')).toBe(true);
    b.restore({ v: 1, guidance: 'full', seen: [], done: [] });
    expect(b.isMuted('combat')).toBe(true);
    b.reset();
    expect(new TutorialStore({ kv }).isMuted('combat')).toBe(false);
  });

  it('counts progress without tut_p_reach', () => {
    const s = new TutorialStore();
    s.markDone('tut_p_reach');
    s.markDone('tut_p_move');
    expect(s.progress(TUT_STEPS)).toEqual({ done: 1, of: 64 });
  });
});

const CTX: SchedulerContext = { guidance: 'full', held: false, combat: false, unsafe: false };
const S = (id: string) => stepById(id) as TutStep;

describe('scheduling (17.3, 17.4)', () => {
  it('danger before the action at hand before a system introduction', () => {
    const s = new TutorialScheduler();
    s.ask(S('tut_a1_save'), 0);
    s.ask(S('tut_a1_equip'), 1);
    s.ask(S('tut_a1_telegraph'), 2);
    expect([s.next(10, CTX), s.next(11, CTX), s.next(12, CTX)].map((x) => x?.step.id)).toEqual([
      'tut_a1_telegraph',
      'tut_a1_equip',
      'tut_a1_save',
    ]);
  });

  it('holds 90 s between cards and at most 2 unasked cards in 10 minutes', () => {
    const s = new TutorialScheduler();
    s.ask(S('tut_a1_pressure'), 0);
    s.ask(S('tut_a1_coin'), 0);
    s.ask(S('tut_a1_craft'), 0);
    expect(s.next(0, CTX)?.card).not.toBeNull();
    expect(s.next(CARD_GAP_MS - 1, CTX)).toBeNull();
    expect(s.next(CARD_GAP_MS, CTX)?.card).not.toBeNull();
    // the budget of two is spent until ten minutes pass after the first
    expect(s.next(CARD_GAP_MS * 3, CTX)).toBeNull();
    // a card the player asked for by opening a window skips the pacing
    s.ask(S('tut_a1_deeds'), CARD_GAP_MS * 3, true);
    expect(s.next(CARD_GAP_MS * 3 + 1, CTX)?.step.id).toBe('tut_a1_deeds');
  });

  it('drops a step that found no moment in 10 minutes', () => {
    const s = new TutorialScheduler();
    s.ask(S('tut_a1_save'), 0);
    expect(s.next(STALE_MS, CTX)).toBeNull();
    expect(s.pending()).toEqual([]);
  });

  it('a scene holds all but its own steps; a fight shows only combat bars and glows', () => {
    const s = new TutorialScheduler();
    s.ask(S('tut_a1_save'), 0);
    s.ask(S('tut_p_listen'), 0);
    expect(s.next(1, { ...CTX, held: true })?.step.id).toBe('tut_p_listen');
    expect(s.next(2, { ...CTX, held: true })).toBeNull();
    s.ask(S('tut_a1_low_hp'), 3);
    expect(s.next(4, { ...CTX, combat: true })).toMatchObject({
      step: { id: 'tut_a1_low_hp' },
      bar: true,
    });
    expect(s.next(5, { ...CTX, combat: true })).toBeNull();
    // the system bar the scene held shows once the scene is over
    expect(s.next(6, CTX)?.step.id).toBe('tut_a1_save');
    // a combat card waits for the fight to end rather than lose its card
    const c = new TutorialScheduler();
    c.ask(S('tut_a1_dungeon'), 6);
    expect(c.next(7, { ...CTX, combat: true })).toBeNull();
    expect(c.next(8, CTX)).toMatchObject({ glow: true, card: { modal: true, brief: false } });
  });

  it('brief drops the basic bars and folds cards; off shows nothing; unsafe gives a side card', () => {
    const s = new TutorialScheduler();
    s.ask(S('tut_a1_wake'), 0);
    expect(s.next(1, { ...CTX, guidance: 'brief' })).toBeNull();
    s.ask(S('tut_a1_pressure'), 2);
    expect(s.next(3, { ...CTX, guidance: 'off' })).toBeNull();
    expect(s.next(4, { ...CTX, guidance: 'brief', unsafe: true })?.card).toEqual({
      modal: false,
      brief: true,
    });
  });
});

function frame(over: Partial<TutFrame> = {}): TutFrame {
  return {
    now: 0,
    act: 'act1',
    flags: {},
    newEvents: [],
    signals: new Set<TutSignal>(),
    openWindows: new Set<TutWindow>(),
    combat: false,
    held: false,
    playerId: 'p1',
    ...over,
  };
}

function flagEvent(key: string, value: FlagValue): AnyWorldEvent {
  return { kind: 'flag.changed', tick: 1, seq: 1, data: { key, value, previous: undefined } };
}

const ids = (r: { ask: TutStep[] }) => r.ask.map((s) => s.id);

describe('trigger evaluation', () => {
  it('fires a step only in its own act', () => {
    const tr = new TutorialTriggers();
    const store = new TutorialStore();
    const menu = new Set<TutSignal>(['menu_opened']);
    expect(ids(tr.update(frame({ act: 'act1', signals: menu }), store))).not.toContain(
      'tut_p_restart',
    );
    expect(ids(tr.update(frame({ act: 'prologue', signals: menu }), store))).toContain(
      'tut_p_restart',
    );
  });

  it('tut_p_listen: the far stances fire it, the near ones do not; the stretch end ends it', () => {
    for (const [level, fires] of [
      [0, true],
      [1, true],
      [2, false],
      [3, false],
    ] as const) {
      const r = new TutorialTriggers().update(
        frame({ act: 'prologue', newEvents: [flagEvent('p_eavesdrop_level', level)] }),
        new TutorialStore(),
      );
      expect(ids(r).includes('tut_p_listen'), `level ${level}`).toBe(fires);
    }
    // another flag at 0 is not the stance choice
    const other = new TutorialTriggers().update(
      frame({ act: 'prologue', newEvents: [flagEvent('p_door_attempts_refused', 0)] }),
      new TutorialStore(),
    );
    expect(ids(other)).not.toContain('tut_p_listen');
    const tr = new TutorialTriggers();
    tr.markShown('tut_p_listen', 0);
    const end = new Set<TutSignal>(['listen_end']);
    expect(tr.update(frame({ act: 'prologue', signals: end }), new TutorialStore()).done).toContain(
      'tut_p_listen',
    );
  });

  it('a stand-still timer that a move resets', () => {
    const tr = new TutorialTriggers();
    const store = new TutorialStore();
    const at = (now: number, sigs: TutSignal[]) =>
      ids(tr.update(frame({ now, signals: new Set(sigs) }), store));
    expect(at(0, ['can_move'])).not.toContain('tut_a1_wake');
    expect(at(19_999, ['can_move'])).not.toContain('tut_a1_wake');
    expect(at(20_000, ['can_move', 'moved'])).not.toContain('tut_a1_wake');
    expect(at(20_001, ['can_move'])).not.toContain('tut_a1_wake');
    expect(at(40_001, ['can_move'])).toContain('tut_a1_wake');
  });

  it('a count of events (the third monster) and a prerequisite (appraisal after the ash room)', () => {
    const monster = (subject: string): AnyWorldEvent => ({
      kind: 'codex.discovered',
      tick: 1,
      seq: 1,
      data: { tab: 'monsters', subject },
    });
    const third = new TutorialTriggers();
    const s2 = new TutorialStore();
    expect(ids(third.update(frame({ newEvents: [monster('a'), monster('b')] }), s2))).not.toContain(
      'tut_a1_codex',
    );
    expect(ids(third.update(frame({ newEvents: [monster('c')] }), s2))).toContain('tut_a1_codex');
    const appr = new TutorialTriggers();
    const s3 = new TutorialStore();
    const sel = frame({ signals: new Set<TutSignal>(['target_selected']) });
    expect(ids(appr.update(sel, s3))).not.toContain('tut_a1_appraise');
    s3.markDone('tut_a1_pressure');
    expect(ids(appr.update(sel, s3))).toContain('tut_a1_appraise');
  });

  it('opening the window completes the step; seen and elapsed count from showing', () => {
    const tr = new TutorialTriggers();
    const store = new TutorialStore();
    const quests = new Set<TutWindow>(['quests']);
    expect(tr.update(frame({ openWindows: quests }), store).done).toContain('tut_a1_quest_log');
    tr.markShown('tut_a1_save', 100);
    expect(tr.update(frame({ now: 101 }), store).done).toContain('tut_a1_save');
    tr.markShown('tut_a1_trust', 100);
    expect(tr.update(frame({ now: 60_099 }), store).done).not.toContain('tut_a1_trust');
    expect(tr.update(frame({ now: 60_100 }), store).done).toContain('tut_a1_trust');
  });
});

const open0 = (st: TutStep) =>
  tutorialCard({ step: st, modal: true, brief: false }).paragraphs[0] ?? '';

describe('card, glow, glossary and help pages', () => {
  it('a brief card shows its title and first sentence with the rest held back', () => {
    const st = S('tut_a1_tide');
    expect(paragraphKeys(st)).toEqual([
      'tut.a1_tide.body',
      'tut.a1_tide.body2',
      'tut.a1_tide.body3',
    ]);
    const brief = tutorialCard({ step: st, modal: true, brief: true });
    // brief: the title and ONE sentence, with the rest behind 展开 (17.3)
    expect(brief.paragraphs).toHaveLength(1);
    expect(brief.paragraphs[0]).toBe(firstSentence(open0(st)));
    expect(brief.paragraphs[0]?.endsWith('。')).toBe(true);
    expect(brief.paragraphs[0]).not.toBe(open0(st));
    expect(brief.hidden).toBe(true);
    const open = tutorialCard({ step: st, modal: false, brief: true, expanded: true });
    expect(open.paragraphs).toHaveLength(3);
    expect(open.hidden).toBe(false);
    expect(open.title).not.toBe('tut.a1_tide.title');
    expect(open.aria).toContain(open.title);
  });

  it('a glow pulses twice, or holds a static outline for 3 s with reduced flashing', () => {
    expect(glowSpan(true)).toBe(GLOW_STATIC_MS);
    const s = { target: 'tracker', startedAt: 0, reduceFlashing: true };
    expect(glowFrame(s, 2999)).toEqual({ target: 'tracker', mode: 'static' });
    expect(glowFrame(s, 3000)).toEqual({ target: null, mode: null });
    expect(glowFrame({ ...s, reduceFlashing: false }, 1).mode).toBe('pulse');
  });

  it('the glossary lists unlocked rows only and renames them once the word is known', () => {
    expect(glossaryModel({}, () => false).map((r) => r.id)).toEqual(['goddess', 'judgement']);
    const before = glossaryModel({ a1_wake_ruins: true }, () => false);
    expect(before.find((r) => r.id === 'grey')?.name).not.toContain('澱');
    const after = glossaryModel({ a1_wake_ruins: true, 'term.dian_known': true }, () => false);
    expect(after.find((r) => r.id === 'grey')?.name).toContain('澱');
    // a row without a rename keeps its one name
    expect(after.find((r) => r.id === 'folk')?.name).toBe(
      before.find((r) => r.id === 'folk')?.name,
    );
    expect(glossaryModel({}, (id) => id === 'tut_a1_evidence').map((r) => r.id)).toContain(
      'evidence',
    );
    expect(GLOSSARY.every((e) => e.unlock.length > 0)).toBe(true);
  });

  it('the help window groups the cards seen by layer', () => {
    const groups = helpCardsModel([S('tut_a1_pressure'), S('tut_a1_coin'), S('tut_a1_town')]);
    expect(groups.map((g) => g.layer)).toEqual(['combat', 'divine']);
    expect(groups[0]?.cards[0]?.paragraphs).toHaveLength(2);
  });
});

describe('every step can fire: signals, owners and waits (review fixes)', () => {
  it('names exactly the signals the session produces, and the waiting ones with a package', () => {
    expect([...SESSION_SIGNALS].sort()).toEqual(
      [
        'answer_prompt',
        'answered',
        'board_near',
        'can_move',
        'combat_ended',
        'combat_started',
        'deadline_quest',
        'dusk',
        'evidence_prompt',
        'evidence_shown',
        'fall_ended',
        'falling',
        'gamepad_connected',
        'hostile_in_view',
        'hp_recovered',
        'key_choice',
        'key_choice_made',
        'listen_end',
        'listen_far',
        'low_hp',
        'menu_opened',
        'moved',
        'name_answered',
        'name_prompt',
        'near_interactable',
        'near_talkable',
        'node_near',
        'save_available',
        'shop_closed',
        'shop_open',
        'station_left',
        'station_near',
        'talking',
        'target_selected',
      ].sort(),
    );
    for (const s of TUT_SIGNALS) expect(SIGNAL_SOURCES[s], s).toBeDefined();
    // signals turned into kernel events are gone from the list
    for (const gone of ['player_died', 'revived', 'looted', 'mirror_near', 'rumor_about_you'])
      expect((TUT_SIGNALS as readonly string[]).includes(gone), gone).toBe(false);
  });

  it('reports the steps that wait on a package, and fails the ones resting on nothing', () => {
    const waiting = waitingSteps(TUT_STEPS);
    expect(waiting.map((w) => w.step).sort()).toEqual(
      [
        'tut_a1_map',
        'tut_any_bagfull',
        'tut_any_contraband',
        'tut_any_degrade',
        'tut_any_llm_error',
        'tut_any_offscreen',
        'tut_any_spoil',
      ].sort(),
    );
    expect(waiting.find((w) => w.step === 'tut_a1_map')?.packages).toEqual(['PK-M1-57']);
    const lost = step({
      id: 'tut_p_lost',
      category: 'ops',
      methods: ['narr'],
      trigger: story(),
      done: seen(),
      silent: true,
    });
    expect(checkWith([lost]).map((f) => f.code)).toEqual(['unfirable']);
    // a waiting signal is a report, not a finding
    const wait = step({ ...lost, trigger: sig('degraded') });
    expect(checkWith([wait])).toEqual([]);
    expect(waitingSteps([wait])).toEqual([
      { step: 'tut_p_lost', where: 'trigger', packages: ['PK-M1-02'] },
    ]);
  });

  it('filters player events to the player: the death step and the evidence item', () => {
    const died = (id: string): AnyWorldEvent => ({
      kind: 'entity.died',
      tick: 1,
      seq: 1,
      data: { id, kind: 'player', mapId: 'm', x: 0, y: 0 },
    });
    const store = new TutorialStore();
    expect(
      ids(new TutorialTriggers().update(frame({ newEvents: [died('wolf')] }), store)),
    ).not.toContain('tut_a1_death');
    expect(ids(new TutorialTriggers().update(frame({ newEvents: [died('p1')] }), store))).toContain(
      'tut_a1_death',
    );
    const gained = (itemId: string, ownerId = 'p1'): AnyWorldEvent => ({
      kind: 'inventory.changed',
      tick: 1,
      seq: 1,
      data: { ownerId, itemId, delta: 1, reason: 'loot' },
    });
    const item = (id: string) =>
      id === 'ev_note'
        ? { kind: 'evidence', equippable: false }
        : { kind: 'weapon', equippable: true };
    const r = new TutorialTriggers().update(
      frame({ newEvents: [gained('ev_note'), gained('sword')], item }),
      store,
    );
    expect(ids(r)).toEqual(expect.arrayContaining(['tut_a1_evidence', 'tut_a1_equip']));
    // without the item lookup neither item test holds
    const bare = new TutorialTriggers().update(frame({ newEvents: [gained('ev_note')] }), store);
    expect(ids(bare)).not.toContain('tut_a1_evidence');
    // another owner's gain is not the player's
    const other = new TutorialTriggers().update(
      frame({
        newEvents: [gained('ev_note', 'npc')],
        item,
      }),
      store,
    );
    expect(ids(other)).not.toContain('tut_a1_evidence');
  });

  it('the mirror fires on its scene ui; the talent step ends on a potential_seen flag', () => {
    const ui = (kind: 'scene.ui' | 'scene.ui_closed', name: string): AnyWorldEvent => ({
      kind,
      tick: 1,
      seq: 1,
      data: { sceneId: 's', nodeId: 'n', ui: name },
    });
    const store = new TutorialStore();
    const tr = new TutorialTriggers();
    expect(
      ids(tr.update(frame({ act: 'prologue', newEvents: [ui('scene.ui', 'other')] }), store)),
    ).not.toContain('tut_p_mirror');
    expect(
      ids(
        tr.update(
          frame({ act: 'prologue', newEvents: [ui('scene.ui', 'ui_mode_creator')] }),
          store,
        ),
      ),
    ).toContain('tut_p_mirror');
    tr.markShown('tut_p_mirror', 0);
    expect(
      tr.update(
        frame({ act: 'prologue', newEvents: [ui('scene.ui_closed', 'ui_mode_creator')] }),
        store,
      ).done,
    ).toContain('tut_p_mirror');
    const talent = new TutorialTriggers();
    talent.markShown('tut_a1_talent', 0);
    expect(
      talent.update(frame({ newEvents: [flagEvent('npc.ron.trust', 1)] }), store).done,
    ).not.toContain('tut_a1_talent');
    expect(
      talent.update(frame({ newEvents: [flagEvent('npc.ron.potential_seen', true)] }), store).done,
    ).toContain('tut_a1_talent');
  });

  it('exports every event kind the catalogue reads, all of them kernel kinds', () => {
    expect(TUT_EVENT_KINDS.has('entity.died')).toBe(true);
    expect(TUT_EVENT_KINDS.has('scene.ui')).toBe(true);
    for (const k of TUT_EVENT_KINDS) expect(EVENT_KINDS.has(k), k).toBe(true);
    const fromSteps = new Set(
      TUT_STEPS.flatMap((s) => [...leaves(s.trigger), ...leaves(s.done)])
        .filter((c) => c.kind === 'event')
        .map((c) => (c as { event: string }).event),
    );
    expect([...TUT_EVENT_KINDS].sort()).toEqual([...fromSteps].sort());
  });
});

describe('presentation rules (review fixes)', () => {
  it('a seen-completed step leaves its bar to run; others finish it', () => {
    expect(endsWhenSeen(S('tut_a1_save'))).toBe(true);
    expect(endsWhenSeen(S('tut_a1_codex'))).toBe(true);
    expect(endsWhenSeen(S('tut_a1_low_hp'))).toBe(false);
  });

  it('a restored record re-arms the steps it showed but did not finish', () => {
    const s = new TutorialStore();
    s.restore({
      v: 1,
      guidance: 'full',
      seen: ['tut_a1_save', 'tut_a1_town'],
      done: ['tut_a1_town'],
    });
    expect(s.pendingSeen(TUT_STEPS)).toEqual(['tut_a1_save']);
    const tr = new TutorialTriggers();
    for (const id of s.pendingSeen(TUT_STEPS)) tr.markShown(id, 0);
    expect(tr.update(frame({ now: 1 }), s).done).toContain('tut_a1_save');
  });

  it('a side card holds other cards back but not danger bars and glows', () => {
    const sch = new TutorialScheduler();
    sch.ask(S('tut_a1_coin'), 0);
    sch.ask(S('tut_a1_low_hp'), 0);
    const ctx = { ...CTX, cardOpen: true };
    expect(sch.next(1, ctx)?.step.id).toBe('tut_a1_low_hp');
    expect(sch.next(2, ctx)).toBeNull();
    expect(sch.next(3, CTX)?.step.id).toBe('tut_a1_coin');
  });

  it('opening the board window asks for its card outside the pacing, without completing it', () => {
    expect(windowsOf(S('tut_a1_board').trigger)).toEqual(['board']);
    expect(S('tut_a1_board').windowOnOpen).toBeUndefined();
    const tr = new TutorialTriggers();
    const r = tr.update(frame({ openWindows: new Set<TutWindow>(['board']) }), new TutorialStore());
    expect(ids(r)).toContain('tut_a1_board');
    expect(r.done).not.toContain('tut_a1_board');
  });

  it('keeps windowOnOpen only where 17.5 says opening the window completes the step', () => {
    const withWindow = TUT_STEPS.filter((s) => s.windowOnOpen)
      .map((s) => s.id)
      .sort();
    expect(withWindow).toEqual(
      [
        'tut_a1_codex',
        'tut_a1_deeds',
        'tut_a1_door_first',
        'tut_a1_map',
        'tut_a1_pet',
        'tut_a1_quest_log',
        'tut_a1_rumor',
      ].sort(),
    );
  });

  it('a mandatory part shows at guidance off and when muted; the rest does not', () => {
    const must = step({
      id: 'tut_any_must',
      category: 'ops',
      methods: ['bar', 'glow'],
      trigger: sig('falling'),
      done: seen(),
      glowTarget: 'x',
      skippable: false,
      mandatory: 'bar',
    });
    const free = step({ ...must, id: 'tut_any_free', skippable: true, mandatory: undefined });
    const off = { ...CTX, guidance: 'off' as const };
    const a = new TutorialScheduler();
    a.ask(must, 0);
    a.ask(free, 0);
    expect(a.next(1, off)).toMatchObject({ step: { id: 'tut_any_must' }, bar: true, glow: false });
    expect(a.next(2, off)).toBeNull();
    const b = new TutorialScheduler();
    b.ask(must, 0);
    expect(b.next(1, { ...CTX, muted: new Set(['ops']) })).toMatchObject({
      bar: true,
      glow: false,
    });
  });

  it('the step text keeps the 19.2 limits and names no key, button or mouse word', () => {
    const table = JSON.parse(readFileSync(join(ROOT, 'locales/zh-Hans/tut.json'), 'utf8'));
    expect(checkTutText(table)).toEqual([]);
    expect(
      checkTutText({
        'tut.x.bar': '按滚轮缩放',
        'tut.x.title': '一二三四五六七八九十一',
        'tut.x.body': '点“还原”',
      }).map((f) => f.code),
    ).toEqual(['key_name', 'key_name', 'too_long']);
  });
});
