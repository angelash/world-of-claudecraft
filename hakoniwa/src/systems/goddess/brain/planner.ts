// The dawn planner of the goddess brain (builtin_ai.md 8.3; catalog_goddess_interventions.md
// 5.0): every "action on a map" of her menu for the act is gated (G), scored (./score.ts),
// and the best ones above the do-nothing baseline are taken greedily, at most maxPerDay a day
// and each action once, re-scoring the rest after each pick with the power it cost. Her
// scheme's next step (+4) and an open scripted act (+5) lift their action; the act budget
// (./budget.ts: hard, with a soft penalty for spending ahead of the act) and the end reserve
// (hard) hold her spending back; an act that lands an open scripted act stands outside them.
// Only her own projection is read:
// her lands and faith, the believers she can see there, a real danger, a market, where the
// player stands (for her interest), her token in the player's hands.

import type { ScoredTerm } from '../../../core/brain/utility';
import type { SystemContext } from '../../../core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../../core/time';
import { npcPackId } from '../../dialogue/lines/packs';
import { actIndex } from '../../quests/conditions';
import { entitiesOnMap, playerEntity } from '../../world';
import {
  actionDef,
  currentAct,
  type GoddessActCommand,
  type GoddessActParams,
  priceCost,
  validateAct,
} from '../actions';
import type { DivineActionDef, GoddessDef, GoddessState } from '../types';
import { budgetView, withinBudget } from './budget';
import { believersOn, dangerOn, gateHolds, marketOn } from './gates';
import {
  brainConfig,
  dawnMenu,
  type GoddessPersona,
  interestIn,
  kpiValue,
  personaAffinity,
  personaMultiplier,
  personaOf,
  trait,
  weightOf,
} from './persona';
import { nextSteps, stepMap, stepTarget } from './schemes';
import { overspent, scoreAction } from './score';
import { brainOf } from './state';

const SRC = { type: 'system', system: 'goddess' } as const;

export interface PlannedAct {
  cmd: GoddessActCommand;
  score: number;
  terms: ScoredTerm[];
}

/** The KPI scale of an action on a map (builtin_ai 8.3 estimate table). */
function scaleOn(
  ctx: SystemContext,
  def: GoddessDef,
  s: GoddessState,
  a: DivineActionDef,
  mapId: string,
  playerMap: string,
): number {
  switch (a.scale ?? 'faith') {
    case 'one':
      return 1;
    case 'faith':
      return s.faith[mapId] ?? 0;
    case 'believers':
      return Math.min(1, believersOn(ctx, def, mapId) / 4);
    case 'danger':
      return dangerOn(ctx, def, mapId) ? 1 : 0;
    case 'market':
      return marketOn(ctx.content, mapId) ? 1 : 0.3;
    case 'player':
      return mapId === playerMap ? 1 : 0.2;
  }
}

/** Candidate maps of an action (at most config.candidateMaps): her lands, or the player's map. */
function candidateMaps(
  ctx: SystemContext,
  def: GoddessDef,
  s: GoddessState,
  a: DivineActionDef,
  playerMap: string,
  limit: number,
): string[] {
  if (def.reach === 'player' || a.needs?.includes('player') || a.needs?.includes('token'))
    return playerMap ? [playerMap] : [];
  return Object.keys(s.faith)
    .filter((m) => (s.faith[m] ?? 0) >= 0.05 && ctx.content.maps.some((x) => x.id === m))
    .sort((x, y) => (s.faith[y] ?? 0) - (s.faith[x] ?? 0) || (x < y ? -1 : x > y ? 1 : 0))
    .slice(0, limit);
}

/** A believer entity on a map to receive an oracle or a dream (stable: smallest id). */
function believerOn(ctx: SystemContext, def: GoddessDef, mapId: string): string | undefined {
  return entitiesOnMap(ctx.world, mapId)
    .filter(
      (e) =>
        e.alive &&
        !e.hidden &&
        e.kind !== 'player' &&
        e.tags.some((t) => def.faithTags.includes(t)),
    )
    .map((e) => e.id)
    .sort()[0];
}

/** Whether her own pack ln_<goddess> has this slot (base or any act override). */
function hasPackSlot(ctx: SystemContext, goddess: string, slot: string): boolean {
  const pack = (ctx.content.linePacks ?? []).find((p) => p.id === npcPackId(goddess));
  if (!pack) return false;
  return slot in pack.slots || Object.values(pack.acts ?? {}).some((act) => slot in act);
}

