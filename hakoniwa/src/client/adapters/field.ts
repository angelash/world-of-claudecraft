// Field-side adapters (../view/adapters_field.ts): the commission board, the livelihoods and
// recipes, the gathering nodes in reach, the dungeon panels, the beast companions and mounts,
// and the party roster with the ironman switch. Pure functions of GameView plus each system's
// exported queries; they read, never write, and build the commands the windows queue.

import type { ContentMap } from '../../core/contracts';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import type { World } from '../../core/world';
import {
  craftingConfig,
  craftingView,
  type GatherNodeDef,
  gainFactor,
  masterworkChance,
  nodeProfession,
  nodesHere,
  placeLocation,
  placeOf,
  recipeRows,
  recipeStationTier,
  skillOf,
  stationAt,
} from '../../systems/crafting';
import { gatherTaint } from '../../systems/crafting/rules';
import { bestTool } from '../../systems/crafting/tools';
import { dungeonsView, fieldView } from '../../systems/dungeons/view';
import { boardView } from '../../systems/guild/view';
import { craftTierOf } from '../../systems/inventory/rules';
import { activeMount, beastsView, ironmanState, rosterView } from '../../systems/party';
import { mapById, sedimentAt } from '../../systems/world';
import type {
  BeastsAdapter,
  BoardAdapter,
  CraftAdapter,
  CraftRecipeData,
  DungeonAdapter,
  GatherAdapter,
  GatherNodeData,
  MountRow,
  PartyRosterAdapter,
} from '../view/adapters_field';
import type { GameView } from '../view/game_view';

const worldOf = (v: GameView) => v.world as unknown as World;
const contentOf = (v: GameView) => v.content as unknown as ContentMap;

// ---------------------------------------------------------------------------
// The commission board (6.3.7)

/** Tiles around a board's location that still count as standing at it (the guild's own reach). */
export const BOARD_REACH = 1;

export function createBoardAdapter(): BoardAdapter {
  return {
    boardHere(view) {
      const p = view.player();
      if (!p) return null;
      const c = contentOf(view);
      for (const b of c.guildBoards ?? []) {
        if (b.mapId !== p.mapId) continue;
        const loc = b.location
          ? placeLocation(c, { mapId: b.mapId, location: b.location })
          : undefined;
        // a board without a location stands for its whole map
        if (!b.location) return b.id;
        if (
          loc &&
          p.x >= loc.x - BOARD_REACH &&
          p.x < loc.x + loc.w + BOARD_REACH &&
          p.y >= loc.y - BOARD_REACH &&
          p.y < loc.y + loc.h + BOARD_REACH
        )
          return b.id;
      }
      return null;
    },
    board: (view, boardId) => boardView(worldOf(view), contentOf(view), boardId),
    // a taken posting runs as the quest of the same id (guild board.ts postingQuest)
    ready: (view, postingId) =>
      (view.world.slices as { quests?: { quests: Record<string, { status?: string }> } }).quests
        ?.quests[postingId]?.status === 'ready',
    accept: (_v, postingId) => [{ kind: 'guild.accept', data: { postingId } }],
    abandon: (_v, postingId) => [{ kind: 'guild.abandon', data: { postingId } }],
    turnIn: (_v, postingId) => [{ kind: 'guild.turn_in', data: { postingId } }],
  };
}

// ---------------------------------------------------------------------------
// Livelihoods and recipes (6.3.3)

export function createCraftAdapter(): CraftAdapter {
  return {
    livelihoods: (view) => craftingView(worldOf(view), contentOf(view), view.playerId()),
    recipes(view) {
      const w = worldOf(view);
      const c = contentOf(view);
      const cfg = craftingConfig(c);
      const pid = view.playerId();
      const holding = view.holding(pid);
      const me = view.player();
      const out: CraftRecipeData[] = [];
      for (const row of recipeRows(w, c, pid)) {
        const def = (c.recipes ?? []).find((r) => r.id === row.id);
        if (!def) continue;
        const have: Record<string, number> = {};
        for (const inp of def.inputs) {
          let n = holding.items[inp.itemId] ?? 0;
          for (const alt of inp.alt ?? []) n += holding.items[alt] ?? 0;
          have[inp.itemId] = n;
        }
        const tier = cfg ? recipeStationTier(def, cfg) : 1;
        const skill = skillOf(w, pid, def.profession);
        const station =
          cfg && me ? stationAt(w, c, cfg, me as never, def.station, tier) : undefined;
        const quality =
          def.output && (c.items ?? []).find((i) => i.id === def.output?.itemId)?.quality;
        const masterwork =
          cfg && station && (def.op ?? 'make') === 'make' && (quality ?? 0) >= 1
            ? masterworkChance(cfg, {
                tiersAbove: craftTierOf(skill) - def.tier,
                signed: false,
                specialized: false,
                stationTier: station.tier,
              })
            : 0;
        out.push({
          row,
          def,
          have,
          masterwork,
          atStation: !!station,
          stationTier: tier,
          skillGain: cfg ? gainFactor(cfg, skill, def.tier) : 0,
        });
      }
      return out;
    },
    stations(view) {
      const c = contentOf(view);
      const cfg = craftingConfig(c);
      const me = view.player();
      if (!cfg || !me) return [];
      return (c.craftStations ?? []).filter((s) => !!placeOf(c, me, s.places, cfg.gather.reach));
    },
    maxRuns: (view) => craftingConfig(contentOf(view))?.maxRuns ?? 10,
    craft: (_v, recipeId, runs) => [{ kind: 'crafting.craft', data: { recipeId, runs } }],
  };
}

