// PK-M1-22 HUD pure cores: the party frames (ui_hud_party), the notification queue and its
// event mapping (ui_hud_notify), the hint bar and its first-step triggers (ui_hud_hint) and the
// focus frame (ui_hud_focus).

import { describe, expect, it } from 'vitest';
import { FOCUS_RANGE, focusModel, toggleFocus } from '../src/client/hud/focus_model';
import {
  HINT_FADE_MS,
  HINT_MOVE,
  HINT_MS,
  HINT_STALE_MS,
  HINT_TALK,
  HintBar,
  type HintSpec,
  HintTriggers,
  hintAllowed,
  MOVE_IDLE_MS,
} from '../src/client/hud/hint_model';
import {
  lightNotice,
  MAX_SHOWN,
  MERGE_MS,
  NOTIFY_MS,
  type NotifyEventContext,
  NotifyQueue,
  type NotifySpec,
  notifyOf,
  STALE_MS,
} from '../src/client/hud/notify_model';
import { PARTY_DEBUFFS, PARTY_FRAMES, partyModel } from '../src/client/hud/party_model';
import type { UnitFrameData } from '../src/client/view/adapters';
import type { AnyWorldEvent } from '../src/core/contracts';
import { tr } from '../src/core/text';
import { t } from '../src/shared_ui/i18n';

const ev = (kind: string, data: Record<string, unknown>): AnyWorldEvent =>
  ({ kind, data, tick: 1 }) as unknown as AnyWorldEvent;

// ---------------------------------------------------------------------------
// ui_hud_party

describe('party frames model (ui_hud_party)', () => {
  const member = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: `name_${id}`,
    order: 'follow' as const,
    downed: false,
    unit: { id: `e_${id}` },
    ...extra,
  });
  const frame = (entityId: string): UnitFrameData | null => ({
    hp: { value: 40.4, max: 100 },
    resources: [{ kind: 'mana', label: 'MP', value: 10, max: 50 }],
    auras: [
      { id: 'b1', name: 'buff', harmful: false, remaining: 3, stacks: 1 },
      { id: 'd_perm', name: 'perm', harmful: true, remaining: null, stacks: 1 },
      { id: 'd_late', name: 'late', harmful: true, remaining: 30, stacks: 1 },
      { id: 'd_soon', name: 'soon', harmful: true, remaining: 1.2, stacks: 1 },
      { id: 'd_mid', name: 'mid', harmful: true, remaining: 9.5, stacks: 1 },
      { id: 'd_5', name: 'five', harmful: true, remaining: 20, stacks: 1 },
    ],
    dead: entityId === 'e_dead',
  });

  it('is empty without members (the block hides)', () => {
    const m = partyModel([], frame);
    expect(m.rows).toEqual([]);
    expect(m.overflow).toBe(0);
  });

  it('shows at most five members and counts the rest for the raid grid', () => {
    const list = Array.from({ length: 7 }, (_, i) => member(`c${i}`));
    const m = partyModel(list, frame);
    expect(m.rows).toHaveLength(PARTY_FRAMES);
    expect(m.overflow).toBe(2);
  });

  it('leaves out members away recovering', () => {
    const m = partyModel([member('a'), member('b', { recovering: true })], frame);
    expect(m.rows.map((r) => r.id)).toEqual(['a']);
  });

  it('reads health, the main resource, the order and up to four debuffs, shortest first', () => {
    const [row] = partyModel([member('a', { order: 'assist' })], frame).rows;
    expect(row?.hp).toEqual({ value: 40, max: 100 });
    expect(row?.resource).toMatchObject({ value: 10, max: 50, label: 'MP' });
    expect(row?.orderText).toBe(t('sys.party.order.assist'));
    expect(row?.debuffs).toHaveLength(PARTY_DEBUFFS);
    expect(row?.debuffs.map((d) => d.id)).toEqual(['d_soon', 'd_mid', 'd_5', 'd_late']);
    expect(row?.debuffs[0]?.seconds).toBe(2);
    expect(row?.downed).toBe(false);
  });

  it('marks a fallen member down (party flag or a dead unit)', () => {
    const m = partyModel(
      [member('a', { downed: true }), member('dead'), member('c', { unit: null })],
      frame,
    );
    expect(m.rows.map((r) => r.downed)).toEqual([true, true, false]);
    expect(m.rows[2]?.hp).toBeNull();
    expect(m.rows[2]?.entityId).toBeNull();
  });

  it('changes its key only when something shown changes', () => {
    const a = partyModel([member('a')], frame);
    const b = partyModel([member('a')], frame);
    expect(a.key).toBe(b.key);
    const c = partyModel([member('a', { order: 'stay' })], frame);
    expect(c.key).not.toBe(a.key);
  });
});

