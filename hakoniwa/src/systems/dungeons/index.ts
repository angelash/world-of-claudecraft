// Dungeons system (PK-M1-50, phase 15, after the world whose moves and clock it reads): the
// dungeon runtime of catalog_dungeons_bosses.md 1 and the nests of catalog_bestiary.md 2.8
// and 6. Instances keep each dungeon's state quantities (pressure, activity, overflow clock,
// disposition) and mirror them to `dg.<id>.<field>`; the player's visit is tracked from where
// they stand (entry, floors, exit, the party cap); left items are swallowed after their days
// in a dungeon through the left pack port (left_items.ts); nests wake, grow by the season,
// and are nurtured, destroyed (the collapse switch `dg.<id>.collapsed`) or purified. Rules
// only: a model never enters, disposes of or clears anything; the collapse days are drawn
// on the named stream `dungeons.collapse`. See docs/70_packets/pk_m1_50_dungeons/.

import { ok, reject } from '../../core';
import { contentRef } from '../../core/content_key';
import type { CommandResult, CommandSource } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { registerSkipHandler } from '../travel/skip_registry';
import { playerEntity } from '../world';
import {
  adoptChoiceFlag,
  beginChoice,
  breakRitual,
  type ChoiceRefusal,
  choiceRefusal,
} from './dispose';
import { dungeonConfig, dungeonDef, entryFloor, floorAt, hasAreaFloors, partyCap } from './layout';
import { nestDeath } from './nests';
import { atPlace, enterDungeon, leaveDungeon, partySize, playerFloor, track } from './run';
import { settle, unsettled, wakeNests } from './settle';
import {
  DUNGEONS_ID_FIELDS,
  dungeonsSlice,
  emptyDungeonsSlice,
  readDungeons,
  validateDungeonsSlice,
} from './slice';
import {
  addActivity,
  clearDungeon,
  clearNest,
  formed,
  instanceOf,
  mirrorDungeon,
  standing,
  sweep,
  type Target,
  targetOf,
} from './state';
import type { Choice, DungeonConfig, DungeonDef, NestDef, RunVia } from './types';

export * from './dispose';
export * from './layout';
export * from './left_items';
export * from './nests';
export * from './run';
export * from './sediment';
export * from './settle';
export * from './slice';
export * from './state';
export * from './types';
export * from './view';

declare module '../../core/contracts' {
  interface WorldSlices {
    dungeons: import('./types').DungeonsSlice;
  }
  interface ContentMap {
    dungeonConfig: DungeonConfig;
    dungeons: DungeonDef[];
    nests: NestDef[];
  }
  interface CommandMap {
    /** enter a dungeon from its gate (the party cap applies to the player) */
    'dungeons.enter': { dungeonId: string };
    /** leave the dungeon the player is in, out at its gate */
    'dungeons.leave': Record<string, never>;
    /** nurture, destroy or purify a dungeon or nest */
    'dungeons.dispose': { id: string; choice: Choice };
    /** the kernel or the story clears a dungeon (core boss) or nest (lord) */
    'dungeons.clear': { id: string };
    /** the kernel or the story moves a dungeon's activity or pressure (story triggers, 1.1) */
    'dungeons.shift': { id: string; activity?: number; pressure?: number };
    /** a clearing sweep went through a dungeon (a garrison, a guild branch: 1.2 nurture) */
    'dungeons.patrol': { id: string };
    /** a purification ritual is broken off (its defence failed, 1.2) */
    'dungeons.break_ritual': { id: string };
  }
  interface EventMap {
    /** the player came into a dungeon (any way); overCap: the party is above the cap */
    'dungeon.entered': {
      dungeonId: string;
      floorId: string;
      depth: number;
      via: RunVia;
      party: number;
      cap: number;
      overCap: boolean;
    };
    /** the player went to another floor of the same dungeon */
    'dungeon.floor_changed': { dungeonId: string; from: string; to: string; depth: number };
    /** the player is out of the dungeon (any way) */
    'dungeon.left': { dungeonId: string; floorId: string; via: RunVia };
    /** a left item lay its days in a dungeon (or the dungeon caved in) and is gone */
    'dungeon.swallowed': { dungeonId: string; itemId: string; mapId: string };
    /** the active period began or ended */
    'dungeon.active': { dungeonId: string; active: boolean };
    /** the dungeon overflowed toward its settlement */
    'dungeon.overflow': { dungeonId: string; toMap?: string };
    /** a dungeon's core boss or a nest's lord is down */
    'dungeon.cleared': { id: string; kind: 'dungeon' | 'nest' };
    /** content wrote a choice the owner will not have; the flag went back */
    'dungeon.choice_refused': {
      id: string;
      kind: 'dungeon' | 'nest';
      choice: Choice;
      reason: 'owner_refuses';
    };
    /** a purification ritual was broken off; the disposition went back to what it was */
    'dungeon.ritual_failed': { id: string; kind: 'dungeon' | 'nest' };
    /** a disposition was made (by a command, or by content writing the choice flag) */
    'dungeon.choice': {
      id: string;
      kind: 'dungeon' | 'nest';
      choice: Choice;
      by: 'command' | 'content';
    };
    /** a destroyed dungeon or nest caved in (the collapse switch is set) */
    'dungeon.collapsed': { id: string; kind: 'dungeon' | 'nest' };
    /** a purification ritual ended: a clean site */
    'dungeon.purified': { id: string; kind: 'dungeon' | 'nest' };
    /** a nest came to life (from 0) or grew a stage */
    'dungeon.nest_stage': { nestId: string; stage: number; from: number };
    /** a nest matured into the shallow dungeon its record names */
    'dungeon.formed': { dungeonId: string; nestId: string };
  }
}