// ---------------------------------------------------------------------------
// The gathering node panel (6.3.4)

/** The taint grade what a node gives at its place carries (1.4). */
function nodeTaint(content: ContentMap, node: GatherNodeDef, me: { mapId: string }): number {
  if (node.taint !== undefined) return node.taint;
  const place = node.places.find((p) => p.mapId === me.mapId);
  const map = place ? mapById(content, place.mapId) : undefined;
  const loc = place ? placeLocation(content, place) : undefined;
  if (!map || !loc) return 0;
  return gatherTaint(sedimentAt(map, loc.x + loc.w / 2, loc.y + loc.h / 2), node.tier);
}

export function createGatherAdapter(): GatherAdapter {
  return {
    nodes(view) {
      const w = worldOf(view);
      const c = contentOf(view);
      const cfg = craftingConfig(c);
      const me = view.player();
      const pid = view.playerId();
      if (!cfg || !me) return [];
      const out: GatherNodeData[] = [];
      for (const row of nodesHere(w, c, pid)) {
        const def = (c.gatherNodes ?? []).find((n) => n.id === row.id);
        if (!def) continue;
        const prof = nodeProfession(def);
        const skillTier = craftTierOf(skillOf(w, pid, prof));
        const toolTier = bestTool(w, c, cfg, pid, prof)?.tier ?? 0;
        const readyDays =
          row.readyAt < 0
            ? -1
            : row.readyAt > view.tick
              ? Math.ceil((row.readyAt - view.tick) / TICKS_PER_GAME_DAY)
              : null;
        out.push({
          row,
          def,
          taint: nodeTaint(c, def, me),
          toolTier,
          skillTier,
          full: skillTier >= def.tier && toolTier >= def.tier,
          readyDays,
        });
      }
      return out;
    },
    gather: (_v, nodeId) => [{ kind: 'crafting.gather', data: { nodeId } }],
  };
}

// ---------------------------------------------------------------------------
// The dungeon panels (5.2, 6.3.10)

export function createDungeonAdapter(): DungeonAdapter {
  return {
    field: (view) => fieldView(worldOf(view), contentOf(view)),
    dungeons: (view) => dungeonsView(worldOf(view), contentOf(view)),
    setDisposition: (_v, dungeonId, choice) => [
      { kind: 'dungeons.dispose', data: { id: dungeonId, choice } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Beast companions and mounts (6.3.5)

export function createBeastsAdapter(): BeastsAdapter {
  return {
    pets: (view) => beastsView(worldOf(view), contentOf(view)),
    mounts(view) {
      const c = contentOf(view);
      const holding = view.holding(view.playerId());
      const active = activeMount(worldOf(view), c);
      const out: MountRow[] = [];
      for (const m of c.mounts ?? []) {
        if ((holding.items[m.id] ?? 0) <= 0 && active?.id !== m.id) continue;
        out.push({ def: m, active: active?.id === m.id });
      }
      return out;
    },
    ride: (_v, mountId) => [{ kind: 'party.ride', data: { mountId } }],
    release: (_v, companionId) => [{ kind: 'party.release', data: { companionId } }],
  };
}

// ---------------------------------------------------------------------------
// The party roster and the ironman switch (PK-M1-15)

export function createPartyRosterAdapter(): PartyRosterAdapter {
  return {
    roster: (view) => rosterView(worldOf(view), contentOf(view)),
    ironman: (view) => ironmanState(worldOf(view)),
    ironmanOff: () => [{ kind: 'party.ironman_off', data: {} }],
    wait: (_v, companionId, on) => [{ kind: 'party.wait', data: { companionId, on } }],
    order: (_v, companionId, order) => [
      { kind: 'party.order', data: companionId ? { companionId, order } : { order } },
    ],
  };
}
