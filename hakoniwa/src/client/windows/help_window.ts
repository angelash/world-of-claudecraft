// Implements `ui_win_help`, the controls lines of the help window (ux_and_onboarding.md 6.2.15):
// the lines name the current device's keys, so each refresh renders them again and the list
// is rebuilt only when a line changed (the device or a binding changed). Thin painter over
// ./help_model.ts; the glossary of 17.7 joins with PK-M1-23.

import { clear, el } from '../../shared_ui/dom';
import { helpModel } from './help_model';
import type { WindowContent } from './window_manager';

export function helpWindow(): WindowContent {
  const root = el('ul', { className: 'hk-help' });
  let sig: string | null = null;
  const update = () => {
    const m = helpModel();
    if (m.sig === sig) return;
    sig = m.sig;
    clear(root);
    for (const line of m.lines) root.append(el('li', { text: line }));
  };
  update();
  return { el: root, update };
}
