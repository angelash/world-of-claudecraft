// Decision explanations of the built-in AI (builtin_ai.md 2.6): every built-in decision
// writes one BrainTrace (actor, decision kind, tick, the top three candidates with their
// named terms, the winner, the stream name and the draw). Traces live in an in-memory
// ring of TRACE_RING per actor and never enter a save: given a save and a tick the same
// trace can be recomputed. Pure data, no clock.

import type { PickResult, ScoredTerm } from './utility';

export const TRACE_TOP = 3;
export const TRACE_RING = 32;

export interface TraceCandidate {
  id: string;
  score: number;
  terms: ScoredTerm[];
}

export interface BrainTrace {
  actor: string;
  /** decision kind, e.g. npc.life, goddess.plan, dialogue.line */
  kind: string;
  tick: number;
  top: TraceCandidate[];
  /** the chosen id; '' when the idle baseline won */
  chosen: string;
  /** the named rng stream the decision used ('' for none) */
  stream: string;
  /** the draw in [0, 1), or -1 when no draw was made */
  draw: number;
}

/** A trace from a utility pick: the top TRACE_TOP ranked candidates and the winner. */
export function traceOfPick(
  actor: string,
  kind: string,
  tick: number,
  pick: PickResult,
  stream = '',
): BrainTrace {
  return {
    actor,
    kind,
    tick,
    top: pick.ranked.slice(0, TRACE_TOP).map((a) => ({
      id: a.id,
      score: a.score,
      terms: a.terms.map((t) => ({ ...t })),
    })),
    chosen: pick.chosen?.id ?? '',
    stream,
    draw: pick.draw,
  };
}

/** Per-actor ring buffers of the latest TRACE_RING traces (oldest dropped first). */
export class TraceBook {
  private readonly rings = new Map<string, BrainTrace[]>();

  constructor(private readonly capacity = TRACE_RING) {}

  push(trace: BrainTrace): void {
    let ring = this.rings.get(trace.actor);
    if (!ring) {
      ring = [];
      this.rings.set(trace.actor, ring);
    }
    ring.push(trace);
    if (ring.length > this.capacity) ring.splice(0, ring.length - this.capacity);
  }

  /** The actor's traces, oldest first. */
  recent(actor: string): readonly BrainTrace[] {
    return this.rings.get(actor) ?? [];
  }

  /** Actors with at least one trace, sorted by id. */
  actors(): string[] {
    return [...this.rings.keys()].sort();
  }

  clear(): void {
    this.rings.clear();
  }
}
