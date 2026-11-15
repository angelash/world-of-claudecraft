// Keyboard bindings (by KeyboardEvent.code, so layouts do not matter) and the pure rules
// that turn held keys into a movement intent. Pure; Node-tested.

export type Action =
  | 'move_up'
  | 'move_down'
  | 'move_left'
  | 'move_right'
  | 'interact'
  | 'hotbar'
  | 'menu'
  | 'advance'
  | 'inventory'
  | 'character'
  | 'quests'
  | 'doors'
  | 'map'
  | 'debug'
  | 'zoom_in'
  | 'zoom_out'
  | 'pause'
  | 'quick_save'
  | 'quick_load'
  | 'target_next'
  | 'appraise'
  | 'view_turn_left'
  | 'view_turn_right'
  | 'view_toggle'
  | 'view_reset';

export interface Binding {
  action: Action;
  /** hotbar slot 1..9 */
  slot?: number;
}

export const DEFAULT_KEYMAP: Readonly<Record<string, Binding>> = {
  KeyW: { action: 'move_up' },
  ArrowUp: { action: 'move_up' },
  KeyS: { action: 'move_down' },
  ArrowDown: { action: 'move_down' },
  KeyA: { action: 'move_left' },
  ArrowLeft: { action: 'move_left' },
  KeyD: { action: 'move_right' },
  ArrowRight: { action: 'move_right' },
  KeyE: { action: 'interact' },
  Escape: { action: 'menu' },
  Space: { action: 'advance' },
  Enter: { action: 'advance' },
  NumpadEnter: { action: 'advance' },
  KeyV: { action: 'appraise' },
  KeyI: { action: 'inventory' },
  KeyB: { action: 'inventory' },
  KeyC: { action: 'character' },
  KeyL: { action: 'quests' },
  KeyK: { action: 'doors' },
  KeyM: { action: 'map' },
  Backquote: { action: 'debug' },
  F3: { action: 'debug' },
  Equal: { action: 'zoom_in' },
  NumpadAdd: { action: 'zoom_in' },
  Minus: { action: 'zoom_out' },
  NumpadSubtract: { action: 'zoom_out' },
  KeyZ: { action: 'view_turn_left' },
  KeyX: { action: 'view_turn_right' },
  KeyG: { action: 'view_toggle' },
  Home: { action: 'view_reset' },
  KeyP: { action: 'pause' },
  Pause: { action: 'pause' },
  F6: { action: 'quick_save' },
  F9: { action: 'quick_load' },
  Tab: { action: 'target_next' },
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [
      `Digit${i + 1}`,
      { action: 'hotbar' as const, slot: i + 1 },
    ]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [
      `Numpad${i + 1}`,
      { action: 'hotbar' as const, slot: i + 1 },
    ]),
  ),
};

export function bindingFor(
  code: string,
  keymap: Readonly<Record<string, Binding>> = DEFAULT_KEYMAP,
): Binding | undefined {
  return keymap[code];
}

export const MOVE_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'move_up',
  'move_down',
  'move_left',
  'move_right',
]);

export interface Intent {
  dx: number;
  dy: number;
}

/** Movement intent from the set of held move actions (+y is south). Opposites cancel. */
export function intentFromHeld(held: ReadonlySet<Action>): Intent {
  const dx = (held.has('move_right') ? 1 : 0) - (held.has('move_left') ? 1 : 0);
  const dy = (held.has('move_down') ? 1 : 0) - (held.has('move_up') ? 1 : 0);
  return { dx, dy };
}

export function sameIntent(a: Intent | null, b: Intent | null): boolean {
  if (!a || !b) return a === b;
  return a.dx === b.dx && a.dy === b.dy;
}

export function isZero(i: Intent): boolean {
  return i.dx === 0 && i.dy === 0;
}
