// Record adapters (PK-M1-23): the deeds book, the codex, the letters and the evidence the
// player holds. They read the records kernel's exported queries (src/systems/records) and
// build the `records.*` commands; the evidence page reads the holding, since no evidence
// system exists yet (its court fields are a request to PK-M1-31/32). Pure functions of
// GameView.

import { contentText } from '../../core/content_key';
import type { ItemDef } from '../../systems/inventory';
import type { CodexTab } from '../../systems/records';
import { codexPage, deedBook, inbox } from '../../systems/records';
import type {
  CodexAdapter,
  CodexMemoryRow,
  DeedsAdapter,
  EvidenceAdapter,
  EvidenceRowView,
  LettersAdapter,
} from '../view/adapters_records';
import { flagOn, type GameView } from '../view/game_view';

/** The flag that opens the court (`a6_court_open`, ux_and_onboarding.md 24.3). */
export const COURT_OPEN_FLAG = 'a6_court_open';

export function createDeedsAdapter(): DeedsAdapter {
  return {
    book: (view) => deedBook(view.world as never, view.content as never),
    wearTitle: (_view, titleId) => [{ kind: 'records.title.wear', data: { titleId } }],
    carve: (_view, deedId, slot) => [
      { kind: 'records.pillar.carve', data: slot === undefined ? { deedId } : { deedId, slot } },
    ],
    doorKeyed: (view) => doorKeyedDeeds(view.content.doors ?? []),
  };
}

/** The `deed.<id>` flag a key condition may read (thousand_doors.md 5.1). */
const DEED_FLAG = /\bdeed\.([a-z0-9_]+)/g;

/**
 * The deeds any door takes as a key: `{ type: 'deed', deed }` keys at any depth of the key
 * combinators, and `deed.<id>` flags a key condition names. A pure scan of the door content.
 */
export function doorKeyedDeeds(doors: readonly { keys?: unknown }[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v === 'string') {
      for (const m of v.matchAll(DEED_FLAG)) out.add(m[1] as string);
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.type === 'deed' && typeof o.deed === 'string') out.add(o.deed);
    for (const [k, x] of Object.entries(o)) {
      // labels and links are display text and quest ids, never a condition
      if (k === 'label' || k === 'link') continue;
      walk(x);
    }
  };
  for (const d of doors) walk(d.keys);
  return out;
}

export function createCodexAdapter(): CodexAdapter {
  return {
    page: (view, tab: CodexTab) => codexPage(view.world as never, view.content as never, tab),
    memories(view): CodexMemoryRow[] {
      const scenes = view.content.scenes ?? [];
      return codexPage(view.world as never, view.content as never, 'memories').map((r) => {
        const def = scenes.find((s) => s.id === r.id);
        return {
          id: r.id,
          title: r.name,
          act: def?.act ?? '',
          first: r.first,
          last: r.last,
        };
      });
    },
  };
}

export function createLettersAdapter(): LettersAdapter {
  return {
    inbox: (view) => inbox(view.world as never, view.content as never),
    read: (_view, letterId) => [{ kind: 'records.letter.read', data: { letterId } }],
    reply: (_view, letterId, optionId) => [
      { kind: 'records.letter.reply', data: { letterId, optionId } },
    ],
    takeAttachment: (_view, letterId) => [{ kind: 'records.letter.take', data: { letterId } }],
  };
}

/** The item tag that marks a historical record (史料 H01 on, data/scenes/lore_items.json). */
export const HISTORY_TAG = 'history';

/** Which page an item belongs on: 证物, 史料, or neither (relics and books are the codex's). */
export function evidencePage(def: Pick<ItemDef, 'kind' | 'tags'> | undefined): EvidencePage {
  if (def?.kind === 'evidence') return 'evidence';
  if (def?.kind === 'lore' && def.tags?.includes(HISTORY_TAG)) return 'records';
  return null;
}

export type EvidencePage = 'evidence' | 'records' | null;

/** The rows of one page from the player's holding, stable by item id. */
function heldRows(view: GameView, page: 'evidence' | 'records'): EvidenceRowView[] {
  const holding = view.holding(view.playerId());
  const out: EvidenceRowView[] = [];
  for (const [id, count] of Object.entries(holding.items)) {
    if (count <= 0) continue;
    const def = view.itemDef(id);
    if (!def || evidencePage(def) !== page) continue;
    out.push({
      id,
      name: contentText('items', def, id),
      kind: page === 'evidence' ? 'evidence' : 'lore',
      count,
      desc: contentText('items', def, '', 'desc'),
      tags: [],
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function createEvidenceAdapter(): EvidenceAdapter {
  return {
    evidence: (view) => heldRows(view, 'evidence'),
    records: (view) => heldRows(view, 'records'),
    courtOpen: (view) => flagOn(view.flag(COURT_OPEN_FLAG)),
  };
}
