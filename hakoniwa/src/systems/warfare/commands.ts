// Warfare command handlers: start, order, hero ability, withdraw, auto-resolve and the
// general.order plan proposals. Every handler returns ok() or a readable rejection.

import { type CommandResult, ok, reject } from '../../core';
import type { CommandMap, CommandSource } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { runToEnd } from './autoresolve';
import { regimentRadius } from './combat_math';
import { heroById, onField, regimentById, unitOf } from './data';
import { castAbility } from './heroes';
import { setPlan } from './kernel';
import { beginBattle, dataOf, emitFlashes, finishBattle, resolveSetup, warfare } from './session';
import { nearestPassable } from './terrain';
import type { PlanId } from './types';

const PLANS: ReadonlySet<string> = new Set<PlanId>([
  'advance',
  'flank',
  'breakthrough',
  'hold',
  'protect',
  'decapitate',
]);

function checkPending(ctx: SystemContext, scenarioId: string): CommandResult | null {
  if (warfare(ctx).battle) return reject('battle_active', '已有一场战斗正在进行');
  if (!scenarioId) return reject('no_scenario', '没有指定战役');
  if (ctx.flag('war.pending') !== scenarioId) return reject('not_pending', '这场战役还没有到来');
  if (!resolveSetup(ctx, scenarioId)) return reject('no_scenario', '没有这场战役的资料');
  return null;
}

export function startBattle(ctx: SystemContext, d: CommandMap['war.start']): CommandResult {
  const bad = checkPending(ctx, d.scenarioId);
  if (bad) return bad;
  const setup = resolveSetup(ctx, d.scenarioId);
  if (!setup) return reject('no_scenario', '没有这场战役的资料');
  beginBattle(ctx, d.scenarioId, setup, 'manual');
  return ok(`${setup.name}开始`);
}

export function orderUnit(ctx: SystemContext, d: CommandMap['war.order']): CommandResult {
  const b = warfare(ctx).battle;
  if (!b) return reject('no_battle', '现在没有战斗');
  const data = dataOf(ctx);
  const point = () => {
    if (d.x === undefined || d.y === undefined) return null;
    if (d.x < 0 || d.y < 0 || d.x >= b.width || d.y >= b.height) return null;
    return nearestPassable(b, d.x, d.y);
  };
  const r = regimentById(b, d.unitId);
  if (r) {
    if (r.team !== 'player' || r.controller !== 'player')
      return reject('not_yours', '这支部队不听你的号令');
    if (!onField(r)) return reject('gone', '这支部队已不在战场上');
    if (r.state === 'rout') return reject('routing', '溃退中的部队不听号令');
    switch (d.kind) {
      case 'move':
      case 'hold': {
        const p = point() ?? (d.kind === 'hold' ? { x: r.x, y: r.y } : null);
        if (!p) return reject('bad_target', '目标位置不在战场内');
        r.order = { kind: d.kind, x: p.x, y: p.y };
        r.path = [];
        return ok();
      }
      case 'attack': {
        const t = d.targetId ? regimentById(b, d.targetId) : undefined;
        const h = d.targetId ? heroById(b, d.targetId) : undefined;
        if (t && t.team !== r.team && onField(t)) {
          r.order = { kind: 'attack', targetId: t.id };
        } else if (h && h.team !== r.team && !h.down) {
          r.order = { kind: 'attack', targetId: h.id };
        } else {
          return reject('bad_target', '没有这个敌人');
        }
        r.path = [];
        return ok();
      }
      case 'retreat':
        r.order = { kind: 'retreat' };
        r.path = [];
        return ok();
      case 'formation': {
        const u = unitOf(data, r.typeId);
        if (!d.formation || !u.formations.includes(d.formation))
          return reject('bad_formation', `${u.name}不会这种阵型`);
        r.formation = d.formation;
        return ok();
      }
    }
    return reject('bad_order', '无法理解的命令');
  }
  const h = heroById(b, d.unitId);
  if (!h) return reject('no_unit', '没有这支部队');
  if (h.team !== 'player' || h.controller !== 'player')
    return reject('not_yours', '这位英雄不听你的号令');
  if (h.down) return reject('down', '英雄已经倒下');
  if (d.kind === 'move') {
    const p = point();
    if (!p) return reject('bad_target', '目标位置不在战场内');
    h.order = { kind: 'move', x: p.x, y: p.y };
    h.path = [];
    return ok();
  }
  if (d.kind === 'attack') {
    const t = d.targetId ? regimentById(b, d.targetId) : undefined;
    const th = d.targetId ? heroById(b, d.targetId) : undefined;
    const pos =
      t && onField(t)
        ? { x: t.x, y: t.y, r: regimentRadius(t.count) }
        : th && !th.down
          ? { x: th.x, y: th.y, r: 0.4 }
          : null;
    if (!pos) return reject('bad_target', '没有这个敌人');
    const ang = Math.atan2(h.y - pos.y, h.x - pos.x);
    h.order = {
      kind: 'move',
      x: pos.x + Math.cos(ang) * (pos.r + 0.7),
      y: pos.y + Math.sin(ang) * (pos.r + 0.7),
    };
    h.path = [];
    return ok();
  }
  if (d.kind === 'retreat') {
    h.order = { kind: 'move', x: b.retreat.player.x, y: b.retreat.player.y };
    h.path = [];
    return ok();
  }
  if (d.kind === 'hold') {
    h.order = null;
    h.path = [];
    return ok();
  }
  return reject('bad_order', '英雄不需要阵型');
}

