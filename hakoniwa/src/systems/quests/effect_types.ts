// The shared effect vocabulary of the narrative systems. Scene nodes, scene choices,
// quest stages and quest rewards all describe their consequences as Effect lists, so
// the editor can render one form and the content validator can check one schema.
// Every effect may carry `when`, a reveal-ledger condition; it applies only when true.

import type { FlagValue } from '../../core/contracts';

/** The six door-hint leanings of the prologue (prologue_antechamber.md 4.8). */
export type DoorHint = 'blade' | 'beast' | 'breath' | 'pact' | 'shadow' | 'spirit';

export const DOOR_HINTS: readonly DoorHint[] = [
  'blade',
  'beast',
  'breath',
  'pact',
  'shadow',
  'spirit',
];

export type LineKind = 'say' | 'think' | 'narrate' | 'divine';

/**
 * The eight kinds of key (power_system.md 9.4; thousand_doors.md 5.1): history (deed), item,
 * bond, choice, place, rank, knowledge (know) and time.
 */
export const KEY_KINDS = [
  'deed',
  'item',
  'bond',
  'choice',
  'place',
  'rank',
  'know',
  'time',
] as const;
export type KeyKind = (typeof KEY_KINDS)[number];

/** Named computations the content may trigger (kept in code, not data). */
export type ComputeFn =
  | 'prologue_door_hints'
  | 'court_verdicts'
  | 'janu_release'
  | 'ending'
  | 'act5_outcome'
  | 'review_score';

export type EffectBody =
  /** set a world flag */
  | { type: 'flag'; key: string; value: FlagValue }
  /** add to a numeric flag, optionally clamped */
  | { type: 'add'; key: string; amount: number; min?: number; max?: number }
  /** add a member to a comma-joined set flag */
  | { type: 'append'; key: string; value: string }
  /** copy one flag into another */
  | { type: 'copy'; key: string; from: string }
  /** goddess impression of the player, -3..3 (prologue 4.1) */
  | { type: 'impression'; goddess: string; amount: number }
  /** goddess interest in the player, 0..3 */
  | { type: 'interest'; goddess: string; amount: number }
  /** goddess relation with the player, -100..100 */
  | { type: 'relation'; goddess: string; amount: number }
  /** a memory tag in a goddess's private memory (max three, newest kept); goddess 'all' */
  | { type: 'memory'; goddess: string; tag: string }
  /** a prologue door hint (+1 by default) */
  | { type: 'hint'; door: DoorHint; amount?: number }
  /** start a quest */
  | { type: 'quest'; quest: string }
  /** give the player an item */
  | { type: 'item'; item: string; count?: number }
  /** take an item from the player (silently ignored when missing) */
  | { type: 'take'; item: string; count?: number }
  /** money in copper (negative spends what the player has) */
  | { type: 'money'; amount: number }
  /** experience for the player (combat applies it through xp.awarded) */
  | { type: 'xp'; amount: number; reason?: string }
  /** move the player; location id wins over x and y */
  | { type: 'teleport'; mapId: string; location?: string; x?: number; y?: number }
  /** unlock a gameplay feature (flag feature.<name> plus feature.unlocked) */
  | { type: 'feature'; feature: string }
  /** recruit a companion (flag companion.<id>.recruited) */
  | { type: 'companion'; id: string }
  /** ask combat to spawn a wave (flag combat.wave.<id> = go) */
  | { type: 'wave'; wave: string }
  /** ask warfare for a battle (flag war.pending = scenario id) */
  | { type: 'war'; scenario: string }
  /** request a scene (flag scene.pending) */
  | { type: 'scene'; scene: string }
  /** change the story act (quests owns the act) */
  | { type: 'act'; act: string }
  /** player appearance from the spirit mirror */
  | { type: 'appearance'; base: string; colors: string[] }
  /** the player's chosen name, read from a flag written by an input node */
  | { type: 'name'; from: string }
  /** a scripted Maker revelation from the goddess content table */
  | { type: 'revelation'; id: string }
  /** a named computation implemented in code */
  | { type: 'compute'; fn: ComputeFn }
  /** emit one dialogue line (quests use it for short barks) */
  | { type: 'line'; speaker: string; text: string; kind?: LineKind }
  /**
   * open an interface (catalog_cutscenes.md 4.1.2 `效果 ui`, 13.6): in a scene the run waits
   * until the client closes it, then goes on to the node's or the choice's target; the
   * interface's result (the spirit mirror's appearance) is written to `storeAs`. Outside a
   * scene it does nothing.
   */
  | { type: 'ui'; ui: UiEffectId; storeAs?: string }
  /**
   * a key event (catalog_quests_acts1_3.md 1.6): the quest grants one key of a door; the
   * doors system decides the door (flag door_key.<doorId>.<keyId> = keyKind, event quest.key)
   */
  | { type: 'key'; doorId: string; keyKind: KeyKind; keyId: string };

export type Effect = EffectBody & { when?: string };

export type EffectType = Effect['type'];

export const EFFECT_TYPES: readonly EffectType[] = [
  'flag',
  'add',
  'append',
  'copy',
  'impression',
  'interest',
  'relation',
  'memory',
  'hint',
  'quest',
  'item',
  'take',
  'money',
  'xp',
  'teleport',
  'feature',
  'companion',
  'wave',
  'war',
  'scene',
  'act',
  'appearance',
  'name',
  'revelation',
  'compute',
  'line',
  'key',
  'ui',
];

/**
 * Interfaces a `ui` effect may open (ux_and_onboarding.md 3.4.3, 8.5, 8.7): the spirit mirror,
 * the credits and the memories carried over. Interface ids, not content ids.
 */
export const UI_EFFECT_IDS = ['ui_mode_creator', 'ui_mode_credits', 'ui_pop_deja'] as const;

export type UiEffectId = (typeof UI_EFFECT_IDS)[number];
