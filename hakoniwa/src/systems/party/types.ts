// Party types: companion content, the party slice, events and commands.
// Companions are spawned by this system when companion.<id>.recruited turns true
// (implementation_conventions.md 3); their combat units live in the combat slice.

import type { FlagValue } from '../../core/contracts';
import type { ItemKind } from '../inventory';
import type { Appearance } from '../world/types';

export type PartyOrder = 'follow' | 'assist' | 'passive' | 'stay';
export type CompanionRole = 'tank' | 'healer' | 'melee' | 'ranged' | 'caster';

export interface CompanionDef {
  id: string;
  name: string;
  /** short line for the party window */
  title: string;
  classId: string;
  role: CompanionRole;
  /** level when first recruited (the floor while scaling) */
  level: number;
  /** companion level follows the player: max(level, playerLevel + levelOffset) */
  levelOffset: number;
  personality: string[];
  appearance: Appearance;
  /** gifts of these kinds or ids count double */
  likes?: { kinds?: ItemKind[]; items?: string[] };
  /** story flags that deepen the bond once (equals: only when the flag has that value) */
  bondFlags?: { flag: string; equals?: FlagValue; amount: number }[];
  /** abilities the rule AI never uses for this companion */
  avoid?: string[];
}

export interface Member {
  id: string;
  entityId: string;
  order: PartyOrder;
  bond: number;
  /** bond thresholds already announced */
  reached: number[];
  /** bondFlags already applied */
  told: string[];
  joinedTick: number;
  downedTick: number;
  pathAt: number;
}

export interface PartySlice {
  members: Record<string, Member>;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    party: PartySlice;
  }
  interface ContentMap {
    companions: CompanionDef[];
  }
  interface EventMap {
    'party.joined': { companionId: string; entityId: string };
    'party.left': { companionId: string };
    'party.bond': { companionId: string; bond: number; delta: number; reason: string };
    'party.order': { companionId: string; order: PartyOrder };
  }
  interface CommandMap {
    /** companionId omitted: every member */
    'party.order': { companionId?: string; order: PartyOrder };
    'party.gift': { companionId: string; itemId: string };
  }
}
