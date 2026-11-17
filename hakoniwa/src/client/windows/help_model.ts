// Implements the model of `ui_win_help`'s control lines (ux_and_onboarding.md 6.2.15, 16.8):
// every line holds `{key:}` references, so the lines are rendered again on each refresh and the
// window rebuilds only when the text changed (a device switch, a rebound key). Pure;
// Node-tested. The painter is help_window.ts.

import { t } from '../../shared_ui/i18n';

/** The help lines in order (17.7 extends them with the glossary). */
export const HELP_LINE_KEYS = Array.from(
  { length: 16 },
  (_, i) => `ui.win.help.line.${i}` as const,
);

export interface HelpModel {
  lines: string[];
  /** changes whenever a line's text changes */
  sig: string;
}

export function helpModel(): HelpModel {
  const lines = HELP_LINE_KEYS.map((k) => t(k));
  return { lines, sig: lines.join('\n') };
}
