// Music player scheduling (audio_direction.md 5.2, 5.3, 5.7, 9.5): the pure half of the music
// player. It keeps the decks that play (one track each, every layer of a track started together
// and only gain-switched, so layers never drift), the beat grid of each track, and the position
// memory, and turns the director's plan and transition into timed commands on the audio clock:
// start a deck at a beat, bar or phrase line with an offset and fade, stop one with a fade,
// ramp its layers or its low-pass. The Web Audio side (./audio_bus.ts) executes the commands.
// Every "next beat" or "next bar line" is computed on the playing track's grid and scheduled
// at least 50 ms ahead. The stinger gate applies 5.7: spacing, priority, queueing and the
// combat rule. Pure: the caller passes the audio clock in seconds.

import type { MusicPlan, Transition } from './audio_director';

/** What the scheduler needs to know of a track (from its processed metadata, 9.3). */
export interface TrackGrid {
  id: string;
  /** Seconds of one pass: the loop body, or the whole file. */
  lengthSec: number;
  loop: boolean;
  bpm: number | null;
  beatsPerBar: number | null;
  /** Layer files (1 when the track is not split). */
  stems: number;
}

export type MusicCommand =
  | {
      op: 'start';
      deck: number;
      id: string;
      atSec: number;
      /** Position inside the track at `atSec`. */
      offsetSec: number;
      layers: number[];
      fadeInMs: number;
      lowpassHz: number | null;
    }
  | { op: 'stop'; deck: number; atSec: number; fadeOutMs: number }
  | { op: 'layers'; deck: number; atSec: number; layers: number[]; rampMs: number }
  | { op: 'filter'; deck: number; atSec: number; lowpassHz: number | null; rampMs: number }
  | { op: 'stinger'; id: string; atSec: number };

/** Lead time of every scheduled change (9.5). */
export const LEAD_SEC = 0.05;
/** A phrase is four bars (the resume point of 5.3). */
export const PHRASE_BARS = 4;
/** Position memory per track (5.3). */
export const MEMORY_SEC = 180;
/** Calmer location tracks wait for a pass that ends within this many seconds (5.3). */
export const CALM_WAIT_SEC = 20;
/** Layers switch with a 2 s ramp (5.2); day and night reductions take 8 s (5.3). */
export const LAYER_RAMP_MS = 2000;
export const NIGHT_RAMP_MS = 8000;
/** Layers per deck: two tracks crossing share the music bus's eight voices (8.3). */
export const STEMS_PER_DECK = 4;

const OFF = Number.NEGATIVE_INFINITY;

interface Deck {
  deck: number;
  grid: TrackGrid;
  /** Audio time at which the deck was (or will be) at `offsetSec`. */
  atSec: number;
  offsetSec: number;
  layers: number[];
  lowpassHz: number | null;
  /** Audio time from which the deck fades out (null while it plays on). */
  stopAtSec: number | null;
}

/** Seconds of one beat, bar and phrase, or null without a grid. */
export function gridUnits(
  g: Pick<TrackGrid, 'bpm' | 'beatsPerBar'>,
): { beat: number; bar: number; phrase: number } | null {
  if (!g.bpm || g.bpm <= 0) return null;
  const beat = 60 / g.bpm;
  const bar = beat * (g.beatsPerBar && g.beatsPerBar > 0 ? g.beatsPerBar : 4);
  return { beat, bar, phrase: bar * PHRASE_BARS };
}

/** Position of a deck at an audio time, wrapped on loops. */
export function positionAt(d: Pick<Deck, 'atSec' | 'offsetSec' | 'grid'>, tSec: number): number {
  const p = d.offsetSec + (tSec - d.atSec);
  if (d.grid.loop && d.grid.lengthSec > 0)
    return ((p % d.grid.lengthSec) + d.grid.lengthSec) % d.grid.lengthSec;
  return Math.max(0, Math.min(p, d.grid.lengthSec));
}

/**
 * The first grid line of `unit` seconds on a deck at or after `nowSec + LEAD_SEC`, as an audio
 * time. Without a grid the change happens after the lead time.
 */
