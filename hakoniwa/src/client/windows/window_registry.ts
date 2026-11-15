// Window catalogue (architecture.md 7) and the availability rule: a window is usable when
// every flag in requiresAll is on, at least one of requiresAny is on (when listed), and
// it is not dev-only outside dev mode. Feature flags follow implementation_conventions.md
// 4 (feature.<name>). Pure; Node-tested.

import type { FlagValue } from '../../core/contracts';
import { T } from '../../shared_ui/text';
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
  | 'debug';

export interface WindowDef {
  id: WindowId;
  /** hotkey label shown on the menu bar (KeyboardEvent.code handled by the keymap) */
  hotkey?: string;
  requiresAll?: readonly string[];
  requiresAny?: readonly string[];
  devOnly?: boolean;
  /** shown as a button on the menu bar */
  menuBar: boolean;
  width: number;
}

export const WINDOW_DEFS: readonly WindowDef[] = [
  { id: 'character', hotkey: 'C', menuBar: true, width: 360 },
  { id: 'inventory', hotkey: 'I', menuBar: true, width: 380 },
  { id: 'doors', hotkey: 'K', menuBar: true, width: 420 },
  { id: 'quests', hotkey: 'L', menuBar: true, width: 380 },
  { id: 'rumors', menuBar: true, width: 400 },
  { id: 'party', menuBar: true, width: 360 },
  { id: 'map', hotkey: 'M', menuBar: true, width: 460 },
  { id: 'company', requiresAll: ['feature.company'], menuBar: true, width: 440 },
  {
    id: 'territory',
    requiresAny: ['feature.city', 'feature.inner_court'],
    menuBar: true,
    width: 440,
  },
  { id: 'battle', requiresAll: ['feature.rts'], menuBar: true, width: 920 },
  { id: 'strategy', requiresAll: ['feature.slg'], menuBar: true, width: 900 },
  { id: 'goddess', menuBar: true, width: 400 },
  { id: 'saves', menuBar: true, width: 420 },
  { id: 'menu', menuBar: false, width: 260 },
  { id: 'help', menuBar: false, width: 320 },
  { id: 'trade', menuBar: false, width: 460 },
  { id: 'settings', menuBar: false, width: 380 },
  { id: 'debug', hotkey: '`', devOnly: true, menuBar: true, width: 460 },
];

export function windowDef(id: WindowId): WindowDef {
  return WINDOW_DEFS.find((d) => d.id === id) as WindowDef;
}

export function windowTitle(id: WindowId): string {
  return T.windows.titles[id] ?? id;
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