// ---------------------------------------------------------------------------
// ui_hud_notify

const spec = (level: NotifySpec['level'], n = 0, extra: Partial<NotifySpec> = {}): NotifySpec => ({
  level,
  text: tr('ui.hud.notify.xp', { n }),
  ...extra,
});
const free = { held: false, combat: false };

describe('notification queue (ui_hud_notify)', () => {
  it('shows each level for its time (critical 4 s, important 3 s, normal 2 s, light 0.8 s)', () => {
    expect(NOTIFY_MS).toEqual({ critical: 4000, important: 3000, normal: 2000, light: 800 });
    const q = new NotifyQueue();
    q.push(spec('important', 1), 0);
    q.push(spec('light', 2), 0);
    let f = q.frame(0, free);
    expect(f.stack).toHaveLength(1);
    expect(f.light).not.toBeNull();
    f = q.frame(799, free);
    expect(f.light).not.toBeNull();
    f = q.frame(800, free);
    expect(f.light).toBeNull();
    expect(f.stack).toHaveLength(1);
    f = q.frame(3000, free);
    expect(f.stack).toHaveLength(0);
  });

  it('puts critical notifications on top and the rest in the right stack', () => {
    const q = new NotifyQueue();
    q.push(spec('critical', 1), 0);
    q.push(spec('normal', 2), 0);
    const f = q.frame(0, free);
    expect(f.top.map((n) => n.level)).toEqual(['critical']);
    expect(f.stack.map((n) => n.level)).toEqual(['normal']);
  });

  it('shows at most three; a higher level pushes out the lowest one', () => {
    const q = new NotifyQueue();
    for (let i = 0; i < 3; i++) q.push(spec('normal', i, { merge: `k${i}` }), 0);
    q.push(spec('normal', 9, { merge: 'k9' }), 0);
    let f = q.frame(0, free);
    expect(f.stack).toHaveLength(MAX_SHOWN);
    expect(q.queued()).toHaveLength(1);
    q.push(spec('critical', 5), 10);
    f = q.frame(10, free);
    expect(f.top).toHaveLength(1);
    expect(f.stack).toHaveLength(2);
    expect(f.top.length + f.stack.length).toBe(MAX_SHOWN);
    // an equal level never pushes out: it waits
    q.push(spec('critical', 6), 20);
    q.push(spec('critical', 7), 20);
    q.push(spec('critical', 8), 20);
    f = q.frame(20, free);
    expect(f.top).toHaveLength(MAX_SHOWN);
    expect(q.queued().some((n) => n.level === 'critical')).toBe(true);
  });

  it('merges the same kind of normal notification within 2 s and adds the amounts', () => {
    const q = new NotifyQueue();
    const item = (count: number): NotifySpec => ({
      level: 'normal',
      merge: 'item:herb',
      sum: 'count',
      text: tr('ui.hud.notify.item', { item: 'herb', count }),
    });
    q.push(item(1), 0);
    q.frame(0, free);
    q.push(item(2), 500);
    let f = q.frame(500, free);
    expect(f.stack).toHaveLength(1);
    expect(f.stack[0]?.text.params?.count).toBe(3);
    // a merge keeps it on screen for another 2 s
    f = q.frame(2400, free);
    expect(f.stack).toHaveLength(1);
    // past the window a new one starts its own count
    q.push(item(4), 500 + MERGE_MS + 1);
    f = q.frame(500 + MERGE_MS + 1, free);
    expect(f.stack.map((n) => n.text.params?.count)).toEqual([4]);
  });

  it('only queues during a scene or dialogue, then releases by level with kinds merged', () => {
    const q = new NotifyQueue();
    const held = { held: true, combat: false };
    q.push(spec('normal', 1, { merge: 'xp', sum: 'n' }), 0);
    q.push(spec('normal', 2, { merge: 'xp', sum: 'n' }), 5000);
    q.push(spec('important', 0), 6000);
    q.push(spec('critical', 0), 7000);
    q.push(lightNotice('x'), 7000);
    let f = q.frame(7000, held);
    expect(f.top.length + f.stack.length).toBe(0);
    expect(f.light).toBeNull();
    f = q.frame(8000, free);
    expect(f.top.map((n) => n.level)).toEqual(['critical']);
    expect(f.stack.map((n) => n.level)).toEqual(['important', 'normal']);
    expect(f.stack[1]?.text.params?.n).toBe(3);
  });

  it('in combat shows only critical and important; normal waits for the fight to end', () => {
    const q = new NotifyQueue();
    const fight = { held: false, combat: true };
    q.push(spec('normal', 1, { merge: 'xp', sum: 'n' }), 0);
    q.push(spec('important', 0), 0);
    let f = q.frame(0, fight);
    expect(f.stack.map((n) => n.level)).toEqual(['important']);
    f = q.frame(100, free);
    expect(f.stack.map((n) => n.level)).toEqual(['important', 'normal']);
  });

  it('a hold keeps everything however long; only an ordinary notice goes stale', () => {
    // a long cutscene: the level-up waits through it and shows when it ends (5.4)
    const q = new NotifyQueue();
    q.push(spec('critical', 0), 0);
    q.push(spec('normal', 0), 0);
    q.frame(STALE_MS * 5, { held: true, combat: false });
    expect(q.queued().map((n) => n.level)).toEqual(['critical', 'normal']);
    const after = q.frame(STALE_MS * 5 + 10, free);
    expect(after.top.map((n) => n.level)).toEqual(['critical']);
    expect(after.stack.map((n) => n.level)).toEqual(['normal']);
    // a fight holds back ordinary notices only; those go stale, an important one never does
    const f = new NotifyQueue();
    f.push(spec('normal', 0), 0);
    f.frame(STALE_MS + 1, { held: false, combat: true });
    expect(f.queued()).toHaveLength(0);
  });

  it('dismisses a clicked notification and changes the frame key when it changes', () => {
    const q = new NotifyQueue();
    q.push(spec('critical', 0, { open: 'doors' }), 0);
    const a = q.frame(0, free);
    expect(q.frame(10, free)).toBe(a);
    q.dismiss(a.top[0]?.id ?? -1);
    const b = q.frame(20, free);
    expect(b.top).toHaveLength(0);
    expect(b.key).not.toBe(a.key);
  });
});

