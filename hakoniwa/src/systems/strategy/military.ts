// Armies on the continent (grand_strategy_slg.md 5): daily marches, field battles via the
// shared warfare kernel (auto-resolve, or a manual battle for the player through
// `war.pending`), sieges and capture with aggressive expansion, garrison recovery.

import { contentText } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { autoResolve, buildFieldSetup } from '../warfare/autoresolve';
import { registerCustomBattle } from '../warfare/ports';
import type { AutoResolveResult, BattleTerrain, ForceSpec, Team } from '../warfare/types';
import { canEnter, linkDays, marchFactor, neighbors, provinceDef } from './map';
import {
  allies,
  armiesOf,
  armyPower,
  atWar,
  log,
  nationName,
  newId,
  PLAYER,
  soldiersOf,
  strat,
  warBetween,
} from './state';
import type { ArmyState, NationId, ProvinceTerrain, Regiment, StrategySlice } from './types';

const FIELD_TERRAIN: Record<ProvinceTerrain, BattleTerrain> = {
  plain: 'plain',
  forest: 'forest',
  hills: 'hill',
  mountain: 'hill',
  swamp: 'swamp',
  steppe: 'plain',
  waste: 'dian',
  coast: 'plain',
};

export function pruneArmy(s: StrategySlice, a: ArmyState): void {
  a.regiments = a.regiments.filter((r) => r.count > 0);
  if (a.regiments.length === 0) delete s.armies[a.id];
}

/** Advance every non-frozen army one day along its path. */
export function marchArmies(ctx: SystemContext): void {
  const s = strat(ctx);
  for (const id of Object.keys(s.armies).sort()) {
    const a = s.armies[id];
    if (!a || a.frozen || a.path.length === 0) continue;
    const next = a.path[0] as string;
    if (!canEnter(ctx.content, s, a.owner, next)) {
      a.path = [];
      a.progress = 0;
      continue;
    }
    a.progress += marchFactor(ctx.tick, provinceDef(ctx.content, a.province));
    const need = linkDays(ctx.content, a.province, next);
    if (a.progress >= need) {
      a.progress = 0;
      a.province = next;
      a.path.shift();
    }
  }
}

function mergeForce(armies: ArmyState[], prefix: 'p' | 'e', scale: number): ForceSpec {
  const byType = new Map<string, number>();
  for (const a of armies)
    for (const r of a.regiments) byType.set(r.typeId, (byType.get(r.typeId) ?? 0) + r.count);
  return {
    regiments: [...byType.entries()]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([typeId, count]) => ({
        typeId,
        count: Math.max(1, Math.round(count / scale)),
        id: `${prefix}_${typeId}`,
      })),
  };
}

function scaleFor(ctx: SystemContext, sides: ArmyState[][]): number {
  const cap = ctx.content.slg_config?.maxKernelRegiment ?? 300;
  let max = 1;
  for (const side of sides) {
    const byType = new Map<string, number>();
    for (const a of side)
      for (const r of a.regiments) byType.set(r.typeId, (byType.get(r.typeId) ?? 0) + r.count);
    for (const v of byType.values()) max = Math.max(max, v);
  }
  return Math.max(1, Math.ceil(max / cap));
}

/** Apply per-type survival ratios from a kernel result to the real armies. */
function applyLosses(armies: ArmyState[], ratios: Map<string, number>): number {
  let lost = 0;
  for (const a of armies) {
    for (const r of a.regiments) {
      const ratio = ratios.get(r.typeId) ?? 1;
      const keep = Math.round(r.count * ratio);
      lost += r.count - keep;
      r.count = keep;
    }
  }
  return lost;
}

function ratiosOf(
  regs: { id: string; typeId: string; start: number; end: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of regs) m.set(r.typeId, r.start > 0 ? r.end / r.start : 1);
  return m;
}

