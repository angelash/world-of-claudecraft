// Implements `ui_set_access`, the accessibility page (ux_and_onboarding.md 4.7, 18): the four
// groups of access_model.ts as selects and checkboxes. A change writes the sync settings part at
// once (4.1: text and colour settings apply immediately); the session re-applies them to the
// page (src/client/app/accessibility.ts) and the audio re-reads the caption style. Thin painter
// over access_model.ts; writes only what changed.

import { el, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import type { WindowContext } from '../window_context';
import {
  type AccessChoiceField,
  type AccessRow,
  type AccessSwitchField,
  accessPageModel,
  accessPatch,
  fieldKey,
} from './access_model';
import type { SettingsPage } from './page';

interface RowRefs {
  input: HTMLSelectElement | HTMLInputElement;
  note: HTMLElement;
}

export function accessPage(ctx: WindowContext): SettingsPage {
  const model = () => accessPageModel(ctx.prefs.sync);
  const apply = (field: AccessChoiceField | AccessSwitchField, raw: string | boolean) => {
    const patch = accessPatch(ctx.prefs.sync, field, raw);
    if (patch) ctx.prefs.updateSync(patch);
  };
  const refs = new Map<string, RowRefs>();
  const groupNotes = new Map<string, HTMLElement>();

  const rowEl = (row: AccessRow): HTMLElement => {
    const id = `hk-access-${fieldKey(row.field)}`;
    const note = el('div', { className: 'hk-set-note' });
    let input: HTMLSelectElement | HTMLInputElement;
    let line: HTMLElement;
    if (row.kind === 'choice') {
      const select = el('select', { attrs: { id } });
      for (const o of row.options) {
        select.append(el('option', { text: o.label, attrs: { value: o.value } }));
      }
      select.addEventListener('change', () => apply(row.field, select.value));
      input = select;
      line = el('div', { className: 'hk-set-row' }, [
        el('label', { text: row.label, attrs: { for: id } }),
        select,
      ]);
    } else {
      const box = el('input', { attrs: { type: 'checkbox', id } });
      box.addEventListener('change', () => apply(row.field, box.checked));
      input = box;
      line = el('div', { className: 'hk-set-row' }, [
        box,
        el('label', { text: row.label, attrs: { for: id } }),
      ]);
    }
    refs.set(row.field, { input, note });
    return el('div', {}, [line, note]);
  };

  const first = model();
  const root = el(
    'div',
    { className: 'hk-set-access' },
    first.groups.flatMap((g) => {
      const note = el('div', { className: 'hk-set-note' });
      groupNotes.set(g.id, note);
      return [el('h3', { text: g.title }), ...g.rows.map(rowEl), note];
    }),
  );
  root.prepend(el('div', { className: 'hk-set-note', text: t('ui.set.access.intro') }));

  return {
    el: root,
    update: () => {
      for (const g of model().groups) {
        const gn = groupNotes.get(g.id);
        if (gn) setText(gn, g.note);
        for (const row of g.rows) {
          const r = refs.get(row.field);
          if (!r) continue;
          const focused = document.activeElement === r.input;
          if (row.kind === 'choice') {
            const sel = r.input as HTMLSelectElement;
            if (sel.value !== row.value && !focused) sel.value = row.value;
          } else {
            const box = r.input as HTMLInputElement;
            if (box.checked !== row.on && !focused) box.checked = row.on;
          }
          if (r.input.disabled !== row.disabled) r.input.disabled = row.disabled;
          setText(r.note, row.note);
          r.note.hidden = row.note === '';
        }
      }
    },
  };
}
