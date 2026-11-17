// Gamepad on the screens before a game runs (the title, the save list; ux_and_onboarding.md
// 3.3, 16.3 "windows and menus"): while the title screen is up, the d-pad and the left stick
// move the focus between its controls, A presses the focused one and B presses the back
// button of the save list. Once a session runs, its own input layer takes the pad. Thin DOM layer over the
// pure gamepad reader and focus navigation.

import { t } from '../../shared_ui/i18n';
import { type FocusMove, type FocusRect, moveFocus } from './focus_nav';
import { PadReader } from './gamepad';
import { readGamepad } from './gamepad_poller';

const SCREEN = '.hk-boot';
const CONTROLS = 'button:not([disabled]), input:not([disabled]), select:not([disabled])';
const PAD_FOCUS = 'hk-pad-focus';

/**
 * Start polling the pad for the title screen; returns the stop function. `swapped` reads the
 * confirm and back swap of the input settings (16.6 rule 5) once they are loaded.
 */
export function startMenuPad(root: HTMLElement, swapped: () => boolean = () => false): () => void {
  const reader = new PadReader();
  let raf = 0;
  let stopped = false;
  const controls = (screen: Element) =>
    [...screen.querySelectorAll<HTMLElement>(CONTROLS)].filter((e) => e.getClientRects().length);
  const focus = (e: HTMLElement) => {
    for (const old of root.querySelectorAll(`.${PAD_FOCUS}`)) old.classList.remove(PAD_FOCUS);
    e.focus();
    e.classList.add(PAD_FOCUS);
  };
  const move = (screen: Element, m: FocusMove) => {
    const list = controls(screen);
    const rects: FocusRect[] = list.map((e, i) => {
      const r = e.getBoundingClientRect();
      return { id: String(i), x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const cur = list.indexOf(document.activeElement as HTMLElement);
    const next = moveFocus(rects, cur >= 0 ? String(cur) : null, m);
    const e = next === null ? undefined : list[Number(next)];
    if (e) focus(e);
  };
  const loop = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const screen = root.querySelector(SCREEN);
    if (!screen) {
      reader.reset();
      return;
    }
    const frame = reader.read(readGamepad(), now);
    for (const ev of frame.events) {
      if (ev.type === 'gesture' && ev.stick === 'left') move(screen, ev.dir);
      if (ev.type !== 'down' && ev.type !== 'repeat') continue;
      if (
        ev.button === 'up' ||
        ev.button === 'down' ||
        ev.button === 'left' ||
        ev.button === 'right'
      )
        move(screen, ev.button);
      if (ev.type !== 'down') continue;
      const active = document.activeElement as HTMLElement | null;
      const confirm = swapped() ? 'b' : 'a';
      const back = swapped() ? 'a' : 'b';
      if (ev.button === confirm) {
        if (active && screen.contains(active)) active.click();
        else move(screen, 'next');
      } else if (ev.button === back) {
        const back = t('ui.scr.title.back');
        controls(screen)
          .find((e) => e.textContent === back)
          ?.click();
      }
    }
  };
  raf = requestAnimationFrame(loop);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
