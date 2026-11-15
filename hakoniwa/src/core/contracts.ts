// Extensible type registries. Every system adds its own entries with TypeScript
// module augmentation, so the core never needs to know about individual systems:
//
//   declare module '../../core/contracts' {
//     interface WorldSlices { combat: CombatState }
//     interface EventMap { 'combat.kill': { killer: string; victim: string } }
//     interface CommandMap { 'combat.cast': { casterId: string; abilityId: string; targetId?: string } }
//     interface ContentMap { abilities: AbilityDef[] }
//   }
//
// See docs/50_tech/architecture.md 4.3 to 4.6.

export type FlagValue = number | boolean | string;

/** Per-system state slices stored on the world. */
// biome-ignore lint/suspicious/noEmptyInterface: filled by module augmentation
export interface WorldSlices {}

/** Facts that happened. Core entries are declared here; systems augment. */
export interface EventMap {
  'command.result': {
    kind: string;
    ok: boolean;
    code?: string;
    reason?: string;
    source: CommandSource;
  };
  'flag.changed': { key: string; value: FlagValue; previous: FlagValue | undefined };
  'ai.requested': { requestId: string; agentId: string; role: string; purpose: string };
  'ai.resolved': {
    requestId: string;
    agentId: string;
    outcome: 'proposal' | 'fallback' | 'declined' | 'expired';
  };
}

/** Inputs that may change the world. Core entries are declared here; systems augment. */
export interface CommandMap {
  'flag.set': { key: string; value: FlagValue };
}

/** Static content tables loaded from data/ and passed to every system. */
// biome-ignore lint/suspicious/noEmptyInterface: filled by module augmentation
export interface ContentMap {}

export type EventKind = keyof EventMap;
export type CommandKind = keyof CommandMap;

export interface WorldEvent<K extends EventKind = EventKind> {
  kind: K;
  tick: number;
  /** monotonically increasing per world, stable ordering key */
  seq: number;
  data: EventMap[K];
}

export type AnyWorldEvent = { [K in EventKind]: WorldEvent<K> }[EventKind];

export type CommandSource =
  | { type: 'player' }
  | { type: 'ai'; agentId: string; requestId: string }
  | { type: 'fallback'; agentId: string; requestId: string }
  | { type: 'system'; system: string }
  | { type: 'script'; script: string };

export interface Command<K extends CommandKind = CommandKind> {
  kind: K;
  data: CommandMap[K];
  source: CommandSource;
}

export type AnyCommand = { [K in CommandKind]: Command<K> }[CommandKind];

export type CommandResult =
  | { ok: true; info?: string }
  | { ok: false; code: string; reason: string };

export const ok = (info?: string): CommandResult => (info ? { ok: true, info } : { ok: true });
export const reject = (code: string, reason: string): CommandResult => ({
  ok: false,
  code,
  reason,
});
