// Implements the model of the first part of `ui_set_gameplay` (ux_and_onboarding.md 4.5): the
// reading settings shared by dialogue and cutscenes (text speed 30 or 60 characters a second or
// instant, auto advance; catalog_cutscenes.md 13.2), the guidance level (17.3) and a read-only
// line naming the run's difficulty (the builtin flag `difficulty`; changing it is PK-M1-57,
// with the rest of the page). Pure; Node-tested. The painter is gameplay_page.ts.

import type { FlagValue } from '../../../core/contracts';
import { t } from '../../../shared_ui/i18n';
import {
  type GameplaySettings,
  GUIDANCE_LEVELS,
  type GuidanceLevel,
  type SyncPatch,
  TEXT_SPEEDS,
  type TextSpeed,
} from '../../app/settings_schema';

/** Difficulties of the new game page (3.4.1; registry builtin `difficulty`). */
export const DIFFICULTIES = ['story', 'standard', 'hard', 'legend'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The run's difficulty: the flag, standard when a world has none (saves before the page). */
export function difficultyOf(flag: FlagValue | undefined): Difficulty {
  return (DIFFICULTIES as readonly unknown[]).includes(flag) ? (flag as Difficulty) : 'standard';
}

export interface Choice<V> {
  value: V;
  label: string;
}

export interface GameplayPageModel {
  textSpeed: { value: TextSpeed; options: Choice<TextSpeed>[] };
  autoAdvance: boolean;
  guidance: { value: GuidanceLevel; options: Choice<GuidanceLevel>[]; note: string };
  /** "Difficulty: Standard" and the note on where it changes */
  difficulty: string;
  difficultyNote: string;
}

function speedLabel(s: TextSpeed): string {
  return s === 'instant'
    ? t('ui.set.gameplay.speed_instant')
    : t('ui.set.gameplay.speed_cps', { n: s });
}

export function gameplayPageModel(
  g: Readonly<GameplaySettings>,
  difficultyFlag: FlagValue | undefined,
): GameplayPageModel {
  const d = difficultyOf(difficultyFlag);
  return {
    textSpeed: {
      value: g.textSpeed,
      options: TEXT_SPEEDS.map((s) => ({ value: s, label: speedLabel(s) })),
    },
    autoAdvance: g.autoAdvance,
    guidance: {
      value: g.guidance,
      options: GUIDANCE_LEVELS.map((v) => ({
        value: v,
        label: t(`ui.set.gameplay.guidance.${v}`),
      })),
      note: t(`ui.set.gameplay.guidance_note.${g.guidance}`),
    },
    difficulty: t('ui.set.gameplay.difficulty', {
      name: t(`ui.set.gameplay.difficulty_name.${d}`),
    }),
    difficultyNote: t('ui.set.gameplay.difficulty_note'),
  };
}

/** Parse a text speed from a select value ('30', '60', 'instant'), or null. */
export function parseTextSpeed(raw: string): TextSpeed | null {
  if (raw === 'instant') return 'instant';
  const n = Number(raw);
  return (TEXT_SPEEDS as readonly unknown[]).includes(n) ? (n as TextSpeed) : null;
}

/** The patch for one change on the page, or null when the value is not valid. */
export function gameplayPatch(
  g: Readonly<GameplaySettings>,
  field: keyof GameplaySettings,
  raw: string | boolean,
): SyncPatch | null {
  const next: GameplaySettings = { ...g };
  if (field === 'textSpeed') {
    const s = typeof raw === 'string' ? parseTextSpeed(raw) : null;
    if (s === null) return null;
    next.textSpeed = s;
  } else if (field === 'autoAdvance') {
    if (typeof raw !== 'boolean') return null;
    next.autoAdvance = raw;
  } else {
    if (!(GUIDANCE_LEVELS as readonly unknown[]).includes(raw)) return null;
    next.guidance = raw as GuidanceLevel;
  }
  return { gameplay: next };
}
