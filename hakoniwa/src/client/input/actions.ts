// The action layer (release_engineering.md 4.4; ux_and_onboarding.md 1.3, 16.1): game logic
// only sees actions (`<context>.<action>` of contexts.ts and pad_bindings.ts), never keys. The
// active contexts form a stack, first match wins and an action its handler declines falls
// through to the next context:
// - a scene (prologue, dreams, court debates) is a mode that takes all input: dialogue, then
//   global;
// - an open window takes the directional navigation (1.3): for a gamepad the window and
//   global only (the sticks and buttons belong to the window); for keyboard and mouse the
//   window on top of the field, so the arrows and Tab move the window's focus while WASD
//   still walks;
// - a conversation or a loose line stacks the talk part of the dialogue context (advance,
//   the options, free input) over the field: Space advances, 1 to 9 pick options, and the
//   rest of the dialogue table (auto-advance on A, hide text on H, recall on PageUp) stays
//   off so it never shadows walking, windows or zoom;
// - global is always last.
// Pure.

import { type ContextKeymap, chordEquals, type InputContext, type KeyChord } from './contexts';
import type { InputDevice } from './device';

/** What the action layer needs to know about the screen. */
export interface InputSurface {
  /** the scene panel's mode, or null when no scene plays */
  scene: 'advance' | 'choice' | 'input' | 'resolve' | null;
  /** a conversation or a loose line is showing */
  talk: boolean;
  /** a conversation with someone is open (its options and free line take the pad) */
  conversation: boolean;
  /** some window is open */
  windows: boolean;
  /** a building is being placed (the cursor points where it goes) */
  placing: boolean;
  /** the corridor mode is open (ux_and_onboarding.md 9): its context takes the input */
  corridor?: boolean;
  /** the spirit mirror is open (`ui_mode_creator`, 3.4.3): its context takes the input */
  creator?: boolean;
}

export const IDLE_SURFACE: InputSurface = {
  scene: null,
  talk: false,
  conversation: false,
  windows: false,
  placing: false,
};

/** The active contexts, first wins. */
export function contextStack(s: InputSurface, device: InputDevice): InputContext[] {
  // the spirit mirror is a mode over its scene (3.4.3): it takes every input but the global
  // keys, so the scene's advance and options never reach the panel behind it
  if (s.creator) return ['creator', 'global'];
  if (s.scene) return ['dialogue', 'global'];
  if (s.corridor) return ['corridor', 'global'];
  if (s.windows && device === 'pad') return ['window', 'global'];
  const out: InputContext[] = [];
  if (s.windows) out.push('window');
  if (s.talk) out.push('dialogue');
  out.push('field', 'global');
  return out;
}

/** The dialogue actions that stay on while a conversation or loose line sits over the field. */
export const TALK_OVER_FIELD: ReadonlySet<string> = new Set([
  'advance',
  'option_prev',
  'option_next',
  'free_input',
  // the AI mark of a generated line (7.3) is reachable wherever generated talk shows
  'ai_mark',
  ...Array.from({ length: 9 }, (_, i) => `option_${i + 1}`),
]);

/** Is `context`.`action` live in this stack (the talk filter above)? */
export function actionLive(
  stack: readonly InputContext[],
  context: InputContext,
  action: string,
): boolean {
  if (context !== 'dialogue' || !stack.includes('field')) return true;
  return TALK_OVER_FIELD.has(action);
}

/** The chord of a keyboard event (KeyboardEvent.code plus Shift, Ctrl, Alt). */
export function chordOf(ev: {
  code: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): KeyChord {
  const c: KeyChord = { code: ev.code };
  if (ev.shiftKey) c.shift = true;
  if (ev.ctrlKey) c.ctrl = true;
  if (ev.altKey) c.alt = true;
  return c;
}

/** The chord of a mouse button (MouseEvent.button 0 to 4). */
export function mouseChord(
  button: number,
  mods: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
): KeyChord {
  return chordOf({ code: `Mouse${button}`, ...mods });
}

export interface BoundAction {
  context: InputContext;
  action: string;
}

/** Every live action `chord` triggers in the stack, in stack order. */
export function actionsForChord(
  map: ContextKeymap,
  stack: readonly InputContext[],
  chord: KeyChord,
): BoundAction[] {
  const out: BoundAction[] = [];
  for (const context of stack) {
    for (const [action, b] of Object.entries(map[context])) {
      if (!actionLive(stack, context, action)) continue;
      if (
        (b.primary && chordEquals(b.primary, chord)) ||
        (b.secondary && chordEquals(b.secondary, chord))
      )
        out.push({ context, action });
    }
  }
  return out;
}

/** The four held movement actions. */
export const MOVE_ACTIONS: ReadonlySet<string> = new Set([
  'move_up',
  'move_down',
  'move_left',
  'move_right',
]);

export function isMoveAction(action: string): boolean {
  return MOVE_ACTIONS.has(action);
}
