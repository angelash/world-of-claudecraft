// Crafting system (PK-M1-49, phase 52): gathering and crafting (catalog_gathering_crafting.md
// 1 to 3, 6, 7; progression_and_pacing.md 6.3). Gathering nodes stand at map locations named
// by the data; work stations likewise; recipes make items, refine pieces and put enchants on
// them through the inventory's workshop ports; livelihood skills grow to the cap of the
// layer the data allows (the act's cap now, the livelihood doors later). The system also
// keeps drunkenness (the drinks of cooking) and runs a station's repair service (the T6
// repair site). Rules only: a model never gathers or crafts; draws go on the named streams
// `crafting.gather` and `crafting.masterwork`. Nothing here advances by the tick: node
// clocks are absolute ticks and drunkenness sobers on `world.hour`, which the world sends
// for every hour of a time skip, so the system needs no skip handler.
// See docs/70_packets/pk_m1_49_crafting/.

import { ok, reject } from '../../core';
import { contentText } from '../../core/content_key';
import type { CommandResult, CommandSource } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import type { CrafterDef, Profession } from '../inventory/types';
import { PROFESSIONS } from '../inventory/types';
import { type InputChoice, planCraft, runCraft } from './craft';
import { drinkUsed, soberHour } from './drink';
import { planGather, resetNode, runGather } from './gather';
import { repairAtStation, repairStationAt } from './service';
import { craftingConfig, setSkill } from './skills';
import {
  CRAFTING_ID_FIELDS,
  craftingSlice,
  emptyCraftingSlice,
  validateCraftingSlice,
} from './slice';
import type { CraftingConfig, GatherNodeDef, RecipeDef, StationDef } from './types';
import './use_gate';

export * from './craft';
export * from './drink';
export * from './gather';
export * from './places';
export * from './rules';
export * from './service';
export * from './skills';
export * from './slice';
export * from './tools';
export * from './types';
export * from './view';

export const SYSTEM_ID = 'crafting';

declare module '../../core/contracts' {
  interface WorldSlices {
    crafting: import('./types').CraftingSlice;
  }
  interface ContentMap {
    craftingConfig: CraftingConfig;
    gatherNodes: GatherNodeDef[];
    craftStations: StationDef[];
    recipes: RecipeDef[];
  }
  interface CommandMap {
    /** gather a node where the entity stands (the player when no entity is named) */
    'crafting.gather': { nodeId: string; entityId?: string };
    /**
     * craft a recipe at the station where the entity stands: `runs` times while the inputs
     * last; `targetId` names the piece a refine or enchant works on; `choice` names the stack
     * of an input to spend (a stack key's qualifiers by item id)
     */
    'crafting.craft': {
      recipeId: string;
      entityId?: string;
      runs?: number;
      targetId?: string;
      choice?: InputChoice;
    };
    /** repair at the station where the entity stands (one piece, or every damaged one) */
    'crafting.repair': { entityId?: string; instanceId?: string };
    /** the story or a master's teaching sets a livelihood skill (system and script only) */
    'crafting.set_skill': { entityId?: string; profession: Profession; skill: number };
    /** content makes an event node give again (system and script only) */
    'crafting.reset_node': { nodeId: string };
  }
  interface EventMap {
    /** a livelihood skill reached a new whole number */
    'crafting.skill': { entityId: string; profession: Profession; skill: number };
    /** a rare gathering event: five times the yield, all signed */
    'crafting.rare': { entityId: string; nodeId: string };
    /** a craft came out a masterwork (`first`: the maker's first) */
    'crafting.masterwork': { entityId: string; recipeId: string; itemId: string; first: boolean };
    /** a recipe worked on a piece (a refine or an enchant): no new item, so no `craft.done` */
    'crafting.worked': {
      entityId: string;
      recipeId: string;
      instanceId: string;
      itemId: string;
      op: 'refine' | 'enchant';
    };
    /** an entity's drunk layers changed */
    'crafting.drunk': { entityId: string; layers: number };
  }
}

/** Grants and resets come from the rules and the story, never from a proposal. */
const SCRIPTED = new Set<CommandSource['type']>(['system', 'script']);

/** The entity a command names: the player's own command acts for the player only. */
function actor(
  ctx: SystemContext,
  entityId: string | undefined,
  source: CommandSource,
): { ok: true; id: string } | { ok: false; result: CommandResult } {
  const player = ctx.world.slices.world.playerId;
  const id = entityId ?? player;
  if (source.type === 'player' && id !== player)
    return { ok: false, result: reject('not_yours', tr('sys.crafting.reject.not_yours')) };
  if (!id || !ctx.world.slices.world.entities[id])
    return { ok: false, result: reject('no_body', tr('sys.crafting.reject.no_body')) };
  return { ok: true, id };
}