export function heroAbility(ctx: SystemContext, d: CommandMap['war.hero_ability']): CommandResult {
  const b = warfare(ctx).battle;
  if (!b) return reject('no_battle', '现在没有战斗');
  const h = heroById(b, d.heroId);
  if (!h) return reject('no_hero', '没有这位英雄');
  if (h.team !== 'player' || h.controller !== 'player')
    return reject('not_yours', '这位英雄不听你的号令');
  const res = castAbility(b, dataOf(ctx), h, d.abilityId, { targetId: d.targetId, x: d.x, y: d.y });
  if (!res.ok) return reject('cannot_cast', res.reason ?? '无法施放');
  emitFlashes(ctx, b);
  return ok(res.felled > 0 ? `倒下 ${res.felled} 人` : undefined);
}

export function withdraw(ctx: SystemContext): CommandResult {
  const b = warfare(ctx).battle;
  if (!b) return reject('no_battle', '现在没有战斗');
  b.outcome = { victor: 'enemy', reason: '我军撤出战场' };
  finishBattle(ctx);
  return ok('全军撤退');
}

export function autoResolveCommand(
  ctx: SystemContext,
  d: CommandMap['war.auto_resolve'],
): CommandResult {
  const slice = warfare(ctx);
  let b = slice.battle;
  if (!b) {
    const id = d.scenarioId ?? String(ctx.flag('war.pending') ?? '');
    const bad = checkPending(ctx, id);
    if (bad) return bad;
    const setup = resolveSetup(ctx, id);
    if (!setup) return reject('no_scenario', '没有这场战役的资料');
    b = beginBattle(ctx, id, setup, 'auto');
  }
  b.mode = 'auto';
  runToEnd(b, dataOf(ctx));
  const rec = finishBattle(ctx);
  return ok(rec ? `交由将领指挥：${rec.reason}` : undefined);
}

export function generalPlan(
  ctx: SystemContext,
  d: CommandMap['war.general_plan'],
  source: CommandSource,
): CommandResult {
  const b = warfare(ctx).battle;
  if (!b || b.id !== d.battleId) return reject('stale', '那场战斗已经结束');
  if (d.revision !== b.revision) return reject('stale', '战况已变，方案过时');
  if (!PLANS.has(d.planId)) return reject('bad_plan', '作战方案不在菜单中');
  const general = b.generals[d.team];
  if (!general || general.id !== d.generalId) return reject('not_general', '这位将领不在指挥位上');
  setPlan(b, d.team, d.planId, source.type === 'ai' ? 'ai' : 'rule');
  return ok();
}
