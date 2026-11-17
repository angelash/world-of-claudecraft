// Reading pace of `ui_mode_dialogue` and `ui_mode_cutscene` (ux_and_onboarding.md 7.3, 8.2;
// catalog_cutscenes.md 13.2): the typewriter (characters revealed by elapsed real time at
// 30 or 60 characters a second, or the whole line at once), the press rule (typing: complete
// the line; complete: show the next line; last line complete: hand the press on), the
// auto-advance dwell (1.5 s plus 1 s per 8 characters) and the hold that skips a cutscene.
// Pure: the caller passes the clock (real milliseconds); Node-tested.

import type { TextSpeed } from '../../app/settings_schema';

/** Auto advance dwells this long on every line (13.2). */
export const AUTO_BASE_MS = 1500;
/** Plus one second per this many characters (13.2). */
export const AUTO_CHARS_PER_SECOND = 8;
/** Skip is a hold of Esc or B for this long (ux 8.2). */
export const SKIP_HOLD_MS = 1000;

/** Characters of a line of `length` shown after `elapsedMs` at `speed`. */
export function charsShown(length: number, speed: TextSpeed, elapsedMs: number): number {
  if (speed === 'instant' || length <= 0) return Math.max(0, length);
  const n = Math.floor((Math.max(0, elapsedMs) * speed) / 1000);
  return Math.min(length, n);
}

/** Milliseconds a line of `length` takes to type at `speed`. */
export function typingMs(length: number, speed: TextSpeed): number {
  if (speed === 'instant' || length <= 0) return 0;
  return Math.ceil((length * 1000) / speed);
}

/** How long auto advance waits after a line is complete (13.2). */
export function autoDwellMs(length: number): number {
  return AUTO_BASE_MS + Math.round((Math.max(0, length) * 1000) / AUTO_CHARS_PER_SECOND);
}

/** The first `n` characters of a text (code points, so surrogate pairs never split). */
export function firstChars(text: string, n: number): string {
  if (n <= 0) return '';
  const chars = Array.from(text);
  return n >= chars.length ? text : chars.slice(0, n).join('');
}

/** Length in code points (what the typewriter counts). */
export function textLength(text: string): number {
  return Array.from(text).length;
}

export interface ReaderState {
  /** index of the line being typed or last shown */
  line: number;
  /** characters of that line shown */
  chars: number;
  /** that line is complete */
  lineDone: boolean;
  /** every line is complete */
  allDone: boolean;
  /** when the current line became complete (null while typing) */
  doneAt: number | null;
}

export type PressResult = 'completed' | 'next' | 'end';

/**
 * Reveals one page of lines. `sequence` mode (scene nodes, loose lines) types the lines one
 * after another, each waiting for a press (or auto advance) once complete; `tail` mode (an
 * open conversation) shows the history at once and types only the newest line, which starts
 * by itself whenever a new line arrives.
 */
export class LineReader {
  private key = '';
  private lengths: number[] = [];
  private index = 0;
  private startedAt = 0;
  /** the current line was completed by a press before its time */
  private forced = false;
  /** the last state() found every line read (appended lines then type on their own) */
  private readAll = false;

  constructor(private readonly mode: 'sequence' | 'tail') {}

  /** Show `lengths` under `key`; a new key starts over, more lines under the same key extend. */
  sync(key: string, lengths: readonly number[], now: number): void {
    // a new page, or the same page shown again with fewer lines (entered anew), types afresh
    if (key !== this.key || lengths.length < this.lengths.length) {
      this.key = key;
      this.lengths = [...lengths];
      this.index = this.mode === 'tail' ? Math.max(0, lengths.length - 1) : 0;
      this.startedAt = now;
      this.forced = false;
      this.readAll = false;
      return;
    }
    const before = this.lengths.length;
    const grew = lengths.length > before;
    this.lengths = [...lengths];
    if (this.index >= lengths.length) this.index = Math.max(0, lengths.length - 1);
    if (!grew) return;
    if (this.mode === 'tail') {
      this.index = lengths.length - 1;
      this.startedAt = now;
      this.forced = false;
    } else if (this.readAll) {
      // every earlier line was read: the first appended line starts typing by itself
      this.index = before;
      this.startedAt = now;
      this.forced = false;
      this.readAll = false;
    }
  }

