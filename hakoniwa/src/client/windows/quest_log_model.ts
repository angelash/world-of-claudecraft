// Implements the model of `ui_win_quests` (ux_and_onboarding.md 14.1; quests_and_events.md 3.1,
// 3.5, 8): the quest log's tabs (main line, disputes, commissions, companions, goddesses, ended),
// a kind badge on every entry, the act and its week ("本幕第 N 周", the act clock), explicit
// deadlines, the ended tab with what happened afterwards (never a red "quest failed") and the
// path taken, and the tracking toggle (at most 5, ./../hud/tracker_model.ts). Side, craft,
// dungeon and exploration quests sit with the commissions, each with its own badge. Pure;
// Node-tested. The painter is the quests window in ./story_windows.ts.

import { t } from '../../shared_ui/i18n';
import type { QuestKind, QuestLogView, QuestView } from '../../systems/quests';
import { deadlineText, objectiveLine } from '../hud/tracker_model';
import type { QuestDetail } from '../view/adapters';

export const QUEST_TABS = [
  'main',
  'disputes',
  'commissions',
  'companions',
  'goddesses',
  'ended',
] as const;
export type QuestTab = (typeof QUEST_TABS)[number];

/** The tab each quest kind lives on (quests_and_events.md 3.1 kinds). */
export const KIND_TAB: Readonly<Record<QuestKind, QuestTab>> = {
  main: 'main',
  side: 'commissions',
  dispute: 'disputes',
  node: 'disputes',
  commission: 'commissions',
  goddess: 'goddesses',
  companion: 'companions',
  craft: 'commissions',
  dungeon: 'commissions',
  explore: 'commissions',
};

/** Ended entries listed at most (the newest first). */
export const ENDED_SHOWN = 30;

export interface QuestObjectiveRow {
  text: string;
  done: boolean;
  optional: boolean;
  options: { id: string; label: string }[];
}

export interface QuestRow {
  id: string;
  title: string;
  kind: QuestKind;
  kindLabel: string;
  status: QuestView['status'];
  /** the stage text (open entries) or the quest's description */
  text: string;
  objectives: QuestObjectiveRow[];
  /** giver or turn-in line ('' when none) */
  who: string;
  /** the explicit deadline and its countdown ('' when none) */
  deadline: string;
  ready: boolean;
  /** an ended entry: what happened afterwards */
  outcome: string;
  /** the path taken ('' when none) */
  path: string;
  /** shown with a tracking toggle (open entries) */
  trackable: boolean;
  tracked: boolean;
}

export interface QuestLogModel {
  /** the act title, with its week when the act has weeks */
  header: string;
  tab: QuestTab;
  tabs: { id: QuestTab; label: string; count: number }[];
  rows: QuestRow[];
  /** the empty state of the tab ('' when it lists something) */
  empty: string;
}

export interface QuestLogInput {
  tab: QuestTab;
  actWeek: number;
  detail(id: string): QuestDetail | null;
  tracked(id: string): boolean;
  personName(id: string): string;
}

function tabOf(q: QuestView): QuestTab {
  return KIND_TAB[q.kind] ?? 'commissions';
}

function isEnded(status: QuestView['status']): boolean {
  return status === 'done' || status === 'failed' || status === 'expired' || status === 'by_other';
}

/** "后来" wording of an ended entry (14.1: what happened afterwards, never "quest failed"). */
export function outcomeText(status: QuestView['status']): string {
  switch (status) {
    case 'done':
      return t('ui.win.quests.outcome.done');
    case 'failed':
      return t('ui.win.quests.outcome.failed');
    case 'expired':
      return t('ui.win.quests.outcome.expired');
    case 'by_other':
      return t('ui.win.quests.outcome.by_other');
    default:
      return '';
  }
}

function row(q: QuestView, i: QuestLogInput, log: QuestLogView): QuestRow {
  const d = i.detail(q.id);
  const ended = isEnded(q.status);
  const ready = q.status === 'ready';
  const whoId = ready ? q.turnIn : q.giver;
  const expiry = !ended && q.act === log.act ? (d?.expiryWeek ?? null) : null;
  const countdown = deadlineText(expiry, i.actWeek);
  return {
    id: q.id,
    title: d?.title || q.title,
    kind: q.kind,
    kindLabel: t(`ui.win.quests.kind.${q.kind}`),
    status: q.status,
    text: q.stageDesc || q.desc,
    objectives: ended
      ? []
      : q.objectives.map((o) => ({
          text: objectiveLine(o),
          done: o.done,
          optional: o.optional,
          options: o.options && !o.done ? o.options : [],
        })),
    who:
      ended || !whoId
        ? ''
        : t(ready ? 'ui.win.quests.turn_in' : 'ui.win.quests.giver', { who: i.personName(whoId) }),
    deadline:
      expiry === null
        ? ''
        : [t('ui.win.quests.deadline', { week: expiry }), countdown].filter(Boolean).join('  '),
    ready,
    outcome: ended ? outcomeText(q.status) : '',
    path: d?.pathLabel ? t('ui.win.quests.path', { path: d.pathLabel }) : '',
    trackable: !ended,
    tracked: !ended && i.tracked(q.id),
  };
}

export function questLogModel(log: QuestLogView, i: QuestLogInput): QuestLogModel {
  const open = [...log.ready, ...log.active];
  const ended = [...log.ended, ...log.done];
  const count = (tab: QuestTab) =>
    tab === 'ended' ? ended.length : open.filter((q) => tabOf(q) === tab).length;
  const list =
    i.tab === 'ended'
      ? ended.slice(-ENDED_SHOWN).reverse()
      : open.filter((q) => tabOf(q) === i.tab);
  const nothing = open.length === 0 && ended.length === 0;
  return {
    header:
      i.actWeek > 0
        ? t('ui.win.quests.act_week', { title: log.actTitle, n: i.actWeek })
        : t('ui.win.quests.act', { title: log.actTitle }),
    tab: i.tab,
    tabs: QUEST_TABS.map((id) => ({ id, label: t(`ui.win.quests.tab.${id}`), count: count(id) })),
    rows: list.map((q) => row(q, i, log)),
    empty:
      list.length > 0
        ? ''
        : nothing
          ? t('ui.win.quests.empty_state')
          : i.tab === 'disputes'
            ? t('ui.win.quests.empty_disputes')
            : i.tab === 'ended'
              ? t('ui.win.quests.empty_ended')
              : t('ui.win.quests.empty_tab'),
  };
}