export function nextLine(
  d: Pick<Deck, 'atSec' | 'offsetSec' | 'grid'> | null,
  nowSec: number,
  unit: 'beat' | 'bar' | 'phrase',
): number {
  const earliest = nowSec + LEAD_SEC;
  if (!d) return earliest;
  const u = gridUnits(d.grid);
  if (!u) return earliest;
  const step = u[unit];
  // Track time at the earliest moment. Lines sit on whole multiples from the start of the
  // file; on a loop they start again at every pass, and the wrap itself is a line.
  const raw = d.offsetSec + (earliest - d.atSec);
  if (raw < 0) return earliest - raw;
  const len = d.grid.lengthSec;
  const p = d.grid.loop && len > 0 ? raw % len : raw;
  const k = Math.ceil(p / step - 1e-9);
  const line = d.grid.loop && len > 0 ? Math.min(k * step, len) : k * step;
  return earliest + (line - p);
}

/** The start of the phrase that holds `posSec` (the resume point of 5.3). */
export function phraseStart(g: TrackGrid, posSec: number): number {
  const u = gridUnits(g);
  if (!u) return posSec;
  return Math.floor(posSec / u.phrase + 1e-9) * u.phrase;
}

const sameLayers = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Clip a plan's layer list to the track's stems (extra stems off, at most STEMS_PER_DECK). */
export function layersFor(plan: readonly number[], stems: number): number[] {
  const n = Math.max(1, Math.min(STEMS_PER_DECK, stems));
  return Array.from({ length: n }, (_, i) => (i < plan.length ? (plan[i] as number) : OFF));
}

export interface SchedulerInput {
  nowSec: number;
  plan: MusicPlan;
  transition: Transition | null;
  /** Grid of a track id; unknown (no approved file) tracks are skipped silently. */
  grid(id: string): TrackGrid | null;
  /** When a boss roar is playing, the audio time it ends (after_roar). */
  roarEndsAtSec?: number | null;
}

export class MusicScheduler {
  private decks: Deck[] = [];
  private nextDeck = 1;
  private memory = new Map<string, { posSec: number; atSec: number }>();
  /** The id the plan asked for last (it may be unknown and not playing). */
  private wanted: string | null = null;

  /** Decks still sounding (the current one last). */
  playing(): readonly Readonly<Deck>[] {
    return this.decks;
  }

  /** The deck that carries the current track, if any. */
  current(): Readonly<Deck> | null {
    const live = this.decks.filter((d) => d.stopAtSec === null);
    return live[live.length - 1] ?? null;
  }

  /** Forget decks whose fade has ended. */
  private prune(nowSec: number, fadeSlackSec = 10): void {
    this.decks = this.decks.filter(
      (d) => d.stopAtSec === null || d.stopAtSec + fadeSlackSec > nowSec,
    );
  }

  /** Keep where a deck was when it stops; a deck stopped before it started leaves no trace. */
  private remember(d: Deck, atSec: number): void {
    if (atSec <= d.atSec) return;
    this.memory.set(d.grid.id, { posSec: positionAt(d, atSec), atSec });
  }

  /** Resume offset for a track: the phrase start of its remembered position, within 3 min. */
  resumeOffset(g: TrackGrid, nowSec: number): number {
    const m = this.memory.get(g.id);
    if (!m || nowSec - m.atSec > MEMORY_SEC) return 0;
    return phraseStart(g, m.posSec);
  }

  /**
   * Stop a deck at a time. A deck already told to stop later (a calmer track waiting for the
   * end of its pass) is told again when a new change needs it gone sooner.
   */
  private stop(d: Deck, atSec: number, fadeOutMs: number, out: MusicCommand[]): void {
    if (d.stopAtSec !== null && d.stopAtSec <= atSec) return;
    if (d.stopAtSec === null) this.remember(d, atSec);
    d.stopAtSec = atSec;
    out.push({ op: 'stop', deck: d.deck, atSec, fadeOutMs });
  }

  /** Stop every deck that would still sound after `atSec` (the current one and pending ones). */
  private stopAllAt(atSec: number, fadeOutMs: number, out: MusicCommand[]): void {
    for (const d of this.decks) this.stop(d, atSec, fadeOutMs, out);
  }

  private start(
    grid: TrackGrid,
    atSec: number,
    offsetSec: number,
    plan: MusicPlan,
    fadeInMs: number,
    out: MusicCommand[],
  ): void {
    const layers = layersFor(plan.layers, grid.stems);
    const d: Deck = {
      deck: this.nextDeck++,
      grid,
      atSec,
      offsetSec,
      layers,
      lowpassHz: plan.lowpassHz,
      stopAtSec: null,
    };
    this.decks.push(d);
    out.push({
      op: 'start',
      deck: d.deck,
      id: grid.id,
      atSec,
      offsetSec,
      layers,
      fadeInMs,
      lowpassHz: plan.lowpassHz,
    });
  }

