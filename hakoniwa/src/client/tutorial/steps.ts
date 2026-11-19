// The onboarding catalogue (ux_and_onboarding.md 17.5): every prologue, act-1 and
// any-time `tut_` step as data. A record says what fires the step (`trigger`), what ends it
// (`done`, required for every step), how it teaches (`methods`, the 17.2 codes), which
// category "此后不提示这类" mutes it under (17.3), and its scheduling priority (17.4).
// Steps taught only by the story (叙, 境) or by written content (缓) carry `silent`: the
// check still sees them, the client shows nothing for them. Conditions are declarative, so
// the onboarding check (./check.ts) can verify every flag name against the variable registry
// and every event kind against the kernel's `EventKind`. Data-as-code: the act tables live in
// ./steps_p.ts, ./steps_a1.ts and ./steps_any.ts. Pure.

import type { EventKind, FlagValue } from '../../core/contracts';
import type { PlannedWindowId, WindowId } from '../windows/window_registry';

export type TutAct = 'p' | 'a1' | 'any';

/** Mute classes of "此后不提示这类" (17.3). */
export const TUT_CATEGORIES = [
  'ops',
  'combat',
  'social',
  'economy',
  'battle',
  'strategy',
  'divine',
] as const;
export type TutCategory = (typeof TUT_CATEGORIES)[number];

/**
 * The teaching methods of 17.2 (叙, 境, 条, 亮, 卡, 练, 缓), plus the notification the
 * 17.5 rows name as 通知 (it rides the HUD notifications, 5.4).
 */
export type TutMethod = 'narr' | 'env' | 'bar' | 'glow' | 'card' | 'drill' | 'slow' | 'notify';

/** The methods the client presents; a step with none of them is taught by the story alone. */
export const SHOWN_METHODS: readonly TutMethod[] = ['bar', 'glow', 'card', 'notify'];

/** 17.4: danger first, then the action at hand, then a system introduction. */
export type TutPriority = 'danger' | 'action' | 'system';

/** The windows a step may point at or be completed by. */
export type TutWindow = WindowId | PlannedWindowId;

/**
 * Named signals: what no registered flag or kernel event reports. Every step reads a flag or
 * an event where one exists; a signal is either fed by the game session each refresh
 * (src/client/app/tut_signals.ts and the act-1 wiring, `SESSION_SIGNALS`) or waits for the
 * package that will produce it (`WAITING_SIGNALS`); the onboarding check fails on any other,
 * and reports the steps that can only fire once a waiting signal arrives.
 */
export const SESSION_SIGNALS = [
  'can_move',
  'moved',
  'near_talkable',
  'near_interactable',
  'talking',
  'hostile_in_view',
  'target_selected',
  'combat_started',
  'combat_ended',
  'low_hp',
  'hp_recovered',
  'board_near',
  'node_near',
  'station_near',
  'station_left',
  'dusk',
  'save_available',
  'gamepad_connected',
  'shop_open',
  'shop_closed',
  'menu_opened',
  'name_prompt',
  'name_answered',
  'answer_prompt',
  'answered',
  'falling',
  'fall_ended',
  'key_choice',
  'key_choice_made',
  'evidence_prompt',
  'evidence_shown',
  'listen_far',
  'listen_end',
  'deadline_quest',
] as const;

/** Signals no one feeds yet, each with the package (or owner) it waits on. */
export const WAITING_SIGNALS = {
  far_from_tracked: 'PK-M1-57',
  charcard_opened: 'PK-M1-57',
  offscreen_threat: 'PK-M1-57',
  llm_error: 'PK-M1-02',
  degraded: 'PK-M1-02',
  bag_full: 'kernel inventory (bag capacity)',
  bag_room: 'kernel inventory (bag capacity)',
  item_spoiled: 'kernel inventory (spoilage event)',
  contraband: 'kernel economy (trade restriction refusal)',
} as const;

export const TUT_SIGNALS = [
  ...SESSION_SIGNALS,
  ...(Object.keys(WAITING_SIGNALS) as (keyof typeof WAITING_SIGNALS)[]),
] as const;
export type TutSignal = (typeof SESSION_SIGNALS)[number] | keyof typeof WAITING_SIGNALS;

/** Who produces each signal: the session, or the package it waits on. */
export const SIGNAL_SOURCES: Readonly<Record<TutSignal, 'session' | { waiting: string }>> = {
  ...(Object.fromEntries(SESSION_SIGNALS.map((x) => [x, 'session'])) as Record<
    (typeof SESSION_SIGNALS)[number],
    'session'
  >),
  ...(Object.fromEntries(
    Object.entries(WAITING_SIGNALS).map(([k, v]) => [k, { waiting: v }]),
  ) as Record<keyof typeof WAITING_SIGNALS, { waiting: string }>),
};

/**
 * The value an event field is compared with to mean "the player's entity" (resolved per frame
 * from `TutFrame.playerId`): `world.arrived`, `inventory.changed`, `combat.cast` and the like
 * fire for every entity, the onboarding only cares about the player's.
 */
