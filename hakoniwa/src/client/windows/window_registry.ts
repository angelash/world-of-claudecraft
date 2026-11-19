// Window catalogue (architecture.md 7; ux_and_onboarding.md 2.3, the 23.1 M0 row on the
// window registry with ui_ ids, the 23.2 window check) and the availability rule: a window is usable when every
// flag in requiresAll is on, at least one of requiresAny is on (when listed), and it is not
// dev-only outside dev mode. Feature flags follow implementation_conventions.md 4
// (feature.<name>). Every window carries its ui_win_ id, the text keys of its title, its
// empty state, its error state and its help entry (all in locales/zh-Hans/ui.json), its
// milestone, and whether the client builds it yet: WINDOW_DEFS lists the built windows,
// PLANNED_WINDOWS the ones the design adds later (6.3). Pure; Node-tested.

import type { FlagValue } from '../../core/contracts';
import type { TextKey } from '../../core/text';
import { t } from '../../shared_ui/i18n';
import { flagOn } from '../view/game_view';

export type WindowId =
  | 'character'
  | 'doors'
  | 'inventory'
  | 'quests'
  | 'rumors'
  | 'map'
  | 'party'
  | 'company'
  | 'territory'
  | 'battle'
  | 'strategy'
  | 'goddess'
  | 'saves'
  | 'menu'
  | 'help'
  | 'trade'
  | 'settings'
  | 'debug'
  // the act-1 windows (6.3; PK-M1-23)
  | 'deeds'
  | 'codex'
  | 'craft'
  | 'gather'
  | 'beasts'
  | 'board'
  | 'letters'
  | 'dungeon'
  | 'evidence';

/** Windows of ux_and_onboarding.md 2.3 the client does not build yet (6.3). */
export type PlannedWindowId = 'atlas' | 'market' | 'council' | 'army';

/** Milestones of the design's window table (roadmap.md names). */
export type UiMilestone = 'M0' | 'M1' | 'M2' | 'M3';

/** The catalogue fields every window carries, built or planned (23.2 window check). */
export interface WindowEntry<Id extends string = string> {
  id: Id;
  /** `ui_win_<id>` (1.2, 2.3) */
  uiId: `ui_win_${Id}`;
  /** title text key */
  titleKey: TextKey;
  /** empty-state text key (6.1: every window says what is missing and what to do) */
  emptyKey: TextKey;
  /** error-state text key */
  errorKey: TextKey;
  /** help entry text key (17.7) */
  helpKey: TextKey;
  milestone: UiMilestone;
}

export interface WindowDef extends WindowEntry<WindowId> {
  /** hotkey label shown on the menu bar (KeyboardEvent.code handled by the keymap) */
  hotkey?: string;
  requiresAll?: readonly string[];
  requiresAny?: readonly string[];
  devOnly?: boolean;
  /** shown as a button on the menu bar */
  menuBar: boolean;
  width: number;
  /**
   * An interface mode (ux_and_onboarding.md 1.2, 1.3): full screen, closes every other
   * window, takes the input through its own context and pauses the world while open.
   */
  mode?: boolean;
  /** the world stands still while it is open: settings, saves, menu and help (1.3) */
  pauses?: boolean;
}

/** The catalogue fields of window `id` from its key family `ui.win.<id>.*`. */
function entry<Id extends string>(id: Id, milestone: UiMilestone): WindowEntry<Id> {
  return {
    id,
    uiId: `ui_win_${id}`,
    titleKey: `ui.win.${id}.title` as TextKey,
    emptyKey: `ui.win.${id}.empty_state` as TextKey,
    errorKey: `ui.win.${id}.error_state` as TextKey,
    helpKey: `ui.win.${id}.help` as TextKey,
    milestone,
  };
}

