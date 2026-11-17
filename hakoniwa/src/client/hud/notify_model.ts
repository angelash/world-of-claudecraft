// Implements the model of `ui_hud_notify` (ux_and_onboarding.md 5.4): notifications in four
// levels. Critical (door opened, level up, act, a companion down): top centre, 4 s, clickable.
// Important (quest updates, new features): right stack, 3 s. Normal (items, money, experience):
// right stack, 2 s, the same kind merged within 2 s ("x3"). Light (why a hotbar press failed):
// one line above the hotbar, 0.8 s, never logged. At most three show at a time and a higher
// level pushes out a lower one; during cutscenes and dialogue they only queue, then come out by
// level with their kinds merged; in combat only critical and important show (normal waits).
// Each notification keeps a text reference (key and params), rendered with t() when painted.
// Also the mapping from world events to notifications. Pure; Node-tested. The painter is
// ./notify.ts.

import type { AnyWorldEvent } from '../../core/contracts';
import { type KeyText, type TextParam, tr } from '../../core/text';

export type NotifyLevel = 'critical' | 'important' | 'normal' | 'light';

export interface NotifySpec {
  level: NotifyLevel;
  text: KeyText;
  /** normal notifications with the same key merge (an item id, 'money', 'xp') */
  merge?: string;
  /** the param that adds up on a merge ('count', 'n', 'm'); the others take the newest value */
  sum?: string;
  /** a window a click on a critical notification opens */
  open?: string;
}

export interface Notification extends NotifySpec {
  id: number;
  /** when it was queued or last merged (ms) */
  at: number;
  /** when it started showing (ms), null while queued */
  shownAt: number | null;
  /** when it stops showing (ms) */
  until: number;
}

/** How long each level shows (5.4), in milliseconds. */
export const NOTIFY_MS: Readonly<Record<NotifyLevel, number>> = {
  critical: 4000,
  important: 3000,
  normal: 2000,
  light: 800,
};

/** Normal notifications of one kind merge within this window (5.4). */
export const MERGE_MS = 2000;
/** At most this many notifications show at once (5.4). */
export const MAX_SHOWN = 3;
/** Queued notifications older than this are dropped (a long scene must not flood the end). */
export const STALE_MS = 60_000;

const RANK: Readonly<Record<NotifyLevel, number>> = {
  critical: 3,
  important: 2,
  normal: 1,
  light: 0,
};

export interface NotifyContext {
  /** a cutscene, a theatre scene or a dialogue is open: notifications only queue */
  held: boolean;
  /** the player is in combat: only critical and important show */
  combat: boolean;
}

export interface NotifyFrame {
  /** critical notifications (top centre) */
  top: readonly Notification[];
  /** important and normal ones (right stack), oldest first */
  stack: readonly Notification[];
  /** the light line above the hotbar */
  light: Notification | null;
  /** changes whenever what shows changes (the painter elides on it) */
  key: string;
}

function mergedText(a: KeyText, b: KeyText, sum: string | undefined): KeyText {
  const params: Record<string, TextParam> = { ...(a.params ?? {}), ...(b.params ?? {}) };
  if (sum) {
    const x = a.params?.[sum];
    const y = b.params?.[sum];
    if (typeof x === 'number' && typeof y === 'number') params[sum] = x + y;
  }
  return { key: a.key, params };
}

export class NotifyQueue {
  private next = 1;
  private shown: Notification[] = [];
  private pending: Notification[] = [];
  private lightItem: Notification | null = null;
  private frameKey = '';
  private cached: NotifyFrame = { top: [], stack: [], light: null, key: '' };

  /** Queue a notification; a light one replaces the light line at once. */
  push(spec: NotifySpec, now: number): void {
    if (spec.level === 'light') {
      this.lightItem = {
        ...spec,
        id: this.next++,
        at: now,
        shownAt: now,
        until: now + NOTIFY_MS.light,
      };
      return;
    }
    if (spec.level === 'normal' && spec.merge) {
      // merge into a showing one of the same kind within the window, else into a queued one
      const live = this.shown.find(
        (n) => n.merge === spec.merge && n.level === 'normal' && now - n.at <= MERGE_MS,
      );
      if (live) {
        live.text = mergedText(live.text, spec.text, spec.sum ?? live.sum);
        live.at = now;
        live.until = Math.max(live.until, now + NOTIFY_MS.normal);
        return;
      }
      const queued = this.pending.find((n) => n.merge === spec.merge && n.level === 'normal');
      if (queued) {
        queued.text = mergedText(queued.text, spec.text, spec.sum ?? queued.sum);
        queued.at = now;
        return;
      }
    }
    this.pending.push({ ...spec, id: this.next++, at: now, shownAt: null, until: 0 });
  }

  /** Drop everything (a new session, back to the title). */
  clear(): void {
    this.shown = [];
    this.pending = [];
    this.lightItem = null;
  }

  /** Close a showing notification early (a click). */
  dismiss(id: number): void {
    this.shown = this.shown.filter((n) => n.id !== id);
  }

