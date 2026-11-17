// Implements `ui_set_controls` (ux_and_onboarding.md 4.4, 16.6): per context, the key-mouse
// rows (primary and secondary slot: click a slot, press the new key; Esc cancels, Delete
// clears) and the pad rows (pick a button and how it is pressed); a clash marks both sides
// and offers "replace" or "cancel"; the gamepad, key-mouse and long-press options; reset of
// this context or of everything; export and import of the scheme as JSON text. Every change
// goes to the settings store at once and the input layer reads it on the next HUD refresh.
// Thin painter over ./controls_model.ts and the rebinding cores of src/client/input/.

import { clear, el, setText } from '../../../shared_ui/dom';
import { listSeparator, t } from '../../../shared_ui/i18n';
import type { SyncPatch } from '../../app/settings_schema';
import { askConfirm } from '../../hud/confirm_pop';
import {
  type BoundSlot,
  type InputContext,
  type KeyChord,
  resetKeymap,
  slotKey,
} from '../../input/contexts';
import { chordText, keyCapText, padChordText } from '../../input/glyphs';
import { type PadChord, resetPadKeymap } from '../../input/pad_bindings';
import type { WindowContext } from '../window_context';
import {
  bindKey,
  bindPad,
  conflictLabel,
  contextLabel,
  exportControls,
  importControls,
  importErrorText,
  keyRows,
  type OptionField,
  type OptionRow,
  optionPatch,
  optionRows,
  PAD_PICK_BUTTONS,
  type PadPress,
  padChordFrom,
  padPressOf,
  padRows,
  type RecordedKey,
  recordedKey,
  recordedMouse,
  refusalText,
  replaceKey,
  replacePad,
  rowFamily,
  type SlotRef,
  slotShown,
  visibleContexts,
} from './controls_model';
import type { SettingsPage } from './page';

type Device = 'kbm' | 'pad';

interface Pending {
  device: Device;
  at: SlotRef;
  chord: KeyChord | PadChord;
  conflicts: BoundSlot[];
}

