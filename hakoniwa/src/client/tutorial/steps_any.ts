// The any-time steps of ux_and_onboarding.md 17.5 (15 rows): they fire in whichever act
// their moment comes. Data only; the types and the builders are in ./steps.ts.

import {
  anyOf,
  count,
  ev,
  field,
  flagChanged,
  PLAYER,
  seen,
  sig,
  step,
  type TutStep,
} from './steps';

/** A cast by someone other than the player that can be broken (18: no shield border). */
const hostileCast = (op: 'start' | 'interrupted') =>
  ev(
    'combat.cast',
    field('casterId', 'ne', PLAYER),
    field('op', 'eq', op),
    ...(op === 'start' ? [field('interruptible', 'ne', false)] : []),
  );

export const ANY_STEPS: readonly TutStep[] = [
  step({
    id: 'tut_any_interrupt',
    category: 'combat',
    methods: ['bar'],
    trigger: hostileCast('start'),
    // "打断一次或经过 3 次读条"
    done: anyOf(hostileCast('interrupted'), count(hostileCast('start'), 3)),
    priority: 'danger',
  }),
  step({
    id: 'tut_any_offscreen',
    category: 'combat',
    methods: ['bar'],
    trigger: sig('offscreen_threat'),
    done: seen(),
    priority: 'danger',
  }),
  step({
    id: 'tut_any_debuff',
    category: 'combat',
    methods: ['glow'],
    // an aura someone else put on the player (the event names no harm or dispel class yet)
    trigger: ev(
      'combat.aura',
      field('targetId', 'eq', PLAYER),
      field('sourceId', 'ne', PLAYER),
      field('op', 'eq', 'applied'),
    ),
    done: ev('combat.aura', field('targetId', 'eq', PLAYER), field('op', 'eq', 'removed')),
    glowTarget: 'player_auras',
    priority: 'danger',
  }),
  step({
    id: 'tut_any_taint',
    category: 'ops',
    methods: ['glow', 'card'],
    trigger: flagChanged('player.taint', 'gt', 0),
    done: seen(),
    glowTarget: 'gauges',
    paragraphs: 2,
  }),
  step({
    id: 'tut_any_gatecost',
    category: 'ops',
    methods: ['glow', 'card'],
    trigger: anyOf(flagChanged('door_fatigue', 'gt', 0), ev('doors.blockage_tier')),
    done: seen(),
    glowTarget: 'gauges',
    paragraphs: 2,
  }),
  step({
    id: 'tut_any_bagfull',
    category: 'ops',
    methods: ['bar'],
    trigger: sig('bag_full'),
    done: anyOf(
      sig('bag_room'),
      ev('inventory.changed', field('ownerId', 'eq', PLAYER), field('delta', 'lt', 0)),
    ),
    priority: 'action',
  }),
  step({
    id: 'tut_any_deadline',
    category: 'ops',
    methods: ['bar'],
    trigger: sig('deadline_quest'),
    done: seen(),
  }),
  step({
    id: 'tut_any_missed',
    category: 'social',
    methods: ['card'],
    trigger: ev('quest.by_other'),
    done: seen(),
    paragraphs: 2,
  }),
  step({
    id: 'tut_any_companion_down',
    category: 'combat',
    methods: ['card'],
    trigger: anyOf(ev('party.wounded'), ev('party.died')),
    done: seen(),
    paragraphs: 2,
  }),
  step({
    id: 'tut_any_contraband',
    category: 'economy',
    methods: ['bar'],
    trigger: sig('contraband'),
    done: seen(),
  }),
  step({
    id: 'tut_any_spoil',
    category: 'ops',
    methods: ['bar'],
    trigger: sig('item_spoiled'),
    done: seen(),
  }),
  step({
    id: 'tut_any_wait_blocked',
    category: 'ops',
    methods: ['notify'],
    // a wait or a time skip broken off (the kernel gives the reason); the client's own
    // speed buttons explain themselves on the clock (5.2)
    trigger: ev('time.interrupt'),
    done: seen(),
  }),
  step({
    id: 'tut_any_gamepad',
    category: 'ops',
    methods: ['card'],
    trigger: sig('gamepad_connected'),
    done: seen(),
    paragraphs: 3,
  }),
  step({
    id: 'tut_any_llm_error',
    category: 'ops',
    methods: ['notify'],
    trigger: sig('llm_error'),
    done: seen(),
  }),
  step({
    id: 'tut_any_degrade',
    category: 'ops',
    methods: ['notify'],
    trigger: sig('degraded'),
    done: seen(),
  }),
];