/** The written text of an action for her (the oracle, dream, omen and request lines). */
function writtenText(ctx: SystemContext, a: DivineActionDef, goddess: string): string | undefined {
  const lines = a.lines?.[goddess];
  if (!lines || lines.length === 0) return undefined;
  return ctx.rng('goddess.plan').pick(lines);
}

/** Command params of an action on a map; null when a required text or target is missing. */
export function actParams(
  ctx: SystemContext,
  def: GoddessDef,
  a: DivineActionDef,
  mapId: string,
  extra: GoddessActParams = {},
): GoddessActParams | null {
  const params: GoddessActParams = { mapId, ...extra };
  if (a.id === 'oracle' || a.id === 'dream' || a.id === 'omen') {
    // her words come from her own pack (catalog 1.1; PK-M1-34): name the slot, the executor
    // draws the line when the act runs; a goddess with no pack keeps the written lines
    const slot = a.slots?.[def.id];
    if (params.text === undefined && slot && hasPackSlot(ctx, def.id, slot)) params.slot = slot;
    else {
      const text = params.text ?? writtenText(ctx, a, def.id);
      if (!text) return null;
      params.text = text;
    }
    if (a.id === 'oracle' && !params.targetId) {
      const t = believerOn(ctx, def, mapId);
      if (t) params.targetId = t;
    }
    if (a.id === 'dream' && !params.targetId && def.reach !== 'player') {
      const t = believerOn(ctx, def, mapId);
      if (!t) return null;
      params.targetId = t;
    }
  } else if (a.id === 'request') {
    const raw = params.text ? `${params.key ?? ''}|${params.text}` : writtenText(ctx, a, def.id);
    if (!raw) return null;
    const [key, text] = raw.split('|');
    params.key = key;
    params.text = text ?? key;
  } else if (a.id === 'price' && params.factor === undefined) {
    params.factor = ctx.rng('goddess.plan').chance(0.5) ? 1.15 : 0.9;
    params.goods ??= '*';
  }
  return params;
}

/** Uses of each of her actions in the last seven game days (the repetition cost). */
function recentUses(ctx: SystemContext, goddess: string): Record<string, number> {
  const out: Record<string, number> = {};
  const since = ctx.tick - 7 * TICKS_PER_GAME_DAY;
  const ledger = ctx.world.slices.goddess.ledger;
  for (let i = ledger.length - 1; i >= 0; i--) {
    const e = ledger[i];
    if (!e || e.tick < since) break;
    if (e.goddess === goddess) out[e.action] = (out[e.action] ?? 0) + 1;
  }
  return out;
}

/** Open scripted acts of hers naming an action (and maybe a map and a person): the +5 term. */
export type OpenBeat = { action: string; mapId?: string; targetId?: string };

/**
 * Her plan for today: up to config.maxPerDay commands, best first. `beats` are her open
 * scripted acts (catalog 5.0 "+5"); `spentSoFar` is power already committed today.
 */
