// Implements the model of `ui_hud_tracker` (ux_and_onboarding.md 14.2): the tracked quests
// (at most 5, 3 on short screens) with their known objectives (at most 3 lines, with counts),
// an explicit deadline countdown when the quest names an expiry week, and the door pinned in
// the corridor at the bottom with its unmet disclosed keys. Tracking is client session state
// (TrackerState), not world state: new main quests are tracked automatically, replacing the
// oldest automatically tracked entry when the list is full, never one the player tracked.
// Pure; Node-tested. The painter is ./tracker.ts.

import { t } from '../../shared_ui/i18n';
import type { ObjectiveView } from '../../systems/quests';
import type { ClientAdapters, CorridorDoorView } from '../view/adapters';
import type { GameView } from '../view/game_view';
import { keysLeftShown } from '../windows/corridor/corridor_model';

/** Most tracked quests (14.2); 3 below 900 px of window height (5.1). */
export const TRACK_MAX = 5;
export const TRACK_MAX_SHORT = 3;
/** Objective lines per tracked quest. */
export const TRACK_LINES = 3;

interface Tracked {
  id: string;
  manual: boolean;
}

/** One quest the log shows, as the tracker needs it. */
export interface LiveQuest {
  id: string;
  kind: string;
}

/** Which quests and which door the player follows (client session state). */
export class TrackerState {
  private list: Tracked[] = [];
  private readonly seen = new Set<string>();
  /** the door pinned in the corridor (9.4), shown under the quests */
  pinnedDoor: string | null = null;
  /** bumps on every change (painter signatures) */
  version = 0;

  /**
   * Line tracking up with the live log (active and ready quests): drop quests that ended,
   * and track every main quest seen for the first time.
   */
  sync(live: readonly LiveQuest[]): void {
    const ids = new Set(live.map((q) => q.id));
    const before = this.list.length;
    this.list = this.list.filter((x) => ids.has(x.id));
    let changed = this.list.length !== before;
    for (const q of live) {
      if (this.seen.has(q.id)) continue;
      this.seen.add(q.id);
      if (q.kind === 'main' && this.add(q.id, false)) changed = true;
    }
    if (changed) this.version++;
  }

  isTracked(id: string): boolean {
    return this.list.some((x) => x.id === id);
  }

  /** Tracked quest ids, oldest first. */
  ids(): string[] {
    return this.list.map((x) => x.id);
  }

  /** Track or untrack by the player; false when the list is full of manual entries. */
  toggle(id: string): boolean {
    this.seen.add(id);
    if (this.isTracked(id)) {
      this.untrack(id);
      return true;
    }
    const ok = this.add(id, true);
    if (ok) this.version++;
    return ok;
  }

  untrack(id: string): void {
    const n = this.list.length;
    this.list = this.list.filter((x) => x.id !== id);
    if (this.list.length !== n) this.version++;
  }

  pinDoor(id: string | null): void {
    if (this.pinnedDoor === id) return;
    this.pinnedDoor = id;
    this.version++;
  }

  private add(id: string, manual: boolean): boolean {
    if (this.isTracked(id)) return false;
    if (this.list.length >= TRACK_MAX) {
      const oldestAuto = this.list.findIndex((x) => !x.manual);
      if (oldestAuto < 0) return false;
      this.list.splice(oldestAuto, 1);
    }
    this.list.push({ id, manual });
    return true;
  }
}

export interface TrackedQuestInput {
  id: string;
  title: string;
  status: string;
  objectives: readonly ObjectiveView[];
  /** act week the quest runs out by, in the act running now; null when it names none */
  expiryWeek: number | null;
}

export interface TrackerInput {
  quests: readonly TrackedQuestInput[];
  /** act_week now (0 in an act without weeks) */
  actWeek: number;
  /** the pinned door, when the corridor still shows it */
  door: CorridorDoorView | null;
  /** entries shown (TRACK_MAX, or TRACK_MAX_SHORT on short screens) */
  limit: number;
}

export interface TrackerLine {
  text: string;
  done: boolean;
}