export const WINDOW_DEFS: readonly WindowDef[] = [
  // The menu bar follows this order (5.2): character, bag, corridor, quests, map, party, rumors,
  // deeds, codex, livelihoods, letters, goddesses, then the act-1 extras, then the windows the
  // later acts open, then saves and the dev window.
  { ...entry('character', 'M1'), hotkey: 'C', menuBar: true, width: 360 },
  { ...entry('inventory', 'M1'), hotkey: 'I', menuBar: true, width: 380 },
  // the corridor shows once the first door opens (thousand_doors.md 8 row 1); opening it
  // enters ui_mode_corridor (9)
  {
    ...entry('doors', 'M1'),
    requiresAll: ['feature.door_corridor'],
    hotkey: 'K',
    menuBar: true,
    width: 420,
    mode: true,
  },
  { ...entry('quests', 'M1'), hotkey: 'L', menuBar: true, width: 380 },
  { ...entry('map', 'M1'), hotkey: 'M', menuBar: true, width: 460 },
  // The act-1 windows (6.3) and the party window show once the player has met what they are
  // about (1.5; the client.win.* keys of ./window_unlocks.ts, sticky once open).
  {
    ...entry('party', 'M1'),
    requiresAll: ['client.win.party'],
    hotkey: 'O',
    menuBar: true,
    width: 360,
  },
  { ...entry('rumors', 'M1'), menuBar: true, width: 400 },
  {
    ...entry('deeds', 'M1'),
    requiresAll: ['client.win.deeds'],
    hotkey: 'J',
    menuBar: true,
    width: 440,
  },
  {
    ...entry('codex', 'M1'),
    requiresAll: ['client.win.codex'],
    hotkey: 'U',
    menuBar: true,
    width: 460,
  },
  {
    ...entry('craft', 'M1'),
    requiresAll: ['client.win.craft'],
    hotkey: 'T',
    menuBar: true,
    width: 480,
  },
  {
    ...entry('letters', 'M1'),
    requiresAll: ['client.win.letters'],
    hotkey: 'H',
    menuBar: true,
    width: 440,
  },
  { ...entry('goddess', 'M1'), menuBar: true, width: 400 },
  {
    ...entry('beasts', 'M1'),
    requiresAll: ['client.win.beasts'],
    hotkey: 'Shift+O',
    menuBar: true,
    width: 400,
  },
  { ...entry('dungeon', 'M1'), requiresAll: ['client.win.dungeon'], menuBar: true, width: 440 },
  { ...entry('evidence', 'M1'), requiresAll: ['client.win.evidence'], menuBar: true, width: 440 },
  {
    ...entry('company', 'M2'),
    requiresAll: ['feature.company'],
    menuBar: true,
    width: 440,
  },
  {
    ...entry('territory', 'M1'),
    requiresAny: ['feature.city', 'feature.inner_court'],
    menuBar: true,
    width: 440,
  },
  { ...entry('battle', 'M2'), requiresAll: ['feature.rts'], menuBar: true, width: 920 },
  { ...entry('strategy', 'M3'), requiresAll: ['feature.slg'], menuBar: true, width: 900 },
  { ...entry('saves', 'M1'), pauses: true, menuBar: true, width: 420 },
  { ...entry('menu', 'M1'), pauses: true, menuBar: false, width: 260 },
  { ...entry('help', 'M1'), pauses: true, menuBar: false, width: 320 },
  { ...entry('trade', 'M1'), menuBar: false, width: 460 },
  { ...entry('settings', 'M1'), pauses: true, menuBar: false, width: 660 },
  { ...entry('debug', 'M0'), hotkey: '`', devOnly: true, menuBar: true, width: 460 },
  // not on the menu bar: they open where the board or the node stands (6.3.4, 6.3.7)
  { ...entry('board', 'M1'), menuBar: false, width: 480 },
  { ...entry('gather', 'M1'), menuBar: false, width: 340 },
];

/** The windows of 2.3 the client does not build yet, with their ids and text keys reserved. */
export const PLANNED_WINDOWS: readonly WindowEntry<PlannedWindowId>[] = [
  entry('atlas', 'M2'),
  entry('market', 'M2'),
  entry('council', 'M2'),
  entry('army', 'M2'),
];

/** Every window of 2.3: built first, then planned. */
export const ALL_WINDOWS: readonly WindowEntry[] = [...WINDOW_DEFS, ...PLANNED_WINDOWS];

export function windowDef(id: WindowId): WindowDef {
  return WINDOW_DEFS.find((d) => d.id === id) as WindowDef;
}

/** The window of a ui_win_ id (built or planned), or undefined. */
export function windowByUiId(uiId: string): WindowEntry | undefined {
  return ALL_WINDOWS.find((d) => d.uiId === uiId);
}

export function windowTitle(id: WindowId): string {
  return t(windowDef(id).titleKey);
}

export function isWindowAvailable(
  def: Pick<WindowDef, 'requiresAll' | 'requiresAny' | 'devOnly'>,
  flags: Readonly<Record<string, FlagValue>>,
  devMode: boolean,
): boolean {
  if (def.devOnly && !devMode) return false;
  if (def.requiresAll?.some((f) => !flagOn(flags[f]))) return false;
  if (
    def.requiresAny &&
    def.requiresAny.length > 0 &&
    !def.requiresAny.some((f) => flagOn(flags[f]))
  ) {
    return false;
  }
  return true;
}

export function availableWindows(
  flags: Readonly<Record<string, FlagValue>>,
  devMode: boolean,
  defs: readonly WindowDef[] = WINDOW_DEFS,
): WindowDef[] {
  return defs.filter((d) => isWindowAvailable(d, flags, devMode));
}

/** Stable signature of availability, so the menu bar only rebuilds when it changes. */
export function availabilityKey(
  flags: Readonly<Record<string, FlagValue>>,
  devMode: boolean,
  defs: readonly WindowDef[] = WINDOW_DEFS,
): string {
  return defs.map((d) => (isWindowAvailable(d, flags, devMode) ? '1' : '0')).join('');
}

/** Keep a dragged window's title bar on screen. */
export function clampWindowPos(
  x: number,
  y: number,
  w: number,
  viewW: number,
  viewH: number,
  titleH = 32,
): { x: number; y: number } {
  const minVisible = 80;
  return {
    x: Math.round(Math.max(minVisible - w, Math.min(viewW - minVisible, x))),
    y: Math.round(Math.max(0, Math.min(viewH - titleH, y))),
  };
}

/** Cascade position for the n-th opened window. */
export function cascadePos(n: number, w: number, viewW: number): { x: number; y: number } {
  const k = n % 8;
  return { x: Math.max(16, Math.round(viewW / 2 - w / 2 - 120 + k * 28)), y: 90 + k * 26 };
}
