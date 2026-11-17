// The travel system (phase 90, after every other system): the time commands of
// travel_and_exploration.md 9.3 (time.wait, time.sleep, time.skip, time.cancel), the skip
// clock, and the interrupts and summary lines it takes from other systems' events. Region
// travel, fog, discovery and gates (PK-M1-17) join this system later.

import type { CommandSource } from '../../core/contracts';
import { reject } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { type TextRef, tr } from '../../core/text';
import { TICKS_PER_GAME_HOUR, TICKS_PER_GAME_MINUTE } from '../../core/time';
import { MAX_WAIT_HOURS, ticksUntil, wakeTick } from './rest';
import {
  advanceSkip,
  emptyTravelSlice,
  endSkip,
  interruptSkip,
  MAX_SKIP_HOURS,
  noteSkip,
  skipClock,
  skipState,
  startSkip,
  travelSlice,
} from './skip';
import { SKIP_KINDS, SKIP_MODES, type SkipKind, type SkipMode } from './types';

/** Whole game minutes of a fractional hour count, as ticks. */
function hoursToTicks(hours: number): number {
  return Math.round(hours * 60) * TICKS_PER_GAME_MINUTE;
}

/**
 * The strategy system's own nation id for the player (`src/systems/strategy/state.ts`
 * `PLAYER`). Travel does not import strategy (implementation_conventions.md 6.7), so this
 * is the same fixed id read back off strategy's events, not a borrowed system constant.
 */
const PLAYER_NATION_ID = 'player';

/** Interrupt the running skip when it is the skipper an event concerns. */
function stopFor(ctx: SystemContext, entityId: string | undefined, reason: TextRef): void {
  const skip = skipState(ctx.world);
  if (skip && entityId === skip.entityId) interruptSkip(ctx, reason);
}

function playerSourced(src: CommandSource): boolean {
  return src.type === 'player';
}

