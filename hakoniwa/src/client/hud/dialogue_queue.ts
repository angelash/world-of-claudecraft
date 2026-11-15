// Loose-line queue for the conversation box: dialogue.line events addressed to the player
// outside an open talk or a scene (goddess speech, narration, barks to the player), shown
// one at a time and advanced with Space. Open talks and scenes have their own views. Pure.

import type { EventMap } from '../../core/contracts';

export type DialogueLine = EventMap['dialogue.line'];

export const MAX_QUEUED_LINES = 40;

/** Lines that belong in the box (ambient chatter stays a bubble). */
export function belongsInBox(line: DialogueLine, playerId: string): boolean {
  if (line.kind === 'narrate' || line.kind === 'divine') return true;
  return line.listenerId === playerId || line.speakerId === playerId;
}

export class DialogueQueue {
  private queue: DialogueLine[] = [];
  current: DialogueLine | null = null;

  /** Accept a line; returns true when it entered the box. */
  push(line: DialogueLine, playerId: string): boolean {
    if (!belongsInBox(line, playerId)) return false;
    if (!this.current) this.current = line;
    else {
      this.queue.push(line);
      if (this.queue.length > MAX_QUEUED_LINES) this.queue.shift();
    }
    return true;
  }

  /** Space: show the next line; returns the new current line (null when the box empties). */
  advance(): DialogueLine | null {
    this.current = this.queue.shift() ?? null;
    return this.current;
  }

  get pending(): number {
    return this.queue.length;
  }

  get open(): boolean {
    return !!this.current;
  }

  close(): void {
    this.queue = [];
    this.current = null;
  }
}
