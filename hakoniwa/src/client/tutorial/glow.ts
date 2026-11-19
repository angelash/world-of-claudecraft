// The painter of the 亮 method (ux_and_onboarding.md 17.2): outlines one HUD element, found by
// its `data-hud` attribute (or its id), with two pulses or, with reduced flashing on, a static
// thick outline for 3 s. At most one element at a time; a class is written only when the
// target or the mode changes. Thin over ./glow_model.ts.

import './tutorial.css';
import { type GlowState, glowFrame } from './glow_model';

export class GlowPainter {
  private state: GlowState | null = null;
  private lit: { node: Element; cls: string } | null = null;

  constructor(private readonly root: HTMLElement) {}

  /** Outline `target` from now on (a new glow replaces the one showing). */
  start(target: string, now: number, reduceFlashing: boolean): void {
    this.state = { target, startedAt: now, reduceFlashing };
  }

  frame(now: number): void {
    const f = glowFrame(this.state, now);
    if (!f.target) {
      this.state = null;
      this.unlight();
      return;
    }
    const cls = f.mode === 'static' ? 'hk-tut-glow-static' : 'hk-tut-glow';
    const node =
      this.root.querySelector(`[data-hud="${f.target}"]`) ??
      this.root.querySelector(`#${CSS.escape(f.target)}`);
    if (this.lit && this.lit.node === node && this.lit.cls === cls) return;
    this.unlight();
    if (!node) return;
    node.classList.add(cls);
    this.lit = { node, cls };
  }

  private unlight(): void {
    if (!this.lit) return;
    this.lit.node.classList.remove(this.lit.cls);
    this.lit = null;
  }

  dispose(): void {
    this.state = null;
    this.unlight();
  }
}
