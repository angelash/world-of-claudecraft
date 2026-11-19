// The window catalogue (ux_and_onboarding.md 2.3; the 23.1 M0 row on ui_ ids; the 23.2
// window check: every WINDOW_DEFS entry has a ui_ id, empty and error text keys and a help
// entry): every built
// and planned window carries its ui_win_ id and the text keys of its title, empty state,
// error state and help entry, all present in the source tables; the 31 windows of 2.3 are
// all listed; ids are unique and built windows open from the same ids.

import { describe, expect, it } from 'vitest';
import {
  ALL_WINDOWS,
  PLANNED_WINDOWS,
  WINDOW_DEFS,
  windowByUiId,
  windowTitle,
} from '../src/client/windows/window_registry';
import { SOURCE_TABLE } from '../src/shared_ui/i18n';

/** The 31 window ids of ux_and_onboarding.md 2.3, in its order. */
const DESIGN_WINDOWS = [
  'ui_win_character',
  'ui_win_inventory',
  'ui_win_doors',
  'ui_win_quests',
  'ui_win_rumors',
  'ui_win_map',
  'ui_win_party',
  'ui_win_company',
  'ui_win_territory',
  'ui_win_battle',
  'ui_win_strategy',
  'ui_win_goddess',
  'ui_win_saves',
  'ui_win_menu',
  'ui_win_help',
  'ui_win_trade',
  'ui_win_settings',
  'ui_win_debug',
  'ui_win_deeds',
  'ui_win_codex',
  'ui_win_craft',
  'ui_win_gather',
  'ui_win_beasts',
  'ui_win_atlas',
  'ui_win_board',
  'ui_win_letters',
  'ui_win_market',
  'ui_win_dungeon',
  'ui_win_evidence',
  'ui_win_council',
  'ui_win_army',
];

describe('window catalogue (23.2 window check)', () => {
  it('lists the 31 windows of 2.3: 27 built (the act-1 nine, PK-M1-23), 4 planned, ids unique', () => {
    expect(WINDOW_DEFS).toHaveLength(27);
    expect(PLANNED_WINDOWS).toHaveLength(4);
    expect(ALL_WINDOWS.map((w) => w.uiId).sort()).toEqual([...DESIGN_WINDOWS].sort());
    expect(new Set(ALL_WINDOWS.map((w) => w.uiId)).size).toBe(31);
  });

  it('gives every window a ui_win_ id built from its id', () => {
    for (const w of ALL_WINDOWS) {
      expect(w.uiId).toBe(`ui_win_${w.id}`);
      expect(windowByUiId(w.uiId)).toBe(w);
    }
    expect(windowByUiId('ui_win_nowhere')).toBeUndefined();
  });

  it('gives every window title, empty, error and help text keys that exist', () => {
    for (const w of ALL_WINDOWS) {
      for (const key of [w.titleKey, w.emptyKey, w.errorKey, w.helpKey]) {
        expect(SOURCE_TABLE[key], `${w.uiId}: ${key}`).toBeTruthy();
        expect(key.startsWith(`ui.win.${w.id}.`), key).toBe(true);
      }
    }
  });

  it('renders built window titles from the table, the debug window marked M0', () => {
    expect(windowTitle('inventory')).toBe('背包与装备');
    expect(windowTitle('debug')).toBe('世界状态与旗标');
    expect(WINDOW_DEFS.find((d) => d.id === 'debug')?.milestone).toBe('M0');
    expect(WINDOW_DEFS.find((d) => d.id === 'strategy')?.milestone).toBe('M3');
  });
});