export function planDay(
  ctx: SystemContext,
  def: GoddessDef,
  s: GoddessState,
  beats: readonly OpenBeat[] = [],
): PlannedAct[] {
  const cfg = brainConfig(ctx.content);
  const p: GoddessPersona | undefined = personaOf(ctx.content, def.id);
  const act = currentAct(ctx);
  const actNo = actIndex(act);
  const brain = brainOf(ctx.world.slices.goddess, def.id);
  const player = playerEntity(ctx.world);
  const playerMap = player?.mapId ?? '';
  const uses = recentUses(ctx, def.id);
  const steps = nextSteps(ctx, def.id);
  const noticeSince = ctx.tick - cfg.noticeHours * TICKS_PER_GAME_HOUR;
  const notices = brain.notices.filter((n) => n.tick >= noticeSince);
  const hostileUsed = s.hostility[act] ?? 0;
  const hostileCap = ctx.world.slices.goddess.hostilityBudget;
  const view = budgetView(ctx, def.id, act);
  const rng = ctx.rng(`goddess.brain.${def.id}`);

  interface Cand {
    a: DivineActionDef;
    cmd: GoddessActCommand;
    base: Omit<Parameters<typeof scoreAction>[0], 'power' | 'overspent'>;
    cost: number;
    exempt: boolean;
  }
  const cands: Cand[] = [];
  for (const id of dawnMenu(def, p, act)) {
    const a = actionDef(ctx.content, id);
    if (!a) continue;
    // her lands, plus the maps her schemes and open scripted acts name for this action
    const maps = candidateMaps(ctx, def, s, a, playerMap, cfg.candidateMaps);
    for (const x of steps)
      if (x.step.action === a.id) {
        const m = stepMap(ctx, x.run, x.step);
        if (m && !maps.includes(m)) maps.push(m);
      }
    for (const b of beats)
      if (b.action === a.id && b.mapId && !maps.includes(b.mapId)) maps.push(b.mapId);
    for (const mapId of maps) {
      if (!(a.needs ?? []).every((n) => gateHolds(ctx, def, n, mapId))) continue;
      const step = steps.find(
        (x) => x.step.action === a.id && (!x.step.map || stepMap(ctx, x.run, x.step) === mapId),
      );
      const extra: GoddessActParams = {};
      if (step) {
        for (const [k, v] of Object.entries(step.step.params ?? {}))
          (extra as Record<string, unknown>)[k] = v;
        const target = stepTarget(step.run, step.step);
        if (target) extra.targetId = target;
      }
      // an open scripted act aimed at a person offers her that person here
      const aimed = beats.find(
        (b) => b.action === a.id && b.targetId && (!b.mapId || b.mapId === mapId),
      );
      if (aimed?.targetId && !extra.targetId) extra.targetId = aimed.targetId;
      const params = actParams(ctx, def, a, mapId, extra);
      if (!params) continue;
      const cmd: GoddessActCommand = {
        goddessId: def.id,
        action: a.id,
        revision: s.revision,
        params,
        origin: step ? 'scheme' : 'plan',
        ...(step ? { scheme: step.run.scheme } : {}),
      };
      if (validateAct(ctx, cmd, SRC)) continue;
      const beat = beats.some(
        (b) =>
          b.action === a.id &&
          (!b.mapId || b.mapId === mapId) &&
          (!b.targetId || b.targetId === params.targetId),
      );
      const tags = [...(a.tags ?? [])];
      cands.push({
        a,
        cmd,
        cost: priceCost(a, false, params, marketOn(ctx.content, mapId)),
        exempt: beat,
        base: {
          weight: weightOf(def, p, a.id, cfg),
          gate: 1,
          mult: personaMultiplier(p, tags),
          kpi: kpiValue(p, a) * scaleOn(ctx, def, s, a, mapId, playerMap),
          affinity: personaAffinity(p, a, cfg),
          scheme: !!step,
          beat,
          notice: notices.some((n) => n.mapId === mapId),
          interest: interestIn(p, actNo),
          playerRel: a.playerRel ?? 0,
          onPlayerMap: mapId === playerMap,
          cost: 0,
          sedimentRate: a.sedimentRate,
          denial: trait(p, 'denial'),
          visibility: a.visibility === 'public' ? 1 : 0.3,
          stealth: trait(p, 'stealth'),
          caution: trait(p, 'caution'),
          uses7d: uses[a.id] ?? 0,
          hostile: !!a.hostile,
          hostileLeft: hostileCap > 0 ? Math.max(0, 1 - hostileUsed / hostileCap) : 0,
          jitter: rng.range(0, 0.5),
        },
      });
    }
  }

  const picked: PlannedAct[] = [];
  let power = s.power;
  let spent = view.spent;
  const usedActions = new Set<string>();
  while (picked.length < cfg.maxPerDay) {
    let best: { c: Cand; total: number; terms: ScoredTerm[] } | null = null;
    for (const c of cands) {
      if (usedActions.has(c.a.id) || power < c.cost) continue;
      // the act's budget and the end reserve: past them only written acts are left (8.4)
      if (!c.exempt && !withinBudget(view, def, power, c.cost, spent)) continue;
      const r = scoreAction(
        {
          ...c.base,
          cost: c.cost,
          power,
          overspent:
            !c.exempt && !!view.row && overspent(spent + c.cost, view.row.budget, view.elapsed),
        },
        cfg,
      );
      if (r.total < cfg.baseline) continue;
      if (
        !best ||
        r.total > best.total ||
        (r.total === best.total &&
          c.cmd.action + (c.cmd.params?.mapId ?? '') <
            best.c.cmd.action + (best.c.cmd.params?.mapId ?? ''))
      )
        best = { c, total: r.total, terms: r.terms };
    }
    if (!best) break;
    picked.push({ cmd: best.c.cmd, score: best.total, terms: best.terms });
    usedActions.add(best.c.a.id);
    power -= best.c.cost;
    if (!best.c.exempt) spent += best.c.cost;
  }
  return picked;
}