  /** Stop everything now (the session ends or audio is muted for good). */
  stopAll(nowSec: number, fadeOutMs = 500): MusicCommand[] {
    const out: MusicCommand[] = [];
    for (const d of this.decks) this.stop(d, nowSec + LEAD_SEC, fadeOutMs, out);
    this.wanted = null;
    return out;
  }

  update(input: SchedulerInput): MusicCommand[] {
    const { nowSec, plan, transition } = input;
    const out: MusicCommand[] = [];
    this.prune(nowSec);
    const cur = this.current();
    const wantId = plan.id;
    const grid = wantId ? input.grid(wantId) : null;
    if (wantId === this.wanted && cur && cur.grid.id === wantId) {
      this.adjust(cur, plan, nowSec, out);
      return out;
    }
    if (wantId === this.wanted && !transition && (!wantId || !grid)) return out;
    this.wanted = wantId;
    const t: Transition = transition ?? { kind: 'crossfade', ms: 3000, align: 'bar' };
    // Silence, or a track with no approved file: the old track fades and nothing replaces it.
    if (!grid) {
      this.stopAllAt(nowSec + LEAD_SEC, Math.min(t.ms, 3000), out);
      return out;
    }
    let atSec = nowSec + LEAD_SEC;
    let fadeInMs = t.ms;
    let fadeOutMs = t.ms;
    let stopAt = atSec;
    switch (t.kind) {
      case 'crossfade': {
        atSec =
          t.align === 'none'
            ? atSec
            : nextLine(
                cur,
                nowSec,
                t.align === 'beat' ? 'beat' : t.align === 'phrase' ? 'phrase' : 'bar',
              );
        if (t.calm && cur?.grid.loop) {
          const remain = cur.grid.lengthSec - positionAt(cur, atSec);
          if (remain > 0 && remain < CALM_WAIT_SEC) atSec += remain;
        }
        stopAt = atSec;
        break;
      }
      case 'fade_gap': {
        const gap = (t.gapMs ?? 0) / 1000;
        fadeOutMs = t.outMs ?? Math.max(0, (t.ms - (t.gapMs ?? 0)) / 2);
        fadeInMs = Math.max(0, t.ms - (t.gapMs ?? 0) - fadeOutMs);
        stopAt = atSec;
        atSec = stopAt + fadeOutMs / 1000 + gap;
        break;
      }
      case 'cut_in': {
        // The location track fades over 1 s; the fight enters on the next beat, no fade.
        fadeOutMs = t.ms;
        stopAt = nowSec + LEAD_SEC;
        atSec = nextLine(cur, nowSec, 'beat');
        fadeInMs = 10;
        break;
      }
      case 'phrase_return': {
        // The fight fades over 4 s, then the location track returns over 3 s (5.3).
        fadeOutMs = 4000;
        fadeInMs = Math.max(0, t.ms - 4000);
        stopAt = nowSec + LEAD_SEC;
        atSec = stopAt + 4;
        break;
      }
      case 'after_roar': {
        fadeOutMs = t.ms;
        stopAt = nowSec + LEAD_SEC;
        const roarEnd = input.roarEndsAtSec ?? null;
        atSec = roarEnd !== null && roarEnd > stopAt ? roarEnd : stopAt + t.ms / 1000;
        fadeInMs = 10;
        break;
      }
      case 'victory': {
        // The boss track fades over 1 s, then the victory phrase; the location returns 3 s on.
        fadeOutMs = t.ms;
        stopAt = nowSec + LEAD_SEC;
        if (t.stinger && input.grid(t.stinger))
          out.push({ op: 'stinger', id: t.stinger, atSec: stopAt + t.ms / 1000 });
        atSec = stopAt + 3;
        fadeInMs = 3000;
        break;
      }
    }
    this.stopAllAt(stopAt, fadeOutMs, out);
    const offset =
      t.aligned && cur
        ? positionAt(cur, atSec) % Math.max(1e-6, grid.lengthSec)
        : this.resumeOffset(grid, nowSec);
    this.start(grid, atSec, offset, plan, fadeInMs, out);
    return out;
  }

