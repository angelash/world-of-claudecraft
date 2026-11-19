// Implements the first part of `ui_set_gameplay` (ux_and_onboarding.md 4.5): text speed, auto
// advance and the guidance level, plus changing a run's difficulty outside combat and
// permanently disabling ironman. The remaining display toggles belong to PK-M1-57.
// Thin painter over gameplay_model.ts and run_settings_model.ts.

import { el, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import { askConfirm } from '../../hud/confirm_pop';
import { actionButton } from '../kit';
import type { WindowContext } from '../window_context';
import { gameplayPageModel, gameplayPatch } from './gameplay_model';
import type { SettingsPage } from './page';
import { difficultyCommands, difficultyModel } from './run_settings_model';

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
  const changeDifficulty = el('select', {
    className: 'hk-input',
    attrs: { 'aria-label': t('ui.set.gameplay.difficulty_title') },
  });
  for (const id of ['story', 'standard', 'hard'])
    changeDifficulty.append(
      el('option', {
        text: t(`ui.set.gameplay.difficulty_name.${id}`),
        attrs: { value: id },
      }),
    );
  const applyDifficulty = el('button', {
    className: 'hk-btn hk-btn-small',
    text: t('ui.set.gameplay.run.change_difficulty'),
    attrs: { type: 'button' },
    on: {
      click: () => ctx.commands.queueAll(difficultyCommands(ctx.view, changeDifficulty.value)),
    },
  });
  const ironman = actionButton(ctx, t('ui.win.party.ironman_turn_off'), () => {
    void askConfirm({
      title: t('ui.win.party.ironman_turn_off'),
      body: t('ui.win.party.ironman_confirm'),
      irreversible: true,
    }).then((yes) => {
      if (yes) ctx.commands.queueAll(ctx.adapters.partyRoster?.ironmanOff(ctx.view) ?? []);
    });
    return [];
  });

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
    el('div', { className: 'hk-row' }, [changeDifficulty, applyDifficulty]),
    ironman,
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
      const run = difficultyModel(ctx.view);
      setText(difficultyNote, run.reason || t('ui.set.gameplay.run.change_note'));
      changeDifficulty.disabled = !run.canChange;
      applyDifficulty.disabled = !run.canChange;
      applyDifficulty.title = run.reason;
      if (document.activeElement !== changeDifficulty && run.current !== 'legend')
        changeDifficulty.value = run.current;
      ironman.hidden = ctx.adapters.partyRoster?.ironman(ctx.view) !== 'on';
    },
  };
}
