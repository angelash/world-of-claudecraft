// Rewards for a defeated enemy: experience (classic mob XP split across the player's
// party with the group bonus), loot and money through the inventory ports, notable-deed
// events for witnesses, and boss milestone flags. Also level progression.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { addItem, addMoney } from '../inventory';
import { applyModifiers } from '../modifiers';
import { getEntity, playerEntity } from '../world';
import { monsterDef } from './defs';
import { ELITE_XP, groupXpBonus, MAX_LEVEL, mobXpValue, xpForLevel } from './formulas';
import type { Unit } from './types';
import { fillUp, refreshTags, setLevel, unitOf } from './units';

/** Party members that share credit: the player and companions near the kill. */
export function creditParty(ctx: SystemContext, mapId: string, x: number, y: number): Unit[] {
  const out: Unit[] = [];
  const player = playerEntity(ctx.world);
  for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
    const u = ctx.world.slices.combat.units[id] as Unit;
    const e = getEntity(ctx.world, id);
    if (!e?.alive || u.downed || e.mapId !== mapId) continue;
    if (e.id !== player?.id && e.kind !== 'companion') continue;
    if (Math.hypot(e.x - x, e.y - y) > 40) continue;
    out.push(u);
  }
  return out;
}

/** Grant experience; handles level ups (player.level_up for the player). */
export function gainXp(ctx: SystemContext, u: Unit, amount: number, reason: TextParam): void {
  if (amount <= 0 || u.level >= MAX_LEVEL) return;
  u.xp += Math.round(amount);
  let leveled = false;
  while (u.level < MAX_LEVEL && u.xp >= xpForLevel(u.level)) {
    u.xp -= xpForLevel(u.level);
    setLevel(ctx, u, u.level + 1);
    leveled = true;
    ctx.emit('combat.level_up', { entityId: u.id, level: u.level, tier: u.tier });
    if (u.id === ctx.world.slices.world.playerId) ctx.emit('player.level_up', { level: u.level });
  }
  if (u.level >= MAX_LEVEL) u.xp = 0;
  if (leveled) {
    fillUp(ctx.world, ctx.content, u);
    refreshTags(ctx, u);
  }
  ctx.emit('combat.xp', {
    entityId: u.id,
    amount: Math.round(amount),
    reason,
    level: u.level,
    xp: u.xp,
  });
}

/** Experience, loot, deeds and boss flags for an enemy that fell (or yielded). */
export function award(
  ctx: SystemContext,
  victim: Unit,
  killer: Unit | null,
  yielded: boolean,
): void {
  const e = getEntity(ctx.world, victim.id);
  if (!e) return;
  const mon = monsterDef(ctx.content, victim.monsterId);
  const tapper = unitOf(ctx.world, victim.tapped);
  const credited = tapper?.side === 'ally' || killer?.side === 'ally';
  const player = playerEntity(ctx.world);

  if (credited && mon && !victim.summonerId) {
    const party = creditParty(ctx, e.mapId, e.x, e.y);
    if (party.length > 0) {
      const elite = mon.rank === 'elite' || mon.rank === 'rare' || mon.rank === 'boss';
      const mult = (mon.xpMult ?? 1) * (elite ? ELITE_XP : 1);
      const top = Math.max(...party.map((p) => p.level));
      const sumLevels = party.reduce((s, p) => s + p.level, 0);
      const pool =
        mobXpValue(victim.level, top, mult) *
        groupXpBonus(party.length) *
        applyModifiers(ctx.world, 'xp', e.mapId, 1);
      for (const member of party) {
        gainXp(ctx, member, (pool * member.level) / sumLevels, `kill:${mon.id}`);
      }
    }
    if (player) rollLoot(ctx, victim, player.id);
  }

  if (credited && mon) {
    const actor = killer?.side === 'ally' ? killer : tapper;
    const notable = mon.rank && mon.rank !== 'normal';
    if (actor && (notable || victim.tier > actor.tier)) {
      ctx.emit('feat.performed', {
        actorId: actor.summonerId ?? actor.id,
        kind: mon.rank === 'boss' ? 'boss_kill' : 'kill',
        tier: victim.tier,
        mapId: e.mapId,
        x: e.x,
        y: e.y,
        targetId: victim.id,
        targetRef: e.ref,
        note: yielded
          ? tr('sys.combat.feat.yielded', { name: mon.name })
          : tr('sys.combat.feat.downed', { name: mon.name }),
      });
    }
  }

  // Bosses and named rares both leave a defeat flag: quests key story beats on them
  // (for example the rare 裂耳 in act 1). Only true bosses emit boss_defeated.
  if (mon?.rank === 'boss' || mon?.rank === 'rare') {
    ctx.setFlag(`boss.${mon.id}.defeated`, true);
  }
  if (mon?.rank === 'boss') {
    ctx.emit('combat.boss_defeated', { entityId: victim.id, bossId: mon.id, yielded });
  }
}

function rollLoot(ctx: SystemContext, victim: Unit, ownerId: string): void {
  const mon = monsterDef(ctx.content, victim.monsterId);
  if (!mon) return;
  const rng = ctx.rng('combat.loot');
  const items: { itemId: string; count: number }[] = [];
  for (const entry of mon.loot ?? []) {
    if (rng.next() >= entry.chance) continue;
    const count = rng.int(entry.min ?? 1, Math.max(entry.min ?? 1, entry.max ?? entry.min ?? 1));
    addItem(ctx, ownerId, entry.itemId, count, 'loot');
    items.push({ itemId: entry.itemId, count });
  }
  let money = 0;
  if (mon.money) {
    money = rng.int(mon.money[0], Math.max(mon.money[0], mon.money[1]));
    if (money > 0) addMoney(ctx, ownerId, money, 'loot');
  }
  if (items.length > 0 || money > 0) {
    ctx.emit('combat.loot', { ownerId, victimId: victim.id, items, money });
  }
}
