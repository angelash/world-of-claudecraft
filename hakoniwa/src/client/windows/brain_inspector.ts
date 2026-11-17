// Pure core of the debug panel's brain inspector skeleton (builtin_ai.md 15, 19 step 4):
// given an actor's recent BrainTrace ring, formats the plain developer-facing lines the
// window shows (top candidates with their named score terms, the winner, the stream and
// tick). Dev-tool output stays English (implementation_conventions.md 8: "开发者文字用
// 英文"), same as this window's existing raw flag keys and event kind strings. No DOM; the
// thin painter is debug_window.ts.

import type { BrainTrace } from '../../core/brain/trace';

export interface TraceLine {
  tick: number;
  headline: string;
  candidates: string[];
}

function candidateLine(c: BrainTrace['top'][number]): string {
  const terms = c.terms.map((t) => `${t.name} ${t.value >= 0 ? '+' : ''}${t.value}`).join(' ');
  return `  ${c.id}  ${c.score.toFixed(2)}  (${terms})`;
}

/** Formats an actor's traces (oldest-first ring) into display lines, newest first. */
export function traceLines(traces: readonly BrainTrace[]): TraceLine[] {
  return [...traces].reverse().map((trace) => ({
    tick: trace.tick,
    headline: `[${trace.tick}] ${trace.kind} -> ${trace.chosen || '(idle)'} (${trace.stream || 'no stream'}${
      trace.draw >= 0 ? `, draw ${trace.draw.toFixed(3)}` : ''
    })`,
    candidates: trace.top.map(candidateLine),
  }));
}

/** One flat string per trace line and its candidates, for a simple list rendering. */
export function traceDisplayLines(traces: readonly BrainTrace[]): string[] {
  return traceLines(traces).flatMap((l) => [l.headline, ...l.candidates]);
}