export const SYSTEM_ID = 'dungeons';

/** Ticks between two looks at the player's floor on a map with area floors. */
export const FLOOR_POLL_TICKS = 10;

/** The player's own acts; never a model's proposal. */
const PLAYER_SOURCES = new Set<CommandSource['type']>(['player', 'system', 'script']);
/** Kernel and story levers. */
const KERNEL_SOURCES = new Set<CommandSource['type']>(['system', 'script']);

const notAllowed = () => reject('not_allowed', tr('sys.dungeons.reject.not_allowed'));
const unknown = () => reject('unknown', tr('sys.dungeons.reject.unknown'));

function choiceReject(code: ChoiceRefusal) {
  return reject(code, tr(`sys.dungeons.reject.${code}`));
}

/** A kernel lever's target: a known dungeon that has formed, or a known nest. */
function leverTarget(ctx: SystemContext, id: string): Target | CommandResult {
  const t = targetOf(ctx, id);
  if (!t) return unknown();
  if (t.kind === 'dungeon' && !formed(ctx.world, ctx.content, t.id))
    return reject('not_formed', tr('sys.dungeons.reject.not_formed'));
  return t;
}

const isTarget = (v: Target | CommandResult): v is Target => 'kind' in v && 'state' in v;

registerSkipHandler(SYSTEM_ID, (ctx) => settle(ctx));

const CHOICE_FLAG = /^dg\.([a-z0-9_]+)\.choice$/;