export function controlsPage(ctx: WindowContext): SettingsPage {
  let device: Device = 'kbm';
  let context: InputContext = 'field';
  let recording: SlotRef | null = null;
  let picking: SlotRef | null = null;
  let pending: Pending | null = null;
  let notice: { text: string; info: boolean } | null = null;
  let rowsSig = '';
  let optSig = '';

  const sync = () => ctx.prefs.sync;
  const write = (patch: SyncPatch): boolean => {
    const ok = ctx.prefs.updateSync(patch);
    if (!ok) notice = { text: t('ui.set.controls.save_failed'), info: false };
    return ok;
  };
  const refresh = () => {
    rowsSig = '';
    paint();
  };

  // ---- top bar: device and context
  const kbmBtn = el('button', {
    className: 'hk-btn hk-btn-small',
    text: t('ui.set.controls.device.kbm'),
    attrs: { type: 'button', 'aria-pressed': 'true' },
    on: { click: () => setDevice('kbm') },
  });
  const padBtn = el('button', {
    className: 'hk-btn hk-btn-small',
    text: t('ui.set.controls.device.pad'),
    attrs: { type: 'button', 'aria-pressed': 'false' },
    on: { click: () => setDevice('pad') },
  });
  const contextSelect = el('select', {
    attrs: { id: 'hk-ctl-context', 'aria-label': t('ui.set.controls.context_label') },
  });
  contextSelect.addEventListener('change', () => {
    cancelEdits();
    context = contextSelect.value as InputContext;
    refresh();
  });
  const bar = el('div', { className: 'hk-ctl-bar' }, [kbmBtn, padBtn, contextSelect]);

  const noticeEl = el('div', { className: 'hk-ctl-notice' });
  const conflictText = el('div');
  const conflictBox = el('div', { className: 'hk-ctl-notice' }, [
    conflictText,
    el('div', { className: 'hk-row' }, [
      el('button', {
        className: 'hk-btn hk-btn-small hk-btn-primary',
        text: t('ui.set.controls.replace'),
        attrs: { type: 'button' },
        on: { click: () => replacePending() },
      }),
      el('button', {
        className: 'hk-btn hk-btn-small',
        text: t('ui.set.controls.cancel'),
        attrs: { type: 'button' },
        on: {
          click: () => {
            pending = null;
            refresh();
          },
        },
      }),
    ]),
  ]);
  const pickerEl = el('div', { className: 'hk-ctl-picker' });
  const rowsEl = el('div', { className: 'hk-ctl-rows', attrs: { role: 'list' } });
  const optionsEl = el('div', { className: 'hk-ctl-options' });

  // ---- scheme: reset, export, import
  const schemeText = el('textarea', {
    attrs: { 'aria-label': t('ui.set.controls.scheme_text'), spellcheck: 'false' },
  });
  const schemeMsg = el('div', { className: 'hk-set-note' });
  const scheme = el('div', { className: 'hk-ctl-scheme' }, [
    el('h3', { text: t('ui.set.controls.scheme') }),
    el('div', { className: 'hk-row' }, [
      el('button', {
        className: 'hk-btn hk-btn-small',
        text: t('ui.set.controls.reset_context'),
        attrs: { type: 'button' },
        on: { click: () => void resetContext() },
      }),
      el('button', {
        className: 'hk-btn hk-btn-small',
        text: t('ui.set.controls.export'),
        attrs: { type: 'button' },
        on: {
          click: () => {
            schemeText.value = exportControls(sync());
            schemeText.select();
            setText(schemeMsg, t('ui.set.controls.exported'));
          },
        },
      }),
      el('button', {
        className: 'hk-btn hk-btn-small',
        text: t('ui.set.controls.import'),
        attrs: { type: 'button' },
        on: { click: () => void importScheme() },
      }),
    ]),
    schemeText,
    schemeMsg,
  ]);

  const root = el('div', { className: 'hk-set-controls' }, [
    bar,
    noticeEl,
    conflictBox,
    pickerEl,
    rowsEl,
    optionsEl,
    scheme,
  ]);

  // ---- recording a key (document capture: the game never sees these presses)
  const onKey = (ev: KeyboardEvent) => {
    if (!recording) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (ev.type !== 'keydown' || ev.repeat) return;
    finishRecording(recordedKey(ev));
  };
  const onPointer = (ev: PointerEvent) => {
    if (!recording) return;
    const target = ev.target as HTMLElement | null;
    if (ev.button === 0) {
      // a click anywhere else cancels; the slot's own click is handled by the slot
      if (!target?.closest('.hk-ctl-slot.recording')) finishRecording({ kind: 'cancel' });
      return;
    }
    ev.stopPropagation();
    ev.preventDefault();
    finishRecording(recordedMouse(ev.button, ev));
  };
  const onContextMenu = (ev: MouseEvent) => {
    if (recording) ev.preventDefault();
  };
  const listen = (on: boolean) => {
    const f = on
      ? document.addEventListener.bind(document)
      : document.removeEventListener.bind(document);
    f('keydown', onKey as EventListener, true);
    f('keyup', onKey as EventListener, true);
    f('pointerdown', onPointer as EventListener, true);
    f('contextmenu', onContextMenu as EventListener, true);
  };

  function startRecording(at: SlotRef): void {
    pending = null;
    picking = null;
    notice = {
      text: t('ui.set.controls.recording_hint', {
        cancel: keyCapText('Escape'),
        clear: keyCapText('Delete'),
      }),
      info: true,
    };
    if (!recording) listen(true);
    recording = at;
    refresh();
  }

  function stopRecording(): void {
    if (recording) listen(false);
    recording = null;
  }

  function finishRecording(r: RecordedKey): void {
    const at = recording;
    if (!at || r.kind === 'wait') return;
    stopRecording();
    notice = null;
    if (r.kind === 'chord' || r.kind === 'clear') {
      const chord = r.kind === 'chord' ? r.chord : null;
      const out = bindKey(sync().contextKeys, at, chord);
      applyKeyOutcome(at, out);
    }
    refresh();
  }

  function applyKeyOutcome(at: SlotRef, out: ReturnType<typeof bindKey>): void {
    if (out.kind === 'bound') {
      if (write({ contextKeys: out.overrides }) && out.reserved) {
        notice = { text: t('ui.set.controls.reserved'), info: true };
      }
    } else if (out.kind === 'conflict') {
      pending = { device: 'kbm', at, chord: out.chord, conflicts: out.conflicts };
    } else {
      notice = { text: refusalText(out.reason), info: false };
    }
  }

  function applyPadOutcome(at: SlotRef, out: ReturnType<typeof bindPad>): void {
    if (out.kind === 'bound') write({ padKeys: out.overrides });
    else if (out.kind === 'conflict')
      pending = { device: 'pad', at, chord: out.chord, conflicts: out.conflicts };
    else notice = { text: refusalText(out.reason), info: false };
  }

  function replacePending(): void {
    const p = pending;
    pending = null;
    if (!p) return;
    if (p.device === 'kbm') {
      applyKeyOutcome(p.at, replaceKey(sync().contextKeys, p.at, p.chord as KeyChord, p.conflicts));
    } else {
      applyPadOutcome(p.at, replacePad(sync().padKeys, p.at, p.chord as PadChord, p.conflicts));
    }
    refresh();
  }

  function cancelEdits(): void {
    stopRecording();
    picking = null;
    pending = null;
    notice = null;
  }

  function setDevice(d: Device): void {
    if (d === device) return;
    cancelEdits();
    device = d;
    kbmBtn.setAttribute('aria-pressed', String(d === 'kbm'));
    padBtn.setAttribute('aria-pressed', String(d === 'pad'));
    refresh();
  }

  async function resetContext(): Promise<void> {
    cancelEdits();
    const yes = await askConfirm({
      title: t('ui.set.controls.reset_context'),
      body: t('ui.set.controls.reset_context_body', {
        context: contextLabel(context),
        device: t(`ui.set.controls.device.${device}`),
      }),
    });
    if (!yes) return;
    write(
      device === 'kbm'
        ? { contextKeys: resetKeymap(sync().contextKeys, context) }
        : { padKeys: resetPadKeymap(sync().padKeys, context) },
    );
    refresh();
  }

  async function importScheme(): Promise<void> {
    cancelEdits();
    const r = importControls(schemeText.value);
    if (!r.ok) {
      setText(schemeMsg, importErrorText(r.reason));
      return;
    }
    const yes = await askConfirm({
      title: t('ui.set.controls.import'),
      body: t('ui.set.controls.import_body'),
    });
    if (!yes) return;
    if (write(r.patch)) setText(schemeMsg, t('ui.set.controls.imported'));
    refresh();
  }

  // ---- painting

  function slotButton(
    key: string,
    text: string,
    cls: string,
    onClick: (() => void) | null,
    title = '',
  ): HTMLButtonElement {
    return el('button', {
      className: `hk-ctl-slot ${cls}`.trim(),
      text,
      title,
      dataset: { key },
      attrs: onClick ? { type: 'button' } : { type: 'button', disabled: '' },
      on: onClick ? { click: onClick } : {},
    });
  }

  function marked(): Set<string> {
    const out = new Set<string>();
    if (!pending) return out;
    out.add(slotKey(pending.at.context, pending.at.action, pending.at.slot));
    for (const c of pending.conflicts) out.add(slotKey(c.context, c.action, c.slot));
    return out;
  }

  function paintRows(): void {
    const s = sync();
    const flags = ctx.view.flags();
    const contexts = visibleContexts(flags);
    if (!contexts.includes(context))
      context = contexts.includes('field') ? 'field' : (contexts[0] as InputContext);
    const opts = { flags, devMode: ctx.devMode, marked: marked() };
    const family = rowFamily(s.input.glyphs);
    const rows =
      device === 'kbm'
        ? keyRows(context, s.contextKeys, opts)
        : padRows(context, s.padKeys, {
            ...opts,
            family,
            swapConfirmBack: s.input.swapConfirmBack,
          });
    const recKey = recording ? slotKey(recording.context, recording.action, recording.slot) : '';
    const sig = JSON.stringify([device, context, contexts, rows, recKey, picking, pending, notice]);
    if (sig === rowsSig) return;
    rowsSig = sig;

    // context list
    const ctxSig = contexts.join(',');
    if (contextSelect.dataset.sig !== ctxSig) {
      contextSelect.dataset.sig = ctxSig;
      clear(contextSelect);
      for (const c of contexts)
        contextSelect.append(el('option', { text: contextLabel(c), attrs: { value: c } }));
    }
    if (contextSelect.value !== context) contextSelect.value = context;

    // notices
    setText(noticeEl, notice?.text ?? '');
    noticeEl.hidden = !notice;
    noticeEl.classList.toggle('info', !!notice?.info);
    conflictBox.hidden = !pending;
    if (pending) {
      const chordLabel =
        pending.device === 'kbm'
          ? chordText(pending.chord as KeyChord)
          : padChordText(pending.chord as PadChord, family);
      setText(
        conflictText,
        t('ui.set.controls.conflict', {
          key: chordLabel,
          list: pending.conflicts
            .map((c) => conflictLabel(c, slotShown(c, flags, ctx.devMode)))
            .join(listSeparator('comma')),
        }),
      );
    }

    // keep the focused slot focused across the rebuild (pad and keyboard navigation)
    const focusedKey = (document.activeElement as HTMLElement | null)?.dataset?.key ?? null;
    clear(rowsEl);
    for (const r of rows) {
      const cells: HTMLElement[] = [el('span', { text: r.label })];
      for (const slot of r.slots) {
        const at: SlotRef = { context, action: r.action, slot: slot.slot };
        const cls = [
          slot.empty ? 'empty' : '',
          slot.changed ? 'changed' : '',
          slot.conflict ? 'conflict' : '',
        ];
        if ('locked' in slot) {
          const isRec = slot.key === recKey;
          cells.push(
            slotButton(
              slot.key,
              isRec ? t('ui.set.controls.recording') : slot.text,
              [...cls, isRec ? 'recording' : ''].join(' '),
              slot.locked
                ? null
                : () => {
                    if (isRec) {
                      stopRecording();
                      notice = null;
                      refresh();
                    } else startRecording(at);
                  },
              slot.locked ? t('ui.set.controls.locked') : '',
            ),
          );
        } else {
          cells.push(
            slotButton(
              slot.key,
              slot.text,
              [...cls, slot.rebindable ? '' : 'fixed'].join(' '),
              slot.rebindable
                ? () => {
                    pending = null;
                    notice = null;
                    picking = at;
                    refresh();
                  }
                : null,
              slot.rebindable ? '' : t('ui.set.controls.fixed'),
            ),
          );
        }
      }
      while (cells.length < 3) cells.push(el('span'));
      rowsEl.append(
        el(
          'div',
          {
            className: `hk-ctl-row${r.slots.some((x) => x.conflict) ? ' conflict' : ''}`,
            attrs: { role: 'listitem' },
          },
          cells,
        ),
      );
    }
    if (focusedKey) rowsEl.querySelector<HTMLElement>(`[data-key="${focusedKey}"]`)?.focus();
    paintPicker(family);
  }

  function paintPicker(family: ReturnType<typeof rowFamily>): void {
    clear(pickerEl);
    pickerEl.hidden = !picking || device !== 'pad';
    const at = picking;
    if (!at || device !== 'pad') return;
    const current = padRows(at.context, sync().padKeys, {
      flags: ctx.view.flags(),
      devMode: ctx.devMode,
      family,
      swapConfirmBack: sync().input.swapConfirmBack,
    })
      .find((r) => r.action === at.action)
      ?.slots.find((s) => s.slot === at.slot);
    const chord = current?.chord ?? null;
    const button = el('select', { attrs: { 'aria-label': t('ui.set.controls.pad_button') } });
    for (const b of PAD_PICK_BUTTONS) {
      button.append(
        el('option', { text: padChordText({ button: b }, family), attrs: { value: b } }),
      );
    }
    button.value = chord?.button ?? 'a';
    const press = el('select', { attrs: { 'aria-label': t('ui.set.controls.pad_press') } });
    press.append(el('option', { text: t('ui.set.controls.press.tap'), attrs: { value: 'tap' } }));
    press.append(el('option', { text: t('ui.set.controls.press.hold'), attrs: { value: 'hold' } }));
    for (const b of PAD_PICK_BUTTONS) {
      press.append(
        el('option', {
          text: t('ui.set.controls.press.with', { b: padChordText({ button: b }, family) }),
          attrs: { value: b },
        }),
      );
    }
    press.value = padPressOf(chord);
    const apply = () => {
      const c = padChordFrom(button.value as PadChord['button'], press.value as PadPress);
      picking = null;
      if (!c) notice = { text: refusalText('unknown'), info: false };
      else applyPadOutcome(at, bindPad(sync().padKeys, at, c));
      refresh();
    };
    pickerEl.append(
      el('span', {
        text: t('ui.set.controls.picking', {
          action: conflictLabel(at),
          slot: t(`ui.set.controls.slot.${at.slot}`),
        }),
      }),
      button,
      press,
      el('button', {
        className: 'hk-btn hk-btn-small hk-btn-primary',
        text: t('ui.set.controls.apply'),
        attrs: { type: 'button' },
        on: { click: apply },
      }),
      el('button', {
        className: 'hk-btn hk-btn-small',
        text: t('ui.set.controls.clear'),
        attrs: { type: 'button' },
        on: {
          click: () => {
            picking = null;
            applyPadOutcome(at, bindPad(sync().padKeys, at, null));
            refresh();
          },
        },
      }),
      el('button', {
        className: 'hk-btn hk-btn-small',
        text: t('ui.set.controls.cancel'),
        attrs: { type: 'button' },
        on: {
          click: () => {
            picking = null;
            refresh();
          },
        },
      }),
    );
    queueMicrotask(() => button.focus());
  }

  function optionControl(row: OptionRow): HTMLElement {
    const id = `hk-opt-${row.field}`;
    const set = (raw: string | number | boolean) => {
      const patch = optionPatch(sync(), row.field as OptionField, raw);
      // the new values change the signature by themselves: the panel rebuilds once focus
      // leaves it, never under the control the player is moving
      if (patch) write(patch);
    };
    if (row.kind === 'toggle') {
      const box = el('input', { attrs: { type: 'checkbox', id } });
      box.checked = row.value;
      box.addEventListener('change', () => set(box.checked));
      return el('div', { className: 'hk-set-row' }, [
        box,
        el('label', { text: row.label, attrs: { for: id } }),
      ]);
    }
    if (row.kind === 'choice') {
      const select = el('select', { attrs: { id } });
      for (const o of row.options)
        select.append(el('option', { text: o.label, attrs: { value: o.value } }));
      select.value = row.value;
      select.addEventListener('change', () => set(select.value));
      return el('div', { className: 'hk-set-row' }, [
        el('label', { text: row.label, attrs: { for: id } }),
        select,
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
    input.addEventListener('change', () => set(Number(input.value)));
    return el('div', { className: 'hk-set-row' }, [
      el('label', { text: row.label, attrs: { for: id } }),
      input,
      value,
    ]);
  }

  function paintOptions(): void {
    const s = sync();
    const groups = optionRows(s.input, s.accessibility.holdToToggle);
    const sig = JSON.stringify([device, groups]);
    if (sig === optSig) return;
    // never rebuild under a control the player is moving
    if (optionsEl.contains(document.activeElement) && optSig !== '') return;
    optSig = sig;
    clear(optionsEl);
    const group = (title: string, rows: OptionRow[]) => {
      optionsEl.append(el('h3', { text: title }));
      for (const r of rows) optionsEl.append(optionControl(r));
    };
    if (device === 'pad') group(t('ui.set.controls.opts_pad'), groups.pad);
    else group(t('ui.set.controls.opts_kbm'), groups.kbm);
    group(t('ui.set.controls.opts_hold'), groups.hold);
  }

  function paint(): void {
    paintRows();
    paintOptions();
  }

  paint();
  return {
    el: root,
    update: paint,
    dispose: () => cancelEdits(),
  };
}
