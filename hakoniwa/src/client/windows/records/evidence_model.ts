// Implements the model of `ui_win_evidence` (ux_and_onboarding.md 6.3.11): the pieces the
// player keeps. M1 has the 证物 page (and the 史料 page for the records read as documents):
// what it is, what the player understands it to prove, and the player's own note. Before the
// court opens (`a6_court_open`) a piece bears no defence tag and no strength, and its row
// reads "可能有用" (6.3.11; quests_and_events.md 8); the court preparation page itself is M3.
// Pure; Node-tested. The painter is ./evidence_window.ts.

import { t } from '../../../shared_ui/i18n';
import type { EvidenceLine, EvidenceRowView } from '../../view/adapters_records';

export const EVIDENCE_TABS = ['evidence', 'records'] as const;
export type EvidenceTab = (typeof EVIDENCE_TABS)[number];

export interface EvidenceRow {
  id: string;
  name: string;
  /** what it is, as the item says */
  desc: string;
  /** "x2" when more than one is held, '' otherwise */
  count: string;
  /** the court code, '' while no kernel gives one */
  code: string;
  /** where it came from and how ('' while no kernel records it) */
  origin: string;
  /** what the player understands it to prove, or "可能有用" before the court opens */
  proves: string;
  /** the chain of custody, oldest first (empty while no kernel records it) */
  custody: string[];
  /** 未验, 已验, 存疑 ('' while no kernel records it) */
  authenticity: string;
  /** the defence lines it bears on (empty before act 6) */
  tags: string[];
  /** the player's own note */
  note: string;
}

export interface EvidenceModel {
  tab: EvidenceTab;
  tabs: { id: EvidenceTab; label: string; count: number }[];
  rows: EvidenceRow[];
  /** '' when the tab has rows */
  empty: string;
  /** the court is open: the defence tags and strengths may be shown */
  courtOpen: boolean;
  /** the note under the list while the court is shut (6.3.11: look, do not cite) */
  hint: string;
}

export interface EvidenceInput {
  /** the pieces of evidence (the 证物 page) */
  pieces: readonly EvidenceRowView[];
  /** the historical records (the 史料 page) */
  records: readonly EvidenceRowView[];
  tab: EvidenceTab;
  courtOpen: boolean;
  /** the player's note on a piece ('' when none) */
  note(itemId: string): string;
}

/** The maximum length of a player note (19.2 备注 40). */
export const NOTE_MAX = 40;

/** The text key of each court line (src/systems/scenes/court.ts `LINES` and the plea). */
export const LINE_KEYS = {
  fact: 'ui.win.evidence.line.fact',
  just: 'ui.win.evidence.line.just',
  need: 'ui.win.evidence.line.need',
  mitigate: 'ui.win.evidence.line.mitigate',
} as const satisfies Record<EvidenceLine, string>;

function row(r: EvidenceRowView, courtOpen: boolean, note: string): EvidenceRow {
  const origin =
    r.source !== undefined || r.how !== undefined
      ? t('ui.win.evidence.origin', {
          source: r.source === undefined ? t('ui.win.evidence.unknown_source') : t(r.source),
          how: r.how === undefined ? t('ui.win.evidence.unknown_how') : t(r.how),
        })
      : '';
  return {
    id: r.id,
    name: t(r.name),
    desc: r.desc === '' ? '' : t(r.desc),
    count: r.count > 1 ? t('ui.win.evidence.count', { n: r.count }) : '',
    code: r.code ?? '',
    origin,
    proves: r.proves !== undefined && courtOpen ? t(r.proves) : t('ui.win.evidence.may_be_useful'),
    custody: (r.custody ?? []).map((c) => t(c)),
    authenticity: r.authenticity ? t(`ui.win.evidence.authenticity.${r.authenticity}`) : '',
    tags: courtOpen ? r.tags.map((x) => t(LINE_KEYS[x])) : [],
    note,
  };
}

export function evidenceModel(i: EvidenceInput): EvidenceModel {
  const pieces = i.pieces;
  const records = i.records;
  const shown = i.tab === 'evidence' ? pieces : records;
  return {
    tab: i.tab,
    tabs: [
      { id: 'evidence', label: t('ui.win.evidence.tab.evidence'), count: pieces.length },
      { id: 'records', label: t('ui.win.evidence.tab.records'), count: records.length },
    ],
    rows: shown.map((r) => row(r, i.courtOpen, i.note(r.id))),
    empty:
      shown.length === 0
        ? i.tab === 'evidence'
          ? t('ui.win.evidence.pieces_empty')
          : t('ui.win.evidence.records_empty')
        : '',
    courtOpen: i.courtOpen,
    hint: i.courtOpen ? '' : t('ui.win.evidence.before_court'),
  };
}

/** A note the player typed: control characters dropped, cut to the 19.2 limit. */
export function cleanNote(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || c === 0x7f) continue;
    out += ch;
  }
  return out.slice(0, NOTE_MAX);
}
