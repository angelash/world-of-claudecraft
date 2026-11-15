// Building the opening continent from content, and founding the player's nation
// (D-044: the founding gate needs territory autonomy of at least 40; the narrative owns
// the other keys, signalled here by `feature.slg`).

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { log, PLAYER, relKey, setRelation, strat } from './state';
import type { ArmyState, NationDef, NationState, StrategySlice } from './types';

function nationState(def: Omit<NationDef, 'armies'>): NationState {
  return {
    id: def.id,
    treasury: def.treasury,
    stability: def.stability,
    legitimacy: def.legitimacy,
    warWeariness: 0,
    autonomy: def.autonomy,
    divineReliance: def.divineReliance,
    credibility: 70,
    ae: {},
    taxRate: 0.1,
    revision: 1,
    lastP3Day: -1000,
    lastPolicyDay: 0,
    incomeToday: 0,
    upkeepToday: 0,
    recognizedBy: [],
    alive: true,
  };
}

function spawnArmies(s: StrategySlice, def: Pick<NationDef, 'id' | 'armies'>): void {
  for (const t of def.armies) {
    const a: ArmyState = {
      id: t.id,
      owner: def.id,
      name: t.name,
      province: t.province,
      general: t.general,
      regiments: t.regiments.map((r) => ({ ...r })),
      path: [],
      progress: 0,
    };
    s.armies[a.id] = a;
  }
}

export function createStrategySlice(content: ContentMap): StrategySlice {
  const s: StrategySlice = {
    day: 0,
    active: false,
    provinces: {},
    nations: {},
    relations: {},
    treaties: [],
    wars: [],
    truces: [],
    armies: {},
    nextId: 0,
    battleMode: 'auto',
    pendingBattle: null,
    conference: null,
    summit: null,
    releaseIndex: 0,
    playerNationName: null,
    log: [],
  };
  for (const p of content.slg_provinces ?? []) {
    s.provinces[p.id] = {
      id: p.id,
      owner: p.owner,
      controller: p.owner,
      population: p.population,
      garrison: p.garrison,
      devastation: 0,
      heldDays: 365,
      siege: null,
    };
  }
  const scale = content.slg_config?.loreScale ?? 30;
  for (const def of content.slg_nations ?? []) {
    s.nations[def.id] = nationState(def);
    spawnArmies(s, def);
    for (const [other, v] of Object.entries(def.relations))
      setRelation(s, def.id, other, v * scale);
  }
  return s;
}

/** Opening relation (lore x scale) used for daily drift. */
export function baseRelation(content: ContentMap, a: string, b: string): number {
  const scale = content.slg_config?.loreScale ?? 30;
  if (a === PLAYER) return (content.slg_config?.playerNation.relations[b] ?? 0) * scale;
  const def = content.slg_nations?.find((n) => n.id === a);
  if (b === PLAYER) return (content.slg_config?.playerNation.relations[a] ?? 0) * scale;
  return (def?.relations[b] ?? 0) * scale;
}

/** Relations drift one percent of the gap back toward the opening values each day. */
export function driftRelations(ctx: SystemContext): void {
  const s = strat(ctx);
  for (const key of Object.keys(s.relations).sort()) {
    const [a, b] = key.split('>') as [string, string];
    const base = baseRelation(ctx.content, a, b);
    const v = s.relations[key] ?? 0;
    s.relations[key] = Math.round((v + (base - v) * 0.01) * 10) / 10;
  }
}

export function foundPlayerNation(ctx: SystemContext, name?: string): string[] {
  const s = strat(ctx);
  const cfg = ctx.content.slg_config;
  if (!cfg) return [];
  const tpl = cfg.playerNation;
  const n = nationState(tpl);
  const autonomy = Number(ctx.flag('territory_autonomy') ?? tpl.autonomy);
  n.autonomy = Number.isFinite(autonomy) ? autonomy : tpl.autonomy;
  s.nations[PLAYER] = n;
  s.playerNationName = name?.trim() ? name.trim().slice(0, 24) : tpl.name;
  const taken: string[] = [];
  for (const pid of cfg.playerProvinces) {
    const p = s.provinces[pid];
    if (!p) continue;
    const from = p.owner;
    p.owner = PLAYER;
    p.controller = PLAYER;
    p.heldDays = 0;
    p.siege = null;
    taken.push(pid);
    if (from && s.nations[from]) {
      const ae = s.nations[from].ae;
      ae[PLAYER] = (ae[PLAYER] ?? 0) + 10;
    }
  }
  spawnArmies(s, { id: PLAYER, armies: tpl.armies });
  const scale = cfg.loreScale;
  for (const other of Object.keys(s.nations)) {
    if (other === PLAYER) continue;
    const v = (tpl.relations[other] ?? 0) * scale;
    if (s.relations[relKey(other, PLAYER)] === undefined) setRelation(s, other, PLAYER, v);
    setRelation(s, PLAYER, other, v);
  }
  log(s, `${s.playerNationName}立国`);
  return taken;
}