function retreatTarget(
  ctx: SystemContext,
  s: StrategySlice,
  a: ArmyState,
  enemies: NationId[],
): string | null {
  for (const q of neighbors(ctx.content, a.province)) {
    const ctrl = s.provinces[q]?.controller ?? null;
    if (ctrl !== a.owner && !(ctrl && allies(s, a.owner).includes(ctrl))) continue;
    const hostile = Object.values(s.armies).some(
      (x) => x.province === q && enemies.includes(x.owner),
    );
    if (!hostile) return q;
  }
  return null;
}

function settleBattle(
  ctx: SystemContext,
  province: string,
  sideA: ArmyState[],
  sideB: ArmyState[],
  result: { victor: Team | 'draw'; teams: AutoResolveResult['teams'] },
  manual: boolean,
): void {
  const s = strat(ctx);
  const ownerA = sideA[0]?.owner as NationId;
  const ownerB = sideB[0]?.owner as NationId;
  const lostA = applyLosses(sideA, ratiosOf(result.teams.player.regiments));
  const lostB = applyLosses(sideB, ratiosOf(result.teams.enemy.regiments));
  const victor: NationId | 'draw' =
    result.victor === 'player' ? ownerA : result.victor === 'enemy' ? ownerB : 'draw';
  const war = warBetween(s, ownerA, ownerB);
  if (war && victor !== 'draw') {
    const attackerWon = war.attackers.includes(victor);
    war.score = Math.max(-100, Math.min(100, war.score + (attackerWon ? 10 : -10)));
  }
  const weary = (n: NationId, lost: number, total: number) => {
    const ns = s.nations[n];
    if (ns)
      ns.warWeariness = Math.min(
        100,
        ns.warWeariness + Math.min(20, (lost / Math.max(1, total)) * 30),
      );
  };
  weary(ownerA, lostA, lostA + sideA.reduce((t, a) => t + soldiersOf(a), 0));
  weary(ownerB, lostB, lostB + sideB.reduce((t, a) => t + soldiersOf(a), 0));
  for (const a of [...sideA, ...sideB]) {
    a.frozen = false;
    pruneArmy(s, a);
  }
  // the loser falls back or is scattered
  const losers = victor === ownerA ? sideB : victor === ownerB ? sideA : [];
  const loserEnemies = victor === 'draw' ? [] : [victor];
  for (const a of losers) {
    if (!s.armies[a.id]) continue;
    const back = retreatTarget(ctx, s, a, loserEnemies);
    if (back) {
      a.province = back;
      a.path = [];
      a.progress = 0;
    } else {
      delete s.armies[a.id];
      log(
        s,
        tr('sys.strategy.log.army_routed', {
          army: a.name,
          province: contentText('slg_provinces', provinceDef(ctx.content, province), province),
        }),
      );
    }
  }
  log(
    s,
    tr('sys.strategy.log.battle', {
      province: contentText('slg_provinces', provinceDef(ctx.content, province), province),
      outcome:
        victor === 'draw'
          ? tr('sys.strategy.log.battle_draw')
          : tr('sys.strategy.log.battle_won', { nation: nationName(ctx.content, s, victor) }),
    }),
  );
  ctx.emit('slg.battle', {
    provinceId: province,
    attacker: ownerA,
    defender: ownerB,
    victor,
    losses: { [ownerA]: lostA, [ownerB]: lostB },
    manual,
  });
}

function fieldSetup(
  ctx: SystemContext,
  province: string,
  sideA: ArmyState[],
  sideB: ArmyState[],
  scale: number,
) {
  const def = provinceDef(ctx.content, province);
  return buildFieldSetup({
    name: tr('sys.strategy.battle.field_name', {
      province: contentText('slg_provinces', def, province),
    }),
    teams: { player: mergeForce(sideA, 'p', scale), enemy: mergeForce(sideB, 'e', scale) },
    terrain: FIELD_TERRAIN[def?.terrain ?? 'plain'],
  });
}

function runAuto(
  ctx: SystemContext,
  province: string,
  sideA: ArmyState[],
  sideB: ArmyState[],
): void {
  const scale = scaleFor(ctx, [sideA, sideB]);
  const res = autoResolve({
    setup: fieldSetup(ctx, province, sideA, sideB, scale),
    units: ctx.content.regiment_types ?? [],
    abilities: ctx.content.hero_abilities ?? [],
    seed: ctx.rng('strategy.battle').int(1, 0x7fffffff),
    maxSeconds: 900,
  });
  settleBattle(ctx, province, sideA, sideB, res, false);
}