export const PLAYER = '$player';

/**
 * Comparisons: the usual ones; `prefix` and `suffix` over strings (a flag family such as
 * `npc.<npc>.potential_seen`); `item_kind` and `equippable` read the item an event names
 * through the frame's item lookup (an evidence item gained, a wearable piece gained).
 */
export type TutCondOp =
  | 'truthy'
  | 'falsy'
  | 'eq'
  | 'ne'
  | 'gte'
  | 'gt'
  | 'lte'
  | 'lt'
  | 'prefix'
  | 'suffix'
  | 'item_kind'
  | 'equippable';

/** A registered world-state variable, read through the registry (D-076). */
export interface FlagCond {
  kind: 'flag';
  flag: string;
  op: TutCondOp;
  value?: FlagValue;
}

/** A test of one field of an event's data (`key` of `flag.changed`, ...). */
export interface EventWhere {
  field: string;
  op: TutCondOp;
  value?: FlagValue;
}

/** A kernel event kind, with optional predicates over fields of its data (all must hold). */
export interface EventCond {
  kind: 'event';
  event: EventKind;
  where?: readonly EventWhere[];
}

export interface SignalCond {
  kind: 'signal';
  signal: TutSignal;
}

/** A signal that has held for `ms` without the paired `until` signal arriving. */
export interface TimerCond {
  kind: 'timer';
  signal: TutSignal;
  ms: number;
  until?: TutSignal;
}

export interface WindowCond {
  kind: 'window';
  /** the window id (not named window: the client purity guard reads that as the DOM global) */
  win: TutWindow;
}

/** Done as soon as the step has been shown (the 17.5 rows that read "看到即完成"). */
export interface SeenCond {
  kind: 'seen';
}

/** Done `ms` after the step was shown (the 17.5 rows that read "或 N 秒"). */
export interface ElapsedCond {
  kind: 'elapsed';
  ms: number;
}

/** Nothing in the client fires it: the story or the written content teaches it. */
export interface StoryCond {
  kind: 'story';
}

/** An event that has happened `n` times (the third monster met, the second companion). */
export interface CountCond {
  kind: 'count';
  event: EventCond;
  n: number;
}

export interface AnyCond {
  kind: 'any';
  of: readonly TutCond[];
}

export type TutCond =
  | FlagCond
  | EventCond
  | SignalCond
  | TimerCond
  | WindowCond
  | SeenCond
  | ElapsedCond
  | StoryCond
  | CountCond
  | AnyCond;

/** A step's part that shows at every level (17.5 "可跳: 否"). */
export type TutMandatory = 'bar' | 'card' | 'death_review' | 'confirm' | 'scene_prompt';

export interface TutStep {
  /** `tut_<act>_<topic>` (1.2) */
  id: string;
  act: TutAct;
  category: TutCategory;
  methods: readonly TutMethod[];
  trigger: TutCond;
  done: TutCond;
  /** every part can be turned off (17.5 "可跳"列) */
  skippable: boolean;
  /**
   * What appears at every guidance level, muted or not, when `skippable` is false: one of this
   * step's own methods (the fall's prompt), or a part another popup owns and always shows
   * (17.3: the death review and the key-choice confirm are not guidance).
   */
  mandatory?: TutMandatory;
  priority: TutPriority;
  /** another step that must be done before this one may fire (the appraisal after the ash room) */
  requires?: string;
  /** the HUD element the 亮 method outlines (its `data-hud` name) */
  glowTarget?: string;
  /** opening this window completes the step */
  windowOnOpen?: TutWindow;
  /** the client shows nothing: the story or the content data teaches it */
  silent?: boolean;
  /** counts toward the onboarding progress (tut_p_reach does not, 17.5) */
  progress: boolean;
  /**
   * Its moment is inside a scene (the quarrel, the name prompt, the trial): its bar may show
   * while the scene holds the other hints (17.4 queues the rest).
   */
  duringScene?: boolean;
  /** body paragraphs of its card beyond the first (at most 3 paragraphs, 17.2) */
  paragraphs?: 2 | 3;
  /**
   * The hint-bar id and text key to use instead of this step's own, for the two steps the
   * committed hint bar already fires itself (`HintTriggers`, move and talk): asking under its
   * id lets the bar's own "once" bookkeeping keep the two from showing twice.
   */
  barId?: string;
  barKey?: string;
}

// ---------------------------------------------------------------------------
// Builders (keep the act tables one line per step)

export const flagCond = (flag: string, op: TutCondOp = 'truthy', value?: FlagValue): FlagCond =>
  value === undefined ? { kind: 'flag', flag, op } : { kind: 'flag', flag, op, value };
export const ev = (event: EventKind, ...where: EventWhere[]): EventCond =>
  where.length ? { kind: 'event', event, where } : { kind: 'event', event };
/** A predicate over an event field. */
export const field = (name: string, op: TutCondOp, value?: FlagValue): EventWhere =>
  value === undefined ? { field: name, op } : { field: name, op, value };
