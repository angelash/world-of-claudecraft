// Default (Mouse Camera off): WoW-style — WASD + A/D keyboard turn, Q/E strafe,
// left-drag orbits, right-drag mouselooks, both buttons run forward.
// Optional Mouse Camera (on): OSRS-style — WASD is camera-relative, A/D strafe,
// mouse drag rotates the orbit (no pointer lock), no keyboard turn.
// Shared: space jump, wheel zoom, Tab target, rebindable action bar, R autorun.

import { Keybinds, actionKind } from './keybinds';

const BASE_LOOK_SENS = 0.0045;
const TOUCH_LOOK_YAW_RATE = 3.2;
const TOUCH_LOOK_PITCH_RATE = 2.2;

export interface InputCallbacks {
  onTab(): void;
  onAbility(slot: number): void;
  onUiKey(key: 'interact' | 'bags' | 'char' | 'spellbook' | 'questlog' | 'map' | 'nameplates' | 'escape' | 'chat' | 'meters' | 'social' | 'arena'): void;
  onClickPick(x: number, y: number, button: number): void;
  /** When false, edge actions (spells, UI keys) are ignored. */
  canUseGameKeys?: () => boolean;
}

export interface TouchMoveInput {
  forward: boolean;
  back: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
}

export class Input {
  keys = new Set<string>();
  leftDown = false;
  rightDown = false;
  camYaw = Math.PI;
  camPitch = 0.32;
  camDist = 12;
  autorun = false;
  suspendMovement = false;
  private mouseCameraEnabled = false;
  private dragDistance = 0;
  private downButton = -1;
  private captureCb: ((code: string | null) => void) | null = null;
  private lookSensitivity = BASE_LOOK_SENS;
  private touchMove: TouchMoveInput = { forward: false, back: false, strafeLeft: false, strafeRight: false };
  private touchLookActive = false;
  private touchLookVector = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, private cb: InputCallbacks, private keybinds: Keybinds) {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.releaseCapture('blur'));
    window.addEventListener('pointerup', (e) => this.onMouseUp(e));
    window.addEventListener('pointercancel', (e) => this.onMouseUp(e));
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) this.releaseCapture('pointerlock');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseCapture('hidden');
    });
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camDist = Math.min(22, Math.max(3, this.camDist + Math.sign(e.deltaY) * 1.4));
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDragging(): boolean {
    return this.leftDown || this.rightDown;
  }

  isMouseCameraMode(): boolean {
    return this.mouseCameraEnabled;
  }

  setMouseCameraEnabled(on: boolean): void {
    this.mouseCameraEnabled = on;
    if (on && document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
    this.updateDragCursor();
  }

  captureNextKey(cb: (code: string | null) => void): void {
    this.captureCb = cb;
  }

  setCameraSpeed(mult: number): void {
    this.lookSensitivity = BASE_LOOK_SENS * mult;
  }

  setTouchMove(move: TouchMoveInput): void {
    this.touchMove = move;
    if (move.forward || move.back) this.autorun = false;
  }

  clearTouchMove(): void {
    this.touchMove = { forward: false, back: false, strafeLeft: false, strafeRight: false };
  }

  setTouchLook(active: boolean): void {
    this.touchLookActive = active;
  }

  setTouchLookVector(v: { x: number; y: number }): void {
    this.touchLookVector = v;
  }

  applyTouchLookDelta(dx: number, dy: number): void {
    this.camYaw -= dx * this.lookSensitivity;
    this.camPitch = Math.min(1.35, Math.max(-0.4, this.camPitch + dy * this.lookSensitivity));
  }

  updateTouchLook(dt: number): void {
    if (!this.touchLookActive) return;
    this.camYaw -= this.touchLookVector.x * TOUCH_LOOK_YAW_RATE * dt;
    this.camPitch = Math.min(1.35, Math.max(-0.4, this.camPitch + this.touchLookVector.y * TOUCH_LOOK_PITCH_RATE * dt));
  }

  isMouselookActive(): boolean {
    if (this.mouseCameraEnabled) return this.touchLookActive;
    return this.rightDown || this.touchLookActive;
  }

  private releaseCapture(_reason: string): void {
    this.keys.clear();
    this.leftDown = false;
    this.rightDown = false;
    this.downButton = -1;
    this.updateDragCursor();
  }

  private updateDragCursor(): void {
    if (this.mouseCameraEnabled && this.isDragging()) {
      this.canvas.style.cursor = 'grabbing';
    } else {
      this.canvas.style.cursor = '';
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (this.captureCb) {
      e.preventDefault();
      const cb = this.captureCb;
      this.captureCb = null;
      cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (this.cb.canUseGameKeys && !this.cb.canUseGameKeys()) return;
    if (e.code === 'Escape') { this.cb.onUiKey('escape'); return; }
    if (e.code === 'Tab') e.preventDefault();
    const action = this.keybinds.actionForCode(e.code);
    if (action === null) return;
    if (actionKind(action) === 'held') {
      this.keys.add(e.code);
      if (action === 'forward' || action === 'back') this.autorun = false;
      return;
    }
    this.dispatchEdge(action);
  }

  private dispatchEdge(action: string): void {
    if (action.startsWith('slot')) { this.cb.onAbility(Number(action.slice(4))); return; }
    switch (action) {
      case 'autorun': this.autorun = !this.autorun; return;
      case 'target': this.cb.onTab(); return;
      case 'interact': this.cb.onUiKey('interact'); return;
      case 'bags': this.cb.onUiKey('bags'); return;
      case 'char': this.cb.onUiKey('char'); return;
      case 'spellbook': this.cb.onUiKey('spellbook'); return;
      case 'questlog': this.cb.onUiKey('questlog'); return;
      case 'map': this.cb.onUiKey('map'); return;
      case 'nameplates': this.cb.onUiKey('nameplates'); return;
      case 'meters': this.cb.onUiKey('meters'); return;
      case 'social': this.cb.onUiKey('social'); return;
      case 'arena': this.cb.onUiKey('arena'); return;
      case 'chat': this.cb.onUiKey('chat'); return;
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) this.leftDown = true;
    if (e.button === 2) this.rightDown = true;
    this.downButton = e.button;
    this.dragDistance = 0;
    if (!this.mouseCameraEnabled) {
      this.canvas.requestPointerLock?.();
    } else {
      this.updateDragCursor();
    }
  }

  private onMouseUp(e: MouseEvent): void {
    const wasDrag = this.dragDistance > 5;
    if (e.button === 0) this.leftDown = false;
    if (e.button === 2) this.rightDown = false;
    if (!this.mouseCameraEnabled && !this.leftDown && !this.rightDown && document.pointerLockElement) {
      document.exitPointerLock();
    }
    const onCanvas = e.target === this.canvas || document.pointerLockElement === this.canvas;
    if (!wasDrag && e.button === this.downButton && onCanvas) {
      this.cb.onClickPick(e.clientX, e.clientY, e.button);
    }
    this.downButton = -1;
    this.updateDragCursor();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.leftDown && !this.rightDown) return;
    const mx = e.movementX ?? 0, my = e.movementY ?? 0;
    if (mx === 0 && my === 0) return;
    this.dragDistance += Math.abs(mx) + Math.abs(my);
    this.camYaw -= mx * this.lookSensitivity;
    this.camPitch = Math.min(1.35, Math.max(-0.4, this.camPitch + my * this.lookSensitivity));
  }

  readMoveInput(): {
    forward: boolean; back: boolean; turnLeft: boolean; turnRight: boolean;
    strafeLeft: boolean; strafeRight: boolean; jump: boolean;
  } {
    if (this.suspendMovement) {
      return { forward: false, back: false, turnLeft: false, turnRight: false, strafeLeft: false, strafeRight: false, jump: false };
    }
    const k = this.keys;
    const held = (id: string) => this.keybinds.codesForAction(id).some((c) => k.has(c));
    const bothButtons = this.leftDown && this.rightDown;
    const forward = held('forward') || bothButtons || this.autorun || this.touchMove.forward;
    const back = held('back') || this.touchMove.back;
    const jump = held('jump');

    if (this.mouseCameraEnabled) {
      return {
        forward, back, jump,
        turnLeft: false,
        turnRight: false,
        strafeLeft: held('strafeLeft') || held('turnLeft') || this.touchMove.strafeLeft,
        strafeRight: held('strafeRight') || held('turnRight') || this.touchMove.strafeRight,
      };
    }

    const mouselook = this.isMouselookActive();
    const aHeld = held('turnLeft');
    const dHeld = held('turnRight');
    return {
      forward, back, jump,
      strafeLeft: held('strafeLeft') || (mouselook && aHeld) || this.touchMove.strafeLeft,
      strafeRight: held('strafeRight') || (mouselook && dHeld) || this.touchMove.strafeRight,
      turnLeft: !mouselook && aHeld,
      turnRight: !mouselook && dHeld,
    };
  }
}
