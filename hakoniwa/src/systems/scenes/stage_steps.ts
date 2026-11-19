// Stage steps as the client sees them (PK-M1-34; catalog_cutscenes.md 13.5 and the request
// PK-M1-27 left behind). A node writes its directives against its WRITTEN lines: `at: k` means
// "run as written line k starts showing", and no `at` means "run as the node is entered". Two
// things stand between that and the client: a line whose `when` fails is not shown, and a
// directive may carry its own `when`.
//
// This module does both in one pure step: it drops the directives whose condition failed and
// renumbers the rest against the lines actually shown, so the client's cutscene player only
// ever counts the lines in front of the player. A directive hung on a line that is not shown
// moves to the next line that is; with no line left after it, it runs once the lines are read
// (`at` equal to the number of shown lines). Without this, the old data had to be cut into one
// node per directive (what the prologue did, PK-M1-27's first deviation note).

import type { ShownStep, StageStep } from './types';

/**
 * The node's directives for the client: `keep` says which written lines are shown (in written
 * order), `holds` tests a directive's own condition. Order is kept, so a node's music, sound
 * and bust directives still arrive in the order they were written.
 */
export function visibleStage(
  stage: readonly StageStep[] | undefined,
  keep: readonly boolean[],
  holds: (expr: string | undefined) => boolean,
): ShownStep[] {
  // written line index -> shown index, and the shown count a directive after the last line gets
  const shownAt: number[] = [];
  let shown = 0;
  for (const visible of keep) {
    shownAt.push(shown);
    if (visible) shown++;
  }
  const out: ShownStep[] = [];
  for (const step of stage ?? []) {
    if (!holds(step.when)) continue;
    const { at, when: _when, ...directive } = step;
    if (at === undefined) {
      out.push(directive as ShownStep);
      continue;
    }
    // `at` counts written lines: at 0 is "before the first line", the same as no `at`
    const mapped = at >= keep.length ? shown : (shownAt[at] ?? shown);
    out.push(mapped > 0 ? ({ ...directive, at: mapped } as ShownStep) : (directive as ShownStep));
  }
  return out;
}
