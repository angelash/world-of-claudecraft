// The four first-run pages. A skipped page contributes its defaults, never the tentative
// value the player tried in its preview. Completion is persisted by the platform owner.

import { defaultSettings, type SyncPatch, type SyncSettings } from '../app/settings_schema';

export const FIRST_RUN_PAGES = ['language', 'visibility', 'input', 'ai'] as const;
export type FirstRunPage = (typeof FIRST_RUN_PAGES)[number];

export function firstRunPatch(
  page: FirstRunPage,
  draft: Readonly<SyncSettings>,
  skipped: boolean,
): SyncPatch {
  const source = skipped ? defaultSettings('sync') : draft;
  if (page === 'language')
    return {
      language: source.language,
      accessibility: { ...draft.accessibility, textScale: source.accessibility.textScale },
    };
  if (page === 'visibility')
    return {
      accessibility: {
        ...draft.accessibility,
        colorMode: source.accessibility.colorMode,
        reduceFlashing: source.accessibility.reduceFlashing,
      },
    };
  if (page === 'input') return { input: { ...draft.input, glyphs: source.input.glyphs } };
  return {};
}
