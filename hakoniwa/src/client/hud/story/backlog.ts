// The backlog (回看) of `ui_mode_cutscene` and `ui_mode_dialogue` (ux_and_onboarding.md 7.3,
// 8.2; catalog_cutscenes.md 13.3): the whole current scene run (its lines, the choices taken
// and the player's free text) or the whole open conversation, scrollable. It only reads: it
// never goes back to a node to choose again. Fed from the world's events (a scene's lines
// arrive as dialogue.line); entries keep text values (TextParam) and render when painted, so
// a language switch shows in the backlog too. Pure; Node-tested.

import type { AnyWorldEvent } from '../../../core/contracts';
import type { TextParam } from '../../../core/text';

export type BacklogKind = 'title' | 'line' | 'choice' | 'input';

export interface BacklogEntry {
  kind: BacklogKind;
  /** speaker display name ('' for narration and the player's own entries) */
  speaker: TextParam;
  text: TextParam;
  /** say, think, narrate, divine (lines only) */
  lineKind?: string;
  /** the scene of a title entry (its title renders through the content key) */
  sceneId?: string;
}

/** The backlog keeps at most this many entries (a long scene run). */
export const BACKLOG_LIMIT = 400;

export class Backlog {
  private entries: BacklogEntry[] = [];
  private inScene = false;
  /** tick of the last scene end (a scene starting on that tick chains on) */
  private endedTick = -1;

  /** The scene run's entries, oldest first. */
  list(): readonly BacklogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }

  private push(e: BacklogEntry): void {
    this.entries.push(e);
    if (this.entries.length > BACKLOG_LIMIT)
      this.entries.splice(0, this.entries.length - BACKLOG_LIMIT);
  }

  /**
   * Feed world events in order. A scene start opens a new run (the old run's entries go,
   * except when a scene chains straight into the next one, which keeps reading on);
   * dialogue lines, choices and the player's words during a scene join it.
   */
  feed(events: readonly AnyWorldEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'scene.started':
          if (!this.inScene && ev.tick !== this.endedTick) this.entries = [];
          this.inScene = true;
          this.push({ kind: 'title', speaker: '', text: ev.data.title, sceneId: ev.data.sceneId });
          break;
        case 'scene.ended':
          this.inScene = false;
          this.endedTick = ev.tick;
          break;
        case 'dialogue.line':
          if (!this.inScene) break;
          this.push({
            kind: 'line',
            speaker: ev.data.kind === 'narrate' ? '' : ev.data.speakerName,
            text: ev.data.text,
            lineKind: ev.data.kind,
          });
          break;
        case 'scene.choice':
          if (this.inScene) this.push({ kind: 'choice', speaker: '', text: ev.data.label });
          break;
        case 'player.said':
          if (this.inScene) this.push({ kind: 'input', speaker: '', text: ev.data.text });
          break;
        default:
          break;
      }
    }
  }
}

/** A conversation's backlog: every line the session keeps (dialogue LINE_CAP). */
export function conversationBacklog(
  lines: readonly { speakerName: string; text: string; kind: string }[],
): BacklogEntry[] {
  return lines.map((l) => ({
    kind: 'line',
    speaker: l.kind === 'narrate' ? '' : l.speakerName,
    text: l.text,
    lineKind: l.kind,
  }));
}
