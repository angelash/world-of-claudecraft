// Dialogue system types: the open conversation and the module augmentation for its slice,
// events and commands (the line packs and their content table are ./lines/types.ts).

import type { TextParam } from '../../core/text';
import type { LineHistory } from './lines/history';

export interface SessionLine {
  speakerId: string;
  speakerName: TextParam;
  text: TextParam;
  kind: 'say' | 'think' | 'narrate' | 'divine';
  tick: number;
}

export interface SessionOption {
  id: string;
  label: TextParam;
  hint?: TextParam;
  /** offering system; 'dialogue' for the built-in options */
  system: string;
}

export interface DialogueSession {
  id: string;
  /** NPC entity id */
  npcId: string;
  /** persona id (entity ref) */
  npcRef: string;
  name: string;
  mapId: string;
  openedTick: number;
  lastTick: number;
  /** bumped on every player input; replies carrying an older revision are stale */
  rev: number;
  lines: SessionLine[];
  options: SessionOption[];
  /** waiting for the NPC's reply (model or fallback) */
  pending: boolean;
  /** a line of this talk recalled a memory or a diary entry (builtin_ai.md 14.2 metric 9) */
  recalled?: boolean;
}

export interface DialogueSlice {
  session: DialogueSession | null;
  /** persona id -> game day of the last small-talk relation bonus */
  chatDay: Record<string, number>;
  /** persona or resident id -> tick of the first conversation with the player */
  met: Record<string, number>;
  /**
   * Anti-farming for the intent classifier's R7 relation writes (builtin_ai.md 5.5: "同一
   * 意图对同一人的关系增益每游戏日只计一次"). Keyed "<npcRef>:<intent>" to the game day the
   * gain last counted.
   */
  intentRelDay: Record<string, number>;
  /**
   * Line history of each speaker toward the player (builtin_ai.md 7.7 and 18: at most 64
   * keys per pair); created on first use, so saves written before it have none.
   */
  lines?: Record<string, LineHistory>;
  /** Bark history of each speaker (3 game days; kept so a load does not reset it). */
  barks?: Record<string, LineHistory>;
  /** Barks said at each place (`<map>/<location>`) in the last two game hours. */
  placeBarks?: Record<string, { key: string; tick: number }[]>;
  /** Offenses the player gave each person today (the third one ends the talk, builtin_ai 6.1). */
  offenses?: Record<string, { day: number; n: number }>;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    dialogue: DialogueSlice;
  }
  interface EventMap {
    'dialogue.opened': { sessionId: string; npcId: string; npcRef: string };
    'dialogue.closed': {
      sessionId: string;
      npcId: string;
      reason: string;
      /** a line of the talk recalled a memory or a diary entry (alive metric 9) */
      recalled?: boolean;
    };
  }
  interface CommandMap {
    /** Start talking to an NPC entity within reach. */
    'dialogue.talk': { npcId: string };
    /** Say free text to the NPC in the open conversation. */
    'dialogue.say': { text: string };
    /** Pick an option of the open conversation (built-in or offered by another system). */
    'dialogue.choose': { optionId: string };
    'dialogue.close': Record<string, never>;
    /** The NPC's answer: the npc.dialogue proposal or its rule fallback. */
    'dialogue.reply': { sessionId: string; npcId: string; text: TextParam; revision: number };
  }
}
