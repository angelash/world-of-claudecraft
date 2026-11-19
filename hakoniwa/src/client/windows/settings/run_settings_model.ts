// The gameplay settings obey the combat system's public run rules. The command is still
// revalidated by that system; a window cannot silently change a fight or leave legend.

import { t } from '../../../shared_ui/i18n';
import type { ClientCommand, GameView } from '../../view/game_view';
import { difficultyOf } from './gameplay_model';

export function difficultyModel(view: GameView): {
  current: ReturnType<typeof difficultyOf>;
  canChange: boolean;
  reason: string;
} {
  const current = difficultyOf(view.flag('difficulty'));
  const unit = view.world.slices.combat?.units[view.playerId()];
  const fighting = !!unit && unit.combatUntil > view.tick;
  const canChange = current !== 'legend' && !fighting;
  return {
    current,
    canChange,
    reason:
      current === 'legend'
        ? t('ui.set.gameplay.run.legend_locked')
        : fighting
          ? t('ui.set.gameplay.run.in_combat')
          : '',
  };
}

export function difficultyCommands(view: GameView, raw: string): ClientCommand[] {
  if (!['story', 'standard', 'hard'].includes(raw) || !difficultyModel(view).canChange) return [];
  return [{ kind: 'flag.set', data: { key: 'difficulty', value: raw } }];
}
