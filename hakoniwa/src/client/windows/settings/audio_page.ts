// Implements `ui_set_audio` (ux_and_onboarding.md 4.3): the five volume sliders, output,
// dynamic range, the background-window rule, the audio switches and the rumble strength.
// Every change is written to the sync settings part; the audio subsystem picks it up on its
// next frame. Thin painter over audio_model.ts; registered in settings_window.ts PAINTERS.

import { clear, el, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import type { WindowContext } from '../window_context';
import {
  type AudioField,
  type AudioRow,
  audioPageModel,
  audioPatch,
  levelText,
} from './audio_model';
import type { SettingsPage } from './page';

export function audioPage(ctx: WindowContext): SettingsPage {
  const apply = (field: AudioField, raw: string | number | boolean) => {
    const patch = audioPatch(ctx.prefs.sync, field, raw);
    if (patch) ctx.prefs.updateSync(patch);
  };
  const body = el('div', { className: 'hk-set-audio' });
  let sig = '';

  function control(row: AudioRow): HTMLElement {
    const id = `hk-audio-${row.field.replace('.', '-')}`;
    if (row.kind === 'toggle') {
      const box = el('input', { attrs: { type: 'checkbox', id } });
      box.checked = row.value;
      box.addEventListener('change', () => apply(row.field, box.checked));
      return el('div', {}, [
        el('div', { className: 'hk-set-row' }, [
          box,
          el('label', { text: row.label, attrs: { for: id } }),
        ]),
        row.note ? el('div', { className: 'hk-set-note', text: row.note }) : null,
      ]);
    }
    if (row.kind === 'choice') {
      const select = el('select', { attrs: { id } });
      for (const o of row.options)
        select.append(el('option', { text: o.label, attrs: { value: o.value } }));
      select.value = row.value;
      select.addEventListener('change', () => apply(row.field, select.value));
      return el('div', {}, [
        el('div', { className: 'hk-set-row' }, [
          el('label', { text: row.label, attrs: { for: id } }),
          select,
        ]),
        row.note ? el('div', { className: 'hk-set-note', text: row.note }) : null,
      ]);
    }
    const input = el('input', {
      attrs: {
        type: 'range',
        id,
        min: String(row.min),
        max: String(row.max),
        step: String(row.step),
      },
    });
    input.value = String(row.value);
    const value = el('span', { className: 'hk-set-value', text: row.text });
    input.addEventListener('input', () => setText(value, levelText(Number(input.value))));
    input.addEventListener('change', () => apply(row.field, Number(input.value)));
    return el('div', { className: 'hk-set-row' }, [
      el('label', { text: row.label, attrs: { for: id } }),
      input,
      value,
    ]);
  }

  function paint(): void {
    const m = audioPageModel(ctx.prefs.sync);
    const next = JSON.stringify(m);
    if (next === sig) return;
    // Never rebuild under a control the player is moving.
    if (body.contains(document.activeElement) && sig !== '') return;
    sig = next;
    clear(body);
    const group = (title: string, rows: AudioRow[]) => {
      body.append(el('h3', { text: title }));
      for (const r of rows) body.append(control(r));
    };
    group(t('ui.set.audio.volumes'), m.volumes);
    group(t('ui.set.audio.output_title'), m.output);
    group(t('ui.set.audio.behaviour'), m.behaviour);
    group(t('ui.set.audio.pad'), m.pad);
    body.append(el('div', { className: 'hk-set-note', text: m.accessNote }));
  }

  paint();
  return { el: body, update: paint };
}
