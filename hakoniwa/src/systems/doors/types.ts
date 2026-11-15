// Thousand Doors (千门回廊) types: door content, keys (钥), effects, per-door state and
// the doors slice, plus the events and commands doors registers.
// Canon: docs/20_world/power_system.md 9 (doors, keys, states, inner court, seal).

import type { FlagValue } from '../../core/contracts';
import type { ResourceKind, StatBlock } from '../combat/types';

export type DoorCategory =
  | 'origin'
  | 'insight'
  | 'vocation'
  | 'school'
  | 'craft'
  | 'bond'
  | 'passage'
  | 'domain'
  | 'truth'
  | 'forbidden'
  | 'last';

/** A key condition. Every key carries a short Chinese label for the corridor view. */
export type KeyCond =
  /** a flag is truthy, equals a value, or (numbers) is at least `min` */
  | { type: 'flag'; key: string; equals?: FlagValue; min?: number; label: string }
  /**
   * count events of a kind whose data fields equal `where` (and are at least `atLeast`),
   * for example combat.kill where { family: 'beast', killerSide: 'ally' }
   */
  | {
      type: 'count';
      event: string;
      where?: Record<string, FlagValue>;
      atLeast?: Record<string, number>;
      count: number;
      label: string;
    }
  /** the player holds an item (optionally consumed when the door opens) */
  | { type: 'item'; itemId: string; count?: number; consume?: boolean; label: string }
  /** the player's level (门阶) */
  | { type: 'level'; min: number; label: string }
  /** the player has stood on a map, or inside one of its locations */
  | { type: 'visit'; mapId: string; location?: string; label: string }
  /** another door is open */
  | { type: 'door'; doorId: string; label: string }
  /** at least `need` (default 1) of the listed keys */
  | { type: 'any'; of: KeyCond[]; need?: number; label: string };

export type DoorEffect =
  | { type: 'abilities'; abilities: string[] }
  | { type: 'stats'; stats: StatBlock }
  /** a resource pool for the outsider (R-02); mana `base` is the level-1 size */
  | { type: 'pool'; resource: ResourceKind; base: number }
  | { type: 'passive'; aura: string }
  /** sets feature.<name> = true and emits feature.unlocked */
  | { type: 'feature'; feature: string }
  | { type: 'flag'; key: string; value: FlagValue }
  | { type: 'item'; itemId: string; count?: number; equip?: boolean };

export interface DoorDef {
  id: string;
  name: string;
  /** canonical code from power_system.md 9.9 */
  code?: string;
  category: DoorCategory;
  /** 0 prologue, 1 to 6 acts, 7 finale */
  act: number;
  /** the vague hint shown while the keys are unknown */
  hint: string;
  /** what the door gives, shown once open */
  desc: string;
  keys: KeyCond[];
  /** any of these reveals the door as hinted (default: any key met, or flag door_hint.<id>) */
  reveal?: KeyCond[];
  effects: DoorEffect[];
  /** doors sharing a group are mutually exclusive: opening one locks the rest */
  exclusive?: string[];
  danger?: boolean;
  closable?: boolean;
  /** story doors open as soon as their keys are met */
  auto?: boolean;
  /** open by itself this many seconds after becoming openable (the door that opens on its own) */
  autoAfter?: number;
  /** increments of the hidden seal variables (decision D-031) */
  sealLooseness: number;
  sealUnrest: number;
}

export type DoorStatus = 'hidden' | 'hinted' | 'openable' | 'opened' | 'locked' | 'closed';

export interface DoorRuntime {
  state: DoorStatus;
  /** tick the current state began */
  since: number;
  openedTick?: number;
}

export interface DoorsSlice {
  doors: Record<string, DoorRuntime>;
  /** event counters keyed `${doorId}:${keyPath}` */
  counters: Record<string, number>;
  /** `map:<id>` and `loc:<mapId>/<locationId>` the player has visited */
  visited: Record<string, true>;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    doors: DoorsSlice;
  }
  interface ContentMap {
    doors: DoorDef[];
  }
  interface EventMap {
    'doors.state': { doorId: string; from: DoorStatus; to: DoorStatus };
    'doors.closed': { doorId: string; sealDelta: number };
  }
  interface CommandMap {
    'doors.open': { doorId: string };
    'doors.close': { doorId: string };
  }
}
