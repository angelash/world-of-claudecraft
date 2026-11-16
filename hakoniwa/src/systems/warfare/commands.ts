// Warfare command handlers: start, order, hero ability, withdraw, auto-resolve and the
// general.order plan proposals. Every handler returns ok() or a readable rejection.

import { type CommandResult, ok, reject } from '../../core';
import type { CommandMap, CommandSource } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
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
  if (warfare(ctx).battle) return reject('battle_active', tr('sys.warfare.reject.battle_active'));
  if (!scenarioId) return reject('no_scenario', tr('sys.warfare.reject.no_scenario.unnamed'));
  if (ctx.flag('war.pending') !== scenarioId)
    return reject('not_pending', tr('sys.warfare.reject.not_pending'));
  if (!resolveSetup(ctx, scenarioId))
    return reject('no_scenario', tr('sys.warfare.reject.no_scenario.missing'));
  return null;
}

export function startBattle(ctx: SystemContext, d: CommandMap['war.start']): CommandResult {
  const bad = checkPending(ctx, d.scenarioId);
  if (bad) return bad;
  const setup = resolveSetup(ctx, d.scenarioId);
  if (!setup) return reject('no_scenario', tr('sys.warfare.reject.no_scenario.missing'));
  beginBattle(ctx, d.scenarioId, setup, 'manual');
  return ok(tr('sys.warfare.info.started', { name: setup.name }));
}

export function orderUnit(ctx: SystemContext, d: CommandMap['war.order']): CommandResult {
  const b = warfare(ctx).battle;
  if (!b) return reject('no_battle', tr('sys.warfare.reject.no_battle'));
  const data = dataOf(ctx);
  const point = () => {
    if (d.x === undefined || d.y === undefined) return null;
    if (d.x < 0 || d.y < 0 || d.x >= b.width || d.y >= b.height) return null;
    return nearestPassable(b, d.x, d.y);
  };
  const r = regimentById(b, d.unitId);
  if (r) {
    if (r.team !== 'player' || r.controller !== 'player')
      return reject('not_yours', tr('sys.warfare.reject.not_yours.regiment'));
    if (!onField(r)) return reject('gone', tr('sys.warfare.reject.gone'));
    if (r.state === 'rout') return reject('routing', tr('sys.warfare.reject.routing'));
    switch (d.kind) {
      case 'move':
      case 'hold': {
        const p = point() ?? (d.kind === 'hold' ? { x: r.x, y: r.y } : null);
        if (!p) return reject('bad_target', tr('sys.warfare.reject.bad_target.point'));
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
          return reject('bad_target', tr('sys.warfare.reject.bad_target.enemy'));
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
          return reject('bad_formation', tr('sys.warfare.reject.bad_formation', { unit: u.name }));
        r.formation = d.formation;
        return ok();
      }
    }
    return reject('bad_order', tr('sys.warfare.reject.bad_order.unknown'));
  }
  const h = heroById(b, d.unitId);
  if (!h) return reject('no_unit', tr('sys.warfare.reject.no_unit'));
  if (h.team !== 'player' || h.controller !== 'player')
    return reject('not_yours', tr('sys.warfare.reject.not_yours.hero'));
  if (h.down) return reject('down', tr('sys.warfare.reject.down'));
  if (d.kind === 'move') {
    const p = point();
    if (!p) return reject('bad_target', tr('sys.warfare.reject.bad_target.point'));
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
    if (!pos) return reject('bad_target', tr('sys.warfare.reject.bad_target.enemy'));
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
  return reject('bad_order', tr('sys.warfare.reject.bad_order.hero'));
}

export function heroAbility(ctx: SystemContext, d: CommandMap['war.hero_ability']): CommandResult {
  const b = warfare(ctx).battle;
  if (!b) return reject('no_battle', tr('sys.warfare.reject.no_battle'));
  const h = heroById(b, d.heroId);
  if (!h) return reject('no_hero', tr('sys.warfare.reject.no_hero'));
  if (h.team !== 'player' || h.controller !== 'player')
    return reject('not_yours', tr('sys.warfare.reject.not_yours.hero'));
  const res = castAbility(b, dataOf(ctx), h, d.abilityId, { targetId: d.targetId, x: d.x, y: d.y });
  if (!res.ok) return reject('cannot_cast', res.reason ?? tr('sys.warfare.reject.cannot_cast'));
  emitFlashes(ctx, b);
  return ok(res.felled > 0 ? tr('sys.warfare.info.felled', { n: res.felled }) : undefined);
}

export function withdraw(ctx: SystemContext): CommandResult {
  const b = warfare(ctx).battle;
  if (!b) return reject('no_battle', tr('sys.warfare.reject.no_battle'));
  b.outcome = { victor: 'enemy', reason: tr('sys.warfare.outcome.withdrew') };
  finishBattle(ctx);
  return ok(tr('sys.warfare.info.withdraw'));
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
    if (!setup) return reject('no_scenario', tr('sys.warfare.reject.no_scenario.missing'));
    b = beginBattle(ctx, id, setup, 'auto');
  }
  b.mode = 'auto';
  runToEnd(b, dataOf(ctx));
  const rec = finishBattle(ctx);
  return ok(rec ? tr('sys.warfare.info.auto_resolved', { reason: rec.reason }) : undefined);
}

export function generalPlan(
  ctx: SystemContext,
  d: CommandMap['war.general_plan'],
  source: CommandSource,
): CommandResult {
  const b = warfare(ctx).battle;
  if (!b || b.id !== d.battleId) return reject('stale', tr('sys.warfare.reject.stale.ended'));
  if (d.revision !== b.revision) return reject('stale', tr('sys.warfare.reject.stale.revision'));
  if (!PLANS.has(d.planId)) return reject('bad_plan', tr('sys.warfare.reject.bad_plan'));
  const general = b.generals[d.team];
  if (!general || general.id !== d.generalId)
    return reject('not_general', tr('sys.warfare.reject.not_general'));
  setPlan(b, d.team, d.planId, source.type === 'ai' ? 'ai' : 'rule');
  return ok();
}
