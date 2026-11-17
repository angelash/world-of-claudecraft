// Implements the model of `ui_pop_confirm` (ux_and_onboarding.md 6.4): a title, one sentence of
// consequence, confirm and cancel. An irreversible action gets the red main button that must be
// held 0.6 s, or pressed twice when the accessibility setting turns every hold into a toggle
// (18.5). Esc and the pad's B always cancel. Pure; Node-tested. The painter is confirm_pop.ts.

import { t } from '../../shared_ui/i18n';

/** How long the irreversible confirm button is held (6.4). */
export const CONFIRM_HOLD_MS = 600;

export interface ConfirmRequest {
  /** already rendered title (a window title, an action name) */
  title: string;
  /** already rendered sentence of consequence */
  body: string;
  /** confirm button text; default ui.pop.confirm.ok */
  confirmLabel?: string;
  /** cancel button text; default ui.pop.confirm.cancel */
  cancelLabel?: string;
  /** an irreversible action (discard, close a door, delete a save, leave legend, ...) */
  irreversible?: boolean;
}

export interface ConfirmModel {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  danger: boolean;
  /** 0: a plain click; otherwise the hold time in milliseconds */
  holdMs: number;
  /** irreversible with holds turned into toggles: the first press arms, the second confirms */
  twoStep: boolean;
  /** the line under the buttons telling how to confirm ('' for a plain click) */
  how: string;
}

export function confirmModel(req: ConfirmRequest, opts: { holdToToggle: boolean }): ConfirmModel {
  const danger = !!req.irreversible;
  const twoStep = danger && opts.holdToToggle;
  return {
    title: req.title,
    body: req.body,
    confirm: req.confirmLabel ?? t('ui.pop.confirm.ok'),
    cancel: req.cancelLabel ?? t('ui.pop.confirm.cancel'),
    danger,
    holdMs: danger && !twoStep ? CONFIRM_HOLD_MS : 0,
    twoStep,
    how: !danger ? '' : twoStep ? t('ui.pop.confirm.how_twice') : t('ui.pop.confirm.how_hold'),
  };
}

/**
 * The confirm button's state machine: a plain press confirms at once, a hold confirms after
 * `holdMs` of continuous holding, a two-step button confirms on its second press. Releasing
 * early cancels the hold (nothing happens); the arming of a two-step button stays until the
 * popup closes.
 */
export class ConfirmPress {
  private downAt: number | null = null;
  private armed = false;

  constructor(private readonly m: Pick<ConfirmModel, 'holdMs' | 'twoStep'>) {}

  /** Press starts; answers true when the press alone confirms. */
  down(now: number): boolean {
    if (this.m.twoStep) {
      if (this.armed) return true;
      this.armed = true;
      return false;
    }
    if (this.m.holdMs <= 0) return true;
    this.downAt = now;
    return false;
  }

  /** Release: a hold never confirms on release. */
  up(): void {
    this.downAt = null;
  }

  /** Hold progress 0..1 while holding (0 when not holding or no hold is needed). */
  progress(now: number): number {
    if (this.downAt === null || this.m.holdMs <= 0) return 0;
    return Math.max(0, Math.min(1, (now - this.downAt) / this.m.holdMs));
  }

  /** True once the hold has lasted long enough. */
  held(now: number): boolean {
    return this.downAt !== null && this.m.holdMs > 0 && now - this.downAt >= this.m.holdMs;
  }

  get isArmed(): boolean {
    return this.armed;
  }
}
