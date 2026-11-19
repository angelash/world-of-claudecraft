// Implements the model of `ui_scr_settings`, the settings shell (ux_and_onboarding.md 4.1):
// the eight pages in the order of 4.1 with their `ui_set_` ids, which of them this build
// paints (a page without a painter is left out of the tab list, never shown as an empty
// shell: 1.6), the tab after or before the current one (shoulder buttons and the window
// tab keys), and the sync-part patch of "restore this page's defaults" for the pages whose
// values live in the settings store. Pure; Node-tested.

import {
  defaultGameplay,
  type Language,
  type SyncPatch,
  type SyncSettings,
} from '../../app/settings_schema';
import { defaultInputSettings } from '../../input/input_settings';
import { accessDefaultsPatch } from './access_model';
import { audioDefaultsPatch } from './audio_model';

/** The pages of 4.1, in tab order. */
export const SETTINGS_PAGES = [
  'graphics',
  'audio',
  'controls',
  'gameplay',
  'llm',
  'access',
  'language',
  'data',
] as const;
export type SettingsPageId = (typeof SETTINGS_PAGES)[number];

/** Who builds each page (the pages this package does not paint name their package). */
export const PAGE_OWNERS: Readonly<Record<SettingsPageId, string>> = {
  graphics: 'PK-M1-22',
  audio: 'PK-M1-06',
  controls: 'PK-M1-22',
  gameplay: 'PK-M1-22',
  llm: 'PK-M1-02',
  access: 'PK-M1-23',
  language: 'PK-M1-22',
  data: 'PK-M1-57',
};

/** `ui_set_<page>` (2.1). */
export function pageUiId(page: SettingsPageId): `ui_set_${SettingsPageId}` {
  return `ui_set_${page}`;
}

export interface SettingsTab {
  id: SettingsPageId;
  uiId: `ui_set_${SettingsPageId}`;
  /** tab label text key */
  labelKey: `ui.set.${SettingsPageId}.tab`;
}

/** The tabs to show: the pages that have a painter, in 4.1 order. */
export function settingsTabs(painted: ReadonlySet<SettingsPageId>): SettingsTab[] {
  return SETTINGS_PAGES.filter((p) => painted.has(p)).map((id) => ({
    id,
    uiId: pageUiId(id),
    labelKey: `ui.set.${id}.tab`,
  }));
}

/** The page to open: the requested one when it is shown, else the first shown page. */
export function initialPage(
  tabs: readonly SettingsTab[],
  wanted?: SettingsPageId | null,
): SettingsPageId | null {
  if (wanted && tabs.some((t) => t.id === wanted)) return wanted;
  return tabs[0]?.id ?? null;
}

/** The tab `delta` steps from `current`, wrapping around (LB and RB, 4.1). */
export function stepTab(
  tabs: readonly SettingsTab[],
  current: SettingsPageId,
  delta: number,
): SettingsPageId {
  if (tabs.length === 0) return current;
  const i = Math.max(
    0,
    tabs.findIndex((t) => t.id === current),
  );
  const n = tabs.length;
  return (tabs[(((i + delta) % n) + n) % n] as SettingsTab).id;
}

/** Interface languages this build ships (D-077: Simplified Chinese at 1.0; 4.8). */
export const SHIPPED_LANGUAGES: readonly Language[] = ['zh-Hans'];

/**
 * The sync-part patch that restores a page's defaults, or null when the page has nothing in
 * the sync part to restore (graphics restores through the session; the model page keeps its
 * own partition).
 */
export function pageDefaultsPatch(
  page: SettingsPageId,
  sync: Readonly<SyncSettings>,
): SyncPatch | null {
  switch (page) {
    case 'audio':
      return audioDefaultsPatch();
    case 'controls':
      return {
        contextKeys: {},
        padKeys: {},
        input: defaultInputSettings(),
        accessibility: { ...sync.accessibility, holdToToggle: false },
      };
    case 'gameplay':
      return { gameplay: defaultGameplay() };
    case 'access':
      return accessDefaultsPatch();
    case 'language':
      return { language: 'zh-Hans' };
    default:
      return null;
  }
}

/** Pages whose defaults the bottom button restores (graphics through the session). */
export function hasPageDefaults(page: SettingsPageId): boolean {
  return (
    page === 'graphics' ||
    page === 'audio' ||
    page === 'controls' ||
    page === 'gameplay' ||
    page === 'access' ||
    page === 'language'
  );
}
