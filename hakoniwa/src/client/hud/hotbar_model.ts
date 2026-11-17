// Hotbar layout, `ui_hud_hotbar` (ux_and_onboarding.md 5.2, 16.2, 16.3): one table of 24
// slots shown two ways. Keyboard and mouse: two rows of 12 (1 to 0, minus, equals; the second
// row with Shift); a gamepad: three groups of 8 (LT held, RT held, both held), each the d-pad
// and the four face buttons. Slot 1 to 8 is the LT group, 9 to 16 the RT group, 17 to 24 the
// group of both. The first row or group always shows; the others only when a slot in them
// is filled. Each slot carries the glyph of its current binding. Pure.

import { t } from '../../shared_ui/i18n';
import { chordFor, HOTBAR_ROW, HOTBAR_SIZE } from '../input/contexts';
import type { InputDevice } from '../input/device';
import { chordText, type KeyTextState, padButtonText } from '../input/glyphs';
import { HOTBAR_LAYER, hotbarLayers, hotbarSlotPosition } from '../input/pad_bindings';

export interface HotbarRowModel {
  /** slot numbers, 1-based */
  slots: number[];
  visible: boolean;
  /** the gamepad group whose layer is held */
  active: boolean;
  /** the layer glyph of a gamepad group ("LT"), empty for a keyboard row */
  label: string;
}

export interface HotbarLayout {
  device: InputDevice;
  rows: HotbarRowModel[];
  /** the glyph of each slot, index 0 for slot 1 */
  keys: string[];
}

const run = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

/** The rows (keyboard) or groups (gamepad) and the slot glyphs. */
export function hotbarLayout(
  state: KeyTextState,
  filled: ReadonlySet<number>,
  layersHeld: { a: boolean; b: boolean },
): HotbarLayout {
  const keys = run(1, HOTBAR_SIZE).map((slot) => slotKeyText(slot, state));
  const any = (slots: number[]) => slots.some((s) => filled.has(s));
  if (state.device === 'pad') {
    const layers = hotbarLayers(state.pad);
    const held = layersHeld.a && layersHeld.b ? 2 : layersHeld.a ? 0 : layersHeld.b ? 1 : -1;
    const labels = [
      padButtonText(layers.a, state.family),
      padButtonText(layers.b, state.family),
      t('ui.common.key.combo', {
        a: padButtonText(layers.a, state.family),
        b: padButtonText(layers.b, state.family),
      }),
    ];
    const rows = [0, 1, 2].map((g) => {
      const slots = run(g * HOTBAR_LAYER + 1, HOTBAR_LAYER);
      return {
        slots,
        visible: g === 0 || any(slots) || held === g,
        active: held === g,
        label: labels[g] as string,
      };
    });
    return { device: 'pad', rows, keys };
  }
  const rows = [0, 1].map((r) => {
    const slots = run(r * HOTBAR_ROW + 1, HOTBAR_ROW);
    return { slots, visible: r === 0 || any(slots), active: false, label: '' };
  });
  return { device: 'kbm', rows, keys };
}

/** The glyph of one slot: its key chord, or its cluster button in a gamepad group. */
export function slotKeyText(slot: number, state: KeyTextState): string {
  if (state.device === 'pad') {
    const pos = hotbarSlotPosition(slot);
    if (!pos) return '';
    // inside a group the d-pad reads as plain arrows
    const b = pos.button;
    if (b === 'up' || b === 'down' || b === 'left' || b === 'right') {
      return t(`ui.common.key.arrow_${b}`);
    }
    return padButtonText(b, state.family);
  }
  const c = chordFor(state.kbm, 'field', `hotbar_${slot}`);
  return c ? chordText(c, state.layout) : '';
}
