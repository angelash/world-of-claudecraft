// The record windows' seam (PK-M1-23): `ui_win_deeds` (ux_and_onboarding.md 6.3.1),
// `ui_win_codex` (6.3.2), `ui_win_letters` (6.3.8) and `ui_win_evidence` (6.3.11). Each
// adapter reads the records kernel's exported queries (src/systems/records/view.ts) and
// builds the commands its window queues; `src/client/view/adapters.ts` re-exports these
// interfaces and names the `ClientAdapters` keys. Text fields stay TextParam (content keys
// the client renders), never sentences. Pure types only.

import type { TextParam } from '../../core/text';
import type { CodexRowView, CodexTab, DeedBookView, LetterView } from '../../systems/records';
import type { Commands } from './adapters';
import type { GameView } from './game_view';

// ---------------------------------------------------------------------------
// ui_win_deeds (6.3.1)

export interface DeedsAdapter {
  /** the book as its stage shows it: deeds, titles, fame and the pillar */
  book(view: GameView): DeedBookView;
  /** wear one office title, or nothing */
  wearTitle(view: GameView, titleId: string | null): Commands;
  /** carve an earned deed on the pillar (a slot, or the first free one) */
  carve(view: GameView, deedId: string | null, slot?: number): Commands;
  /**
   * The deeds some door takes as a key (thousand_doors.md 5.1, `{ type: 'deed' }` keys and
   * `deed.<id>` flag conditions): in the carvings stage these stand by their doors and every
   * other deed is filed under 未记之事 (catalog_deeds_titles.md 2.11).
   */
  doorKeyed(view: GameView): ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// ui_win_codex (6.3.2)

export interface CodexAdapter {
  /** one tab's subjects, oldest first, with the notes discovered about each */
  page(view: GameView, tab: CodexTab): CodexRowView[];
  /** scenes seen, for the recollection page (6.3.2 回想) */
  memories(view: GameView): CodexMemoryRow[];
}

/** One scene the player has seen: the recollection page's row. */
export interface CodexMemoryRow {
  /** the scene id (`cut_...`) */
  id: string;
  title: TextParam;
  /** the act flag the scene belongs to ('' when the record names none) */
  act: string;
  /** first seen */
  first: number;
  last: number;
}

// ---------------------------------------------------------------------------
// ui_win_letters (6.3.8)

export interface LettersAdapter {
  inbox(view: GameView): LetterView[];
  read(view: GameView, letterId: string): Commands;
  reply(view: GameView, letterId: string, optionId: string): Commands;
  /** take a letter's attachments into the pack */
  takeAttachment(view: GameView, letterId: string): Commands;
}

// ---------------------------------------------------------------------------
// ui_win_evidence (6.3.11)

/** How sure the player is of a piece (6.3.11 真伪); no kernel writes it in M1. */
export type EvidenceAuthenticity = 'unchecked' | 'checked' | 'doubted';

/** The court's defence lines (src/systems/scenes/court.ts `LINES`) and the mitigating plea. */
export type EvidenceLine = 'fact' | 'just' | 'need' | 'mitigate';

/**
 * One piece of evidence or one historical record the player holds. M1 reads the player's
 * holding: items of kind `evidence` are 证物, `lore` items tagged `history` (the 史料 H01 on,
 * data/scenes/lore_items.json) are 史料; other lore (relics, books) belongs to the codex. The
 * court fields (`code`, `act`, `source`, `how`, `proves`, `custody`, `authenticity`, the
 * defence lines and their strength) wait on an evidence read (a request to PK-M1-31/32), so
 * they are optional here and the window writes "可能有用" while they are missing (6.3.11:
 * before act 6 the strength is not shown).
 */
export interface EvidenceRowView {
  /** the item id */
  id: string;
  name: TextParam;
  /** `evidence` on the 证物 page, `lore` (history records) on the 史料 page */
  kind: 'evidence' | 'lore';
  count: number;
  desc: TextParam;
  /** the court code E01 to E36, when a kernel gives one */
  code?: string;
  /** the act it was obtained in, when a kernel records it */
  act?: number;
  /** where it came from, and how it was obtained */
  source?: TextParam;
  how?: TextParam;
  /** what the player understands it to prove */
  proves?: TextParam;
  /** the chain of custody, oldest first */
  custody?: TextParam[];
  authenticity?: EvidenceAuthenticity;
  /** the defence lines it bears on (empty before act 6) */
  tags: EvidenceLine[];
}

export interface EvidenceAdapter {
  /** the pieces of evidence held (items of kind `evidence`), the 证物 page */
  evidence(view: GameView): EvidenceRowView[];
  /** the historical records held (`lore` items tagged `history`), the 史料 page */
  records(view: GameView): EvidenceRowView[];
  /** true once the court is open (`a6_court_open`): the court fields may be shown */
  courtOpen(view: GameView): boolean;
}

/**
 * The player's own notes on a piece of evidence (6.3.11 `annotate`). They are client data,
 * not world state: the save's client segment keeps them (17.8's store, wired by the session).
 * The window takes this interface; a window without one shows the notes read-only and empty.
 */
export interface EvidenceNoteStore {
  note(itemId: string): string;
  setNote(itemId: string, text: string): void;
}
