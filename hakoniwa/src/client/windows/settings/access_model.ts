// Implements the model of `ui_set_access`, the accessibility page (ux_and_onboarding.md 4.7, 18):
// four groups, "see clearly" (colour-vision mode, text size, larger dialogue text), "hear"
// (sound captions off, important or all, and the caption style: size, backdrop opacity,
// position, coloured important lines), "operate" (every hold becomes a toggle; the hold length
// lives on the controls page and is only pointed at) and "keep up" (reduce flashing and
// shaking: follow the system, on, off). Every value lives in the sync settings part
// (`accessibility`, `subtitles`); none of them reaches the kernel (18.1). Pure; Node-tested.
// The painter is access_page.ts.

import { t } from '../../../shared_ui/i18n';
import {
  type Accessibility,
  CAPTION_BACKDROPS,
  CAPTION_MODES,
  CAPTION_POSITIONS,
  CAPTION_SIZES,
  type CaptionMode,
  COLOR_MODES,
  defaultAccessibility,
  FLASH_MODES,
  type SyncPatch,
  type SyncSettings,
  TEXT_SCALES,
} from '../../app/settings_schema';

/** The groups of 4.7, in order. */
export const ACCESS_GROUPS = ['see', 'hear', 'operate', 'keep_up'] as const;
export type AccessGroup = (typeof ACCESS_GROUPS)[number];

/** A choice field of the page: `accessibility.<field>` or the caption mode (`subtitles`). */
export type AccessChoiceField =
  | 'colorMode'
  | 'textScale'
  | 'reduceFlashing'
  | 'captionSize'
  | 'captionBackdrop'
  | 'captionPosition'
  | 'subtitles';

/** A switch field of the page (`accessibility.<field>`). */
export type AccessSwitchField = 'largeDialogue' | 'holdToToggle' | 'captionColors';

export interface AccessOption {
  /** the select value (the stored value as a string) */
  value: string;
  label: string;
}

export interface AccessChoiceRow {
  kind: 'choice';
  field: AccessChoiceField;
  label: string;
  value: string;
  options: AccessOption[];
  /** one line under the row ('' for none) */
  note: string;
  /** the row is shown but cannot change now (caption style while captions are off) */
  disabled: boolean;
}

export interface AccessSwitchRow {
  kind: 'switch';
  field: AccessSwitchField;
  label: string;
  on: boolean;
  note: string;
  disabled: boolean;
}

export type AccessRow = AccessChoiceRow | AccessSwitchRow;

export interface AccessGroupView {
  id: AccessGroup;
  title: string;
  rows: AccessRow[];
  /** a closing line of the group ('' for none) */
  note: string;
}

export interface AccessPageModel {
  groups: AccessGroupView[];
}

const choice = (
  field: AccessChoiceField,
  value: string,
  options: AccessOption[],
  note = '',
  disabled = false,
): AccessChoiceRow => ({
  kind: 'choice',
  field,
  label: t(`ui.set.access.${fieldKey(field)}`),
  value,
  options,
  note,
  disabled,
});

const toggle = (
  field: AccessSwitchField,
  on: boolean,
  note = '',
  disabled = false,
): AccessSwitchRow => ({
  kind: 'switch',
  field,
  label: t(`ui.set.access.${fieldKey(field)}`),
  on,
  note,
  disabled,
});

