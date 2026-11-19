// @vitest-environment happy-dom

// Drive the DOM controller and the real input hub together. Layout is supplied because
// happy-dom does not render boxes; browser sizing remains a separate acceptance check.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewGameScreen } from '../src/client/app/newgame_screen';
import { defaultSettings } from '../src/client/app/settings_schema';
import { InputLayer } from '../src/client/input/input_layer';
import { startMenuPad } from '../src/client/input/menu_pad';
import { PlayerPopupShell } from '../src/client/windows/player_popup_shell';
import { inputHarness } from './input_harness';

const cleanups: (() => void)[] = [];
let buttons: number[];
let raf: FrameRequestCallback | null;
let now = 0;

beforeEach(() => {
  buttons = new Array(17).fill(0);
  raf = null;
  now = 0;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    const rects = this.closest('[hidden]') ? [] : [new DOMRect(0, 0, 100, 25)];
    return Object.assign(rects, { item: (index: number) => rects[index] ?? null });
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const all = [...document.querySelectorAll('button, input, select')];
    return new DOMRect(0, Math.max(0, all.indexOf(this)) * 30, 100, 25);
  });
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () =>
      [
        {
          id: 'Xbox Controller',
          connected: true,
          mapping: 'standard',
          timestamp: now,
          axes: [0, 0, 0, 0],
          buttons: buttons.map((value) => ({ value, pressed: value > 0, touched: value > 0 })),
        },
      ] as unknown as Gamepad[],
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    raf = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as Partial<Navigator>).getGamepads;
  document.documentElement.removeAttribute('data-text-size');
  document.documentElement.removeAttribute('data-color-mode');
  document.documentElement.style.removeProperty('--hk-text-scale');
});

function press(code: string, target: HTMLElement = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
  return event;
}

function fixture() {
  const h = inputHarness();
  const root = document.createElement('div');
  const canvas = document.createElement('canvas');
  const windowsRoot = document.createElement('div');
  root.append(canvas, windowsRoot);
  document.body.append(root);
  const layer = new InputLayer({
    root,
    canvas,
    dpr: () => 1,
    windowsRoot,
    game: h.player,
    settings: () => defaultSettings('sync'),
    pointer: { secondary() {}, hover() {}, zoom() {}, orbit() {} },
    glyphsChanged() {},
  });
  cleanups.push(() => layer.dispose());
  const frame = () => {
    now += 20;
    layer.frame(now);
  };
  const tap = (button: number) => {
    buttons[button] = 1;
    frame();
    buttons[button] = 0;
    frame();
  };
  frame();
  return { h, root, windowsRoot, layer, frame, tap };
}