  /** Advance to `now` and answer what shows. */
  frame(now: number, ctx: NotifyContext): NotifyFrame {
    this.shown = this.shown.filter((n) => n.until > now);
    if (this.lightItem && (this.lightItem.until <= now || ctx.held)) this.lightItem = null;
    if (ctx.held) {
      // Held by a scene or a talk: everything waits, however long, and comes out afterwards
      // (5.4); the wait only starts counting once the hold ends.
      for (const n of this.pending) n.at = now;
    } else {
      // Only an ordinary notice goes stale (a long fight's loot lines; the log has them);
      // critical and important ones always show.
      this.pending = this.pending.filter((n) => n.level !== 'normal' || now - n.at <= STALE_MS);
      this.release(now, ctx.combat);
    }
    const top = this.shown.filter((n) => n.level === 'critical');
    const stack = this.shown.filter((n) => n.level !== 'critical');
    const key = [...this.shown, ...(this.lightItem ? [this.lightItem] : [])]
      .map((n) => `${n.id}:${JSON.stringify(n.text.params ?? {})}`)
      .join('|');
    if (key !== this.frameKey) {
      this.frameKey = key;
      this.cached = { top, stack, light: this.lightItem, key };
    }
    return this.cached;
  }

  /** Queued notifications, highest level first (tests and the debug view). */
  queued(): readonly Notification[] {
    return this.order(this.pending);
  }

  private order(list: Notification[]): Notification[] {
    return [...list].sort((a, b) => RANK[b.level] - RANK[a.level] || a.id - b.id);
  }

  /** Move queued notifications into view: by level, pushing out lower levels when full. */
  private release(now: number, combat: boolean): void {
    for (const n of this.order(this.pending)) {
      if (combat && n.level === 'normal') continue;
      if (this.shown.length >= MAX_SHOWN) {
        let low: Notification | undefined;
        for (const s of this.shown) {
          if (RANK[s.level] >= RANK[n.level]) continue;
          const lower = !low || RANK[s.level] < RANK[low.level];
          const older = !!low && RANK[s.level] === RANK[low.level] && s.id < low.id;
          if (lower || older) low = s;
        }
        if (!low) break;
        this.shown = this.shown.filter((s) => s !== low);
      }
      this.pending = this.pending.filter((p) => p !== n);
      n.shownAt = now;
      n.until = now + NOTIFY_MS[n.level];
      // a merge window counts from when it shows, so a burst after a scene still merges
      n.at = now;
      this.shown.push(n);
    }
  }
}

// ---------------------------------------------------------------------------
// Events to notifications

/** What the event mapping reads besides the event (names are display names). */
export interface NotifyEventContext {
  playerId: string;
  itemName(id: string): string;
  questTitle(id: string): string;
  /** the display name of a companion's entity, or null when the entity is no companion */
  companionName(entityId: string): string | null;
  featureName(feature: string): string;
  actName(act: string): string;
}

/** The notification an event gives the player, if any (the message log keeps its lines). */
export function notifyOf(ev: AnyWorldEvent, c: NotifyEventContext): NotifySpec | null {
  const me = c.playerId;
  switch (ev.kind) {
    case 'inventory.changed': {
      const d = ev.data;
      if (d.ownerId !== me || d.delta <= 0) return null;
      return {
        level: 'normal',
        merge: `item:${d.itemId}`,
        sum: 'count',
        text: tr('ui.hud.notify.item', { item: c.itemName(d.itemId), count: d.delta }),
      };
    }
    case 'money.changed': {
      const d = ev.data;
      if (d.ownerId !== me || d.delta <= 0) return null;
      return {
        level: 'normal',
        merge: 'money',
        sum: 'm',
        text: tr('ui.hud.notify.money', { m: d.delta }),
      };
    }
    case 'combat.xp': {
      const d = ev.data;
      if (d.entityId !== me || d.amount <= 0) return null;
      return {
        level: 'normal',
        merge: 'xp',
        sum: 'n',
        text: tr('ui.hud.notify.xp', { n: d.amount }),
      };
    }
    case 'quest.started':
      return {
        level: 'important',
        open: 'quests',
        text: tr('ui.hud.notify.quest_started', { title: c.questTitle(ev.data.questId) }),
      };
    case 'quest.stage':
      // stage 0 comes with quest.started in the same tick: one notice for a new quest
      if (ev.data.stage === 0) return null;
      return {
        level: 'important',
        open: 'quests',
        text: tr('ui.hud.notify.quest_updated', { title: c.questTitle(ev.data.questId) }),
      };
    case 'quest.ready':
      return {
        level: 'important',
        open: 'quests',
        text: tr('ui.hud.notify.quest_ready', { title: c.questTitle(ev.data.questId) }),
      };
    case 'quest.completed':
      return {
        level: 'important',
        open: 'quests',
        text: tr('ui.hud.notify.quest_done', { title: c.questTitle(ev.data.questId) }),
      };
    case 'feature.unlocked':
      return {
        level: 'important',
        text: tr('ui.hud.notify.feature', { feature: c.featureName(ev.data.feature) }),
      };
    case 'doors.state':
      return ev.data.to === 'openable'
        ? { level: 'important', open: 'doors', text: tr('ui.hud.notify.door_openable') }
        : null;
    case 'door.opened':
      return { level: 'critical', open: 'doors', text: tr('ui.hud.notify.door_opened') };
    case 'player.level_up':
      return {
        level: 'critical',
        open: 'character',
        text: tr('ui.hud.notify.level_up', { level: ev.data.level }),
      };
    case 'act.changed':
      return {
        level: 'critical',
        open: 'quests',
        text: tr('ui.hud.notify.act', { act: c.actName(ev.data.to) }),
      };
    case 'entity.died': {
      const name = c.companionName(ev.data.id);
      return name
        ? {
            level: 'critical',
            open: 'party',
            text: tr('ui.hud.notify.companion_down', { name }),
          }
        : null;
    }
    default:
      return null;
  }
}

/** A light notification (a failed hotbar press, a window that is not open yet). */
export function lightNotice(text: string): NotifySpec {
  return { level: 'light', text: tr('ui.hud.notify.light', { text }) };
}
