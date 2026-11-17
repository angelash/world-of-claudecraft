// Implements the model of `ui_set_audio` (ux_and_onboarding.md 4.3; audio_direction.md 10.3):
// the five bus sliders (0 is silence, 1 to 100 on the logarithmic curve of 8.2), the output
// (stereo or mono), the dynamic range (full or night), the background-window rule, the combat
// music, dialogue blip, thinking sound and reduce-loud switches, and the pad rumble strength
// (shared with the controls page). Sound captions and reduce flashing and shaking live on the
// accessibility page (18.4, 18.8); the desktop's output device picker joins with the desktop
// settings. Pure; Node-tested. The painter is audio_page.ts.

import { t } from '../../../shared_ui/i18n';
import { BACKGROUND_AUDIO, type SyncPatch, type SyncSettings } from '../../app/settings_schema';
import {
  AUDIO_OUTPUTS,
  type AudioOptions,
  DYNAMIC_RANGES,
  defaultAudioOptions,
} from '../../audio/audio_settings';
import { BUSES, type BusId, DEFAULT_VOLUMES } from '../../audio/bus_model';

export type AudioField =
  | `volume.${BusId}`
  | 'volume.background'
  | 'audio.output'
  | 'audio.dynamicRange'
  | 'audio.combatMusic'
  | 'audio.dialogueBlips'
  | 'audio.llmThinking'
  | 'audio.reduceLoud'
  | 'input.rumble';

export type AudioRow =
  | {
      field: AudioField;
      kind: 'range';
      label: string;
      min: number;
      max: number;
      step: number;
      value: number;
      text: string;
    }
  | { field: AudioField; kind: 'toggle'; label: string; value: boolean; note?: string }
  | {
      field: AudioField;
      kind: 'choice';
      label: string;
      value: string;
      options: { value: string; label: string }[];
      note?: string;
    };

export interface AudioPageModel {
  volumes: AudioRow[];
  output: AudioRow[];
  behaviour: AudioRow[];
  pad: AudioRow[];
  accessNote: string;
}

type AudioSlice = Pick<SyncSettings, 'volume' | 'audio' | 'input'>;

/** A slider's value text: 0 is silence. */
export const levelText = (n: number): string =>
  n === 0 ? t('ui.set.audio.muted') : t('ui.set.audio.level', { n });

const range = (field: AudioField, label: string, value: number, step = 1): AudioRow => ({
  field,
  kind: 'range',
  label,
  min: 0,
  max: 100,
  step,
  value,
  text: levelText(value),
});

export function audioPageModel(s: Readonly<AudioSlice>): AudioPageModel {
  const a: AudioOptions = { ...defaultAudioOptions(), ...(s.audio ?? {}) };
  return {
    volumes: BUSES.map((b) =>
      range(`volume.${b}`, t(`ui.set.audio.bus.${b}`), s.volume?.[b] ?? DEFAULT_VOLUMES[b]),
    ),
    output: [
      {
        field: 'audio.output',
        kind: 'choice',
        label: t('ui.set.audio.output'),
        value: a.output,
        options: AUDIO_OUTPUTS.map((v) => ({ value: v, label: t(`ui.set.audio.output_opt.${v}`) })),
      },
      {
        field: 'audio.dynamicRange',
        kind: 'choice',
        label: t('ui.set.audio.range'),
        value: a.dynamicRange,
        options: DYNAMIC_RANGES.map((v) => ({ value: v, label: t(`ui.set.audio.range_opt.${v}`) })),
        note: t('ui.set.audio.range_note'),
      },
      {
        field: 'volume.background',
        kind: 'choice',
        label: t('ui.set.audio.background'),
        value: s.volume?.background ?? 'lower',
        options: BACKGROUND_AUDIO.map((v) => ({
          value: v,
          label: t(`ui.set.audio.background_opt.${v}`),
        })),
      },
    ],
    behaviour: [
      {
        field: 'audio.combatMusic',
        kind: 'toggle',
        label: t('ui.set.audio.combat_music'),
        value: a.combatMusic,
        note: t('ui.set.audio.combat_music_note'),
      },
      {
        field: 'audio.dialogueBlips',
        kind: 'toggle',
        label: t('ui.set.audio.blips'),
        value: a.dialogueBlips,
      },
      {
        field: 'audio.llmThinking',
        kind: 'toggle',
        label: t('ui.set.audio.llm_thinking'),
        value: a.llmThinking,
      },
      {
        field: 'audio.reduceLoud',
        kind: 'toggle',
        label: t('ui.set.audio.reduce_loud'),
        value: a.reduceLoud,
      },
    ],
    pad: [range('input.rumble', t('ui.set.audio.rumble'), s.input?.rumble ?? 70, 5)],
    accessNote: t('ui.set.audio.access_note'),
  };
}

const level = (raw: unknown): number | null => {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
};

const oneOf = <T extends string>(list: readonly T[], raw: unknown): T | null =>
  typeof raw === 'string' && (list as readonly string[]).includes(raw) ? (raw as T) : null;

/** The patch for one change on the page, or null when the value is not valid. */
export function audioPatch(
  s: Readonly<AudioSlice>,
  field: AudioField,
  raw: string | number | boolean,
): SyncPatch | null {
  const [part, key] = field.split('.') as [string, string];
  if (part === 'volume') {
    if (key === 'background') {
      const v = oneOf(BACKGROUND_AUDIO, raw);
      return v ? { volume: { ...s.volume, background: v } } : null;
    }
    const n = level(raw);
    return n === null ? null : { volume: { ...s.volume, [key]: n } };
  }
  if (part === 'input') {
    const n = level(raw);
    return n === null ? null : { input: { ...s.input, rumble: n } };
  }
  const a: AudioOptions = { ...defaultAudioOptions(), ...(s.audio ?? {}) };
  if (key === 'output') {
    const v = oneOf(AUDIO_OUTPUTS, raw);
    return v ? { audio: { ...a, output: v } } : null;
  }
  if (key === 'dynamicRange') {
    const v = oneOf(DYNAMIC_RANGES, raw);
    return v ? { audio: { ...a, dynamicRange: v } } : null;
  }
  if (typeof raw !== 'boolean') return null;
  if (
    key === 'combatMusic' ||
    key === 'dialogueBlips' ||
    key === 'llmThinking' ||
    key === 'reduceLoud'
  )
    return { audio: { ...a, [key]: raw } };
  return null;
}

/** "Restore this page's defaults": the sliders, the background rule and the audio options. */
export function audioDefaultsPatch(): SyncPatch {
  return {
    volume: { ...DEFAULT_VOLUMES, background: 'lower' },
    audio: defaultAudioOptions(),
  };
}
