// Tuning constants for the NPC system. Initial values, marked "待调" in the design
// (npc_society_ai.md 1.3, 6.3, 7.2); change them here, not inline.

import { TICKS_PER_GAME_HOUR, TICKS_PER_GAME_MINUTE } from '../../core/time';

/** NPC-to-NPC chat roll cadence (every 15 game minutes). */
export const CHAT_TICKS = 15 * TICKS_PER_GAME_MINUTE;
/** A resident chats at most once per this many ticks. */
export const CHAT_COOLDOWN = 45 * TICKS_PER_GAME_MINUTE;
/** Base probability that two eligible residents at one place start talking. */
export const CHAT_BASE = 0.35;
/** Model-worded chat lines for one L1 NPC at most once per game hour. */
export const SAY_AI_COOLDOWN = TICKS_PER_GAME_HOUR;
/** Deadlines for AI requests (ticks). */
export const DAILY_DEADLINE = 600;
export const CHAT_DEADLINE = 100;
export const DIARY_DEADLINE = 1200;
/** Player conversation freezes the NPC's schedule up to 10 game minutes past the last line. */
export const FREEZE_TICKS = 10 * TICKS_PER_GAME_MINUTE;
/** Dawn hour of the daily plan round. */
export const DAWN_HOUR = 5;

/** Need decay per game hour (awake) and the "reconsider" lines (design 3.2: 35, reset at 45). */
export const NEED_DECAY = { hunger: 5, energy: 4, social: 3, faith: 1.5, duty: 8 };
export const NEED_RECONSIDER = 35;
/** A latched need layer lets go once every need is back at this (builtin_ai 2.4). */
export const NEED_RELEASE = 45;
export const NEED_CRITICAL = 18;

/** Need gains per game hour of the satisfying activity. */
export const NEED_GAIN = {
  eat: 45,
  sleep: 12,
  chat: 14,
  pray: 25,
  shop: 4,
  wander: 4,
  duty: 12,
};

/** Baselines the event-driven needs drift back to, and their hourly drift (builtin_ai 3.3). */
export const NEED_BASE = { safety: 70, face: 70, duty: 80, peace: 70 };
export const NEED_DRIFT = { safety: 10, face: 2, duty: 2, peace: 1 };

/** Meal prices in copper (society.md 9.3: tavern meal 12, black bread 2). */
export const MEAL_TAVERN = 12;
export const MEAL_HOME = 2;
/** Default wage per working hour in copper (a day laborer earns about 40 copper a day). */
export const DEFAULT_WAGE = 5;

/** Tier thresholds (npc_society_ai.md 1.3). */
export const L1_SCORE = 60;
export const L2_SCORE = 40;
export const L1_CAP = 12;
export const L1_DIALOGUE_SLOTS = 2;
/** Core (written L1) NPCs are L1 only within this many tiles of the player. */
export const CORE_RADIUS = 24;

/** Memory bounds and daily consolidation. */
export const MEMORY_CAP = 40;
export const MEMORY_KEEP_IMPORTANT = 20;
export const MEMORY_KEEP_RECENT = 8;
export const DIGEST_CAP = 14;
export const RELATION_LOG_CAP = 24;
export const TRACK_CAP = 12;
export const DIARY_CAP = 20;
/** Residents per batch diary request (8 to 15 in the design). */
export const DIARY_BATCH = 15;

/** Brain evaluation beats (builtin_ai.md 3.1, 16): L1 every 10 game minutes, L2 every 30. */
export const BEAT_L1 = 200;
export const BEAT_L2 = 600;
/** Emergency layer holds 30 game minutes past the threat (builtin_ai 2.4). */
export const EMERGENCY_HOLD = 30 * TICKS_PER_GAME_MINUTE;
/** Proactive approaches: per NPC per game day, per map per game hour (builtin_ai 3.4). */
export const APPROACH_PER_HOUR = 3;
/** The player answers an approach within this many ticks, or walked away. */
export const APPROACH_WAIT = 30 * TICKS_PER_GAME_MINUTE;
/** Bark chance on a schedule beat while the player can hear (builtin_ai 4.3: 0.15). */
export const BARK_CHANCE = 0.15;
/** One bark per speaker and context per two game hours (builtin_ai 7.6). */
export const BARK_WINDOW = 2 * TICKS_PER_GAME_HOUR;
/** Hearing range of a bark and the follower's and watcher's cadence (ticks). */
export const BARK_RANGE = 14;
export const FOLLOW_TICKS = 10;
/** Stealth: watchers see the sneaking player within this many tiles (halved at night). */
export const WATCH_RADIUS = 7;
/** A cognition transition seen offscreen waits for the next talk at most 7 game days. */
export const OPENER_DAYS = 7;
/**
 * The weekday of the week's service (society.md 9.2: every seventh day) and of the market
 * day (Borderstone's salt lane market, once a week; a town's own cycle is a follow-up).
 */
export const HOLY_WEEKDAY = 7;
export const MARKET_WEEKDAY = 3;
