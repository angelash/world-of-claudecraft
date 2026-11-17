// PK-M1-22 fork C pure cores: the corridor mode model (ux_and_onboarding.md 9), the quest log
// model (14.1), the HUD tracker (14.2) and the door-cost and taint gauges (5.2), plus the
// corridor and quest-detail adapters against the real game and the corridor input context.

import { describe, expect, it } from 'vitest';
import { corridorData, createQuestDetailAdapter } from '../src/client/adapters/corridor';
import { createAdapters } from '../src/client/app/adapters_wiring';
import { GAUGE_MAX, gaugeInput, gaugesModel, stepOf } from '../src/client/hud/gauges_model';
import {
  buildTracker,
  deadlineText,
  TRACK_MAX,
  TrackerState,
  trackerModel,
} from '../src/client/hud/tracker_model';
import { contextStack, IDLE_SURFACE } from '../src/client/input/actions';
import { installKeyText } from '../src/client/input/glyphs';
import type { ClientAdapters, CorridorData, CorridorDoorView } from '../src/client/view/adapters';
import { createGameView } from '../src/client/view/game_view';
import {
  corridorModel,
  doorCommandResult,
  doorShape,
  keysLeftShown,
  moveSelection,
  passesFilter,
  stepFilter,
  stepSegment,
} from '../src/client/windows/corridor/corridor_model';
import { KIND_TAB, QUEST_TABS, questLogModel } from '../src/client/windows/quest_log_model';
import { windowDef } from '../src/client/windows/window_registry';
import { createGame } from '../src/game/create';
import { t } from '../src/shared_ui/i18n';
import type { QuestLogView, QuestView } from '../src/systems/quests';
import { QUEST_KINDS } from '../src/systems/quests/types';

installKeyText(null);

function door(over: Partial<CorridorDoorView> & { id: string }): CorridorDoorView {
  return {
    name: `name_${over.id}`,
    category: 'vocation',
    categoryName: 'cat',
    act: 1,
    segment: 1,
    wing: 'vocations',
    wingName: 'wing',
    hall: false,
    state: 'hinted',
    stateName: 'st',
    hintLevel: 2,
    nameShown: true,
    hint: `hint_${over.id}`,
    keys: [],
    keysLeft: 0,
    danger: false,
    closable: false,
    ...over,
  };
}

function data(doors: CorridorDoorView[], segments = [1]): CorridorData {
  return {
    open: true,
    segments,
    doors,
    mirror: { rank: 3, blockage: 42, blockageTier: 2, fatigue: 10 },
  };
}

const ST = { filter: 'all' as const, selected: null, pinned: null };

