// One-on-one duels (combat_and_classes.md 19.2 `duelWatch`, 17.4; the quest model's
// non-lethal duel objective): the player challenges someone; for the duel the opponent is
// the player's foe, and a duel never kills: the blow that would drop either fighter to zero
// leaves them at 1 health and ends it (an opponent with its own yield threshold yields
// first). A boss fought alone keeps the share of its health a party of one would face
// (5.5: (1 / full party)^0.8, 0.415 for a lair lord). A boss with `duelWatch` has watchers
// (its band) who stand aside; once a second fighter of the player's side deals damage the
// duel is void and every watcher turns hostile. The end emits duel.ended (declared with the
// quest objectives that listen for it) with the winner: player, opponent, or draw (voided,
// broken off, or a fighter gone).

import type { SystemContext } from '../../core/system';
import { getEntity, haltEntity } from '../world';
import { bossLayer } from './control';
import { monsterDef } from './defs';
import { FULL_PARTY, partySizeHpScale } from './formulas';
import { deriveStats } from './stats';
import { engage, forgetAttacker } from './threat';
import type { DuelState, Side, Unit } from './types';
import { isPartySide, liveUnit, refreshTags, unitOf } from './units';

/** Watchers within this many tiles of the opponent stand aside. */
const WATCH_RADIUS = 20;
/** Fighters this far apart (or on different maps) break the duel off. */
export const DUEL_BREAK_DISTANCE = 40;

export type DuelStart = { ok: true; duelId: string } | { ok: false; code: string };

/** Start a duel between the player's unit and `opponent`. */
export function startDuel(ctx: SystemContext, challenger: Unit, opponent: Unit): DuelStart {
  if (challenger.duel || opponent.duel) return { ok: false, code: 'busy' };
  if (challenger === opponent || !opponent.attackable) return { ok: false, code: 'bad_target' };
  const ce = liveUnit(ctx.world, challenger.id)?.[1];
  const oe = liveUnit(ctx.world, opponent.id)?.[1];
  if (!ce || !oe || ce.mapId !== oe.mapId) return { ok: false, code: 'bad_target' };
  if (opponent.ai?.state === 'yielded' || opponent.ai?.state === 'evade')
    return { ok: false, code: 'bad_target' };
  if (Math.hypot(ce.x - oe.x, ce.y - oe.y) > DUEL_BREAK_DISTANCE)
    return { ok: false, code: 'out_of_range' };
  if (challenger.combatUntil > ctx.tick || opponent.combatUntil > ctx.tick)
    return { ok: false, code: 'in_combat' };
  const slice = ctx.world.slices.combat;
  const id = ctx.newId('duel');
  const sides: Record<string, Side> = { [opponent.id]: opponent.side };
  const watch = monsterDef(ctx.content, opponent.monsterId)?.mechanics?.duelWatch;
  const watchers: string[] = [];
  if (watch) {
    for (const wid of Object.keys(slice.units).sort()) {
      const w = slice.units[wid];
      const we = getEntity(ctx.world, wid);
      if (!w || !we?.alive || w === opponent || !w.monsterId) continue;
      if (!watch.watchers.includes(w.monsterId) || we.mapId !== oe.mapId) continue;
      if (Math.hypot(we.x - oe.x, we.y - oe.y) > WATCH_RADIUS) continue;
      sides[wid] = w.side;
      standAside(ctx, w);
      watchers.push(wid);
    }
  }
  opponent.side = 'enemy';
  opponent.duel = id;
  challenger.duel = id;
  // a boss fought alone faces a party of one (5.5)
  const layer = bossLayer(ctx.content, opponent);
  if (layer) {
    opponent.hpScale = partySizeHpScale(1, FULL_PARTY[layer] ?? 1);
    opponent.hp = deriveStats(ctx.world, ctx.content, opponent).maxHp;
  }
  refreshTags(ctx, opponent);
  const duel: DuelState = {
    id,
    challengerId: challenger.id,
    opponentId: opponent.id,
    opponentRef: oe.ref ?? '',
    watchers,
    sides,
    startTick: ctx.tick,
  };
  slice.duels = { ...(slice.duels ?? {}), [id]: duel };
  ctx.emit('combat.duel_started', {
    duelId: id,
    challengerId: challenger.id,
    opponentId: opponent.id,
  });
  return { ok: true, duelId: id };
}

function standAside(ctx: SystemContext, w: Unit): void {
  w.side = 'neutral';
  w.threat = {};
  w.target = null;
  w.autoAttack = false;
  w.cast = null;
  if (w.ai && w.ai.state !== 'yielded') w.ai.state = 'idle';
  forgetAttacker(ctx.world, w.id);
  haltEntity(ctx, w.id);
  refreshTags(ctx, w);
}

