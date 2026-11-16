// World events to message-log lines; kernel text (TextRefs) is rendered with t(). Covers
// the core and shared events plus the finished world and inventory systems; later systems
// add lines through LogAdapter.
// Command rejections are shown only for the player's own commands. Experience lines come
// from combat.xp in the system log adapter (combat applies xp.awarded). Pure; Node-tested.

import type { AnyWorldEvent } from '../../core/contracts';
import { calendarAt } from '../../core/time';
import { formatMoney, t } from '../../shared_ui/i18n';
import { fmt, T } from '../../shared_ui/text';
import { actLabel, featureLabel, formatDate, weatherLabel } from './format';

export type LogCategory =
  | 'dialogue'
  | 'divine'
  | 'narrate'
  | 'system'
  | 'warning'
  | 'loot'
  | 'world'
  | 'story'
  | 'combat';

export interface LogLine {
  text: string;
  category: LogCategory | string;
}

export interface LogContext {
  playerId: string;
  playerMapId: string;
  itemName(id: string): string | undefined;
  mapName(id: string): string | undefined;
  entityName(id: string): string | undefined;
}

/** Commands whose rejections are routine and would only spam the log. */
const QUIET_REJECTIONS = new Set(['world.set_intent', 'world.stop']);

export function formatEvent(ev: AnyWorldEvent, ctx: LogContext): LogLine | null {
  const me = ctx.playerId;
  switch (ev.kind) {
    case 'dialogue.line': {
      const d = ev.data;
      if (d.kind === 'narrate')
        return { text: fmt(T.log.narrate, { text: t(d.text) }), category: 'narrate' };
      if (d.kind === 'divine') {
        return {
          text: fmt(T.log.divine, { name: t(d.speakerName), text: t(d.text) }),
          category: 'divine',
        };
      }
      if (d.kind === 'think') {
        return {
          text: fmt(T.log.think, { name: t(d.speakerName), text: t(d.text) }),
          category: 'dialogue',
        };
      }
      return {
        text: fmt(T.log.say, { name: t(d.speakerName), text: t(d.text) }),
        category: 'dialogue',
      };
    }
    case 'command.result': {
      const d = ev.data;
      if (d.ok || d.source.type !== 'player' || QUIET_REJECTIONS.has(d.kind)) return null;
      return {
        text: d.reason
          ? fmt(T.log.rejected, { reason: t(d.reason) })
          : fmt(T.log.rejectedNoReason, { kind: d.kind }),
        category: 'warning',
      };
    }
    case 'money.changed': {
      const d = ev.data;
      if (d.ownerId !== me || d.delta === 0) return null;
      const tpl = d.delta > 0 ? T.log.moneyGain : T.log.moneyLoss;
      return { text: fmt(tpl, { money: formatMoney(Math.abs(d.delta)) }), category: 'loot' };
    }
    case 'inventory.changed': {
      const d = ev.data;
      if (d.ownerId !== me || d.delta === 0) return null;
      const item = ctx.itemName(d.itemId) ?? T.log.unknownItem;
      const tpl = d.delta > 0 ? T.log.itemGain : T.log.itemLoss;
      return { text: fmt(tpl, { item, count: Math.abs(d.delta) }), category: 'loot' };
    }
    case 'item.equipped': {
      const d = ev.data;
      if (d.ownerId !== me) return null;
      return {
        text: fmt(T.log.itemEquipped, { item: ctx.itemName(d.itemId) ?? T.log.unknownItem }),
        category: 'system',
      };
    }
    case 'item.used': {
      const d = ev.data;
      if (d.ownerId !== me) return null;
      return {
        text: fmt(T.log.itemUsed, { item: ctx.itemName(d.itemId) ?? T.log.unknownItem }),
        category: 'system',
      };
    }
    case 'world.map_changed': {
      const d = ev.data;
      if (d.id !== me) return null;
      return {
        text: fmt(T.log.mapChanged, { map: ctx.mapName(d.to) ?? T.log.unknownMap }),
        category: 'world',
      };
    }
    case 'world.weather': {
      const d = ev.data;
      const tpl = d.forced ? T.log.weatherForced : T.log.weatherChanged;
      return { text: fmt(tpl, { weather: weatherLabel(d.weather) }), category: 'world' };
    }
    case 'world.day':
      return {
        text: fmt(T.log.newDay, { date: formatDate(calendarAt(ev.tick)) }),
        category: 'world',
      };
    case 'world.move_failed': {
      const d = ev.data;
      if (d.id !== me) return null;
      return { text: fmt(T.log.moveFailed, { reason: t(d.reason) }), category: 'warning' };
    }
    case 'feature.unlocked':
      return {
        text: fmt(T.log.featureUnlocked, { feature: featureLabel(ev.data.feature) }),
        category: 'story',
      };
    case 'act.changed':
      return { text: fmt(T.log.actChanged, { act: actLabel(ev.data.to) }), category: 'story' };
    case 'door.opened':
      return { text: T.log.doorOpened, category: 'story' };
    case 'entity.died': {
      const d = ev.data;
      if (d.mapId !== ctx.playerMapId) return null;
      const name = d.id === me ? undefined : (d.name ?? ctx.entityName(d.id));
      if (!name) return null;
      return { text: fmt(T.log.entityDied, { name }), category: 'combat' };
    }
    case 'player.level_up':
      return { text: fmt(T.log.levelUp, { level: ev.data.level }), category: 'story' };
    default:
      return null;
  }
}
