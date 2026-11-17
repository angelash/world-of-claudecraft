// What every settings page painter gives the shell (ui_scr_settings, ux_and_onboarding.md 4.1).

import type { WindowContext } from '../window_context';

export interface SettingsPage {
  el: HTMLElement;
  /** called a few times a second while the page shows; writes only what changed */
  update(): void;
  dispose?(): void;
}

export type SettingsPageFactory = (ctx: WindowContext) => SettingsPage;
