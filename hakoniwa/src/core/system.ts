// The game-system seam. Each system is its own module under src/systems/<name>/ and
// registers a GameSystem: an id, a phase order, slice initialisation, a per-tick
// update, command handlers and event subscriptions. Systems read other systems only
// through those systems' exported query functions. See docs/50_tech/architecture.md 4.6.

import type { AiPort } from './ai_port';
import type { BrainTrace } from './brain/trace';
import type {
  CommandKind,
  CommandMap,
  CommandResult,
  CommandSource,
  ContentMap,
  EventKind,
  EventMap,
  FlagValue,
  WorldEvent,
} from './contracts';
import type { Rng } from './rng';
import type { World } from './world';

export interface SystemContext {
  readonly world: World;
  readonly content: ContentMap;
  readonly tick: number;
  /** Named deterministic stream; use the system id or a sub-name like 'combat.loot'. */
  rng(stream: string): Rng;
  emit<K extends EventKind>(kind: K, data: EventMap[K]): void;
  /** Queue a command for the next tick (source defaults to this system). */
  dispatch<K extends CommandKind>(kind: K, data: CommandMap[K], source?: CommandSource): void;
  readonly ai: AiPort;
  /** Deterministic id: prefix plus a per-prefix counter. */
  newId(prefix: string): string;
  flag(key: string): FlagValue | undefined;
  setFlag(key: string, value: FlagValue): void;
  /**
   * Record one built-in decision explanation (builtin_ai.md 2.6, 15): any brain (NPC,
   * goddess, ruler, general, companion, official, the director) pushes its trace here
   * after a utility pick, a rule-table firing or an HTN step. Kept in memory only, per
   * actor, dropped oldest first (TRACE_RING); never saved (recomputable from the save and
   * the tick). The debug panel's brain inspector reads it back through `recentTraces`.
   */
  brainTrace(trace: BrainTrace): void;
}

export type CommandHandler<K extends CommandKind> = (
  ctx: SystemContext,
  data: CommandMap[K],
  source: CommandSource,
) => CommandResult;

export type EventHandler<K extends EventKind> = (ctx: SystemContext, event: WorldEvent<K>) => void;

/**
 * How the next engine step advances the clock during a time skip
 * (travel_and_exploration.md 7.5). The system that runs skips answers it from world state,
 * so a replay takes the same steps.
 */
export interface SkipClockStep {
  /**
   * Game ticks the step covers: 1 is an ordinary tick (the short, tick-by-tick tier);
   * more is an hour-coarse step of the long tier, which runs `skip` instead of `tick`.
   */
  stride: number;
  /**
   * Model requests filed during the skip are held (ai_port.ts): decisions fall back to the
   * built-in AI at once, and up to `backfill` text-only requests wait for the skip's end.
   * Null when nothing is held.
   */
  hold: { backfill: number } | null;
}

/** One hour-coarse skip step: the clock went from `from` to `to` (ctx.tick) at once. */
export interface SkipStep {
  from: number;
  to: number;
}

export interface GameSystem {
  id: string;
  /** Phase order; lower runs first (see architecture.md 4.6). */
  order: number;
  /** Create this system's slice on a fresh world. */
  init?(ctx: SystemContext): void;
  /** Backfill this owner's loaded state once, before any resumed command or tick. */
  resume?(ctx: SystemContext): void;
  tick?(ctx: SystemContext): void;
  commands?: { [K in CommandKind]?: CommandHandler<K> };
  on?: { [K in EventKind]?: EventHandler<K> };
  /**
   * The time-skip clock: before each step the engine asks the systems that define it (in
   * phase order, the first answer wins) how the step advances. Null or absent: one tick.
   */
  clock?(world: World): SkipClockStep | null;
  /**
   * The system's hour-coarse skip handler (travel_and_exploration.md 7.5): on a step whose
   * stride is above 1 it runs instead of `tick`, after the clock has jumped. A system with
   * no handler stands still for that step. Handlers are registered with
   * registerSkipHandler (src/systems/travel/skip.ts).
   */
  skip?(ctx: SystemContext, step: SkipStep): void;
}