/** The text key segment of a field (snake case). */
export function fieldKey(field: AccessChoiceField | AccessSwitchField): string {
  return field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** The text key segment of a text size step (0.9 is small, 1.3 extra large). */
export function textScaleKey(scale: number): string {
  return scale === 0.9 ? 'small' : scale === 1.15 ? 'large' : scale === 1.3 ? 'xlarge' : 'standard';
}

export function accessPageModel(
  sync: Pick<Readonly<SyncSettings>, 'accessibility' | 'subtitles'>,
): AccessPageModel {
  const a = sync.accessibility;
  const captionsOff = sync.subtitles === 'off';
  return {
    groups: [
      {
        id: 'see',
        title: t('ui.set.access.group.see'),
        rows: [
          choice(
            'colorMode',
            a.colorMode,
            COLOR_MODES.map((m) => ({ value: m, label: t(`ui.set.access.color_mode_opt.${m}`) })),
            t(`ui.set.access.color_mode_note.${a.colorMode}`),
          ),
          choice(
            'textScale',
            String(a.textScale),
            TEXT_SCALES.map((s) => ({
              value: String(s),
              label: t(`ui.set.access.text_scale_opt.${textScaleKey(s)}`),
            })),
          ),
          toggle('largeDialogue', a.largeDialogue),
        ],
        note: t('ui.set.access.shapes_note'),
      },
      {
        id: 'hear',
        title: t('ui.set.access.group.hear'),
        rows: [
          choice(
            'subtitles',
            sync.subtitles,
            CAPTION_MODES.map((m) => ({ value: m, label: t(`ui.set.access.subtitles_opt.${m}`) })),
            t('ui.set.access.subtitles_note'),
          ),
          choice(
            'captionSize',
            a.captionSize,
            CAPTION_SIZES.map((s) => ({
              value: s,
              label: t(`ui.set.access.caption_size_opt.${s}`),
            })),
            '',
            captionsOff,
          ),
          choice(
            'captionBackdrop',
            String(a.captionBackdrop),
            CAPTION_BACKDROPS.map((b) => ({
              value: String(b),
              label: t('ui.set.access.caption_backdrop_opt', { n: b }),
            })),
            a.colorMode === 'high_contrast' ? t('ui.set.access.caption_backdrop_hc') : '',
            captionsOff,
          ),
          choice(
            'captionPosition',
            a.captionPosition,
            CAPTION_POSITIONS.map((p) => ({
              value: p,
              label: t(`ui.set.access.caption_position_opt.${p}`),
            })),
            '',
            captionsOff,
          ),
          toggle('captionColors', a.captionColors, '', captionsOff),
        ],
        note: t('ui.set.access.captions_third_channel'),
      },
      {
        id: 'operate',
        title: t('ui.set.access.group.operate'),
        rows: [toggle('holdToToggle', a.holdToToggle, t('ui.set.access.hold_to_toggle_note'))],
        note: t('ui.set.access.hold_seconds_pointer'),
      },
      {
        id: 'keep_up',
        title: t('ui.set.access.group.keep_up'),
        rows: [
          choice(
            'reduceFlashing',
            a.reduceFlashing,
            FLASH_MODES.map((m) => ({
              value: m,
              label: t(`ui.set.access.reduce_flashing_opt.${m}`),
            })),
            t('ui.set.access.reduce_flashing_note'),
          ),
        ],
        note: t('ui.set.access.keep_up_note'),
      },
    ],
  };
}

const LISTS: Readonly<Record<AccessChoiceField, readonly (string | number)[]>> = {
  colorMode: COLOR_MODES,
  textScale: TEXT_SCALES,
  reduceFlashing: FLASH_MODES,
  captionSize: CAPTION_SIZES,
  captionBackdrop: CAPTION_BACKDROPS,
  captionPosition: CAPTION_POSITIONS,
  subtitles: CAPTION_MODES,
};

/** The stored value of a select's string, or undefined when it is not one of the field's. */
function parseChoice(field: AccessChoiceField, raw: string): string | number | undefined {
  const list = LISTS[field];
  return list.find((v) => String(v) === raw);
}

/** The patch for one change on the page, or null when the value is not valid. */
export function accessPatch(
  sync: Pick<Readonly<SyncSettings>, 'accessibility' | 'subtitles'>,
  field: AccessChoiceField | AccessSwitchField,
  raw: string | boolean,
): SyncPatch | null {
  if (field === 'largeDialogue' || field === 'holdToToggle' || field === 'captionColors') {
    if (typeof raw !== 'boolean') return null;
    return { accessibility: { ...sync.accessibility, [field]: raw } };
  }
  if (typeof raw !== 'string') return null;
  const v = parseChoice(field, raw);
  if (v === undefined) return null;
  if (field === 'subtitles') return { subtitles: v as CaptionMode };
  return { accessibility: { ...sync.accessibility, [field]: v } as Accessibility };
}

/** "Restore this page's defaults": every accessibility field and the caption mode. */
export function accessDefaultsPatch(): SyncPatch {
  return { accessibility: defaultAccessibility(), subtitles: 'important' };
}