/** Find hostile armies sharing a province and fight; player battles may go manual. */
export function resolveBattles(ctx: SystemContext): void {
  const s = strat(ctx);
  const byProvince = new Map<string, ArmyState[]>();
  for (const id of Object.keys(s.armies).sort()) {
    const a = s.armies[id] as ArmyState;
    if (a.frozen) continue;
    const list = byProvince.get(a.province) ?? [];
    list.push(a);
    byProvince.set(a.province, list);
  }
  for (const [province, list] of [...byProvince.entries()].sort((x, y) =>
    x[0].localeCompare(y[0]),
  )) {
    const owners = [...new Set(list.map((a) => a.owner))].sort();
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const x = owners[i] as NationId;
        const y = owners[j] as NationId;
        if (!atWar(s, x, y)) continue;
        // the player's side is always team A so a manual battle puts the player on the left
        const [oa, ob] = y === PLAYER ? [y, x] : [x, y];
        const sideA = list.filter((a) => a.owner === oa && s.armies[a.id] && !a.frozen);
        const sideB = list.filter((a) => a.owner === ob && s.armies[a.id] && !a.frozen);
        if (sideA.length === 0 || sideB.length === 0) continue;
        if (
          oa === PLAYER &&
          s.battleMode === 'manual' &&
          !s.pendingBattle &&
          !ctx.world.slices.warfare?.battle &&
          !ctx.flag('war.pending')
        ) {
          const scale = scaleFor(ctx, [sideA, sideB]);
          const scenarioId = `slg_${newId(s, 'b')}`;
          registerCustomBattle(ctx, scenarioId, fieldSetup(ctx, province, sideA, sideB, scale));
          for (const a of [...sideA, ...sideB]) a.frozen = true;
          s.pendingBattle = {
            scenarioId,
            province,
            playerArmies: sideA.map((a) => a.id),
            enemyArmies: sideB.map((a) => a.id),
            scale,
            createdDay: s.day,
          };
          ctx.setFlag('war.pending', scenarioId);
          log(
            s,
            tr('sys.strategy.log.battle_pending', {
              province: contentText('slg_provinces', provinceDef(ctx.content, province), province),
            }),
          );
          continue;
        }
        runAuto(ctx, province, sideA, sideB);
      }
    }
  }
}

/** Apply a manual battle report (or auto-resolve a pending battle the player left too long). */
export function settlePending(
  ctx: SystemContext,
  report?: {
    victor: Team | 'draw';
    regiments: { id: string; typeId: string; team: Team; start: number; end: number }[];
  },
): void {
  const s = strat(ctx);
  const p = s.pendingBattle;
  if (!p) return;
  const sideA = p.playerArmies.map((id) => s.armies[id]).filter((a): a is ArmyState => !!a);
  const sideB = p.enemyArmies.map((id) => s.armies[id]).filter((a): a is ArmyState => !!a);
  s.pendingBattle = null;
  if (sideA.length === 0 || sideB.length === 0) {
    for (const a of [...sideA, ...sideB]) a.frozen = false;
    return;
  }
  if (!report) {
    if (ctx.flag('war.pending') === p.scenarioId) ctx.setFlag('war.pending', '');
    delete ctx.world.slices.warfare.custom[p.scenarioId];
    for (const a of [...sideA, ...sideB]) a.frozen = false;
    runAuto(ctx, p.province, sideA, sideB);
    return;
  }
  const teams = {
    player: { start: 0, end: 0, regiments: report.regiments.filter((r) => r.team === 'player') },
    enemy: { start: 0, end: 0, regiments: report.regiments.filter((r) => r.team === 'enemy') },
  };
  settleBattle(ctx, p.province, sideA, sideB, { victor: report.victor, teams }, true);
}