export const system: GameSystem & {
  validateSlice: typeof validateDungeonsSlice;
  idFields: typeof DUNGEONS_ID_FIELDS;
} = {
  id: SYSTEM_ID,
  order: 15,
  validateSlice: validateDungeonsSlice,
  idFields: DUNGEONS_ID_FIELDS,

  init(ctx) {
    ctx.world.slices.dungeons = emptyDungeonsSlice();
    settle(ctx);
    ctx.world.slices.dungeons.dirty = false;
  },

  tick(ctx: SystemContext) {
    const s = dungeonsSlice(ctx.world);
    if (s.dirty) {
      s.dirty = false;
      // a save from before this system settles in full once; later flag moves wake nests
      if (unsettled(ctx)) settle(ctx);
      else wakeNests(ctx);
    }
    if (ctx.tick % FLOOR_POLL_TICKS === 0) {
      const p = playerEntity(ctx.world);
      if (p && (s.run || hasAreaFloors(ctx.content, p.mapId))) track(ctx, 'walk');
    }
  },

  commands: {
    'dungeons.enter'(ctx, d, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const def = dungeonDef(ctx.content, d.dungeonId);
      const cfg = dungeonConfig(ctx.content);
      const st = def ? instanceOf(ctx, def.id) : undefined;
      if (!def || !cfg || !st) return unknown();
      if (st.collapsed || st.purified)
        return reject('collapsed', tr('sys.dungeons.reject.collapsed'));
      if (!formed(ctx.world, ctx.content, def.id))
        return reject('not_formed', tr('sys.dungeons.reject.not_formed'));
      if (playerFloor(ctx)?.dungeon.id === def.id)
        return reject('inside', tr('sys.dungeons.reject.inside'));
      if (source.type === 'player') {
        if (!atPlace(ctx, def.gate)) return reject('far', tr('sys.dungeons.reject.far'));
        const cap = partyCap(cfg, def, st.pressure);
        const count = partySize(ctx);
        if (count > cap)
          return reject('party_full', tr('sys.dungeons.reject.party_full', { cap, count }));
      }
      if (!enterDungeon(ctx, def)) return unknown();
      return ok(tr('sys.dungeons.note.entered', { name: contentRef('dungeons', def.id, 'name') }));
    },

    'dungeons.leave'(ctx, _d, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const hit = playerFloor(ctx);
      if (!hit) return reject('not_inside', tr('sys.dungeons.reject.not_inside'));
      // a player walks out from the arrival floor; the story may pull them out from anywhere
      if (source.type === 'player' && entryFloor(ctx.content, hit.dungeon)?.id !== hit.floor.id)
        return reject('deep', tr('sys.dungeons.reject.deep'));
      if (!leaveDungeon(ctx, hit.dungeon, 'command')) return unknown();
      return ok(
        tr('sys.dungeons.note.left', { name: contentRef('dungeons', hit.dungeon.id, 'name') }),
      );
    },

    'dungeons.dispose'(ctx, d, source) {
      if (!PLAYER_SOURCES.has(source.type)) return notAllowed();
      const t = targetOf(ctx, d.id);
      if (!t) return unknown();
      const refusal = choiceRefusal(ctx, t, d.choice, source);
      if (refusal) return choiceReject(refusal);
      beginChoice(ctx, t, d.choice, 'command');
      return ok(
        tr(`sys.dungeons.note.chose.${d.choice}`, {
          name: contentRef(t.kind === 'dungeon' ? 'dungeons' : 'nests', t.id, 'name'),
        }),
      );
    },

    'dungeons.clear'(ctx, d, source) {
      if (!KERNEL_SOURCES.has(source.type)) return notAllowed();
      const t = leverTarget(ctx, d.id);
      if (!isTarget(t)) return t;
      if (t.kind === 'dungeon') clearDungeon(ctx, t.def, t.state);
      else clearNest(ctx, t.def, t.state);
      return ok();
    },

    'dungeons.shift'(ctx, d, source) {
      if (!KERNEL_SOURCES.has(source.type)) return notAllowed();
      const t = leverTarget(ctx, d.id);
      if (!isTarget(t)) return t;
      if (t.kind !== 'dungeon') return unknown();
      if (d.pressure !== undefined && Number.isFinite(d.pressure)) {
        t.state.pressure = Math.max(0, t.state.pressure + d.pressure);
        mirrorDungeon(ctx, t.id, t.state);
      }
      if (d.activity !== undefined && Number.isFinite(d.activity))
        addActivity(ctx, t.def, t.state, d.activity);
      return ok();
    },

    'dungeons.patrol'(ctx, d, source) {
      if (!KERNEL_SOURCES.has(source.type)) return notAllowed();
      const t = leverTarget(ctx, d.id);
      if (!isTarget(t)) return t;
      if (t.kind !== 'dungeon') return unknown();
      sweep(ctx, t.state);
      return ok();
    },

    'dungeons.break_ritual'(ctx, d, source) {
      if (!KERNEL_SOURCES.has(source.type)) return notAllowed();
      const t = leverTarget(ctx, d.id);
      if (!isTarget(t)) return t;
      if (!breakRitual(ctx, t)) return reject('no_ritual', tr('sys.dungeons.reject.no_ritual'));
      return ok();
    },
  },

  on: {
    'flag.changed'(ctx, e) {
      const s = readDungeons(ctx.world);
      if (!s) return;
      s.dirty = true;
      const hit = CHOICE_FLAG.exec(e.data.key);
      if (!hit) return;
      const t = targetOf(ctx, hit[1] as string);
      if (t) adoptChoiceFlag(ctx, t, e.data.value);
    },
    'world.hour'(ctx) {
      settle(ctx);
    },
    'world.map_changed'(ctx, e) {
      if (e.data.id === ctx.world.slices.world.playerId) track(ctx, 'walk');
    },
    'entity.died'(ctx, e) {
      const cfg = dungeonConfig(ctx.content);
      if (!cfg) return;
      const d = e.data;
      const mon = d.kind === 'monster' && d.ref ? d.ref : undefined;
      // nests: the lord (or the stage 1 head) is down at the nest
      if (mon) nestDeath(ctx, d);
      // dungeons: a paged creature dying inside feeds it; the core boss's death clears it
      const hit = floorAt(ctx.content, d.mapId, d.x, d.y, (x) =>
        standing(ctx.world, ctx.content, x),
      );
      const st = hit ? instanceOf(ctx, hit.dungeon.id) : undefined;
      if (!hit || !st) return;
      const family = mon ? ctx.content.monsters?.find((m) => m.id === mon)?.family : undefined;
      const paged =
        cfg.paged.kinds.includes(d.kind) || (!!family && cfg.paged.families.includes(family));
      if (paged) addActivity(ctx, hit.dungeon, st, cfg.activity.pagedDeath);
      if (mon && mon === hit.dungeon.coreBoss) clearDungeon(ctx, hit.dungeon, st);
    },
  },
};
