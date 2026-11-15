// Segment files (release_engineering.md 5.3 and 13.6): one stream's entries for a tick
// range, as JSON Lines. The first line describes the segment; each further line is one
// entry. The `commands` stream holds the external commands of the replay log, numbered
// in run order, so a world snapshot (an anchor) plus the segments after it replay a run.

import type { AnyCommand } from '../contracts';
import type { LoggedCommand } from '../world';
import type { SegmentKind } from './header';

export const SEGMENT_FORMAT = 'hakoniwa-segment';

export interface SegmentMeta {
  format: typeof SEGMENT_FORMAT;
  kind: SegmentKind;
  runId: string;
  /** entries have fromTick < tick <= toTick */
  fromTick: number;
  toTick: number;
  /** run-wide ordinal of the first entry */
  first: number;
  count: number;
}

/** One commands-stream line: tick, run-wide ordinal, command. */
interface CommandLine {
  t: number;
  n: number;
  c: AnyCommand;
}

export function encodeCommandSegment(
  at: { runId: string; fromTick: number; toTick: number; first: number },
  entries: readonly LoggedCommand[],
): string {
  const meta: SegmentMeta = {
    format: SEGMENT_FORMAT,
    kind: 'commands',
    runId: at.runId,
    fromTick: at.fromTick,
    toTick: at.toTick,
    first: at.first,
    count: entries.length,
  };
  const lines = [JSON.stringify(meta)];
  entries.forEach((e, i) => {
    if (e.tick <= at.fromTick || e.tick > at.toTick) {
      throw new Error(`command at tick ${e.tick} outside segment (${at.fromTick}, ${at.toTick}]`);
    }
    const line: CommandLine = { t: e.tick, n: at.first + i, c: e.command };
    lines.push(JSON.stringify(line));
  });
  return `${lines.join('\n')}\n`;
}

export interface DecodedSegment {
  meta: SegmentMeta;
  entries: LoggedCommand[];
}

/** Parse a commands segment and check its own consistency (count, order, numbering). */
export function decodeCommandSegment(text: string): DecodedSegment {
  const lines = text.split('\n').filter((l) => l.length > 0);
  const meta = JSON.parse(lines[0] ?? 'null') as SegmentMeta | null;
  if (!meta || meta.format !== SEGMENT_FORMAT || meta.kind !== 'commands') {
    throw new Error('not a commands segment');
  }
  if (lines.length - 1 !== meta.count) throw new Error('segment entry count mismatch');
  const entries: LoggedCommand[] = [];
  let lastTick = meta.fromTick;
  for (let i = 1; i < lines.length; i++) {
    const l = JSON.parse(lines[i] as string) as CommandLine;
    if (l.n !== meta.first + i - 1) throw new Error('segment numbering gap');
    if (l.t < lastTick || l.t <= meta.fromTick || l.t > meta.toTick) {
      throw new Error('segment tick out of order or range');
    }
    lastTick = l.t;
    entries.push({ tick: l.t, command: l.c });
  }
  return { meta, entries };
}

/**
 * Join consecutive segments of one run into one entry list, checking that the numbering
 * runs on without a gap or overlap.
 */
export function joinSegments(segments: readonly DecodedSegment[]): LoggedCommand[] {
  const out: LoggedCommand[] = [];
  let next: number | null = null;
  let lastTo: number | null = null;
  for (const s of segments) {
    if (next !== null && s.meta.first !== next) throw new Error('segments do not follow on');
    if (lastTo !== null && s.meta.fromTick !== lastTo) throw new Error('segment tick ranges gap');
    next = s.meta.first + s.meta.count;
    lastTo = s.meta.toTick;
    out.push(...s.entries);
  }
  return out;
}