describe('corridor model (ui_mode_corridor)', () => {
  it('tells every state by shape: crack, glimpse, openable, opened, locked, closed', () => {
    expect(doorShape({ state: 'hinted', hintLevel: 1 })).toBe('crack');
    expect(doorShape({ state: 'hinted', hintLevel: 2 })).toBe('glimpse');
    expect(doorShape({ state: 'hinted', hintLevel: 3 })).toBe('glimpse');
    for (const s of ['openable', 'opened', 'locked', 'closed'] as const)
      expect(doorShape({ state: s, hintLevel: 4 })).toBe(s);
  });

  it('a crack shows no name and no key count; a glimpse shows "keys met/total"', () => {
    const crack = door({
      id: 'a',
      hintLevel: 1,
      nameShown: false,
      name: '',
      keys: [{ label: 'k1', met: false }],
      keysLeft: 2,
    });
    const glimpse = door({
      id: 'b',
      keys: [
        { label: 'k1', met: true },
        { label: 'k2', met: false, cur: 1, need: 3 },
      ],
      keysLeft: 1,
    });
    const m = corridorModel(data([crack, glimpse]), ST);
    const nodes = m.sections.flatMap((s) => s.wings.flatMap((w) => w.doors));
    const a = nodes.find((n) => n.id === 'a');
    const b = nodes.find((n) => n.id === 'b');
    expect(a?.label).toBe(t('ui.mode.corridor.unnamed'));
    expect(a?.keys).toBe('');
    expect(a?.title).toBe('hint_a');
    expect(b?.label).toBe('name_b');
    expect(b?.keys).toBe(t('ui.mode.corridor.keys', { met: 1, total: 3 }));
  });

  it('a crack never leaks how many keys are left, on the card or in the tracker', () => {
    const crack = door({ id: 'a', hintLevel: 1, nameShown: false, name: '', keysLeft: 3 });
    expect(keysLeftShown(crack)).toBe(0);
    const card = corridorModel(data([crack]), { ...ST, selected: 'a' }).card;
    expect(card?.keysLeft).toBe('');
    const tracked = trackerModel({ quests: [], actWeek: 0, door: crack, limit: 5 });
    expect(tracked?.door?.keys).toEqual([]);
    // a door opened or closed never shows a count either, however it got there
    const opened = door({ id: 'a', state: 'opened', hintLevel: 4, keysLeft: 3 });
    expect(keysLeftShown(opened)).toBe(0);
  });

  it('the card discloses keys with their state in words, keys left and the refusal', () => {
    const d = door({
      id: 'b',
      keys: [
        { label: 'k1', met: true },
        { label: 'k2', met: false, cur: 1, need: 3 },
      ],
      keysLeft: 2,
    });
    const c = corridorModel(data([d]), { ...ST, selected: 'b' }).card;
    expect(c?.keys).toEqual([
      { text: 'k1', met: true, mark: t('ui.mode.corridor.key_met') },
      {
        text: t('ui.mode.corridor.key_count', { label: 'k2', cur: 1, need: 3 }),
        met: false,
        mark: t('ui.mode.corridor.key_unmet'),
      },
    ]);
    expect(c?.keysLeft).toBe(t('ui.mode.corridor.keys_left', { n: 2 }));
    expect(c?.canOpen).toBe(false);
    expect(c?.refusal).toBe(t('sys.doors.reject.no_key'));
    expect(c?.effect).toBe('');
    expect(c?.hint).toBe('hint_b');
  });

  it('the effect shows only once opened; close only when closable; a kernel refusal wins', () => {
    const opened = door({ id: 'o', state: 'opened', desc: 'gives', closable: true });
    const openable = door({ id: 'p', state: 'openable' });
    const m1 = corridorModel(data([opened, openable]), { ...ST, selected: 'o' });
    expect(m1.card?.effect).toBe('gives');
    expect(m1.card?.hint).toBe('');
    expect(m1.card?.canClose).toBe(true);
    expect(m1.card?.refusal).toBe('');
    const m2 = corridorModel(data([opened, openable]), {
      ...ST,
      selected: 'p',
      refused: { doorId: 'p', reason: 'exclusive' },
    });
    expect(m2.card?.canOpen).toBe(true);
    expect(m2.card?.refusal).toBe('exclusive');
    const locked = corridorModel(data([door({ id: 'l', state: 'locked' })]), ST);
    expect(locked.card?.refusal).toBe(t('sys.doors.reject.locked'));
    expect(locked.sections[0]?.wings[0]?.doors[0]?.title).toBe(t('sys.doors.reject.locked'));
  });

  it('places doors by segment, wing order and end hall; grown segments show even when empty', () => {
    const doors = [
      door({ id: 'h', segment: 2, wing: 'court', hall: true }),
      door({ id: 'v', segment: 1, wing: 'vocations' }),
      door({ id: 'f', segment: 1, wing: 'hall_front' }),
      door({ id: 'm', segment: 1, wing: 'mirror' }),
    ];
    const m = corridorModel(data(doors, [1, 2, 3]), ST);
    expect(m.sections.map((s) => s.segment)).toEqual([1, 2, 3]);
    expect(m.sections[0]?.wings.map((w) => w.wing)).toEqual(['hall_front', 'mirror', 'vocations']);
    expect(m.sections[1]?.hall.map((d) => d.id)).toEqual(['h']);
    expect(m.sections[2]?.wings).toEqual([]);
    expect(m.order).toEqual(['f', 'm', 'v', 'h']);
    expect(m.selected).toBe('f');
  });

  it('filters by state and counts every tab; an empty filter says so', () => {
    const doors = [
      door({ id: 'a', state: 'openable' }),
      door({ id: 'b', state: 'hinted' }),
      door({ id: 'c', state: 'opened' }),
      door({ id: 'd', state: 'locked' }),
    ];
    expect(passesFilter(doors[0] as CorridorDoorView, 'openable')).toBe(true);
    expect(passesFilter(doors[3] as CorridorDoorView, 'opened')).toBe(false);
    const m = corridorModel(data(doors), { ...ST, filter: 'opened' });
    expect(m.order).toEqual(['c']);
    expect(m.filters.map((f) => [f.id, f.count])).toEqual([
      ['all', 4],
      ['openable', 1],
      ['glimpsed', 1],
      ['opened', 1],
    ]);
    const none = corridorModel(data([door({ id: 'b' })]), { ...ST, filter: 'opened' });
    expect(none.empty).toBe(t('ui.mode.corridor.empty_filter'));
    expect(none.card).toBeNull();
    expect(corridorModel(data([]), ST).empty).toBe(t('ui.win.doors.empty_state'));
  });

  it('the mirror shows rank, blockage with its tier and fatigue, never the seal', () => {
    const m = corridorModel(data([]), ST);
    expect(m.mirror).toEqual({
      rank: t('ui.mode.corridor.mirror_rank', { n: 3 }),
      blockage: t('ui.mode.corridor.mirror_blockage', {
        tier: t('ui.hud.gauges.blockage_tier.2'),
        n: 42,
      }),
      fatigue: t('ui.mode.corridor.mirror_fatigue', { n: 10 }),
    });
  });

  it('navigates doors, segments and filters, wrapping', () => {
    expect(moveSelection(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(moveSelection(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(moveSelection(['a', 'b'], null, -1)).toBe('b');
    expect(moveSelection([], null, 1)).toBeNull();
    const m = corridorModel(
      data([door({ id: 'a', segment: 1 }), door({ id: 'b', segment: 3 })], [1, 2, 3]),
      ST,
    );
    expect(stepSegment(m, 'a', 1)).toBe('b');
    expect(stepSegment(m, 'b', 1)).toBe('a');
    expect(stepSegment(m, 'a', -1)).toBe('b');
    expect(stepFilter('all', -1)).toBe('opened');
    expect(stepFilter('opened', 1)).toBe('all');
  });

  it("reads the kernel's answer to the player's door command after a sequence number", () => {
    const events = [
      {
        kind: 'command.result',
        seq: 4,
        data: { kind: 'doors.open', ok: false, source: { type: 'player' } },
      },
      { kind: 'flag.changed', seq: 6, data: {} },
      {
        kind: 'command.result',
        seq: 7,
        data: { kind: 'doors.open', ok: false, reason: 'no', source: { type: 'player' } },
      },
    ];
    expect(doorCommandResult(events, 5)).toEqual({ ok: false, reason: 'no' });
    expect(doorCommandResult(events, 7)).toBeUndefined();
  });

  it('the doors window is a mode, and the corridor context takes the input while it is open', () => {
    expect(windowDef('doors').mode).toBe(true);
    expect(windowDef('quests').mode).toBeUndefined();
    expect(contextStack({ ...IDLE_SURFACE, windows: true, corridor: true }, 'kbm')).toEqual([
      'corridor',
      'global',
    ]);
    expect(contextStack({ ...IDLE_SURFACE, windows: true, corridor: true }, 'pad')).toEqual([
      'corridor',
      'global',
    ]);
    expect(contextStack({ ...IDLE_SURFACE, scene: 'advance', corridor: true }, 'kbm')).toEqual([
      'dialogue',
      'global',
    ]);
  });
});

describe('tracker state and model (ui_hud_tracker)', () => {
  it('auto-tracks new main quests once, drops ended ones, never re-adds an untracked one', () => {
    const s = new TrackerState();
    s.sync([
      { id: 'm1', kind: 'main' },
      { id: 's1', kind: 'side' },
    ]);
    expect(s.ids()).toEqual(['m1']);
    s.untrack('m1');
    s.sync([{ id: 'm1', kind: 'main' }]);
    expect(s.ids()).toEqual([]);
    expect(s.toggle('s1')).toBe(true);
    expect(s.ids()).toEqual(['s1']);
    s.sync([]);
    expect(s.ids()).toEqual([]);
  });

  it('a full list loses its oldest automatic entry to a new main quest, never a manual one', () => {
    const s = new TrackerState();
    for (const id of ['a', 'b', 'c', 'd']) s.toggle(id);
    const sides = ['a', 'b', 'c', 'd'].map((id) => ({ id, kind: 'side' }));
    s.sync([{ id: 'm1', kind: 'main' }, ...sides]);
    expect(s.ids()).toEqual(['a', 'b', 'c', 'd', 'm1']);
    s.sync([{ id: 'm1', kind: 'main' }, { id: 'm2', kind: 'main' }, ...sides]);
    expect(s.ids()).toEqual(['a', 'b', 'c', 'd', 'm2']);
    expect(s.ids().length).toBe(TRACK_MAX);
    // five manual entries: a sixth manual track is refused, a new main quest is not added
    expect(s.toggle('e')).toBe(true);
    expect(s.ids()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(s.toggle('f')).toBe(false);
    const v = s.version;
    s.sync([
      ...['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, kind: 'side' })),
      { id: 'm3', kind: 'main' },
    ]);
    expect(s.ids()).not.toContain('m3');
    expect(s.version).toBe(v);
  });

  it('shows at most the limit, three objective lines open first, ready and deadlines', () => {
    const objectives = [
      { label: 'o1', progress: 1, need: 1, done: true, optional: false },
      { label: 'o2', progress: 2, need: 5, done: false, optional: false },
      { label: 'o3', progress: 0, need: 1, done: false, optional: false },
      { label: 'o4', progress: 0, need: 1, done: false, optional: false },
    ];
    const q = (id: string, over = {}) => ({
      id,
      title: id,
      status: 'active',
      objectives,
      expiryWeek: null,
      ...over,
    });
    const m = trackerModel({
      quests: [q('a', { expiryWeek: 5 }), q('b', { status: 'ready' }), q('c'), q('d')],
      actWeek: 3,
      door: null,
      limit: 4,
    });
    expect(m?.entries.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(m?.entries[0]?.lines.map((l) => l.text)).toEqual([
      t('ui.win.quests.progress', { label: 'o2', cur: 2, need: 5 }),
      'o3',
      'o4',
    ]);
    expect(m?.entries[0]?.deadline).toBe(t('ui.hud.tracker.weeks_left', { n: 2 }));
    expect(m?.entries[1]?.lines).toEqual([{ text: t('ui.hud.tracker.ready'), done: false }]);
    expect(m?.entries[2]?.deadline).toBe('');
    // a short screen keeps the newest (a quest just tracked is never the one left out)
    const short = trackerModel({
      quests: [q('a'), q('b'), q('c'), q('d')],
      actWeek: 3,
      door: null,
      limit: 3,
    });
    expect(short?.entries.map((e) => e.id)).toEqual(['b', 'c', 'd']);
    expect(trackerModel({ quests: [], actWeek: 1, door: null, limit: 5 })).toBeNull();
  });

  it('deadlines count down only for explicit expiry weeks in an act with weeks', () => {
    expect(deadlineText(4, 4)).toBe(t('ui.hud.tracker.due_this_week'));
    expect(deadlineText(6, 4)).toBe(t('ui.hud.tracker.weeks_left', { n: 2 }));
    expect(deadlineText(3, 4)).toBe('');
    expect(deadlineText(null, 4)).toBe('');
    expect(deadlineText(4, 0)).toBe('');
  });

  it('a pinned door lists its unmet disclosed keys and how many are left', () => {
    const d = door({
      id: 'x',
      keys: [
        { label: 'k1', met: true },
        { label: 'k2', met: false },
      ],
      keysLeft: 1,
    });
    const m = trackerModel({ quests: [], actWeek: 0, door: d, limit: 5 });
    expect(m?.door).toEqual({
      id: 'x',
      title: 'name_x',
      keys: ['k2', t('ui.mode.corridor.keys_left', { n: 1 })],
    });
  });

  it('builds from the adapters: ended quests drop out, the order is the tracking order', () => {
    const view = {} as never;
    const log: QuestLogView = {
      act: 'act1',
      actTitle: 'A1',
      active: [quest('q1', 'main'), quest('q2', 'side')],
      ready: [],
      done: [],
      ended: [],
    };
    const adapters = {
      quests: { log: () => log, choose: () => [] },
      questDetail: {
        actWeek: () => 2,
        detail: (_v: unknown, id: string) => ({ title: `T_${id}`, pathLabel: '', expiryWeek: 4 }),
      },
    } as unknown as ClientAdapters;
    const s = new TrackerState();
    s.toggle('q2');
    const m = buildTracker(view, adapters, s, 5);
    expect(m?.entries.map((e) => [e.id, e.title, e.deadline])).toEqual([
      ['q2', 'T_q2', t('ui.hud.tracker.weeks_left', { n: 2 })],
      ['q1', 'T_q1', t('ui.hud.tracker.weeks_left', { n: 2 })],
    ]);
    log.active = [quest('q1', 'main')];
    expect(buildTracker(view, adapters, s, 5)?.entries.map((e) => e.id)).toEqual(['q1']);
  });
});

function quest(id: string, kind: QuestView['kind'], over: Partial<QuestView> = {}): QuestView {
  return {
    id,
    title: id,
    act: 'act1',
    kind,
    status: 'active',
    desc: `desc_${id}`,
    stageDesc: '',
    objectives: [],
    ...over,
  };
}

describe('quest log model (ui_win_quests)', () => {
  const input = {
    tab: 'main' as const,
    actWeek: 3,
    detail: (id: string) => ({
      title: `T_${id}`,
      pathLabel: id === 'e2' ? 'P' : '',
      expiryWeek: 5,
    }),
    tracked: (id: string) => id === 'm',
    personName: (id: string) => `N_${id}`,
  };

  it('every quest kind has a tab and a badge', () => {
    for (const k of QUEST_KINDS) {
      expect(QUEST_TABS).toContain(KIND_TAB[k]);
      expect(t(`ui.win.quests.kind.${k}`)).not.toContain('ui.');
    }
    for (const tab of QUEST_TABS) expect(t(`ui.win.quests.tab.${tab}`)).not.toContain('ui.');
  });

  it('the header names the act week; tabs sort by kind; badges, deadline and tracking', () => {
    const log: QuestLogView = {
      act: 'act1',
      actTitle: 'A1',
      active: [quest('m', 'main', { giver: 'g' }), quest('d', 'dispute'), quest('n', 'node')],
      ready: [quest('c', 'commission', { turnIn: 'r', status: 'ready' })],
      done: [],
      ended: [],
    };
    const m = questLogModel(log, input);
    expect(m.header).toBe(t('ui.win.quests.act_week', { title: 'A1', n: 3 }));
    expect(m.rows.map((r) => r.id)).toEqual(['m']);
    const r = m.rows[0];
    expect(r?.kindLabel).toBe(t('ui.win.quests.kind.main'));
    expect(r?.title).toBe('T_m');
    expect(r?.tracked).toBe(true);
    expect(r?.who).toBe(t('ui.win.quests.giver', { who: 'N_g' }));
    expect(r?.deadline).toBe(
      `${t('ui.win.quests.deadline', { week: 5 })}  ${t('ui.hud.tracker.weeks_left', { n: 2 })}`,
    );
    expect(m.tabs.map((x) => [x.id, x.count])).toEqual([
      ['main', 1],
      ['disputes', 2],
      ['commissions', 1],
      ['companions', 0],
      ['goddesses', 0],
      ['ended', 0],
    ]);
    const c = questLogModel(log, { ...input, tab: 'commissions' }).rows[0];
    expect(c?.ready).toBe(true);
    expect(c?.who).toBe(t('ui.win.quests.turn_in', { who: 'N_r' }));
    const prologue = questLogModel(log, { ...input, actWeek: 0 });
    expect(prologue.header).toBe(t('ui.win.quests.act', { title: 'A1' }));
  });

  it('the ended tab tells what happened afterwards and the path, never "failed", newest first', () => {
    const log: QuestLogView = {
      act: 'act1',
      actTitle: 'A1',
      active: [],
      ready: [],
      done: [quest('e1', 'main', { status: 'done' })],
      ended: [
        quest('e2', 'side', { status: 'failed' }),
        quest('e3', 'side', { status: 'by_other' }),
        quest('e4', 'side', { status: 'expired' }),
      ],
    };
    const m = questLogModel(log, { ...input, tab: 'ended' });
    expect(m.rows.map((r) => r.id)).toEqual(['e1', 'e4', 'e3', 'e2']);
    expect(m.rows.map((r) => r.outcome)).toEqual([
      t('ui.win.quests.outcome.done'),
      t('ui.win.quests.outcome.expired'),
      t('ui.win.quests.outcome.by_other'),
      t('ui.win.quests.outcome.failed'),
    ]);
    expect(m.rows.find((r) => r.id === 'e2')?.path).toBe(t('ui.win.quests.path', { path: 'P' }));
    expect(m.rows.every((r) => !r.trackable && r.deadline === '' && r.who === '')).toBe(true);
  });

  it('empty states: the whole log, the disputes tab, the ended tab, any other tab', () => {
    const none: QuestLogView = {
      act: 'act1',
      actTitle: 'A1',
      active: [],
      ready: [],
      done: [],
      ended: [],
    };
    expect(questLogModel(none, input).empty).toBe(t('ui.win.quests.empty_state'));
    const some = { ...none, active: [quest('m', 'main')] };
    expect(questLogModel(some, { ...input, tab: 'disputes' }).empty).toBe(
      t('ui.win.quests.empty_disputes'),
    );
    expect(questLogModel(some, { ...input, tab: 'ended' }).empty).toBe(
      t('ui.win.quests.empty_ended'),
    );
    expect(questLogModel(some, { ...input, tab: 'goddesses' }).empty).toBe(
      t('ui.win.quests.empty_tab'),
    );
    expect(questLogModel(some, input).empty).toBe('');
  });
});

describe('gauges (ui_hud_gauges)', () => {
  it('each bar shows only above 0; numbers only in the hover text', () => {
    expect(gaugesModel({ blockage: 0, fatigue: 0, taint: 0, dianKnown: false })).toEqual([]);
    const bars = gaugesModel({ blockage: 25, fatigue: 0, taint: 50, dianKnown: false });
    expect(bars.map((b) => b.id)).toEqual(['blockage', 'taint']);
    const [blockage, taint] = bars;
    expect(blockage?.state).toBe(t('ui.hud.gauges.blockage_tier.1'));
    expect(blockage?.label).not.toMatch(/\d/);
    expect(blockage?.title).toBe(
      t('ui.hud.gauges.hover', { label: t('ui.hud.gauges.blockage'), n: 25, max: GAUGE_MAX }),
    );
    expect(taint?.ticks).toEqual([20, 45, 75]);
    expect(taint?.pct).toBe(50);
  });

  it('the taint carries the mortal word until term.dian_known', () => {
    const before = gaugesModel({ blockage: 0, fatigue: 0, taint: 76, dianKnown: false })[0];
    expect(before?.label).toBe(t('ui.hud.gauges.taint_mortal'));
    expect(before?.state).toBe(t('ui.hud.gauges.taint_mortal_state.3'));
    const after = gaugesModel({ blockage: 0, fatigue: 0, taint: 76, dianKnown: true })[0];
    expect(after?.label).toBe(t('ui.hud.gauges.taint'));
    expect(after?.state).toBe(t('ui.hud.gauges.taint_state.3'));
    expect(gaugesModel({ blockage: 0, fatigue: 0, taint: 19, dianKnown: true })[0]?.state).toBe('');
  });

  it('thresholds and clamping', () => {
    expect(stepOf(19, [20, 45, 75])).toBe(0);
    expect(stepOf(20, [20, 45, 75])).toBe(1);
    expect(stepOf(100, [20, 45, 75])).toBe(3);
    expect(gaugesModel({ blockage: 0, fatigue: 140, taint: 0, dianKnown: false })[0]?.pct).toBe(
      100,
    );
    expect(gaugesModel({ blockage: Number.NaN, fatigue: -5, taint: 0, dianKnown: false })).toEqual(
      [],
    );
  });
});

describe('corridor and quest-detail adapters on the real game', () => {
  it('reads the corridor and the door mirror, never the seal; gauges read the taint flag', () => {
    const engine = createGame({ seed: 3 });
    const view = createGameView(engine);
    const before = corridorData(view);
    expect(before.open).toBe(false);
    engine.queue('flag.set', { key: 'feature.door_corridor', value: true });
    engine.queue('flag.set', { key: 'player.taint', value: 30 });
    engine.step(1);
    const d = corridorData(view);
    expect(d.open).toBe(true);
    expect(d.segments).toContain(1);
    expect(Object.keys(d.mirror).sort()).toEqual(['blockage', 'blockageTier', 'fatigue', 'rank']);
    for (const x of d.doors) {
      expect(x.state).not.toBe('hidden');
      if (!x.nameShown) expect(x.name).toBe('');
      expect(x.wingName).not.toContain('sys.');
    }
    const g = gaugeInput(view, createAdapters());
    expect(g.taint).toBe(30);
    expect(g.dianKnown).toBe(false);
  });

  it('gives the act week, a quest title and its expiry week', () => {
    const engine = createGame({ seed: 3 });
    const view = createGameView(engine);
    const ad = createQuestDetailAdapter();
    expect(ad.actWeek(view)).toBe(0);
    const def = (view.content as { quests: { id: string; expiry?: { week?: number } }[] })
      .quests[0];
    expect(def).toBeDefined();
    const det = ad.detail(view, def?.id ?? '');
    expect(det?.title).toBeTruthy();
    expect(det?.expiryWeek).toBe(def?.expiry?.week ?? null);
    expect(det?.pathLabel).toBe('');
    expect(ad.detail(view, 'no_such_quest')).toBeNull();
  });
});
