// World events to message-log lines; kernel text (TextRefs) is rendered with t(). Covers
// the core and shared events plus the finished world and inventory systems; later systems
// add lines through LogAdapter.
// Command rejections are shown only for the player's own commands. Experience lines come
// from combat.xp in the system log adapter (combat applies xp.awarded). Pure; Node-tested.

import type { AnyWorldEvent } from '../../core/contracts';
import { calendarAt } from '../../core/time';
import { formatMoney, t } from '../../shared_ui/i18n';
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
        return { text: t('ui.hud.log.narrate', { text: t(d.text) }), category: 'narrate' };
      if (d.kind === 'divine') {
        return {
          text: t('ui.hud.log.divine', { name: t(d.speakerName), text: t(d.text) }),
          category: 'divine',
        };
      }
      if (d.kind === 'think') {
        return {
          text: t('ui.hud.log.think', { name: t(d.speakerName), text: t(d.text) }),
          category: 'dialogue',
        };
      }
      return {
        text: t('ui.hud.log.say', { name: t(d.speakerName), text: t(d.text) }),
        category: 'dialogue',
      };
    }
    case 'command.result': {
      const d = ev.data;
      if (d.ok || d.source.type !== 'player' || QUIET_REJECTIONS.has(d.kind)) return null;
      return {
        text: d.reason
          ? t('ui.hud.log.rejected', { reason: t(d.reason) })
          : t('ui.hud.log.rejected_no_reason', { kind: d.kind }),
        category: 'warning',
      };
    }
    case 'money.changed': {
      const d = ev.data;
      if (d.ownerId !== me || d.delta === 0) return null;
      const money = formatMoney(Math.abs(d.delta));
      return {
        text: t(d.delta > 0 ? 'ui.hud.log.money_gain' : 'ui.hud.log.money_loss', { money }),
        category: 'loot',
      };
    }
    case 'inventory.changed': {
      const d = ev.data;
      if (d.ownerId !== me || d.delta === 0) return null;
      const item = ctx.itemName(d.itemId) ?? t('ui.hud.log.unknown_item');
      const count = Math.abs(d.delta);
      return {
        text: t(d.delta > 0 ? 'ui.hud.log.item_gain' : 'ui.hud.log.item_loss', { item, count }),
        category: 'loot',
      };
    }
    case 'item.equipped': {
      const d = ev.data;
      if (d.ownerId !== me) return null;
      return {
        text: t('ui.hud.log.item_equipped', {
          item: ctx.itemName(d.itemId) ?? t('ui.hud.log.unknown_item'),
        }),
        category: 'system',
      };
    }
    case 'item.used': {
      const d = ev.data;
      if (d.ownerId !== me) return null;
      return {
        text: t('ui.hud.log.item_used', {
          item: ctx.itemName(d.itemId) ?? t('ui.hud.log.unknown_item'),
        }),
        category: 'system',
      };
    }
    case 'world.map_changed': {
      const d = ev.data;
      if (d.id !== me) return null;
      return {
        text: t('ui.hud.log.map_changed', {
          map: ctx.mapName(d.to) ?? t('ui.hud.log.unknown_map'),
        }),
        category: 'world',
      };
    }
    case 'world.weather': {
      const d = ev.data;
      const weather = weatherLabel(d.weather);
      return {
        text: t(d.forced ? 'ui.hud.log.weather_forced' : 'ui.hud.log.weather_changed', { weather }),
        category: 'world',
      };
    }
    case 'world.day':
      return {
        text: t('ui.hud.log.new_day', { date: formatDate(calendarAt(ev.tick)) }),
        category: 'world',
      };
    case 'world.move_failed': {
      const d = ev.data;
      if (d.id !== me) return null;
      return { text: t('ui.hud.log.move_failed', { reason: t(d.reason) }), category: 'warning' };
    }
    case 'feature.unlocked':
      return {
        text: t('ui.hud.log.feature_unlocked', { feature: featureLabel(ev.data.feature) }),
        category: 'story',
      };
    case 'act.changed':
      return {
        text: t('ui.hud.log.act_changed', { act: actLabel(ev.data.to) }),
        category: 'story',
      };
    case 'door.opened':
      return { text: t('ui.hud.log.door_opened'), category: 'story' };
    case 'entity.died': {
      const d = ev.data;
      if (d.mapId !== ctx.playerMapId) return null;
      const name = d.id === me ? undefined : (d.name ?? ctx.entityName(d.id));
      if (!name) return null;
      return { text: t('ui.hud.log.entity_died', { name }), category: 'combat' };
    }
    case 'player.level_up':
      return { text: t('ui.hud.log.level_up', { level: ev.data.level }), category: 'story' };
    default:
      return null;
  }
}