describe('DOM input ownership', () => {
  it('navigates and activates a modeless player card through keyboard and pad', () => {
    const { h, root, frame, tap } = fixture();
    const close = vi.fn();
    const shell = new PlayerPopupShell(root, 'charcard', close);
    Object.assign(h.host, { playerPopupOpen: () => !shell.el.hidden });
    shell.show('Character');
    const action = document.createElement('button');
    action.textContent = 'Appraise';
    const clicked = vi.fn();
    action.addEventListener('click', clicked);
    shell.body.append(action);
    frame();
    expect(h.player.surface().windows).toBe(true);
    press('Tab');
    expect(shell.el.contains(document.activeElement)).toBe(true);
    action.focus();
    expect(press('Space', action).defaultPrevented).toBe(false);
    press('Enter', action);
    expect(clicked).toHaveBeenCalledTimes(1);
    tap(0);
    expect(clicked).toHaveBeenCalledTimes(2);
    tap(13);
    expect(document.activeElement).not.toBe(action);
    tap(0);
    expect(close).toHaveBeenCalledTimes(1);
    expect(h.sent['combat.select']).toBeUndefined();
  });

  it('leaves native modal keys intact, releases held movement and resumes after close', () => {
    const { h, root, layer, frame, tap } = fixture();
    h.host.windows.show('settings');
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-modal', 'true');
    const close = document.createElement('button');
    close.textContent = 'Close';
    close.addEventListener('click', () => dialog.close());
    dialog.append(close);
    root.append(dialog);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true }),
    );
    expect(layer.actionHeld('field', 'move_up')).toBe(true);
    dialog.showModal();
    close.focus();
    frame();
    for (const code of ['Tab', 'ArrowDown', 'Enter', 'Space', 'Escape'])
      expect(press(code, close).defaultPrevented, code).toBe(false);
    expect(h.open).toEqual(['settings']);
    expect(layer.actionHeld('field', 'move_up')).toBe(false);
    tap(0);
    expect(dialog.open).toBe(false);
    expect(h.open).toEqual(['settings']);
    press('Escape');
    expect(h.open).toEqual([]);
  });

  it('routes title pad input to the sibling modal and excludes inert title controls', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<section class="hk-boot"><div inert><button>Background</button></div><section role="dialog" aria-modal="true"><button>First run</button></section></section>';
    document.body.append(root);
    cleanups.push(startMenuPad(root));
    const frame = () => {
      now += 20;
      raf?.(now);
    };
    const tap = (button: number) => {
      buttons[button] = 1;
      frame();
      buttons[button] = 0;
      frame();
    };
    frame();
    tap(13);
    expect(document.activeElement?.textContent).toBe('First run');
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-modal', 'true');
    const inside = document.createElement('button');
    inside.textContent = 'Model connection';
    const clicked = vi.fn();
    inside.addEventListener('click', clicked);
    dialog.append(inside);
    root.append(dialog);
    dialog.showModal();
    frame();
    inside.focus();
    tap(0);
    expect(clicked).toHaveBeenCalledTimes(1);
    tap(1);
    expect(dialog.open).toBe(false);
    tap(13);
    expect(document.activeElement?.textContent).toBe('First run');
    root.querySelector('.hk-boot')?.remove();
    dialog.showModal();
    inside.focus();
    frame();
    tap(0);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('navigates the real new-game page above a retained title and restores the title on back', () => {
    const root = document.createElement('div');
    const boot = document.createElement('section');
    boot.className = 'hk-boot';
    const background = document.createElement('button');
    background.textContent = 'Title';
    const backgroundClick = vi.fn();
    background.addEventListener('click', backgroundClick);
    boot.append(background);
    root.append(boot);
    document.body.append(root);
    const start = vi.fn();
    const page = new NewGameScreen(
      root,
      {
        ai: { preset: 'off', lastTestFailed: false },
        storage: { durable: true, low: false },
        ironmanSlotTaken: false,
      },
      { start, back: () => page.dispose() },
    );
    cleanups.push(() => page.dispose(), startMenuPad(root));
    const frame = () => {
      now += 20;
      raf?.(now);
    };
    const tap = (button: number) => {
      buttons[button] = 1;
      frame();
      buttons[button] = 0;
      frame();
    };
    const control = (key: string) => {
      const found = page.el.querySelector<HTMLElement>(`[data-focus-key="${key}"]`);
      if (!found) throw new Error(`missing new-game control: ${key}`);
      return found;
    };
    frame();
    expect(control('diff.standard').getAttribute('aria-pressed')).toBe('true');
    tap(13);
    expect(document.activeElement).toBe(control('diff.hard'));
    tap(0);
    expect(control('diff.hard').getAttribute('aria-pressed')).toBe('true');
    for (let guard = 0; guard < 20 && document.activeElement !== control('start'); guard++) tap(13);
    expect(document.activeElement).toBe(control('start'));
    tap(0);
    expect(start).toHaveBeenCalledWith({ difficulty: 'hard', ironman: false, guidance: 'full' });
    expect(backgroundClick).not.toHaveBeenCalled();
    tap(1);
    expect(page.el.isConnected).toBe(false);
    tap(13);
    expect(document.activeElement).toBe(background);
    tap(0);
    expect(backgroundClick).toHaveBeenCalledTimes(1);
  });

  it('scales card content once while high contrast and border-box keep the frames bounded', () => {
    const style = document.createElement('style');
    style.textContent = [
      'src/client/access.css',
      'src/client/screens/title.css',
      'src/client/windows/player_popups.css',
      'src/client/windows/llm/llm.css',
    ]
      .map((path) => readFileSync(join(__dirname, '..', path), 'utf8'))
      .join('\n');
    document.body.append(style);
    document.documentElement.setAttribute('data-text-size', 'xlarge');
    document.documentElement.setAttribute('data-color-mode', 'high_contrast');
    document.documentElement.style.setProperty('--hk-text-scale', '1.3');
    for (const className of ['hk-player-popup', 'hk-first-run-card', 'hk-llm-dialog']) {
      const frame = document.createElement('section');
      frame.className = className;
      const body = document.createElement('div');
      const control = document.createElement('button');
      body.append(control);
      frame.append(body);
      document.body.append(frame);
      const computed = getComputedStyle(frame);
      expect(computed.boxSizing, className).toBe('border-box');
      expect(computed.borderTopWidth, className).toBe('2px');
      expect(computed.backgroundColor, className).toBe('#000000');
      expect(getComputedStyle(body).getPropertyValue('zoom'), className).toBe('1.3');
      expect(getComputedStyle(control).getPropertyValue('zoom'), className).toBe('');
    }
  });
});