function itemName(ctx: SystemContext, itemId: string) {
  return contentText(
    'items',
    ctx.content.items.find((i) => i.id === itemId),
    itemId,
  );
}

export const system: GameSystem & {
  validateSlice: typeof validateCraftingSlice;
  idFields: typeof CRAFTING_ID_FIELDS;
} = {
  id: SYSTEM_ID,
  order: 52,
  validateSlice: validateCraftingSlice,
  idFields: CRAFTING_ID_FIELDS,

  init(ctx) {
    ctx.world.slices.crafting = emptyCraftingSlice();
  },

  commands: {
    'crafting.gather'(ctx, d, source) {
      const a = actor(ctx, d.entityId, source);
      if (!a.ok) return a.result;
      const v = planGather(ctx.world, ctx.content, a.id, d.nodeId);
      if (!v.ok) return reject(v.code, tr(`sys.crafting.reject.gather.${v.code}`));
      const got = runGather(ctx, craftingConfig(ctx.content) as CraftingConfig, v.plan);
      const first = got[0];
      return first
        ? ok(
            tr('sys.crafting.info.gathered', { item: itemName(ctx, first.itemId), n: first.count }),
          )
        : ok(tr('sys.crafting.info.gathered_none'));
    },
    'crafting.craft'(ctx, d, source) {
      const a = actor(ctx, d.entityId, source);
      if (!a.ok) return a.result;
      const cfg = craftingConfig(ctx.content);
      const asked = typeof d.runs === 'number' && Number.isFinite(d.runs) ? Math.floor(d.runs) : 1;
      const runs = Math.max(1, Math.min(cfg?.maxRuns ?? 1, asked));
      const opts = { targetId: d.targetId, choice: d.choice };
      let made = 0;
      let last: { itemId: string; masterwork: boolean } | undefined;
      let masterwork: string | undefined;
      for (let i = 0; i < runs; i++) {
        const v = planCraft(ctx.world, ctx.content, a.id, d.recipeId, opts);
        if (!v.ok) {
          if (made === 0) return reject(v.code, tr(`sys.crafting.reject.craft.${v.code}`));
          break;
        }
        last = runCraft(ctx, cfg as CraftingConfig, v.plan);
        if (last.masterwork) masterwork = last.itemId;
        made++;
      }
      return ok(
        tr(masterwork ? 'sys.crafting.info.masterwork' : 'sys.crafting.info.crafted', {
          item: itemName(ctx, masterwork ?? last?.itemId ?? ''),
          n: made,
        }),
      );
    },
    'crafting.repair'(ctx, d, source) {
      const a = actor(ctx, d.entityId, source);
      if (!a.ok) return a.result;
      const station = repairStationAt(ctx.world, ctx.content, a.id);
      if (!station) return reject('no_station', tr('sys.crafting.reject.repair.no_station'));
      const run = repairAtStation(ctx, a.id, station, d.instanceId);
      if (run.repaired > 0) return ok(tr('sys.crafting.info.repaired', { m: run.copper }));
      const code = run.failure ?? 'intact';
      return reject(code, tr(`sys.inventory.reject.${code}`));
    },
    'crafting.set_skill'(ctx, d, source) {
      if (!SCRIPTED.has(source.type))
        return reject('not_allowed', tr('sys.crafting.reject.not_allowed'));
      const a = actor(ctx, d.entityId, source);
      if (!a.ok) return a.result;
      if (!PROFESSIONS.includes(d.profession) || !Number.isFinite(d.skill))
        return reject('bad_skill', tr('sys.crafting.reject.bad_skill'));
      craftingSlice(ctx.world);
      setSkill(ctx, a.id, d.profession, d.skill);
      return ok();
    },
    'crafting.reset_node'(ctx, d, source) {
      if (!SCRIPTED.has(source.type))
        return reject('not_allowed', tr('sys.crafting.reject.not_allowed'));
      if (!(ctx.content.gatherNodes ?? []).some((n) => n.id === d.nodeId))
        return reject('no_node', tr('sys.crafting.reject.gather.no_node'));
      resetNode(ctx, d.nodeId);
      return ok();
    },
  },

  on: {
    'item.used'(ctx, e) {
      drinkUsed(ctx, e.data);
    },
    'world.hour'(ctx) {
      soberHour(ctx);
    },
  },
};

export type { CrafterDef };
