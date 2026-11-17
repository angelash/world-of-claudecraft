// Sound captions (audio_direction.md 10.4; ux_and_onboarding.md 18.4): a sound that matters to
// play is written at the bottom of the screen in brackets with its direction, "[left] ...".
// A caption names a key `audio.cap.<id>` (the design name the data tables use); its text lives
// in the interface table as `ui.ovl.caption.<id>` (the overlay class, ux 20.2), the direction as
// `ui.ovl.caption.dir.<dir>`.
// Captions follow the setting (off, important only, all) and show even when no audio device
// exists or a sound has no file yet: they are a channel of their own, never the only one (every
// gameplay sound also has a picture). The board keeps at most three lines, each for 3 s, and
// refreshes a line instead of repeating it. Pure: the caller passes the clock.

import { type CaptionSetting, captionShown } from './audio_settings';
import type { Direction } from './spatializer';

export interface CaptionRequest {
  /** audio.cap.<id> */
  key: string;
  level: 'important' | 'all';
  direction: Direction | null;
}

export interface CaptionLine {
  /** The caption id: its text is `ui.ovl.caption.<cap>`. */
  cap: string;
  /** The direction: its text is `ui.ovl.caption.dir.<dir>`. */
  dir: Direction | null;
  level: 'important' | 'all';
  /** Until when the line shows. */
  untilMs: number;
}

export const CAPTION_LINES = 3;
export const CAPTION_MS = 3000;

const DESIGN_KEY = /^audio\.cap\.([a-z0-9_]+)$/;

/** The caption id of a caption key (audio.cap.x to x), or null when malformed. */
export function captionId(key: string): string | null {
  return DESIGN_KEY.exec(key)?.[1] ?? null;
}

export class CaptionBoard {
  private lines: CaptionLine[] = [];
  private version = 0;

  /** Add or refresh a caption; returns whether it shows under the setting. */
  push(req: CaptionRequest, mode: CaptionSetting, nowMs: number): boolean {
    if (!captionShown(req.level, mode)) return false;
    const cap = captionId(req.key);
    if (!cap) return false;
    this.prune(nowMs);
    const same = this.lines.find((l) => l.cap === cap);
    if (same) {
      same.untilMs = nowMs + CAPTION_MS;
      same.dir = req.direction;
      this.version++;
      return true;
    }
    this.lines.push({ cap, dir: req.direction, level: req.level, untilMs: nowMs + CAPTION_MS });
    // Important lines outlive the others when the board is full.
    while (this.lines.length > CAPTION_LINES) {
      const drop = this.lines.findIndex((l) => l.level === 'all');
      this.lines.splice(drop >= 0 ? drop : 0, 1);
    }
    this.version++;
    return true;
  }

  private prune(nowMs: number): void {
    const before = this.lines.length;
    this.lines = this.lines.filter((l) => l.untilMs > nowMs);
    if (this.lines.length !== before) this.version++;
  }

  /** The lines on screen now, oldest first. */
  active(nowMs: number): readonly CaptionLine[] {
    this.prune(nowMs);
    return this.lines;
  }

  /** Changes on every push or expiry: the painter redraws only then. */
  stamp(nowMs: number): number {
    this.prune(nowMs);
    return this.version;
  }

  clear(): void {
    if (this.lines.length > 0) this.version++;
    this.lines = [];
  }
}
