// Gamepad on the screens before a game runs (the title, the save list; ux_and_onboarding.md
// 3.3, 16.3 "windows and menus"): while the title screen is up, the d-pad and the left stick
// move the focus between its controls, A presses the focused one and B presses the back
// button of the save list. Once a session runs, its own input layer takes the pad. Thin DOM layer over the
// pure gamepad reader and focus navigation.

import { t } from '../../shared_ui/i18n';
import {
  cancelNativeModal,
  DomPadNavigation,
  inputControls,
  menuModalScope,
} from './dom_navigation';
import { readGamepad } from './gamepad_poller';

const PAD_FOCUS = 'hk-pad-focus';

/**
 * Start polling the pad for the title screen; returns the stop function. `swapped` reads the
 * confirm and back swap of the input settings (16.6 rule 5) once they are loaded.
 */
export function startMenuPad(root: HTMLElement, swapped: () => boolean = () => false): () => void {
  let raf = 0;
  let stopped = false;
  const focus = (e: HTMLElement) => {
    for (const old of root.querySelectorAll(`.${PAD_FOCUS}`)) old.classList.remove(PAD_FOCUS);
    e.focus();
    e.classList.add(PAD_FOCUS);
  };
  const pad = new DomPadNavigation(focus);
  const loop = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    // This poll lives for the whole app. Once the pre-game screens leave, the session's
    // InputLayer owns its native dialogs, so there must never be two pad consumers.
    const pregame = root.querySelector('.hk-newgame') ?? root.querySelector('.hk-boot');
    const modal = pregame ? menuModalScope(root) : null;
    const screen = modal ?? pregame;
    pad.frame(screen, readGamepad(), now, swapped() ? 'b' : 'a', swapped() ? 'a' : 'b', () => {
      if (modal instanceof HTMLDialogElement) cancelNativeModal(modal);
      else if (screen)
        inputControls(screen)
          .find((element) => element.textContent === t('ui.scr.title.back'))
          ?.click();
    });
  };
  raf = requestAnimationFrame(loop);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