  /** Same track: layer and filter changes on the next bar line (5.2, 5.5). */
  private adjust(d: Deck, plan: MusicPlan, nowSec: number, out: MusicCommand[]): void {
    const layers = layersFor(plan.layers, d.grid.stems);
    const filterChanged = d.lowpassHz !== plan.lowpassHz;
    if (!sameLayers(layers, d.layers)) {
      const atSec = nextLine(d, nowSec, 'bar');
      d.layers = layers;
      out.push({
        op: 'layers',
        deck: d.deck,
        atSec,
        layers,
        rampMs: filterChanged ? NIGHT_RAMP_MS : LAYER_RAMP_MS,
      });
    }
    if (filterChanged) {
      d.lowpassHz = plan.lowpassHz;
      out.push({
        op: 'filter',
        deck: d.deck,
        atSec: nextLine(d, nowSec, 'bar'),
        lowpassHz: plan.lowpassHz,
        rampMs: NIGHT_RAMP_MS,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Stingers (5.7)

/** Priority classes: story above doors above level-ups above quests above the rest. */
export const STINGER_CLASSES = ['story', 'door', 'level', 'quest', 'other'] as const;
export type StingerClass = (typeof STINGER_CLASSES)[number];

/** The only stingers a fight lets through (5.7); the rest wait for its end. */
export const COMBAT_STINGERS: ReadonlySet<string> = new Set(['mus_stg_victory', 'mus_stg_defeat']);
export const SAME_STINGER_GAP_MS = 20_000;
export const ANY_STINGER_GAP_MS = 2_500;
export const STINGER_QUEUE_MS = 3_000;

export interface StingerOffer {
  id: string;
  cls: StingerClass;
  /** Doors, level-ups and finished quests wait up to 3 s for a free slot; others drop. */
  queue: boolean;
}

interface Pending extends StingerOffer {
  untilMs: number;
}

export type StingerVerdict = 'play' | 'queued' | 'deferred' | 'dropped';

export class StingerGate {
  private lastAny = Number.NEGATIVE_INFINITY;
  private lastById = new Map<string, number>();
  private pending: Pending[] = [];
  private deferred: StingerOffer[] = [];

  private canPlay(id: string, nowMs: number): boolean {
    const last = this.lastById.get(id);
    return (
      nowMs - this.lastAny >= ANY_STINGER_GAP_MS &&
      (last === undefined || nowMs - last >= SAME_STINGER_GAP_MS)
    );
  }

  private mark(id: string, nowMs: number): void {
    this.lastAny = nowMs;
    this.lastById.set(id, nowMs);
  }

  /** A stinger asks to play now. */
  offer(s: StingerOffer, nowMs: number, inCombat: boolean): StingerVerdict {
    if (inCombat && !COMBAT_STINGERS.has(s.id)) {
      // Played after the fight (level-up, quest done and the like), once per id.
      this.deferred = [...this.deferred.filter((d) => d.id !== s.id), s];
      return 'deferred';
    }
    const last = this.lastById.get(s.id);
    if (last !== undefined && nowMs - last < SAME_STINGER_GAP_MS) return 'dropped';
    if (this.canPlay(s.id, nowMs) && this.pending.length === 0) {
      this.mark(s.id, nowMs);
      return 'play';
    }
    // Blocked: only doors, level-ups and finished quests wait (5.7); the rest are dropped.
    if (!s.queue) return 'dropped';
    this.pending.push({ ...s, untilMs: nowMs + STINGER_QUEUE_MS });
    return 'queued';
  }

  /** Stingers due now: the best queued one when the spacing allows, after the fight the deferred. */
  tick(nowMs: number, inCombat: boolean): string[] {
    if (inCombat) {
      // A fight started while phrases waited: they wait for its end instead.
      for (const p of this.pending.filter((x) => !COMBAT_STINGERS.has(x.id)))
        this.deferred = [...this.deferred.filter((d) => d.id !== p.id), p];
      this.pending = this.pending.filter((x) => COMBAT_STINGERS.has(x.id));
    }
    if (!inCombat && this.deferred.length > 0) {
      // A fight ended: each deferred phrase gets its turn, 2.5 s apart.
      this.deferred.forEach((d, i) => {
        this.pending.push({ ...d, untilMs: nowMs + STINGER_QUEUE_MS + i * ANY_STINGER_GAP_MS });
      });
      this.deferred = [];
    }
    this.pending = this.pending.filter((p) => p.untilMs >= nowMs);
    if (this.pending.length === 0) return [];
    const rank = (c: StingerClass) => STINGER_CLASSES.indexOf(c);
    this.pending.sort((a, b) => rank(a.cls) - rank(b.cls));
    const next = this.pending.find((p) => this.canPlay(p.id, nowMs));
    if (!next) return [];
    this.pending = this.pending.filter((p) => p !== next);
    this.mark(next.id, nowMs);
    return [next.id];
  }

  /** A stinger played outside the gate (the victory phrase of a transition). */
  played(id: string, nowMs: number): void {
    this.mark(id, nowMs);
  }
}
