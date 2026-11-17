// Implements the model of `ui_scr_newgame` (ux_and_onboarding.md 3.4.1, 3.4.2): the four
// difficulty cards (story, standard, hard, legend) with the differences the design states
// (progression_and_pacing.md 15, warfare_rts.md 9.1), the ironman switch (any difficulty,
// D-073), the guidance level (17.3), the read-only model card, the storage warnings of the web
// demo, and the confirm that restates the legend and ironman consequences. Starting a run
// writes the registered built-in variables `difficulty` and `ironman`
// (world_state_registry.md 8.1) through the engine's flag.set channel at the first tick, so a
// replay of the run starts the same way. Pure; Node-tested. The painter is ./newgame_screen.ts.

import { t } from '../../shared_ui/i18n';
import type { ConfirmRequest } from '../hud/confirm_model';
import { aiModeText } from '../hud/save_list_model';
import { DIFFICULTIES, type Difficulty } from '../hud/slot_extras';
import type { ClientCommand } from '../view/game_view';
import { GUIDANCE_LEVELS, type GuidanceLevel } from './settings_schema';

export interface NewGameChoices {
  difficulty: Difficulty;
  ironman: boolean;
  guidance: GuidanceLevel;
}

export const DEFAULT_CHOICES: Readonly<NewGameChoices> = Object.freeze({
  difficulty: 'standard',
  ironman: false,
  guidance: 'full',
});

/** Lines per difficulty card (text keys ui.scr.newgame.diff.<id>.line.<n>). */
export const CARD_LINES: Readonly<Record<Difficulty, number>> = {
  story: 3,
  standard: 3,
  hard: 3,
  legend: 3,
};

export interface NewGameEnv {
  /** the model settings: the preset ('off' is the built-in AI) and the last test */
  ai: { preset: string; lastTestFailed: boolean };
  /** saves outlive the page; storage is short (the web demo) */
  storage: { durable: boolean; low: boolean };
  /** the ironman slot holds another run's save (release_engineering.md 5.1) */
  ironmanSlotTaken: boolean;
}

export interface NewGameModel {
  title: string;
  cards: { id: Difficulty; name: string; lines: string[]; selected: boolean }[];
  ironman: { on: boolean; label: string; note: string };
  guidance: { label: string; options: { id: GuidanceLevel; label: string; selected: boolean }[] };
  model: { title: string; text: string; note: string };
  warnings: string[];
  start: string;
  back: string;
  /** ask before starting (legend, ironman), or null to start at once */
  confirm: ConfirmRequest | null;
}

export function newGameModel(c: NewGameChoices, env: NewGameEnv): NewGameModel {
  const cards = DIFFICULTIES.map((id) => ({
    id,
    name: t(`ui.scr.newgame.diff.${id}.name`),
    lines: Array.from({ length: CARD_LINES[id] }, (_, i) =>
      t(`ui.scr.newgame.diff.${id}.line.${i}`),
    ),
    selected: c.difficulty === id,
  }));
  const configured = env.ai.preset !== 'off';
  const warnings: string[] = [];
  if (!env.storage.durable) warnings.push(t('ui.win.saves.memory_only'));
  else if (env.storage.low) warnings.push(t('ui.scr.newgame.storage_low'));
  return {
    title: t('ui.scr.newgame.title'),
    cards,
    ironman: {
      on: c.ironman,
      label: t('ui.scr.newgame.ironman'),
      note: t('ui.scr.newgame.ironman_note'),
    },
    guidance: {
      label: t('ui.scr.newgame.guidance'),
      options: GUIDANCE_LEVELS.map((id) => ({
        id,
        label: t(`ui.scr.newgame.guidance_level.${id}`),
        selected: c.guidance === id,
      })),
    },
    model: {
      title: t('ui.scr.newgame.model'),
      text: configured
        ? t('ui.scr.newgame.model_current', { mode: aiModeText(env.ai.preset) })
        : t('ui.scr.newgame.model_builtin'),
      note: configured
        ? env.ai.lastTestFailed
          ? t('ui.scr.newgame.model_test_failed')
          : t('ui.scr.newgame.model_later')
        : t('ui.scr.newgame.model_connect_later'),
    },
    warnings,
    start: t('ui.scr.newgame.start'),
    back: t('ui.scr.title.back'),
    confirm: startConfirm(c, env),
  };
}

/** The confirm restating legend and ironman (3.4.1); null when neither is chosen. */
export function startConfirm(c: NewGameChoices, env: NewGameEnv): ConfirmRequest | null {
  const lines: string[] = [];
  if (c.difficulty === 'legend') lines.push(t('ui.scr.newgame.confirm_legend'));
  if (c.ironman) {
    lines.push(t('ui.scr.newgame.confirm_ironman'));
    if (env.ironmanSlotTaken) lines.push(t('ui.scr.newgame.confirm_ironman_replace'));
  }
  if (!lines.length) return null;
  return {
    title: t('ui.scr.newgame.confirm_title'),
    body: lines.join('\n'),
    confirmLabel: t('ui.scr.newgame.start'),
    irreversible: c.ironman && env.ironmanSlotTaken,
  };
}

/**
 * The commands that open a run (queued before the first tick): the built-in variables
 * `difficulty` and `ironman` of the registry, written through the engine's flag.set channel.
 */
export function startCommands(c: NewGameChoices): ClientCommand[] {
  return [
    { kind: 'flag.set', data: { key: 'difficulty', value: c.difficulty } },
    { kind: 'flag.set', data: { key: 'ironman', value: c.ironman } },
  ];
}

/** The model settings as the card reads them: preset and whether a connection test failed. */
export function aiCardEnv(s: {
  preset: string;
  connections: readonly { lastTest?: { ok: boolean } }[];
}): NewGameEnv['ai'] {
  return {
    preset: s.preset,
    lastTestFailed: s.preset !== 'off' && s.connections.some((c) => c.lastTest?.ok === false),
  };
}
