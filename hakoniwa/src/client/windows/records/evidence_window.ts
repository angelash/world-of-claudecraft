// Paints `ui_win_evidence` (ux_and_onboarding.md 6.3.11): the pieces of evidence and the
// historical records the player keeps, with the player's own note on each. Thin painter over
// ./evidence_model.ts. Notes are client data (the save's client segment): the session passes
// the store; without one the notes are not offered. The note box is a kept node, so a refresh
// never takes the focus from it (6.1).

import { el } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import type { EvidenceNoteStore } from '../../view/adapters_records';
import { badge, empty, rebuilder, tabs } from '../kit';
import { placeholderWindow } from '../simple_windows';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';
import {
  cleanNote,
  type EvidenceRow,
  type EvidenceTab,
  evidenceModel,
  NOTE_MAX,
} from './evidence_model';
import './records.css';

function noteBox(row: EvidenceRow, notes: EvidenceNoteStore, onSaved: () => void): HTMLElement {
  const input = el('input', {
    className: 'hk-input hk-evidence-note',
    attrs: {
      type: 'text',
      maxlength: String(NOTE_MAX),
      placeholder: t('ui.win.evidence.note_placeholder'),
      'aria-label': t('ui.win.evidence.note_label', { name: row.name }),
    },
  });
  input.value = row.note;
  input.addEventListener('change', () => {
    notes.setNote(row.id, cleanNote(input.value));
    onSaved();
  });
  return el('div', { className: 'hk-row' }, [
    el('span', { className: 'hk-muted', text: t('ui.win.evidence.note') }),
    input,
  ]);
}

function pieceCard(r: EvidenceRow, notes: EvidenceNoteStore | undefined, saved: () => void) {
  return el('div', { className: 'hk-card hk-evidence' }, [
    el('div', { className: 'hk-card-head' }, [
      el('strong', { text: r.name }),
      el('span', { className: 'hk-row-inline' }, [
        r.code ? badge(r.code) : null,
        r.count ? badge(r.count) : null,
        r.authenticity ? badge(r.authenticity) : null,
      ]),
    ]),
    r.desc ? el('div', { className: 'hk-card-text', text: r.desc }) : null,
    r.origin ? el('div', { className: 'hk-muted', text: r.origin }) : null,
    el('div', { className: 'hk-evidence-proves', text: r.proves }),
    r.custody.length
      ? el('div', {
          className: 'hk-muted',
          text: t('ui.win.evidence.custody', { chain: r.custody.join(t('ui.win.evidence.sep')) }),
        })
      : null,
    r.tags.length
      ? el(
          'div',
          { className: 'hk-row-inline' },
          r.tags.map((x) => badge(x)),
        )
      : null,
    notes ? noteBox(r, notes, saved) : null,
  ]);
}

/**
 * The evidence window. `notes` is the player's note store from the save's client segment
 * (the session wires it); without one the note boxes are left out.
 */
export function evidenceWindow(ctx: WindowContext, notes?: EvidenceNoteStore): WindowContent {
  const ad = ctx.adapters.evidence;
  if (!ad) return placeholderWindow();
  const body = el('div');
  let force = 0;
  const strip = tabs<EvidenceTab>(
    [
      { id: 'evidence', label: t('ui.win.evidence.tab.evidence') },
      { id: 'records', label: t('ui.win.evidence.tab.records') },
    ],
    'evidence',
    () => {
      force++;
      update();
    },
  );
  const saved = () => {
    force++;
  };
  const update = rebuilder(
    body,
    () => ({
      force,
      m: evidenceModel({
        pieces: ad.evidence(ctx.view),
        records: ad.records(ctx.view),
        tab: strip.current(),
        courtOpen: ad.courtOpen(ctx.view),
        note: (id) => notes?.note(id) ?? '',
      }),
    }),
    ({ m }) => {
      if (m.hint) body.append(el('p', { className: 'hk-muted hk-evidence-hint', text: m.hint }));
      if (m.empty) {
        body.append(empty(m.empty));
        return;
      }
      for (const r of m.rows) body.append(pieceCard(r, notes, saved));
    },
  );
  return {
    el: el('div', { className: 'hk-evidence-win' }, [strip.strip, body]),
    update: () => {
      // a note being typed keeps its node: rebuild only when the focus is elsewhere
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (active && body.contains(active) && active.tagName === 'INPUT') return;
      update();
    },
  };
}
