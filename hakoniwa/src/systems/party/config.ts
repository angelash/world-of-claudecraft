// The party's numbers (data/party/config.json) with the design values as the fallback, so a
// content set without the table (a test pack) runs the same rules. Sources: companions_and_
// party.md 3.1 (places), 4.2 (experience), 7.1 (retreat), 7.3 (big abilities), 8.3 and 8.4
// (bond), 8.5 (red lines), 11.2 to 11.4 (grave injury, rest, spring); progression_and_pacing
// .md 9 (exposure); thousand_doors.md 3.7 and 15 (retainers, the half-pact).

import type { ContentMap, FlagValue } from '../../core/contracts';
import type { World } from '../../core/world';
import { calendarTerms } from '../quests/calendar_terms';
import { evaluate, flagResolver } from '../quests/conditions';
import type { BanterConfig, CompanionDef, PartyConfig, TacticsConfig } from './types';

export const DEFAULT_PARTY_CONFIG: PartyConfig = {
  slots: { byAct: { prologue: 3, act1: 3 }, default: 4 },
  catchUp: [
    { below: 8, factor: 3 },
    { below: 3, factor: 2 },
  ],
  levelCapOverPlayer: 2,
  awayShare: 0.5,
  bondGates: [
    { stage: 2, max: 59 },
    { stage: 3, max: 79 },
    { stage: 4, max: 89 },
  ],
  bondKill: { boss: 2, elite: 0.5, normal: 0.05, perDay: 3, range: 20 },
  gift: { base: 1, perQuality: 1, liked: 2, perWeek: 3 },
  coldAfter: 3,
  rest: { baseDays: 2, fatalDays: 1, repeatDays: 1, repeatWindowDays: 7, minDays: 1, maxDays: 4 },
  fatalShare: 0.5,
  getUpSec: 15,
  getUpHp: 0.5,
  spring: { days: 7, servantDays: 14, petDays: 3 },
  retreat: { base: 0.25, span: 0.15 },
  bigCooldown: 60,
  exposure: { named: true, immuneTags: ['door_mark'], crystalTaint: 50 },
  pets: { requires: '', overPlayer: 2 },
  retainers: { requires: '', slots: 2, fatigue: 20 },
  tempObjectives: ['escort', 'rescue', 'accompany'],
};

/**
 * The stance score of builtin_ai.md 11.1 (weight 3, state 2, protect 3, foes 1, inertia 1,
 * the player under half health, two hard fights in a row) with the proposed readings of
 * "full", "low", "hard" and "known" (progress.md of PK-M1-21, user decisions).
 */
export const DEFAULT_TACTICS: TacticsConfig = {
  auto: true,
  weight: 3,
  state: 2,
  protect: 3,
  foes: 1,
  inertia: 1,
  protectBelow: 0.5,
  hardStreak: 2,
  fullHp: 0.8,
  fullMana: 0.5,
  lowMana: 0.3,
  lowPotions: 1,
  hardHp: 0.5,
  sight: 20,
  openingSec: 3,
};

/**
 * Chatter pacing: 8.2 (no chatter under bond 20), 10.1 (one exchange per 10 real minutes
 * exploring, one per 30 game minutes of travel, one to three a campfire night); the line
 * and reply seconds, the freshness and the relevance are proposals.
 */
export const DEFAULT_BANTER: BanterConfig = {
  minBond: 20,
  campTalkBond: 40,
  lineSec: 4,
  replySec: 15,
  exploreGap: 10 * 60 * 20,
  travelGap: 30 * 20,
  campfireMax: 3,
  freshPerDay: 0.1,
  relevance: 2,
  journeyRoles: ['field'],
};

export function partyConfig(content: ContentMap): PartyConfig {
  return content.partyConfig ?? DEFAULT_PARTY_CONFIG;
}

export function tacticsConfig(content: ContentMap): TacticsConfig {
  return { ...DEFAULT_TACTICS, ...partyConfig(content).tactics };
}

export function banterConfig(content: ContentMap): BanterConfig {
  return { ...DEFAULT_BANTER, ...partyConfig(content).banter };
}

export function companionDef(content: ContentMap, id: string): CompanionDef | undefined {
  return (content.companions ?? []).find((c) => c.id === id);
}

/** Companion places in the party for an act flag value (3.1: three in act 1, four from act 2). */
export function slotsFor(cfg: PartyConfig, act: FlagValue | undefined): number {
  const key = typeof act === 'string' ? act : '';
  return cfg.slots.byAct[key] ?? cfg.slots.default;
}

/** The completed personal-line segment of a companion (`pl.<id>`, 9.1). */
export function lineStage(world: World, id: string): number {
  const v = world.meta.flags[`pl.${id}`];
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Whether a condition in the reveal-ledger syntax holds now: the world's flags with the
 * calendar terms (`act_week` and the like). Read through the pure condition modules only.
 */
export function holds(ctx: { world: World; tick: number }, expr: string | undefined): boolean {
  if (!expr) return true;
  const resolve = flagResolver(ctx.world.meta.flags, {
    ...calendarTerms(ctx.tick),
    ai_enabled: ctx.world.ai.mode !== 'off',
  });
  return evaluate(expr, resolve);
}
