// Rewards for a defeated enemy: the credit (the player's side dealt a tenth or struck last,
// 8.5), experience (the player's classic solo value, companions counted on their own,
// catch-up below the band floor; progression.ts), loot and money through the inventory
// ports, notable-deed events for witnesses, and boss milestone flags. Also level
// progression (a level widens the outsider's skill rack) and the pass-on pool past the cap.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { addItem, addMoney } from '../inventory';
import { applyModifiers } from '../modifiers';
import { getEntity, playerEntity } from '../world';
import { monsterDef } from './defs';
import { CREDIT_SHARE, ELITE_XP, MAX_LEVEL, xpForLevel } from './formulas';
import { killXpShare, playerXpFactor, XP_OVERFLOW_FLAG } from './progression';
import { syncRack } from './rack';
import { deriveStats } from './stats';
import type { Unit } from './types';
import { fillUp, isPartySide, refreshTags, setLevel, unitOf } from './units';

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

/** Add to the pass-on pool `xp_overflow` (progression 4.4). */
function addOverflow(ctx: SystemContext, amount: number): void {
  if (amount <= 0) return;
  const pool = Number(ctx.flag(XP_OVERFLOW_FLAG) ?? 0) || 0;
  ctx.setFlag(XP_OVERFLOW_FLAG, pool + amount);
}

/**
 * Experience another system granted (xp.awarded: quests, discoveries): for the player the
 * catch-up factor applies to quest experience below the band floor (progression 4.1).
 */
export function applyAwardedXp(
  ctx: SystemContext,
  u: Unit,
  amount: number,
  reason: TextParam,
): void {
  const isPlayer = u.id === ctx.world.slices.world.playerId;
  const factor = isPlayer ? playerXpFactor(u.level, ctx.flag('act'), reason) : 1;
  gainXp(ctx, u, amount * factor, reason);
}

/**
 * Grant experience; handles level ups (player.level_up for the player). At the level cap
 * the player's experience goes 1 to 1 into the pass-on pool, with what an award leaves
 * over on reaching the cap (progression 4.4); other units at the cap gain nothing.
 */
export function gainXp(ctx: SystemContext, u: Unit, amount: number, reason: TextParam): void {
  if (amount <= 0) return;
  const isPlayer = u.id === ctx.world.slices.world.playerId;
  if (u.level >= MAX_LEVEL) {
    if (!isPlayer) return;
    addOverflow(ctx, Math.round(amount));
    ctx.emit('combat.xp', {
      entityId: u.id,
      amount: Math.round(amount),
      reason,
      level: u.level,
      xp: 0,
    });
    return;
  }
  u.xp += Math.round(amount);
  let leveled = false;
  while (u.level < MAX_LEVEL && u.xp >= xpForLevel(u.level)) {
    u.xp -= xpForLevel(u.level);
    setLevel(ctx, u, u.level + 1);
    leveled = true;
    ctx.emit('combat.level_up', { entityId: u.id, level: u.level, tier: u.tier });
    if (u.id === ctx.world.slices.world.playerId) ctx.emit('player.level_up', { level: u.level });
  }
  if (u.level >= MAX_LEVEL) {
    if (isPlayer) addOverflow(ctx, u.xp);
    u.xp = 0;
  }
  if (leveled) {
    fillUp(ctx.world, ctx.content, u);
    refreshTags(ctx, u);
    // a wider rack takes the abilities the new levels brought (7)
    syncRack(ctx.content, u);
  }
  ctx.emit('combat.xp', {
    entityId: u.id,
    amount: Math.round(amount),
    reason,
    level: u.level,
    xp: u.xp,
  });
}

/**
 * The credit of a fallen enemy (8.5; progression 3.3): the player's side (the player,
 * companions and their pets) dealt at least 10% of its health, or struck the last blow; a
 * kill by companions alone counts, one by town guards or another faction alone does not.
 */
export function creditedToParty(ctx: SystemContext, victim: Unit, killer: Unit | null): boolean {
  if (killer && isPartySide(ctx.world, killer)) return true;
  const max = deriveStats(ctx.world, ctx.content, victim).maxHp;
  return (victim.partyDamage ?? 0) >= CREDIT_SHARE * max;
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
  const credited = creditedToParty(ctx, victim, killer);
  const player = playerEntity(ctx.world);

  if (credited && mon && !victim.summonerId) {
    const party = creditParty(ctx, e.mapId, e.x, e.y);
    if (party.length > 0) {
      const elite = mon.rank === 'elite' || mon.rank === 'rare' || mon.rank === 'boss';
      const mult = (mon.xpMult ?? 1) * (elite ? ELITE_XP : 1);
      const mod = applyModifiers(ctx.world, 'xp', e.mapId, 1);
      const reason = `kill:${mon.id}`;
      const act = ctx.flag('act');
      const companions = party.filter((p) => p.id !== player?.id).length;
      for (const member of party) {
        const isPlayer = member.id === player?.id;
        const share = killXpShare(
          victim.level,
          member.level,
          mult,
          isPlayer,
          party.length,
          companions,
        );
        const factor = isPlayer ? playerXpFactor(member.level, act, reason) : 1;
        gainXp(ctx, member, share * mod * factor, reason);
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
    ctx.emit('combat.boss_defeated', {
      entityId: victim.id,
      bossId: mon.id,
      yielded,
      killerId: killer?.id,
    });
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