export const system: GameSystem = {
  id: 'travel',
  order: 90,

  init(ctx) {
    ctx.world.slices.travel = emptyTravelSlice();
  },

  clock: skipClock,

  tick(ctx) {
    if (skipState(ctx.world)) advanceSkip(ctx);
  },

  // the travel system's own coarse step: the hour-mark checks and the end of the skip
  skip(ctx) {
    advanceSkip(ctx);
  },

  commands: {
    'time.wait'(ctx, d) {
      let ticks: number;
      if (d.until) {
        const { hour, minute = 0 } = d.until;
        if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !(minute >= 0 && minute < 60)) {
          return reject('bad_hours', tr('sys.travel.skip.reject.bad_hours'));
        }
        ticks = ticksUntil(ctx.tick, hour, Math.floor(minute));
        if (ticks > MAX_WAIT_HOURS * TICKS_PER_GAME_HOUR) {
          return reject('too_long', tr('sys.travel.skip.reject.too_long', { n: MAX_WAIT_HOURS }));
        }
      } else {
        const h = d.hours ?? 1;
        if (!Number.isInteger(h) || h < 1 || h > MAX_WAIT_HOURS) {
          return reject(
            'bad_hours',
            tr('sys.travel.skip.reject.wait_hours', { n: MAX_WAIT_HOURS }),
          );
        }
        ticks = h * TICKS_PER_GAME_HOUR;
      }
      return startSkip(ctx, { kind: 'wait', endTick: ctx.tick + ticks });
    },

    'time.sleep'(ctx) {
      return startSkip(ctx, { kind: 'sleep', endTick: wakeTick(ctx.tick) });
    },

    'time.skip'(ctx, d, src) {
      const kind: SkipKind = d.kind ?? 'wait';
      if (!SKIP_KINDS.includes(kind)) {
        return reject('bad_kind', tr('sys.travel.skip.reject.bad_kind'));
      }
      const mode: SkipMode | undefined = d.mode;
      if (mode !== undefined && !SKIP_MODES.includes(mode)) {
        return reject('bad_mode', tr('sys.travel.skip.reject.bad_mode'));
      }
      if (kind === 'travel' && playerSourced(src)) {
        // a journey starts with travel.depart on the region map, never a bare skip
        return reject('not_allowed', tr('sys.travel.skip.reject.travel_not_allowed'));
      }
      if (kind === 'sleep') return startSkip(ctx, { kind, endTick: wakeTick(ctx.tick), mode });
      const hours = d.hours ?? 1;
      const cap = kind === 'wait' ? MAX_WAIT_HOURS : MAX_SKIP_HOURS;
      if (!(hours > 0) || hours > cap || hoursToTicks(hours) <= 0) {
        return reject('bad_hours', tr('sys.travel.skip.reject.wait_hours', { n: cap }));
      }
      return startSkip(ctx, { kind, endTick: ctx.tick + hoursToTicks(hours), mode });
    },

    'time.cancel'(ctx) {
      if (!skipState(ctx.world)) return reject('no_skip', tr('sys.travel.skip.reject.no_skip'));
      endSkip(ctx, 'cancelled', tr('sys.travel.skip.stop.cancelled'));
      return { ok: true };
    },
  },

  on: {
    'time.interrupt'(ctx, e) {
      if (skipState(ctx.world)) {
        noteSkip(ctx, 'time.interrupt', e.data.ref);
        interruptSkip(ctx, e.data.reason);
      }
    },
    'act.changed'(ctx, e) {
      if (!skipState(ctx.world)) return;
      noteSkip(ctx, 'act.changed', e.data.to);
      interruptSkip(ctx, tr('sys.travel.skip.stop.story'));
    },
    'quest.started'(ctx, e) {
      if (!skipState(ctx.world)) return;
      noteSkip(ctx, 'quest.started', e.data.questId);
      interruptSkip(ctx, tr('sys.travel.skip.stop.story'));
    },
    'quest.stage'(ctx, e) {
      if (!skipState(ctx.world)) return;
      noteSkip(ctx, 'quest.stage', e.data.questId);
      interruptSkip(ctx, tr('sys.travel.skip.stop.story'));
    },
    'quest.ready'(ctx, e) {
      if (!skipState(ctx.world)) return;
      noteSkip(ctx, 'quest.ready', e.data.questId);
      interruptSkip(ctx, tr('sys.travel.skip.stop.story'));
    },
    'quest.completed'(ctx, e) {
      if (!skipState(ctx.world)) return;
      noteSkip(ctx, 'quest.completed', e.data.questId);
      interruptSkip(ctx, tr('sys.travel.skip.stop.story'));
    },
    'scene.started'(ctx) {
      if (skipState(ctx.world)) interruptSkip(ctx, tr('sys.travel.skip.stop.story'));
    },
    'war.battle_started'(ctx) {
      if (skipState(ctx.world)) interruptSkip(ctx, tr('sys.travel.skip.stop.battle'));
    },
    'flag.changed'(ctx, e) {
      if (e.data.key === 'war.pending' && e.data.value && skipState(ctx.world)) {
        interruptSkip(ctx, tr('sys.travel.skip.stop.battle'));
      }
    },
    'combat.wave_spawned'(ctx, e) {
      const skip = skipState(ctx.world);
      if (!skip) return;
      noteSkip(ctx, 'combat.wave_spawned', e.data.waveId);
      const me = ctx.world.slices.world.entities[skip.entityId];
      if (me && me.mapId === e.data.mapId) interruptSkip(ctx, tr('sys.travel.skip.stop.tide'));
    },
    'combat.damage'(ctx, e) {
      stopFor(ctx, e.data.targetId, tr('sys.travel.skip.stop.attacked'));
    },
    'entity.died'(ctx, e) {
      stopFor(ctx, e.data.id, tr('sys.travel.skip.stop.attacked'));
    },
    'world.map_changed'(ctx, e) {
      stopFor(ctx, e.data.id, tr('sys.travel.skip.stop.moved'));
    },
    'dialogue.opened'(ctx) {
      if (skipState(ctx.world)) interruptSkip(ctx, tr('sys.travel.skip.stop.visitor'));
    },
    'building.completed'(ctx, e) {
      if (skipState(ctx.world)) noteSkip(ctx, 'building.completed', e.data.defId);
    },
    'city.stage_changed'(ctx) {
      if (skipState(ctx.world)) noteSkip(ctx, 'city.stage_changed');
    },
    'economy.caravan_arrived'(ctx) {
      if (skipState(ctx.world)) noteSkip(ctx, 'economy.caravan_arrived');
    },
    'economy.caravan_raided'(ctx) {
      if (skipState(ctx.world)) noteSkip(ctx, 'economy.caravan_raided');
    },
    // a severe settlement crisis (famine, unrest, a raid) stops the skip (7.4, "领地危机")
    'city.event'(ctx, e) {
      if (!skipState(ctx.world)) return;
      noteSkip(ctx, 'city.event', e.data.kind);
      if (e.data.severity === 'severe') interruptSkip(ctx, tr('sys.travel.skip.stop.crisis'));
    },
    // a nation battle naming the player's nation is the continent's own crisis; travel
    // does not import strategy (implementation_conventions.md 6.7), so it reads the
    // nation ids off the event instead of asking strategy which one is the player's
    'slg.battle'(ctx, e) {
      if (!skipState(ctx.world)) return;
      noteSkip(ctx, 'slg.battle', e.data.provinceId);
      if (e.data.attacker === PLAYER_NATION_ID || e.data.defender === PLAYER_NATION_ID) {
        interruptSkip(ctx, tr('sys.travel.skip.stop.crisis'));
      }
    },
    'slg.war_declared'(ctx, e) {
      if (!skipState(ctx.world)) return;
      noteSkip(ctx, 'slg.war_declared', e.data.attacker);
      if (e.data.attacker === PLAYER_NATION_ID || e.data.defender === PLAYER_NATION_ID) {
        interruptSkip(ctx, tr('sys.travel.skip.stop.crisis'));
      }
    },
  },
};

export { travelSlice };
