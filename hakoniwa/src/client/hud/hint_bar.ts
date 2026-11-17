// Implements `ui_hud_hint` (ux_and_onboarding.md 17.2): the painter of the hint bar bottom
// centre, above the cast bar and the hotbar. The text is rendered with t() on every refresh and
// written only when it changes, so a `{key:}` glyph follows the device the player switches to.
// `show` is the small API later steps call (the full tut_ catalogue is PK-M1-23): a hint may
// carry a `doneWhen` test the refresh checks. The rules live in ./hint_model.ts.

import './hint_bar.css';
import type { KeyText } from '../../core/text';
import { el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import {
  HintBar,
  type HintCategory,
  type HintContext,
  type HintGuidance,
  type HintSpec,
  type HintTriggerInput,
  HintTriggers,
} from './hint_model';

export class HintBarView {
  readonly el = el('div', { className: 'hk-hint', attrs: { role: 'status' } });
  readonly bar = new HintBar();
  private readonly triggers = new HintTriggers();
  private readonly doneWhen = new Map<string, () => boolean>();

  constructor() {
    this.el.hidden = true;
  }

  /**
   * Ask for a hint (a key glyph and one sentence of at most 20 characters, 19.2). `doneWhen`
   * ends it once it answers true. False when it already showed or the guidance level leaves it
   * out.
   */
  show(
    id: string,
    text: KeyText,
    opts: {
      category?: HintCategory;
      guidance: HintGuidance;
      now: number;
      doneWhen?: () => boolean;
    },
  ): boolean {
    const spec: HintSpec = { id, text, category: opts.category ?? 'system' };
    const asked = this.bar.show(spec, opts.now, opts.guidance);
    if (asked && opts.doneWhen) this.doneWhen.set(id, opts.doneWhen);
    return asked;
  }

  /** Refresh: run the first-step triggers, the done tests, then paint. */
  update(trigger: HintTriggerInput, ctx: HintContext): void {
    const now = trigger.now;
    const r = this.triggers.update(trigger);
    for (const id of r.done) this.bar.finish(id, now);
    for (const spec of r.ask) {
      if (!this.bar.spent(spec.id)) this.bar.show(spec, now, ctx.guidance);
    }
    for (const [id, test] of this.doneWhen) {
      if (test()) {
        this.bar.finish(id, now);
        this.doneWhen.delete(id);
      }
    }
    const f = this.bar.frame(now, ctx);
    const shown = !!f.hint;
    if (this.el.hidden === shown) this.el.hidden = !shown;
    if (!f.hint) return;
    setText(this.el, t(f.hint.text));
    setClass(this.el, 'fading', f.fading);
  }
}
