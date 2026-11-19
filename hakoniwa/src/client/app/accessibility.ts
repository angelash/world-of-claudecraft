// Applies the accessibility settings to the page (ux_and_onboarding.md 18.2, 18.3, 18.8): the
// colour-vision mode, the text size, larger dialogue text and "reduce flashing and shaking" as
// attributes, variables and classes on the document element; src/client/access.css hangs the
// token overrides and the calm rules off them. The world canvas cannot read CSS, so the same
// call hands the colour mode and the calm switch to the world painters
// (src/client/render/palette_modes.ts `setColourMode`, `setWorldCalm`). Writes only what
// changed. The session calls it at start and whenever the settings change (the settings store
// replaces its sync object on every write). Thin DOM side of ./access_apply_model.ts.

import '../access.css';
import { setColourMode, setWorldCalm } from '../render/palette_modes';
import { accessApply, accessWrites } from './access_apply_model';
import type { SyncSettings } from './settings_schema';

const written = new WeakMap<HTMLElement, string>();

/**
 * Write the accessibility settings onto `root` (the document element in the game) and the
 * world painters. Answers whether the world picture needs a redraw (its palette or its calm
 * switch changed).
 */
export function applyAccessibility(
  root: HTMLElement,
  sync: Readonly<SyncSettings>,
  systemReducedMotion: boolean,
): boolean {
  const v = accessApply(sync.accessibility, sync.subtitles, systemReducedMotion);
  const world = setColourMode(v.colorMode);
  const calm = setWorldCalm(v.calm);
  const w = accessWrites(v);
  const key = JSON.stringify(w);
  if (written.get(root) !== key) {
    written.set(root, key);
    for (const [name, value] of Object.entries(w.attrs)) {
      if (root.getAttribute(name) !== value) root.setAttribute(name, value);
    }
    for (const [name, value] of Object.entries(w.vars)) {
      if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
    }
    for (const [name, on] of Object.entries(w.classes)) root.classList.toggle(name, on);
  }
  return world || calm;
}

/** The system's "reduce motion" preference (18.8: reduce flashing follows it by default). */
export function systemReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