/** A registered flag changing to a value that passes `op` (the `flag.changed` event). */
export const flagChanged = (flag: string, op: TutCondOp = 'truthy', value?: FlagValue): EventCond =>
  ev('flag.changed', field('key', 'eq', flag), field('value', op, value));
export const sig = (signal: TutSignal): SignalCond => ({ kind: 'signal', signal });
export const timer = (signal: TutSignal, ms: number, until?: TutSignal): TimerCond =>
  until ? { kind: 'timer', signal, ms, until } : { kind: 'timer', signal, ms };
export const win = (id: TutWindow): WindowCond => ({ kind: 'window', win: id });
export const seen = (): SeenCond => ({ kind: 'seen' });
export const after = (ms: number): ElapsedCond => ({ kind: 'elapsed', ms });
export const story = (): StoryCond => ({ kind: 'story' });
export const anyOf = (...of: TutCond[]): AnyCond => ({ kind: 'any', of });
export const count = (event: EventCond, n: number): CountCond => ({ kind: 'count', event, n });

/** The act a step belongs to, from its id. */
export function actOfId(id: string): TutAct {
  if (id.startsWith('tut_p_')) return 'p';
  if (id.startsWith('tut_a1_')) return 'a1';
  return 'any';
}

export interface StepInit {
  id: string;
  category: TutCategory;
  methods: readonly TutMethod[];
  trigger: TutCond;
  done: TutCond;
  skippable?: boolean;
  mandatory?: TutMandatory;
  priority?: TutPriority;
  requires?: string;
  glowTarget?: string;
  windowOnOpen?: TutWindow;
  silent?: boolean;
  progress?: boolean;
  duringScene?: boolean;
  paragraphs?: 2 | 3;
  barId?: string;
  barKey?: string;
}

export function step(init: StepInit): TutStep {
  const out: TutStep = {
    id: init.id,
    act: actOfId(init.id),
    category: init.category,
    methods: init.methods,
    trigger: init.trigger,
    done: init.done,
    skippable: init.skippable ?? true,
    priority: init.priority ?? 'system',
    progress: init.progress ?? true,
  };
  if (init.mandatory !== undefined) out.mandatory = init.mandatory;
  if (init.requires !== undefined) out.requires = init.requires;
  if (init.glowTarget !== undefined) out.glowTarget = init.glowTarget;
  if (init.windowOnOpen !== undefined) out.windowOnOpen = init.windowOnOpen;
  if (init.silent !== undefined) out.silent = init.silent;
  if (init.duringScene !== undefined) out.duringScene = init.duringScene;
  if (init.paragraphs !== undefined) out.paragraphs = init.paragraphs;
  if (init.barId !== undefined) out.barId = init.barId;
  if (init.barKey !== undefined) out.barKey = init.barKey;
  return out;
}

/** The text-key base of a step: `tut_a1_first_fight` reads `tut.a1_first_fight.*` (20.2). */
export function keyBase(id: string): string {
  return `tut.${id.replace(/^tut_/, '')}`;
}

/** The text keys a step needs, from its methods (the check verifies each one exists). */
export function textKeysOf(s: TutStep): string[] {
  const base = keyBase(s.id);
  const out: string[] = [];
  if (s.methods.includes('card')) {
    out.push(`${base}.title`, `${base}.body`);
    if (s.paragraphs === 2 || s.paragraphs === 3) out.push(`${base}.body2`);
    if (s.paragraphs === 3) out.push(`${base}.body3`);
  }
  if (s.methods.includes('bar')) out.push(s.barKey ?? `${base}.bar`);
  if (s.methods.includes('notify')) out.push(`${base}.notify`);
  return out;
}

/** The hint-bar id a step asks under (its own id unless it defers to the bar's, above). */
export function barIdOf(s: TutStep): string {
  return s.barId ?? s.id;
}

/** Every leaf of a condition (the members of `any`, the event of `count`). */
export function leaves(cond: TutCond): TutCond[] {
  if (cond.kind === 'any') return cond.of.flatMap(leaves);
  if (cond.kind === 'count') return [cond.event];
  return [cond];
}

/** The mandatory part is one of the step's own methods (it shows even at guidance off). */
export function ownMandatory(s: TutStep): TutMethod | null {
  const m = s.mandatory;
  return (m === 'bar' || m === 'card') && s.methods.includes(m) ? m : null;
}

/** The windows a condition names (a card a window's opening asks for skips the pacing, 17.4). */
export function windowsOf(cond: TutCond): TutWindow[] {
  return leaves(cond).flatMap((c) => (c.kind === 'window' ? [c.win] : []));
}

/**
 * A completion of the "看到即完成" kind: the bar the step showed ends on its own 12 s
 * (17.2); finishing it at once would cut it short or drop it before it ever showed.
 */
export function endsWhenSeen(step: TutStep): boolean {
  return leaves(step.done).some((c) => c.kind === 'seen');
}
