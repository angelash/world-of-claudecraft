// The game-system seam. Each system is its own module under src/systems/<name>/ and
// registers a GameSystem: an id, a phase order, slice initialisation, a per-tick
// update, command handlers and event subscriptions. Systems read other systems only
// through those systems' exported query functions. See docs/50_tech/architecture.md 4.6.

import type { AiPort } from './ai_port';
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
}

export type CommandHandler<K extends CommandKind> = (
  ctx: SystemContext,
  data: CommandMap[K],
  source: CommandSource,
) => CommandResult;

export type EventHandler<K extends EventKind> = (ctx: SystemContext, event: WorldEvent<K>) => void;

export interface GameSystem {
  id: string;
  /** Phase order; lower runs first (see architecture.md 4.6). */
  order: number;
  /** Create this system's slice on a fresh world. */
  init?(ctx: SystemContext): void;
  tick?(ctx: SystemContext): void;
  commands?: { [K in CommandKind]?: CommandHandler<K> };
  on?: { [K in EventKind]?: EventHandler<K> };
}
