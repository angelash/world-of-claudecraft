// Implements the model of the save list shared by `ui_scr_load` (ux_and_onboarding.md 3.5) and
// `ui_win_saves` (6.2.13): newest first, each row with its thumbnail, act and place, game date,
// play time, level, difficulty and ironman badges, AI mode and real save time; the empty state
// ("no saves yet"); the error states (a slot that cannot be read, a save from a newer version,
// the fallback to the previous generation); in game the "save here" rows, the prologue rule
// (the whole list greyed), the waits in combat, scenes and conversations, and an ironman run's
// one slot (3.4.1: no manual or quick saves, no loading back). Pure; Node-tested. The painter
// is ./save_list.ts.

import { MANUAL_SLOTS, type SlotId } from '../../core/save';
import { t, textLanguage } from '../../shared_ui/i18n';
import type { ConfirmRequest } from './confirm_model';
import { actLabel } from './format';
import {
  type SaveBlock,
  type SlotMeta,
  type SlotProblem,
  saveBlockText,
  slotLabel,
} from './save_slots';

export type SaveListMode = 'title' | 'game';

/** Manual slots per build (3.5): the desktop build 20, the web demo 5. */
export const MANUAL_LIMIT = { desktop: 20, web: 5 } as const;

export interface SaveListInput {
  mode: SaveListMode;
  list: Partial<Record<SlotId, SlotMeta>>;
  problems: Partial<Record<SlotId, SlotProblem>>;
  /** in game: why saving waits right now (null: it may go ahead) */
  block: SaveBlock | null;
  /** in game: the running run (its id and whether it is an ironman run) */
  run: { id: string | null; ironman: boolean } | null;
  /** manual slots this build offers to fill (MANUAL_LIMIT) */
  manualLimit: number;
}

export interface SaveButton {
  enabled: boolean;
  /** why it is disabled ('' when enabled) */
  reason: string;
  /** ask first (null: act at once) */
  confirm: ConfirmRequest | null;
}

export type SaveRowState = 'ok' | 'fallback' | 'corrupt' | 'newer' | 'new';

export interface SaveRow {
  slot: SlotId;
  label: string;
  state: SaveRowState;
  /** thumbnail data URL, null for the neutral placeholder */
  thumb: string | null;
  lines: string[];
  badges: { text: string; cls: string }[];
  /** an error or fallback sentence ('' when none) */
  note: string;
  save: SaveButton | null;
  load: SaveButton | null;
  remove: SaveButton | null;
}

export interface SaveListModel {
  rows: SaveRow[];
  /** one line over the list: the prologue, an ironman run, a wait ('' when none) */
  notice: string;
  /** the whole list is greyed (the prologue) */
  disabled: boolean;
  /** the empty-state sentence when there are no rows, else null */
  empty: string | null;
}

const WRITABLE = new Set<SlotId>(['quick', ...MANUAL_SLOTS]);
const PRESETS = new Set(['off', 'single', 'tiered', 'local', 'custom']);

const ok = (confirm: ConfirmRequest | null = null): SaveButton => ({
  enabled: true,
  reason: '',
  confirm,
});
const off = (reason: string): SaveButton => ({ enabled: false, reason, confirm: null });

/** Real play time as hours and minutes ("3 小时 12 分钟"). */
export function playTimeText(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  if (mins < 1) return t('ui.scr.load.under_minute');
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? t('ui.scr.load.hours', { h, m }) : t('ui.scr.load.minutes', { m });
}

/** A real-world ISO time in the interface language's date and time style. */
export function realTimeText(iso: string, lang = textLanguage()): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      ms,
    );
  }
}

/** The AI mode badge text of a preset name ('off' is the built-in AI). */
export function aiModeText(preset: string | null): string {
  const id = preset && PRESETS.has(preset) ? preset : 'custom';
  return t(`ui.scr.load.ai.${id}`);
}

function metaRow(m: SlotMeta): Omit<SaveRow, 'save' | 'load' | 'remove' | 'state' | 'note'> {
  const lines: string[] = [];
  const where = [m.act ? actLabel(m.act) : '', m.mapName].filter(Boolean).join('  ');
  if (where) lines.push(where);
  lines.push(m.date);
  const detail: string[] = [];
  if (m.playSeconds !== null)
    detail.push(t('ui.scr.load.played', { time: playTimeText(m.playSeconds) }));
  if (m.level !== null) detail.push(t('ui.scr.load.level', { n: m.level }));
  if (detail.length) lines.push(detail.join('  '));
  const saved = realTimeText(m.savedAt);
  if (saved) lines.push(t('ui.scr.load.saved_at', { time: saved }));
  const badges: SaveRow['badges'] = [];
  if (m.difficulty) badges.push({ text: t(`ui.scr.load.difficulty.${m.difficulty}`), cls: 'diff' });
  if (m.ironman) badges.push({ text: t('ui.scr.load.ironman'), cls: 'ironman' });
  if (m.aiPreset) badges.push({ text: aiModeText(m.aiPreset), cls: 'ai' });
  if (m.recovered) badges.push({ text: t('ui.scr.load.recovered'), cls: 'recovered' });
  return { slot: m.slot, label: m.label || slotLabel(m.slot), thumb: m.thumb, lines, badges };
}

