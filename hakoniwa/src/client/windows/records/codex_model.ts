// Implements the model of `ui_win_codex` (ux_and_onboarding.md 6.3.2): the codex of people,
// monsters, creatures, items, books, collections and the recollection page. Only subjects the
// player has met are listed (no silhouettes of the rest) and the denominator is written as
// "已记 N", never "N / all". Monster names follow the naming ledger: before the player hears
// the word from Yeyu (`term.dian_known`, D-030, reveal_ledger.md 6) a monster shows its mortal
// name, or its name with the canon term replaced by the mortal word. Notes carry their source
// mark (亲见, 转述, 书面, 鉴定, 凡人之说). The recollection page lists the scenes seen, grouped
// by act in story order (the prologue first), each replayable (a replay changes nothing in the
// world). Pure; Node-tested. The painter is ./codex_window.ts.

import { contentKey } from '../../../core/content_key';
import { t, tOr } from '../../../shared_ui/i18n';
import type { CodexRowView, CodexSource, CodexTab } from '../../../systems/records';
import type { CodexMemoryRow } from '../../view/adapters_records';
import { mortalName } from './mortal_name';

export const CODEX_TAB_ORDER: readonly CodexTab[] = [
  'people',
  'monsters',
  'creatures',
  'items',
  'books',
  'collections',
  'memories',
];

export interface CodexNoteRow {
  id: string;
  text: string;
  /** the source as a word (6.3.2: every note carries where it came from) */
  source: string;
}

export interface CodexSubjectRow {
  id: string;
  name: string;
  /** "遇见 N 次" for people, "击杀 N" for monsters, "得到 N 次" for items */
  count: string;
  /** the map of the last meeting ('' when none is recorded) */
  place: string;
  notes: CodexNoteRow[];
}

export interface CodexMemoryGroup {
  /** the act flag ('' for the scenes that name none) */
  act: string;
  label: string;
  rows: { id: string; title: string }[];
}

export interface CodexModel {
  tab: CodexTab;
  tabs: { id: CodexTab; label: string }[];
  /** "已记 N" (6.3.2: the denominator is never shown) */
  recorded: string;
  rows: CodexSubjectRow[];
  /** the recollection page's scenes, by act (the memories tab only) */
  memories: CodexMemoryGroup[];
  /** '' when the tab has rows */
  empty: string;
}

export interface CodexInput {
  tab: CodexTab;
  /** the tab's subjects, as the adapter gave them */
  rows: readonly CodexRowView[];
  /** the scenes seen (the memories tab) */
  memories?: readonly CodexMemoryRow[];
  /** the player has heard the word 澱 (`term.dian_known`) */
  dianKnown: boolean;
}

function sourceText(s: CodexSource): string {
  return tOr(`ui.win.codex.source.${s}`, t('ui.win.codex.source.seen'));
}

/**
 * How a subject's meetings read on each tab (6.3.2): meetings for people, kills for monsters,
 * acquisitions for items; the other tabs show no count.
 */
export function countText(tab: CodexTab, count: number): string {
  if (tab === 'people') return t('ui.win.codex.met_count', { n: count });
  if (tab === 'monsters') return t('ui.win.codex.kill_count', { n: count });
  if (tab === 'items') return t('ui.win.codex.got_count', { n: count });
  return '';
}

/**
 * A monster's name before the word is known (D-030): the content record's mortal name when
 * it has one (its `nameMortal` field, through the content key; no monster record carries one
 * yet, a request to PK-M1-30), else the ordinary name under the mortal rule (./mortal_name.ts),
 * so a name built on the canon term never shows it early.
 */
export function monsterName(name: string, id: string, dianKnown: boolean): string {
  if (dianKnown) return name;
  return tOr(contentKey('monsters', id, 'nameMortal'), mortalName(name, false));
}

/** Acts in story order (the act flag's values); scenes naming none sort last. */
export const ACT_ORDER: readonly string[] = [
  'prologue',
  'act1',
  'act2',
  'act3',
  'act4',
  'act5',
  'act6',
  'epilogue',
];

/** Story order of an act flag value: known acts by ACT_ORDER, anything else after them. */
export function actRank(act: string): number {
  const i = ACT_ORDER.indexOf(act);
  return i >= 0 ? i : ACT_ORDER.length;
}

export function codexModel(i: CodexInput): CodexModel {
  const rows: CodexSubjectRow[] = i.rows.map((r) => {
    const name = t(r.name);
    return {
      id: r.id,
      name: i.tab === 'monsters' ? monsterName(name, r.id, i.dianKnown) : name,
      count: countText(i.tab, r.count),
      place: r.map ? t('ui.win.codex.last_seen', { place: t(r.map) }) : '',
      notes: r.notes.map((n) => ({
        id: n.id,
        text: t(n.text),
        source: sourceText(n.source as CodexSource),
      })),
    };
  });
  const memories: CodexMemoryGroup[] = [];
  if (i.tab === 'memories') {
    const byAct = new Map<string, { id: string; title: string }[]>();
    for (const m of i.memories ?? []) {
      const list = byAct.get(m.act) ?? [];
      list.push({ id: m.id, title: t(m.title) });
      byAct.set(m.act, list);
    }
    const acts = [...byAct.keys()].sort(
      (a, b) => actRank(a) - actRank(b) || (a < b ? -1 : a > b ? 1 : 0),
    );
    for (const act of acts) {
      memories.push({
        act,
        label: act ? tOr(`ui.common.act.${act}`, act) : t('ui.win.codex.act_other'),
        rows: byAct.get(act) as { id: string; title: string }[],
      });
    }
  }
  const count = i.tab === 'memories' ? (i.memories?.length ?? 0) : rows.length;
  return {
    tab: i.tab,
    tabs: CODEX_TAB_ORDER.map((id) => ({ id, label: t(`ui.win.codex.tab.${id}`) })),
    recorded: t('ui.win.codex.recorded', { n: count }),
    rows,
    memories,
    empty: count === 0 ? t(`ui.win.codex.empty.${i.tab}`) : '',
  };
}