describe('notifications of world events', () => {
  const ctx: NotifyEventContext = {
    playerId: 'p',
    itemName: (id) => `item_${id}`,
    questTitle: (id) => `quest_${id}`,
    companionName: (id) => (id === 'e_yeyu' ? 'yeyu' : null),
    featureName: (f) => `feature_${f}`,
    actName: (a) => `act_${a}`,
  };

  it('maps gains to merging normal notifications, the player only', () => {
    const item = notifyOf(ev('inventory.changed', { ownerId: 'p', itemId: 'herb', delta: 2 }), ctx);
    expect(item).toMatchObject({ level: 'normal', merge: 'item:herb', sum: 'count' });
    expect(item?.text).toEqual(tr('ui.hud.notify.item', { item: 'item_herb', count: 2 }));
    expect(notifyOf(ev('inventory.changed', { ownerId: 'x', itemId: 'herb', delta: 2 }), ctx)).toBe(
      null,
    );
    expect(
      notifyOf(ev('inventory.changed', { ownerId: 'p', itemId: 'herb', delta: -1 }), ctx),
    ).toBeNull();
    expect(notifyOf(ev('money.changed', { ownerId: 'p', delta: 120 }), ctx)).toMatchObject({
      level: 'normal',
      merge: 'money',
      sum: 'm',
    });
    expect(notifyOf(ev('combat.xp', { entityId: 'p', amount: 5 }), ctx)).toMatchObject({
      level: 'normal',
      merge: 'xp',
    });
  });

  it('maps quest and feature news to important ones', () => {
    for (const kind of ['quest.started', 'quest.stage', 'quest.ready', 'quest.completed']) {
      const n = notifyOf(ev(kind, { questId: 'q1', title: 'T', stage: 1 }), ctx);
      expect(n?.level, kind).toBe('important');
      expect(n?.open).toBe('quests');
      expect(n?.text.params?.title).toBe('quest_q1');
    }
    // a new quest's stage 0 comes with quest.started in the same tick: one notice, not two
    expect(notifyOf(ev('quest.stage', { questId: 'q1', stage: 0 }), ctx)).toBeNull();
    expect(notifyOf(ev('feature.unlocked', { feature: 'company' }), ctx)?.level).toBe('important');
    expect(notifyOf(ev('doors.state', { doorId: 'd', to: 'openable' }), ctx)?.level).toBe(
      'important',
    );
    expect(notifyOf(ev('doors.state', { doorId: 'd', to: 'hinted' }), ctx)).toBeNull();
  });

  it('maps door, level, act and a fallen companion to critical, clickable ones', () => {
    expect(notifyOf(ev('door.opened', { doorId: 'd' }), ctx)).toMatchObject({
      level: 'critical',
      open: 'doors',
    });
    expect(notifyOf(ev('player.level_up', { level: 3 }), ctx)).toMatchObject({
      level: 'critical',
      open: 'character',
    });
    expect(notifyOf(ev('act.changed', { from: 'prologue', to: 'act1' }), ctx)?.text.params).toEqual(
      { act: 'act_act1' },
    );
    expect(notifyOf(ev('entity.died', { id: 'e_yeyu' }), ctx)).toMatchObject({
      level: 'critical',
      open: 'party',
    });
    expect(notifyOf(ev('entity.died', { id: 'e_wolf' }), ctx)).toBeNull();
  });

  it('every notification text is a ui.hud.notify key that renders', () => {
    const texts = [
      notifyOf(ev('door.opened', { doorId: 'd' }), ctx),
      notifyOf(ev('player.level_up', { level: 3 }), ctx),
      lightNotice('x'),
    ].map((n) => n?.text);
    for (const x of texts) {
      expect(x?.key.startsWith('ui.hud.notify.')).toBe(true);
      expect(t(x ?? '')).not.toBe(x?.key);
    }
    expect(lightNotice('why').level).toBe('light');
  });
});