/** Sieges of enemy-held provinces by armies standing in them unopposed. */
export function runSieges(ctx: SystemContext): void {
  const s = strat(ctx);
  for (const pid of Object.keys(s.provinces).sort()) {
    const prov = s.provinces[pid];
    if (!prov) continue;
    const holder = prov.controller;
    const here = Object.values(s.armies).filter((a) => a.province === pid && !a.frozen);
    const besiegers = holder ? here.filter((a) => atWar(s, a.owner, holder)) : [];
    const defenders = holder
      ? here.filter((a) => a.owner === holder || allies(s, holder).includes(a.owner))
      : [];
    if (!holder || besiegers.length === 0 || defenders.length > 0) {
      if (prov.siege && (besiegers.length === 0 || defenders.length > 0)) prov.siege = null;
      continue;
    }
    const lead = besiegers.sort((x, y) => x.id.localeCompare(y.id))[0] as ArmyState;
    if (!prov.siege || prov.siege.by !== lead.owner)
      prov.siege = { by: lead.owner, armyId: lead.id, progress: 0 };
    const def = provinceDef(ctx.content, pid);
    const power = besiegers.reduce((t, a) => t + armyPower(ctx.content, a), 0);
    const garrisonPower = Math.max(1, prov.garrison) * 6 * (1 + (def?.fort ?? 0) * 0.5);
    const rate = Math.max(0.2, Math.min(4, power / garrisonPower));
    prov.siege.progress += rate * 8;
    prov.garrison = Math.max(0, Math.round(prov.garrison * 0.98));
    for (const a of besiegers)
      for (const r of a.regiments) r.count = Math.max(0, Math.round(r.count * 0.997));
    if (prov.siege.progress >= 100) capture(ctx, pid, lead.owner);
  }
}

export function capture(ctx: SystemContext, pid: string, to: NationId): void {
  const s = strat(ctx);
  const prov = s.provinces[pid];
  if (!prov) return;
  const from = prov.owner;
  prov.owner = to;
  prov.controller = to;
  prov.siege = null;
  prov.heldDays = 0;
  prov.garrison = 200;
  prov.devastation = Math.min(1, prov.devastation + 0.2);
  const neighbourOwners = new Set(
    neighbors(ctx.content, pid)
      .map((q) => s.provinces[q]?.owner)
      .filter(Boolean),
  );
  for (const n of Object.values(s.nations)) {
    if (n.id === to) continue;
    n.ae[to] = (n.ae[to] ?? 0) + (neighbourOwners.has(n.id) ? 15 : 8);
  }
  if (from) {
    const war = warBetween(s, to, from);
    if (war)
      war.score = Math.max(
        -100,
        Math.min(100, war.score + (war.attackers.includes(to) ? 15 : -15)),
      );
    const def = provinceDef(ctx.content, pid);
    const loser = s.nations[from];
    if (loser && def?.capitalOf === from) loser.stability = Math.max(0, loser.stability - 20);
    if (
      loser &&
      armiesOf(s, from).length === 0 &&
      Object.values(s.provinces).every((p) => p.owner !== from)
    ) {
      loser.alive = false;
    }
  }
  log(
    s,
    tr('sys.strategy.log.captured', {
      nation: nationName(ctx.content, s, to),
      province: contentText('slg_provinces', provinceDef(ctx.content, pid), pid),
    }),
  );
  ctx.emit('slg.province_captured', { provinceId: pid, from, to });
}

export function addRegiments(
  s: StrategySlice,
  owner: NationId,
  province: string,
  regs: Regiment[],
  name: TextParam,
): ArmyState {
  let army = Object.values(s.armies)
    .filter((a) => a.owner === owner && a.province === province && !a.frozen)
    .sort((x, y) => x.id.localeCompare(y.id))[0];
  if (!army) {
    army = { id: newId(s, 'army'), owner, name, province, regiments: [], path: [], progress: 0 };
    s.armies[army.id] = army;
  }
  for (const r of regs) {
    const same = army.regiments.find((x) => x.typeId === r.typeId);
    if (same) same.count += r.count;
    else army.regiments.push({ ...r });
  }
  return army;
}