function removeButton(slot: SlotId): SaveButton {
  return ok({
    title: slotLabel(slot),
    body: t('ui.win.saves.confirm_remove'),
    confirmLabel: t('ui.win.saves.remove'),
    irreversible: true,
  });
}

/** The first free manual slot within the build's limit, or null. */
export function freeManualSlot(
  list: Partial<Record<SlotId, SlotMeta>>,
  problems: Partial<Record<SlotId, SlotProblem>>,
  limit: number,
): SlotId | null {
  for (const s of MANUAL_SLOTS.slice(0, Math.max(0, limit))) {
    if (!list[s] && !problems[s]) return s;
  }
  return null;
}

export function saveListModel(input: SaveListInput): SaveListModel {
  const { mode, list, problems, block, run } = input;
  const game = mode === 'game';
  const ironmanRun = game && !!run?.ironman;
  const prologue = game && block === 'prologue';
  const saveWait = game && block !== null ? saveBlockText(block) : '';

  const metas = Object.values(list).filter((m): m is SlotMeta => !!m);
  metas.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  const rows: SaveRow[] = [];

  for (const m of metas) {
    if (ironmanRun && !(m.slot === 'ironman' && m.runId === run?.id)) continue;
    const problem = problems[m.slot] ?? null;
    const base = metaRow(m);
    const state: SaveRowState =
      problem === 'newer'
        ? 'newer'
        : problem === 'corrupt'
          ? 'corrupt'
          : m.fallback
            ? 'fallback'
            : 'ok';
    const note =
      state === 'newer'
        ? t('ui.win.saves.newer')
        : state === 'corrupt'
          ? t('ui.win.saves.unreadable')
          : state === 'fallback'
            ? t('ui.win.saves.fell_back')
            : '';
    let save: SaveButton | null = null;
    let load: SaveButton | null;
    let remove: SaveButton | null = removeButton(m.slot);
    if (ironmanRun) {
      save = off(t('ui.win.saves.ironman_auto_only'));
      load = off(t('ui.win.saves.ironman_no_load'));
      remove = null;
    } else {
      if (game && WRITABLE.has(m.slot)) {
        save = saveWait
          ? off(saveWait)
          : state === 'newer'
            ? off(t('ui.win.saves.newer'))
            : ok({ title: base.label, body: t('ui.win.saves.confirm_overwrite') });
      }
      load =
        state === 'newer' || state === 'corrupt'
          ? off(note)
          : ok(game ? { title: base.label, body: t('ui.win.saves.confirm_load') } : null);
    }
    rows.push({ ...base, state, note, save, load, remove });
  }

  // Slots with no readable header at all: shown so they can be deleted (3.5 error states).
  if (!ironmanRun) {
    for (const [slot, problem] of Object.entries(problems) as [SlotId, SlotProblem][]) {
      if (list[slot]) continue;
      const note = problem === 'newer' ? t('ui.win.saves.newer') : t('ui.win.saves.unreadable');
      rows.push({
        slot,
        label: slotLabel(slot),
        state: problem,
        thumb: null,
        lines: [],
        badges: [],
        note,
        save: null,
        load: off(note),
        remove: removeButton(slot),
      });
    }
  }

  if (game && !ironmanRun) {
    const free = freeManualSlot(list, problems, input.manualLimit);
    if (free) {
      rows.push({
        slot: free,
        label: slotLabel(free),
        state: 'new',
        thumb: null,
        lines: [t('ui.win.saves.empty')],
        badges: [],
        note: '',
        save: saveWait ? off(saveWait) : ok(),
        load: null,
        remove: null,
      });
    }
  }

  if (prologue) {
    for (const r of rows) {
      const why = t('ui.win.saves.block.prologue');
      if (r.save) r.save = off(why);
      if (r.load) r.load = off(why);
      if (r.remove) r.remove = off(why);
    }
  }

  const notice = prologue
    ? t('ui.win.saves.block.prologue')
    : ironmanRun
      ? t('ui.win.saves.ironman_notice')
      : saveWait;
  const hasSaves = rows.some((r) => r.state !== 'new');
  return {
    rows,
    notice,
    disabled: prologue,
    empty: hasSaves ? null : t('ui.win.saves.empty_state'),
  };
}
