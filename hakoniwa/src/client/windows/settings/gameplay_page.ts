// Implements the first part of `ui_set_gameplay` (ux_and_onboarding.md 4.5): text speed, auto
// advance and the guidance level, plus the run's difficulty as a read-only line. The rest of
// the page (auto pause, bubbles, names, floating text, loot, fame display, confirmations,
// changing the difficulty) is PK-M1-57. Thin painter over gameplay_model.ts.

import { el, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import type { WindowContext } from '../window_context';
import { gameplayPageModel, gameplayPatch } from './gameplay_model';
import type { SettingsPage } from './page';

export function gameplayPage(ctx: WindowContext): SettingsPage {
  const model = () => gameplayPageModel(ctx.prefs.sync.gameplay, ctx.view.flag('difficulty'));
  const first = model();
  const apply = (field: 'textSpeed' | 'autoAdvance' | 'guidance', raw: string | boolean) => {
    const patch = gameplayPatch(ctx.prefs.sync.gameplay, field, raw);
    if (patch) ctx.prefs.updateSync(patch);
  };

  const speed = el('select', { attrs: { id: 'hk-text-speed' } });
  for (const o of first.textSpeed.options) {
    speed.append(el('option', { text: o.label, attrs: { value: String(o.value) } }));
  }
  speed.addEventListener('change', () => apply('textSpeed', speed.value));

  const auto = el('input', { attrs: { type: 'checkbox', id: 'hk-auto-advance' } });
  auto.addEventListener('change', () => apply('autoAdvance', auto.checked));

  const guidance = el('select', { attrs: { id: 'hk-guidance' } });
  for (const o of first.guidance.options) {
    guidance.append(el('option', { text: o.label, attrs: { value: o.value } }));
  }
  guidance.addEventListener('change', () => apply('guidance', guidance.value));
  const guidanceNote = el('div', { className: 'hk-set-note' });
  const difficulty = el('div', { className: 'hk-set-row' });
  const difficultyNote = el('div', { className: 'hk-set-note' });

  const root = el('div', { className: 'hk-set-gameplay' }, [
    el('h3', { text: t('ui.set.gameplay.reading') }),
    el('div', { className: 'hk-set-row' }, [
      el('label', { text: t('ui.set.gameplay.text_speed'), attrs: { for: 'hk-text-speed' } }),
      speed,
    ]),
    el('div', { className: 'hk-set-row' }, [
      auto,
      el('label', { text: t('ui.set.gameplay.auto_advance'), attrs: { for: 'hk-auto-advance' } }),
    ]),
    el('div', { className: 'hk-set-note', text: t('ui.set.gameplay.auto_advance_note') }),
    el('h3', { text: t('ui.set.gameplay.guidance_title') }),
    el('div', { className: 'hk-set-row' }, [
      el('label', { text: t('ui.set.gameplay.guidance_label'), attrs: { for: 'hk-guidance' } }),
      guidance,
    ]),
    guidanceNote,
    el('h3', { text: t('ui.set.gameplay.difficulty_title') }),
    difficulty,
    difficultyNote,
  ]);
  return {
    el: root,
    update: () => {
      const m = model();
      const sp = String(m.textSpeed.value);
      if (speed.value !== sp && document.activeElement !== speed) speed.value = sp;
      if (auto.checked !== m.autoAdvance && document.activeElement !== auto)
        auto.checked = m.autoAdvance;
      if (guidance.value !== m.guidance.value && document.activeElement !== guidance)
        guidance.value = m.guidance.value;
      setText(guidanceNote, m.guidance.note);
      setText(difficulty, m.difficulty);
      setText(difficultyNote, m.difficultyNote);
    },
  };
}
