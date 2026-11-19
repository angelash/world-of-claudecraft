// The shared presentation core (PK-M1-55; act1_borderstone.md 4.2, act6_review_and_epilogue.md
// 3.3 and 4.1): putting a piece of evidence before a tribunal and getting its verdict back. Act
// 1's witch trial runs every presentation through it (holding, repeats, forgeries, the points a
// piece proves); act 6's court judges hit or deflection through it (court.ts courtPiece), and
// keeps its own line strengths and its `presentable` filter for holding and repeats. The act-6
// forgery rule below is the core's outcome; the court does not carry forged evidence yet (no
// act-6 record is `forged`), so its "line +1, eloquence 0" consequence is a later package.
// Pure on its inputs (no world writes), so the rules are tested apart from both scenes.
//
// A presentation lands as exactly one of:
// - `hit`: the piece bears on the point it is put to (act 6: the goddess and line it targets;
//   act 1: the trial point it proves);
// - `wrong`: the piece is real but bears on nothing here (act 6's deflection: "这与光无关"; act 1:
//   the manifest at the witch trial, a coin for a crime the court is not trying);
// - `forged`: the piece is false (act 6 3.3 "伪证"); it proves nothing, and the record keeps
//   `forgeryCaught` for the tribunal that wants to punish it (act 1: the forgery rebuttal's cost);
// - `repeat`: already shown at this tribunal (one count per piece);
// - `missing`: the player does not hold it (refused before anything happens).
// The tribunal's answer to a `wrong` or `forged` presentation (its rebuttal line and what it
// costs) is the tribunal's data, never composed here (act 1: trial.ts and data/scenes/trials.json).

export type PresentOutcome = 'hit' | 'wrong' | 'forged' | 'repeat' | 'missing';

/** What a piece of evidence claims about one tribunal (act 1: a point; act 6: a line). */
export interface PresentTarget {
  /** the tribunal it is put before (act 6: the goddess; act 1: the trial id) */
  tribunal: string;
  /** what it proves there (act 6: fact, just, need or mitigate; act 1: a trial point) */
  point: string;
  /** how hard it lands (act 6: 1 to 3; act 1: 1) */
  strength: number;
}

/** A piece the player may put forward: its item, whether it is false, what it bears on. */
export interface PresentPiece {
  id: string;
  /** the item that carries it (the player must hold one) */
  item: string;
  /** a forgery: real-looking, but the kernel knows it is false (act6 3.3 伪证) */
  forged?: boolean;
  targets: readonly PresentTarget[];
}

/** One tribunal's record of what was shown to it (the court slice keeps one per tribunal). */
export interface TribunalRecord {
  shown: readonly string[];
  /** a forgery was caught here: eloquence no longer counts (act6 3.3) */
  forgeryCaught?: boolean;
}

export interface PresentJudgement {
  outcome: PresentOutcome;
  /** the targets that landed (hit only), in data order */
  landed: PresentTarget[];
}

/**
 * Judge one presentation. `holds` says whether the player holds an item; the tribunal record
 * says what was already shown. No side effects: the caller records the piece and applies the
 * landed targets (act 6 adds strength to lines; act 1 writes its trial points).
 */
export function judgePresentation(
  piece: PresentPiece,
  tribunal: string,
  record: TribunalRecord,
  holds: (item: string) => boolean,
): PresentJudgement {
  if (!holds(piece.item)) return { outcome: 'missing', landed: [] };
  if (record.shown.includes(piece.id)) return { outcome: 'repeat', landed: [] };
  if (piece.forged) return { outcome: 'forged', landed: [] };
  const landed = piece.targets.filter((t) => t.tribunal === tribunal);
  return landed.length > 0 ? { outcome: 'hit', landed } : { outcome: 'wrong', landed: [] };
}

/** The record after a presentation: the piece is shown (a refused one is not). */
export function recordPresentation(
  record: TribunalRecord,
  piece: PresentPiece,
  result: PresentJudgement,
): TribunalRecord {
  if (result.outcome === 'missing' || result.outcome === 'repeat') return record;
  return {
    shown: [...record.shown, piece.id],
    forgeryCaught: record.forgeryCaught || result.outcome === 'forged',
  };
}

/**
 * The points a tribunal holds as proven: each point once, however many pieces proved it
 * (act1 4.2 "多名证人只计一项"). Order follows the first piece that proved each.
 */
export function provenPoints(
  pieces: readonly PresentPiece[],
  tribunal: string,
  record: TribunalRecord,
): string[] {
  const out: string[] = [];
  for (const id of record.shown) {
    const p = pieces.find((x) => x.id === id);
    if (!p || p.forged) continue;
    for (const t of p.targets)
      if (t.tribunal === tribunal && !out.includes(t.point)) out.push(t.point);
  }
  return out;
}
