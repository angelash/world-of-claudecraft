// Party system, phase 25: companions and the servant. Spawns a companion next to the
// player when companion.<id>.recruited turns true, scales its level with the player,
// drives its rule AI (ai.ts), keeps it beside the player across maps, and tracks bonds.

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { addUnit, setLevel, unitOf } from '../combat';
import { countItem, itemDef, removeItem } from '../inventory';
import { getEntity, playerEntity, removeEntity, spawnEntity, teleportEntity } from '../world';
import { tickMember } from './ai';
import { addBond, applyBondFlags, giftValue, killValue } from './bond';
import type { CompanionDef, Member, PartyOrder } from './types';

export * from './bond';
export type * from './types';
export * from './view';

const ORDERS: PartyOrder[] = ['follow', 'assist', 'passive', 'stay'];
const RECRUIT = /^companion\.([a-z0-9_]+)\.recruited$/;

function companionDef(ctx: SystemContext, id: string): CompanionDef | undefined {
  return (ctx.content.companions ?? []).find((c) => c.id === id);
}

function targetLevel(ctx: SystemContext, def: CompanionDef): number {
  const p = unitOf(ctx.world, ctx.world.slices.world.playerId);
  return Math.max(def.level, (p?.level ?? 1) + def.levelOffset);
}

/** Spawn the companion beside the player and give it a combat unit. */
export function join(ctx: SystemContext, id: string): Member | undefined {
  const slice = ctx.world.slices.party;
  if (slice.members[id]) return slice.members[id];
  const def = companionDef(ctx, id);
  const p = playerEntity(ctx.world);
  if (!def || !p) return undefined;
  const e = spawnEntity(ctx, {
    id: `companion_${id}`,
    kind: 'companion',
    name: def.name,
    mapId: p.mapId,
    x: p.x - 1,
    y: p.y + 1,
    faction: 'player',
    appearance: def.appearance,
    speed: p.speed,
    tags: ['companion', 'friendly', `class:${def.classId}`, `faction:player`],
    ref: id,
  });
  addUnit(ctx, e.id, { classId: def.classId, level: targetLevel(ctx, def), side: 'ally' });
  const m: Member = {
    id,
    entityId: e.id,
    order: 'assist',
    bond: 0,
    reached: [],
    told: [],
    joinedTick: ctx.tick,
    downedTick: 0,
    pathAt: 0,
  };
  slice.members[id] = m;
  ctx.emit('party.joined', { companionId: id, entityId: e.id });
  applyBondFlags(ctx, def, m);
  return m;
}

export function leave(ctx: SystemContext, id: string): void {
  const slice = ctx.world.slices.party;
  const m = slice.members[id];
  if (!m) return;
  delete slice.members[id];
  removeEntity(ctx, m.entityId);
  ctx.emit('party.left', { companionId: id });
}

function members(ctx: SystemContext): Member[] {
  const slice = ctx.world.slices.party;
  return Object.keys(slice.members)
    .sort()
    .map((k) => slice.members[k] as Member);
}

export const system: GameSystem = {
  id: 'party',
  order: 25,

  init(ctx) {
    ctx.world.slices.party = { members: {} };
    for (const def of ctx.content.companions ?? []) {
      if (ctx.flag(`companion.${def.id}.recruited`)) join(ctx, def.id);
    }
  },

  tick(ctx) {
    const list = members(ctx);
    list.forEach((m, i) => {
      if ((ctx.tick + i) % 5 !== 0) return;
      const def = companionDef(ctx, m.id);
      if (def) tickMember(ctx, def, m, i + 1, list);
    });
  },

  commands: {
    'party.order'(ctx, d) {
      if (!ORDERS.includes(d.order)) return reject('bad_order', tr('sys.party.reject.bad_order'));
      const list = d.companionId ? [ctx.world.slices.party.members[d.companionId]] : members(ctx);
      if (list.length === 0 || !list[0])
        return reject('no_companion', tr('sys.party.reject.no_companion'));
      for (const m of list) {
        if (!m) continue;
        m.order = d.order;
        ctx.emit('party.order', { companionId: m.id, order: d.order });
      }
      return ok();
    },
    'party.gift'(ctx, d) {
      const m = ctx.world.slices.party.members[d.companionId];
      const def = companionDef(ctx, d.companionId);
      if (!m || !def) return reject('no_companion', tr('sys.party.reject.no_companion'));
      const item = itemDef(ctx.content, d.itemId);
      const pid = ctx.world.slices.world.playerId;
      if (!item) return reject('no_item', tr('sys.party.reject.no_item'));
      if (item.kind === 'key' || item.kind === 'evidence')
        return reject('not_giftable', tr('sys.party.reject.not_giftable'));
      if (countItem(ctx.world, pid, d.itemId) <= 0)
        return reject('missing', tr('sys.party.reject.missing'));
      removeItem(ctx, pid, d.itemId, 1, `gift:${d.companionId}`);
      addBond(ctx, m, giftValue(def, item), `gift:${d.itemId}`);
      return ok();
    },
  },

  on: {
    'flag.changed'(ctx, ev) {
      const hit = RECRUIT.exec(ev.data.key);
      if (hit) {
        const id = hit[1] as string;
        if (ev.data.value) join(ctx, id);
        else leave(ctx, id);
        return;
      }
      for (const m of members(ctx)) {
        const def = companionDef(ctx, m.id);
        if (def?.bondFlags?.some((b) => b.flag === ev.data.key)) applyBondFlags(ctx, def, m);
      }
    },
    'player.level_up'(ctx) {
      for (const m of members(ctx)) {
        const def = companionDef(ctx, m.id);
        const u = unitOf(ctx.world, m.entityId);
        if (!def || !u) continue;
        const want = targetLevel(ctx, def);
        if (u.level < want) setLevel(ctx, u, want);
      }
    },
    'world.map_changed'(ctx, ev) {
      if (ev.data.id !== ctx.world.slices.world.playerId) return;
      const p = getEntity(ctx.world, ev.data.id);
      if (!p) return;
      members(ctx).forEach((m, i) => {
        teleportEntity(ctx, m.entityId, p.mapId, p.x - 1 - (i % 2), p.y + 1 + Math.floor(i / 2));
      });
    },
    'entity.died'(ctx, ev) {
      for (const m of members(ctx)) {
        if (m.entityId === ev.data.id) m.downedTick = ctx.tick;
      }
    },
    'combat.kill'(ctx, ev) {
      if (ev.data.killerSide !== 'ally' || ev.data.side === 'ally') return;
      const p = playerEntity(ctx.world);
      for (const m of members(ctx)) {
        const e = getEntity(ctx.world, m.entityId);
        if (!e?.alive || !p || e.mapId !== ev.data.mapId) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) > 20) continue;
        addBond(ctx, m, killValue(ev.data.rank), 'shared_kill');
      }
    },
  },
};
