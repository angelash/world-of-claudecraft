// The interface layers an act has opened (ux_and_onboarding.md 1.5): the prologue shows only
// the interaction prompt and the hint bar, so when its roam nodes hand the player control
// (onboarding_interaction.md 5.3) the field HUD (frames, clock, minimap, tracker, log, hotbar,
// menus, auto combat) stays out of the modern-day rooms and the antechamber. A pure core
// (which class an act puts on the HUD root) and a painter that writes only on change.

import './act_release.css';

/** The HUD root class an act sets, or null when the act shows the whole field HUD. */
export function actReleaseClass(act: unknown): string | null {
  return act === 'prologue' ? 'hk-act-prologue' : null;
}

/** Puts the act's class on the HUD root; touches the DOM only when the class changes. */
export class ActRelease {
  private current: string | null | undefined;

  paint(root: Pick<HTMLElement, 'classList'> | undefined, act: unknown): void {
    if (!root) return;
    const next = actReleaseClass(act);
    if (next === this.current) return;
    if (this.current) root.classList.remove(this.current);
    if (next) root.classList.add(next);
    this.current = next;
  }
}
