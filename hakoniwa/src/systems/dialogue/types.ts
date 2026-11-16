// Dialogue system types: the open conversation, line templates, and the module
// augmentation for its slice, content table, events and commands.

import type { TextParam } from '../../core/text';

export interface DialogueTemplate {
  /** dotted key, for example greet.unaware or opinion.explaining.luck */
  id: string;
  lines: string[];
}

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
}

export interface DialogueSlice {
  session: DialogueSession | null;
  /** persona id -> game day of the last small-talk relation bonus */
  chatDay: Record<string, number>;
  /** persona or resident id -> tick of the first conversation with the player */
  met: Record<string, number>;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    dialogue: DialogueSlice;
  }
  interface ContentMap {
    dialogueTemplates: DialogueTemplate[];
  }
  interface EventMap {
    'dialogue.opened': { sessionId: string; npcId: string; npcRef: string };
    'dialogue.closed': { sessionId: string; npcId: string; reason: string };
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
