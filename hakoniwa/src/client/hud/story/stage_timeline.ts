// The reading cursor, not the kernel's node-entry tick, releases a node's timed stage cues.
// The kernel has already filtered conditions and remapped `at` to the lines on screen
// (systems/scenes/stage_steps.ts). Entry cues run first, then each line's cues once; skipping
// drains the same timeline so the final picture and music survive without a burst of sounds.

import type { ShownStep, StageDirective } from '../../../systems/scenes/types';

interface PendingStep {
  at: number;
  order: number;
  directive: StageDirective;
}

export class StageTimeline {
  private pending: PendingStep[] = [];
  private next = 0;

  /** Start a node, returning the cues that precede its first line. */
  begin(steps: readonly ShownStep[]): StageDirective[] {
    const entry: StageDirective[] = [];
    this.pending = [];
    this.next = 0;
    steps.forEach((step, order) => {
      const { at, ...directive } = step;
      if (at === undefined || at <= 0) entry.push(directive);
      else this.pending.push({ at, order, directive });
    });
    this.pending.sort((a, b) => a.at - b.at || a.order - b.order);
    return entry;
  }

  /** The cursor reached `line`; trailing cues wait until every line has been read. */
  take(line: number, allRead: boolean): StageDirective[] {
    const due: StageDirective[] = [];
    while (this.next < this.pending.length) {
      const step = this.pending[this.next];
      if (!step || (!allRead && step.at > line)) break;
      due.push(step.directive);
      this.next++;
    }
    return due;
  }
}