  get pageKey(): string {
    return this.key;
  }

  state(now: number, speed: TextSpeed): ReaderState {
    const len = this.lengths[this.index] ?? 0;
    const chars = this.forced ? len : charsShown(len, speed, now - this.startedAt);
    const lineDone = chars >= len;
    const doneAt = !lineDone
      ? null
      : this.forced
        ? this.startedAt
        : this.startedAt + typingMs(len, speed);
    const allDone = lineDone && this.index >= this.lengths.length - 1;
    this.readAll = allDone && this.lengths.length > 0;
    return { line: this.index, chars, lineDone, allDone, doneAt };
  }

  /** An advance press: complete the typing line, else show the next line, else 'end'. */
  press(now: number, speed: TextSpeed): PressResult {
    const s = this.state(now, speed);
    if (!s.lineDone) {
      this.forced = true;
      this.startedAt = now;
      return 'completed';
    }
    if (this.index < this.lengths.length - 1) {
      this.index++;
      this.startedAt = now;
      this.forced = false;
      return 'next';
    }
    return 'end';
  }

  /** Show every line complete (skipping, hidden text). */
  completeAll(now: number): void {
    this.index = Math.max(0, this.lengths.length - 1);
    this.forced = true;
    this.startedAt = now;
  }

  reset(): void {
    this.key = '';
    this.lengths = [];
    this.index = 0;
    this.forced = false;
    this.readAll = false;
  }
}

/**
 * Auto advance (13.2): on by the setting or the toggle; a manual advance press while it runs
 * pauses it until the toggle is pressed again; it never presses through a choice, free input,
 * a letter or an inscription (the caller says `stop`).
 */
export class AutoAdvance {
  private on = false;
  private paused = false;

  constructor(initial = false) {
    this.on = initial;
  }

  get active(): boolean {
    return this.on && !this.paused;
  }

  get enabled(): boolean {
    return this.on;
  }

  toggle(): boolean {
    if (this.on && this.paused) this.paused = false;
    else this.on = !this.on;
    this.paused = false;
    return this.on;
  }

  /** The setting changed (a new run of the setting starts unpaused). */
  setEnabled(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.paused = false;
  }

  /** A manual advance while auto runs pauses it (13.2). */
  manualPress(): void {
    if (this.on) this.paused = true;
  }

  /** Time to press: the line has dwelt long enough and nothing stops auto here. */
  due(now: number, doneAt: number | null, length: number, stop: boolean): boolean {
    if (!this.active || stop || doneAt === null) return false;
    return now - doneAt >= autoDwellMs(length);
  }
}

/**
 * A hold that fires once after `ms` (skip: hold Esc or B for a second). With hold-to-toggle
 * (18.5) the press itself fires.
 */
export class HoldWatch {
  private since: number | null = null;
  private fired = false;

  constructor(private readonly ms = SKIP_HOLD_MS) {}

  /** Feed the button state each frame; true on the frame the hold completes. */
  update(down: boolean, now: number, toggle = false): boolean {
    if (!down) {
      this.since = null;
      this.fired = false;
      return false;
    }
    if (this.fired) return false;
    if (this.since === null) this.since = now;
    if (toggle || now - this.since >= this.ms) {
      this.fired = true;
      return true;
    }
    return false;
  }

  /** 0..1 while held (for the skip control's ring). */
  progress(now: number): number {
    if (this.since === null || this.fired) return 0;
    return Math.max(0, Math.min(1, (now - this.since) / this.ms));
  }
}