// ---------------------------------------------------------------------------
// ui_hud_hint

describe('hint bar (ui_hud_hint)', () => {
  const sys: HintSpec = { id: 'sys', text: tr('ui.hud.hint.talk'), category: 'system' };
  const fight: HintSpec = { id: 'fight', text: tr('ui.hud.hint.move'), category: 'combat' };
  const ctx = { guidance: 'full' as const, combat: false, held: false };

  it('filters by guidance level (off none, brief no basic operations)', () => {
    expect(hintAllowed('basic', 'full')).toBe(true);
    expect(hintAllowed('basic', 'brief')).toBe(false);
    expect(hintAllowed('system', 'brief')).toBe(true);
    expect(hintAllowed('combat', 'off')).toBe(false);
    const bar = new HintBar();
    expect(bar.show(HINT_MOVE, 0, 'brief')).toBe(false);
    expect(bar.show(HINT_MOVE, 0, 'off')).toBe(false);
    expect(bar.show(sys, 0, 'brief')).toBe(true);
  });

  it('shows one hint at a time, ends it after 12 s, fades, then shows the next', () => {
    const bar = new HintBar();
    bar.show(HINT_MOVE, 0, 'full');
    bar.show(sys, 0, 'full');
    expect(bar.frame(0, ctx).hint?.id).toBe('move');
    expect(bar.frame(HINT_MS - 1, ctx)).toEqual({ hint: HINT_MOVE, fading: false });
    expect(bar.frame(HINT_MS, ctx)).toEqual({ hint: HINT_MOVE, fading: true });
    expect(bar.frame(HINT_MS + HINT_FADE_MS, ctx).hint?.id).toBe('sys');
  });

  it('ends a hint when its action is done, and never shows a done one', () => {
    const bar = new HintBar();
    bar.show(HINT_MOVE, 0, 'full');
    bar.frame(0, ctx);
    bar.finish('move', 100);
    expect(bar.frame(100, ctx).fading).toBe(true);
    expect(bar.frame(100 + HINT_FADE_MS, ctx).hint).toBeNull();
    expect(bar.show(HINT_MOVE, 1000, 'full')).toBe(false);
    bar.finish('talk', 1000);
    expect(bar.show(HINT_TALK, 1000, 'full')).toBe(false);
  });

  it('shows each hint once per session', () => {
    const bar = new HintBar();
    bar.show(sys, 0, 'full');
    bar.frame(0, ctx);
    bar.frame(HINT_MS + HINT_FADE_MS, ctx);
    expect(bar.show(sys, HINT_MS + HINT_FADE_MS, 'full')).toBe(false);
  });

  it('waits during scenes and dialogue; in combat only combat hints show', () => {
    const bar = new HintBar();
    bar.show(sys, 0, 'full');
    bar.show(fight, 0, 'full');
    expect(bar.frame(0, { ...ctx, held: true }).hint).toBeNull();
    expect(bar.frame(10, { ...ctx, combat: true }).hint?.id).toBe('fight');
    expect(bar.frame(10 + HINT_MS, { ...ctx, combat: true }).fading).toBe(true);
    const later = 10 + HINT_MS + HINT_FADE_MS;
    expect(bar.frame(later, { ...ctx, combat: true }).hint).toBeNull();
    expect(bar.frame(later + 1, ctx).hint?.id).toBe('sys');
  });

  it('drops a hint that found no moment within 10 minutes', () => {
    const bar = new HintBar();
    bar.show(sys, 0, 'full');
    expect(bar.frame(HINT_STALE_MS, { ...ctx, held: true }).hint).toBeNull();
    expect(bar.frame(HINT_STALE_MS + 1, ctx).hint).toBeNull();
  });

  it('first-step triggers: move after 2 s still, done after 3 m; talk near someone', () => {
    const tr8 = new HintTriggers();
    const base = { act: 'prologue', held: false, talkableNear: false, talking: false };
    expect(tr8.update({ ...base, now: 0, pos: { x: 0, y: 0 } }).ask).toEqual([]);
    expect(tr8.update({ ...base, now: MOVE_IDLE_MS, pos: { x: 0, y: 0 } }).ask).toEqual([
      HINT_MOVE,
    ]);
    expect(tr8.update({ ...base, now: 3000, pos: { x: 3, y: 0 } }).done).toContain('move');
    const talk = tr8.update({ ...base, now: 3100, pos: { x: 3, y: 0 }, talkableNear: true });
    expect(talk.ask).toContain(HINT_TALK);
    expect(tr8.update({ ...base, now: 3200, pos: { x: 3, y: 0 }, talking: true }).done).toContain(
      'talk',
    );
  });

  it('first-step triggers stay quiet outside the prologue and act 1 and while held', () => {
    const late = new HintTriggers();
    const base = { held: false, talkableNear: true, talking: false, pos: { x: 0, y: 0 } };
    expect(late.update({ ...base, act: 'act2', now: 99_999 })).toEqual({ ask: [], done: [] });
    const held = new HintTriggers();
    held.update({ ...base, act: 'act1', now: 0, talkableNear: false });
    // a scene restarts the "still" clock
    held.update({ ...base, act: 'act1', now: 5000, held: true, talkableNear: false });
    expect(held.update({ ...base, act: 'act1', now: 5500, talkableNear: false }).ask).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ui_hud_focus

describe('focus frame (ui_hud_focus)', () => {
  const player = { mapId: 'm', x: 0, y: 0 };
  const entity = { alive: true, name: 'wolf', kind: 'monster' as const, mapId: 'm', x: 10, y: 0 };

  it('hides without a focus', () => {
    expect(focusModel({ focusId: null, entity, player, frame: null })).toEqual({
      clear: false,
      row: null,
    });
  });

  it('shows name, health and cast', () => {
    const r = focusModel({
      focusId: 'w',
      entity,
      player,
      frame: { hp: { value: 5.6, max: 20 }, cast: { name: 'howl', progress: 0.5 } },
    });
    expect(r.row).toEqual({
      id: 'w',
      name: 'wolf',
      kind: 'monster',
      hp: { value: 6, max: 20 },
      cast: { name: 'howl', progress: 0.5 },
    });
  });

  it('clears when the focus dies, leaves the map or goes beyond 60 m', () => {
    const at = (e: Partial<typeof entity>, frame = null as { dead?: boolean } | null) =>
      focusModel({ focusId: 'w', entity: { ...entity, ...e }, player, frame }).clear;
    expect(at({ alive: false })).toBe(true);
    expect(at({}, { dead: true })).toBe(true);
    expect(at({ mapId: 'other' })).toBe(true);
    expect(at({ x: FOCUS_RANGE + 0.1 })).toBe(true);
    expect(at({ x: FOCUS_RANGE })).toBe(false);
    expect(focusModel({ focusId: 'w', entity: undefined, player, frame: null }).clear).toBe(true);
  });

  it('the focus action toggles the same unit off and takes another', () => {
    expect(toggleFocus(null, 'a')).toBe('a');
    expect(toggleFocus('a', 'a')).toBeNull();
    expect(toggleFocus('a', 'b')).toBe('b');
    expect(toggleFocus('a', null)).toBeNull();
  });
});