export interface TrackerEntry {
  id: string;
  title: string;
  lines: TrackerLine[];
  /** explicit deadline countdown ('' when the quest names none) */
  deadline: string;
}

export interface TrackerModel {
  entries: TrackerEntry[];
  door: { id: string; title: string; keys: string[] } | null;
}

/** "{label} 2/5", or the label alone for a one-step objective. */
export function objectiveLine(o: Pick<ObjectiveView, 'label' | 'progress' | 'need'>): string {
  return o.need > 1
    ? t('ui.win.quests.progress', {
        label: o.label,
        cur: Math.min(o.progress, o.need),
        need: o.need,
      })
    : o.label;
}

/** The deadline countdown of an explicit expiry week (14.2: only explicit deadlines). */
export function deadlineText(expiryWeek: number | null, actWeek: number): string {
  if (expiryWeek === null || actWeek <= 0) return '';
  const left = expiryWeek - actWeek;
  if (left < 0) return '';
  return left === 0
    ? t('ui.hud.tracker.due_this_week')
    : t('ui.hud.tracker.weeks_left', { n: left });
}

function entry(q: TrackedQuestInput, actWeek: number): TrackerEntry {
  let lines: TrackerLine[];
  if (q.status === 'ready') lines = [{ text: t('ui.hud.tracker.ready'), done: false }];
  else {
    // open objectives first, then the ones already met, at most TRACK_LINES
    const open = q.objectives.filter((o) => !o.done);
    const met = q.objectives.filter((o) => o.done);
    lines = [...open, ...met]
      .slice(0, TRACK_LINES)
      .map((o) => ({ text: objectiveLine(o), done: o.done }));
  }
  return { id: q.id, title: q.title, lines, deadline: deadlineText(q.expiryWeek, actWeek) };
}

/** The tracker's picture, or null when nothing is tracked (the block hides, 14.2). */
export function trackerModel(i: TrackerInput): TrackerModel | null {
  // a short screen shows the newest entries, so a quest just tracked is never the one left out
  const shown = Math.max(0, i.limit);
  const entries = i.quests
    .slice(Math.max(0, i.quests.length - shown))
    .map((q) => entry(q, i.actWeek));
  const d = i.door;
  const door = d
    ? {
        id: d.id,
        title: d.nameShown && d.name ? d.name : t('ui.mode.corridor.unnamed'),
        keys: [
          ...d.keys.filter((k) => !k.met).map((k) => k.label),
          ...(keysLeftShown(d) > 0
            ? [t('ui.mode.corridor.keys_left', { n: keysLeftShown(d) })]
            : []),
        ],
      }
    : null;
  if (entries.length === 0 && !door) return null;
  return { entries, door };
}

/**
 * Gather the tracker's input from the adapters and bring the tracking state up to date with
 * the log. The quests keep their tracking order (oldest first).
 */
export function buildTracker(
  view: GameView,
  adapters: ClientAdapters,
  state: TrackerState,
  limit: number,
): TrackerModel | null {
  const log = adapters.quests?.log(view);
  const live = log ? [...log.active, ...log.ready] : [];
  state.sync(live);
  const detail = adapters.questDetail;
  const actWeek = detail?.actWeek(view) ?? 0;
  const byId = new Map(live.map((q) => [q.id, q]));
  const quests: TrackedQuestInput[] = [];
  for (const id of state.ids()) {
    const q = byId.get(id);
    if (!q) continue;
    const d = detail?.detail(view, id);
    quests.push({
      id,
      title: d?.title ?? q.title,
      status: q.status,
      objectives: q.objectives,
      expiryWeek: log && q.act === log.act ? (d?.expiryWeek ?? null) : null,
    });
  }
  let door: CorridorDoorView | null = null;
  if (state.pinnedDoor && adapters.corridor) {
    door = adapters.corridor.corridor(view).doors.find((x) => x.id === state.pinnedDoor) ?? null;
    // a door that opened, closed or locked has nothing left to find
    if (door && door.state !== 'hinted' && door.state !== 'openable') door = null;
  }
  return trackerModel({ quests, actWeek, door, limit });
}