/** End a duel: sides back as they were, the fighters part, duel.ended. */
export function endDuel(
  ctx: SystemContext,
  duelId: string,
  winner: 'player' | 'opponent' | 'draw',
): void {
  const slice = ctx.world.slices.combat;
  const duel = slice.duels?.[duelId];
  if (!duel) return;
  const challenger = unitOf(ctx.world, duel.challengerId);
  const opponent = unitOf(ctx.world, duel.opponentId);
  if (opponent) {
    delete opponent.duel;
    if (opponent.hpScale !== undefined) {
      // back to the full party's health at the same share (a broken duel is no discount)
      const scaled = deriveStats(ctx.world, ctx.content, opponent).maxHp;
      const frac = scaled > 0 ? opponent.hp / scaled : 1;
      delete opponent.hpScale;
      const full = deriveStats(ctx.world, ctx.content, opponent).maxHp;
      opponent.hp = Math.max(1, Math.round(full * frac));
    }
    // a yielded opponent stays neutral; otherwise it goes back to its old side
    if (opponent.ai?.state !== 'yielded') opponent.side = duel.sides[opponent.id] ?? opponent.side;
    if (winner !== 'draw' || opponent.side !== 'enemy') {
      opponent.threat = {};
      opponent.target = null;
      opponent.autoAttack = false;
      opponent.cast = null;
      forgetAttacker(ctx.world, opponent.id);
    }
    refreshTags(ctx, opponent);
  }
  if (challenger) {
    delete challenger.duel;
    if (winner !== 'draw') {
      challenger.target = null;
      challenger.autoAttack = false;
      if (opponent) delete challenger.threat[opponent.id];
    }
  }
  // a decided duel is honoured: the watchers keep the peace; a broken-off one sends them back
  if (winner === 'draw') {
    for (const wid of duel.watchers) {
      const w = unitOf(ctx.world, wid);
      if (w && w.side === 'neutral' && w.ai?.state !== 'yielded') {
        w.side = duel.sides[wid] ?? w.side;
        refreshTags(ctx, w);
      }
    }
  }
  const rest = { ...(slice.duels ?? {}) };
  delete rest[duelId];
  if (Object.keys(rest).length > 0) slice.duels = rest;
  else delete slice.duels;
  ctx.emit('duel.ended', { duelId, opponentRef: duel.opponentRef, winner });
}

/** A second fighter broke in: the watchers turn on the player's side; the duel is void. */
function breakIn(ctx: SystemContext, duel: DuelState, intruder: Unit): void {
  const turned: Unit[] = [];
  for (const wid of duel.watchers) {
    const w = unitOf(ctx.world, wid);
    if (!w || !liveUnit(ctx.world, wid)) continue;
    w.side = 'enemy';
    duel.sides[wid] = 'enemy';
    refreshTags(ctx, w);
    turned.push(w);
  }
  duel.watchers = [];
  endDuel(ctx, duel.id, 'draw');
  for (const w of turned) engage(ctx, w, intruder);
}

/**
 * A blow landed from `source` on `target` (after the damage, before yielding and death).
 * Returns true when the duel took the blow over: nobody dies in a duel.
 */
export function duelHit(ctx: SystemContext, source: Unit, target: Unit): boolean {
  const slice = ctx.world.slices.combat;
  if (!slice.duels) return false;
  // a second fighter of the player's side strikes a watched opponent: the duel is void
  if (target.duel && source.duel !== target.duel && isPartySide(ctx.world, source)) {
    const duel = slice.duels[target.duel];
    const watch = monsterDef(ctx.content, target.monsterId)?.mechanics?.duelWatch;
    if (duel && duel.opponentId === target.id && watch?.breakOn === 'second_fighter') {
      breakIn(ctx, duel, source);
      return false;
    }
  }
  const id = target.duel;
  if (!id || source.duel !== id) return false;
  const duel = slice.duels[id];
  if (!duel || target.hp > 0) return false;
  target.hp = 1;
  if (target.id === duel.opponentId) {
    // an opponent that yields at a threshold yields now (maybeYield); settleDuels ends it
    if (monsterDef(ctx.content, target.monsterId)?.mechanics?.yieldAtPct !== undefined)
      return false;
    endDuel(ctx, id, 'player');
  } else endDuel(ctx, id, 'opponent');
  return true;
}

/** Settle duels whose opponent yielded or whose fighters parted or fell. */
export function settleDuels(ctx: SystemContext): void {
  const slice = ctx.world.slices.combat;
  if (!slice.duels) return;
  for (const id of Object.keys(slice.duels).sort()) {
    const duel = slice.duels?.[id];
    if (!duel) continue;
    const opp = unitOf(ctx.world, duel.opponentId);
    if (opp?.ai?.state === 'yielded') {
      endDuel(ctx, id, 'player');
      continue;
    }
    const op = liveUnit(ctx.world, duel.opponentId)?.[1];
    const cp = liveUnit(ctx.world, duel.challengerId)?.[1];
    if (!op || !cp || op.mapId !== cp.mapId) {
      endDuel(ctx, id, 'draw');
      continue;
    }
    if (Math.hypot(op.x - cp.x, op.y - cp.y) > DUEL_BREAK_DISTANCE) endDuel(ctx, id, 'draw');
  }
}
