// Battlefield window model: the grid-to-canvas transform, formation footprints, picking
// (front-most unit under a point), selection rules, the orders and casts a click builds,
// colours, morale bars and the text lines of the side panel. Pure; Node-tested. The DOM
// painter in battle_window.ts only draws what this module decides.

import type { AnyWorldEvent, EventMap } from '../../core/contracts';
import { t as renderText, type TextParam } from '../../shared_ui/i18n';
import { fmt, T } from '../../shared_ui/text';
import type {
  BattleTerrain,
  BattleView,
  Formation,
  HeroView,
  RegimentView,
  Team,
  UnitOrder,
  Victor,
} from '../../systems/warfare';
import { ROUT_BELOW } from '../../systems/warfare/morale';
import { terrainAtTile } from '../../systems/warfare/terrain';
import type { WarOrderSpec } from '../view/adapters';

// ---------------------------------------------------------------------------
// Layout: integer pixels per grid cell, fitted into a box

export interface BattleLayout {
  /** css pixels per grid cell (integer) */
  cell: number;
  cols: number;
  rows: number;
  /** canvas size in css pixels */
  width: number;
  height: number;
}

export const CELL_MIN = 4;
export const CELL_MAX = 32;

/** Largest integer cell size that fits the grid into the box (clamped to CELL_MIN..CELL_MAX). */
export function fitLayout(cols: number, rows: number, maxW: number, maxH: number): BattleLayout {
  const c = cols > 0 && rows > 0 ? Math.floor(Math.min(maxW / cols, maxH / rows)) : CELL_MIN;
  const cell = Math.max(CELL_MIN, Math.min(CELL_MAX, c));
  return { cell, cols, rows, width: cols * cell, height: rows * cell };
}

export function sameLayout(a: BattleLayout | null, b: BattleLayout): boolean {
  return !!a && a.cell === b.cell && a.cols === b.cols && a.rows === b.rows;
}

/** Grid units (cells, float) to canvas css pixels. */
export function gridToCanvas(l: BattleLayout, gx: number, gy: number): { x: number; y: number } {
  return { x: gx * l.cell, y: gy * l.cell };
}

/** Canvas css pixels to grid units (cells, float). */
export function canvasToGrid(l: BattleLayout, px: number, py: number): { x: number; y: number } {
  return { x: px / l.cell, y: py / l.cell };
}

export function inGrid(l: BattleLayout, gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < l.cols && gy < l.rows;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Colours

export const TERRAIN_COLORS: Record<BattleTerrain, string> = {
  plain: '#6f8a4e',
  road: '#a8936a',
  forest: '#3e6236',
  hill: '#8c7f55',
  ford: '#6f98a8',
  water: '#36628e',
  wall: '#5a5652',
  swamp: '#566048',
  snow: '#d6dde4',
  dian: '#5a5560',
  building: '#7a5e48',
};

export function terrainAtCell(b: BattleView, tx: number, ty: number): BattleTerrain {
  return terrainAtTile(b, tx, ty);
}

export function terrainName(t: BattleTerrain): string {
  return T.battle.terrain[t] ?? t;
}

export interface UnitColors {
  fill: string;
  edge: string;
  /** 0..1, faded for broken or routing regiments */
  alpha: number;
}

export const SIDE_COLORS = {
  player: { fill: '#5b8fe0', edge: '#cfe0ff' },
  ally: { fill: '#58aebd', edge: '#c8f0f4' },
  enemy: { fill: '#d4574a', edge: '#ffd0c8' },
  down: { fill: '#6c6870', edge: '#a8a4ac' },
} as const;

function sideOf(team: Team, controller: 'player' | 'ai'): 'player' | 'ally' | 'enemy' {
  if (team === 'enemy') return 'enemy';
  return controller === 'player' ? 'player' : 'ally';
}

export function regimentColors(r: RegimentView): UnitColors {
  const side = SIDE_COLORS[sideOf(r.team, r.controller)];
  const alpha = r.state === 'rout' ? 0.4 : r.broken ? 0.55 : 1;
  return { fill: side.fill, edge: side.edge, alpha };
}

export function heroColors(h: HeroView): UnitColors {
  if (h.down) return { ...SIDE_COLORS.down, alpha: 0.7 };
  const side = SIDE_COLORS[sideOf(h.team, h.controller)];
  return { fill: side.fill, edge: '#f2d78a', alpha: 1 };
}

/** Normalised morale: the kernel keeps 0..100; a 0..1 reading is accepted as a share. */
export function moraleShare(morale: number): number {
  const v = morale > 1 ? morale / 100 : morale;
  return Math.max(0, Math.min(1, v));
}

export function moraleBar(morale: number): { frac: number; color: string } {
  const frac = moraleShare(morale);
  const pct = frac * 100;
  const color = pct >= 60 ? '#7ed36a' : pct >= ROUT_BELOW * 2 ? '#e2c04a' : '#e0604a';
  return { frac, color };
}

export function hpBar(hp: number, maxHp: number): { frac: number; color: string } {
  const frac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  return { frac, color: frac >= 0.5 ? '#7ed36a' : frac >= 0.25 ? '#e2c04a' : '#e0604a' };
}

export const OBJECTIVE_COLORS: Record<'active' | 'done' | 'failed', string> = {
  active: '#e2b04a',
  done: '#7ed36a',
  failed: '#e0604a',
};

// ---------------------------------------------------------------------------
// Formations: soldier pips in the regiment's local frame

/** One drawn soldier pip: a across the front (cells), d along the facing (front positive). */
export interface Pip {
  a: number;
  d: number;
}

export interface FormationShape {
  pips: Pip[];
  /** pip spacing in cells */
  spacing: number;
  /** half extents of the footprint in the local frame (cells) */
  halfW: number;
  halfD: number;
}

export const MAX_PIPS = 36;

export function pipCount(count: number): number {
  return Math.max(1, Math.min(MAX_PIPS, Math.round(count)));
}

function gridPips(n: number, files: number, s: number, stagger: boolean): Pip[] {
  const out: Pip[] = [];
  const ranks = Math.ceil(n / files);
  let placed = 0;
  for (let j = 0; j < ranks; j++) {
    const inRank = Math.min(files, n - placed);
    const shift = stagger && j % 2 === 1 ? s / 2 : 0;
    for (let i = 0; i < inRank; i++) {
      out.push({ a: (i - (inRank - 1) / 2) * s + shift, d: ((ranks - 1) / 2 - j) * s });
    }
    placed += inRank;
  }
  return out;
}

function wedgePips(n: number, s: number): Pip[] {
  const rows: number[] = [];
  let left = n;
  for (let i = 1; left > 0; i++) {
    const k = Math.min(i, left);
    rows.push(k);
    left -= k;
  }
  const out: Pip[] = [];
  rows.forEach((k, j) => {
    for (let i = 0; i < k; i++) {
      out.push({ a: (i - (k - 1) / 2) * s, d: ((rows.length - 1) / 2 - j) * s });
    }
  });
  return out;
}

function ringPips(n: number, s: number): Pip[] {
  if (n === 1) return [{ a: 0, d: 0 }];
  const radius = Math.max(s, (n * s) / (2 * Math.PI));
  const out: Pip[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    out.push({ a: Math.sin(ang) * radius, d: Math.cos(ang) * radius });
  }
  return out;
}

/** Pip layout for a regiment by formation; the footprint area tracks the kernel radius. */
export function formationShape(
  formation: Formation,
  count: number,
  radius: number,
): FormationShape {
  const n = pipCount(count);
  const base = Math.max(0.16, Math.min(0.6, (1.7 * Math.max(0.3, radius)) / Math.sqrt(n)));
  let s = base;
  let pips: Pip[];
  switch (formation) {
    case 'column': {
      const files = Math.max(1, Math.round(Math.sqrt(n / 4)));
      pips = gridPips(n, files, s, false);
      break;
    }
    case 'square': {
      pips = gridPips(n, Math.max(1, Math.ceil(Math.sqrt(n))), s, false);
      break;
    }
    case 'wedge':
      pips = wedgePips(n, s);
      break;
    case 'skirmish': {
      s = base * 1.45;
      const ranks = Math.max(1, Math.round(Math.sqrt(n / 3)));
      pips = gridPips(n, Math.ceil(n / ranks), s, true);
      break;
    }
    case 'shield_wall': {
      s = base * 0.85;
      const ranks = n >= 6 ? 2 : 1;
      pips = gridPips(n, Math.ceil(n / ranks), s, false);
      break;
    }
    case 'circle':
      pips = ringPips(n, s);
      break;
    default: {
      const ranks = Math.max(1, Math.round(Math.sqrt(n / 4)));
      pips = gridPips(n, Math.ceil(n / ranks), s, false);
      break;
    }
  }
  let halfW = 0;
  let halfD = 0;
  for (const p of pips) {
    halfW = Math.max(halfW, Math.abs(p.a));
    halfD = Math.max(halfD, Math.abs(p.d));
  }
  return { pips, spacing: s, halfW: halfW + s / 2, halfD: halfD + s / 2 };
}

/** Local (across, depth) to grid units around a centre facing `facing` (radians, atan2). */
export function localToGrid(
  cx: number,
  cy: number,
  facing: number,
  a: number,
  d: number,
): { x: number; y: number } {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  return { x: cx - fy * a + fx * d, y: cy + fx * a + fy * d };
}

/** Grid units to the local (across, depth) frame of a unit. */
export function gridToLocal(cx: number, cy: number, facing: number, gx: number, gy: number): Pip {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const dx = gx - cx;
  const dy = gy - cy;
  return { a: -fy * dx + fx * dy, d: fx * dx + fy * dy };
}

// ---------------------------------------------------------------------------
// Units, draw order and picking

export type UnitRef = { kind: 'regiment'; unit: RegimentView } | { kind: 'hero'; unit: HeroView };

export function regimentOnField(r: RegimentView): boolean {
  return r.state !== 'gone' && r.count > 0;
}

export function findUnit(b: BattleView, id: string | null): UnitRef | null {
  if (!id) return null;
  const r = b.regiments.find((x) => x.id === id);
  if (r) return { kind: 'regiment', unit: r };
  const h = b.heroes.find((x) => x.id === id);
  return h ? { kind: 'hero', unit: h } : null;
}

/** Drawn regiments and heroes, back to front; the selected one is drawn last of its kind. */
export function drawOrder(
  b: BattleView,
  selectedId: string | null,
): { regiments: RegimentView[]; heroes: HeroView[] } {
  const regiments = b.regiments.filter(regimentOnField);
  const heroes = [...b.heroes];
  const lift = <U extends { id: string }>(list: U[]) => {
    const i = list.findIndex((u) => u.id === selectedId);
    if (i >= 0 && i < list.length - 1) list.push(...list.splice(i, 1));
  };
  lift(regiments);
  lift(heroes);
  return { regiments, heroes };
}

/** Pick radius of a hero marker, in cells. */
export const HERO_PICK_RADIUS = 0.6;
/** Extra margin around a regiment footprint, in cells. */
export const PICK_PAD = 0.15;

export function hitsRegiment(r: RegimentView, gx: number, gy: number, pad = PICK_PAD): boolean {
  const shape = formationShape(r.formation, r.count, r.radius);
  const p = gridToLocal(r.x, r.y, r.facing, gx, gy);
  const hw = Math.max(0.4, shape.halfW) + pad;
  const hd = Math.max(0.4, shape.halfD) + pad;
  return Math.abs(p.a) <= hw && Math.abs(p.d) <= hd;
}

export function hitsHero(h: HeroView, gx: number, gy: number): boolean {
  return Math.hypot(h.x - gx, h.y - gy) <= HERO_PICK_RADIUS;
}

/** The front-most living unit under a grid point: heroes over regiments, later over earlier. */
export function pickUnit(
  b: BattleView,
  gx: number,
  gy: number,
  selectedId: string | null = null,
): UnitRef | null {
  const order = drawOrder(b, selectedId);
  for (let i = order.heroes.length - 1; i >= 0; i--) {
    const h = order.heroes[i] as HeroView;
    if (!h.down && hitsHero(h, gx, gy)) return { kind: 'hero', unit: h };
  }
  for (let i = order.regiments.length - 1; i >= 0; i--) {
    const r = order.regiments[i] as RegimentView;
    if (hitsRegiment(r, gx, gy)) return { kind: 'regiment', unit: r };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Selection rules

/** The player may order only own-side units the player controls that are still fighting. */
export function isOrderable(u: UnitRef | null): boolean {
  if (!u) return false;
  if (u.unit.team !== 'player' || u.unit.controller !== 'player') return false;
  return u.kind === 'regiment' ? regimentOnField(u.unit) : !u.unit.down;
}

/** Why a selected unit cannot take an order right now, or null when it can. */
export function orderBlock(u: UnitRef | null): string | null {
  if (!u || !isOrderable(u)) return null;
  if (u.kind === 'regiment' && u.unit.state === 'rout') return T.battle.routing;
  return null;
}

/** Keep a selection only while it names an orderable unit. */
export function validSelection(b: BattleView, id: string | null): string | null {
  return isOrderable(findUnit(b, id)) ? id : null;
}

export function isEnemyTarget(u: UnitRef | null): boolean {
  if (u?.unit.team !== 'enemy') return false;
  return u.kind === 'regiment' ? regimentOnField(u.unit) : !u.unit.down;
}

// ---------------------------------------------------------------------------
// Orders

export function moveOrder(unitId: string, gx: number, gy: number): WarOrderSpec {
  return { unitId, kind: 'move', x: round2(gx), y: round2(gy) };
}

export function attackOrder(unitId: string, targetId: string): WarOrderSpec {
  return { unitId, kind: 'attack', targetId };
}

/** Hold where the unit stands (the kernel fills in the position). */
export function holdOrder(unitId: string): WarOrderSpec {
  return { unitId, kind: 'hold' };
}

export function retreatOrder(unitId: string): WarOrderSpec {
  return { unitId, kind: 'retreat' };
}

export function formationOrder(unitId: string, formation: Formation): WarOrderSpec {
  return { unitId, kind: 'formation', formation };
}

/** How a hero ability picks its target: none, one enemy unit, or a unit or a ground point. */
export type AbilityTargetMode = 'self' | 'unit' | 'area';

export function abilityTargetMode(kind: string): AbilityTargetMode {
  if (kind === 'charge' || kind === 'strike') return 'unit';
  if (kind === 'aoe') return 'area';
  return 'self';
}

export interface Targeting {
  heroId: string;
  abilityId: string;
  kind: string;
  name: string;
  range: number;
}

export interface CastTarget {
  targetId?: string;
  x?: number;
  y?: number;
}

export type ClickAction =
  | { kind: 'select'; id: string }
  | { kind: 'inspect'; id: string | null }
  | { kind: 'order'; order: WarOrderSpec }
  | { kind: 'cast'; heroId: string; abilityId: string; target: CastTarget }
  | { kind: 'cancel' }
  | { kind: 'none' };

/** The cast target a click names for an ability, or null when the click does not fit it. */
export function castTargetFor(
  kind: string,
  hit: UnitRef | null,
  gx: number,
  gy: number,
  l: BattleLayout,
): CastTarget | null {
  const mode = abilityTargetMode(kind);
  if (mode === 'self') return {};
  if (isEnemyTarget(hit) && hit) {
    if (kind === 'charge' && hit.kind !== 'regiment') return null;
    if (mode === 'area' && hit.kind !== 'regiment')
      return { x: round2(hit.unit.x), y: round2(hit.unit.y) };
    return { targetId: hit.unit.id };
  }
  if (mode === 'area' && inGrid(l, gx, gy)) return { x: round2(gx), y: round2(gy) };
  return null;
}

/**
 * What a click on the field does. Left: select an orderable unit, inspect any other unit,
 * or move the selection to the ground point. Right: attack the enemy under the cursor or
 * move there. While an ability awaits a target, left casts and right cancels.
 */
export function resolveClick(
  b: BattleView,
  l: BattleLayout,
  selectedId: string | null,
  button: 'left' | 'right',
  gx: number,
  gy: number,
  targeting: Targeting | null = null,
): ClickAction {
  const hit = pickUnit(b, gx, gy, selectedId);
  if (targeting) {
    if (button === 'right') return { kind: 'cancel' };
    const target = castTargetFor(targeting.kind, hit, gx, gy, l);
    if (!target) return { kind: 'none' };
    return { kind: 'cast', heroId: targeting.heroId, abilityId: targeting.abilityId, target };
  }
  const sel = findUnit(b, validSelection(b, selectedId));
  const canOrder = !!sel && !orderBlock(sel);
  if (button === 'left') {
    if (hit && isOrderable(hit)) return { kind: 'select', id: hit.unit.id };
    if (hit) return { kind: 'inspect', id: hit.unit.id };
    if (sel && canOrder && inGrid(l, gx, gy))
      return { kind: 'order', order: moveOrder(sel.unit.id, gx, gy) };
    return { kind: 'inspect', id: null };
  }
  if (!sel || !canOrder) return { kind: 'none' };
  if (hit && isEnemyTarget(hit))
    return { kind: 'order', order: attackOrder(sel.unit.id, hit.unit.id) };
  if (!inGrid(l, gx, gy)) return { kind: 'none' };
  return { kind: 'order', order: moveOrder(sel.unit.id, gx, gy) };
}

// ---------------------------------------------------------------------------
// Order lines (where each player-led unit is heading)

export interface OrderLine {
  unitId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: 'move' | 'attack' | 'hold' | 'retreat';
}

export function orderLine(
  b: BattleView,
  u: { id: string; x: number; y: number; team: Team },
  order: UnitOrder | { kind: 'move'; x: number; y: number } | null,
): OrderLine | null {
  if (!order) return null;
  const from = { x: u.x, y: u.y };
  switch (order.kind) {
    case 'move':
    case 'hold':
      if (Math.hypot(order.x - u.x, order.y - u.y) < 0.3) return null;
      return { unitId: u.id, from, to: { x: order.x, y: order.y }, kind: order.kind };
    case 'attack': {
      const t = findUnit(b, order.targetId);
      if (!t) return null;
      return { unitId: u.id, from, to: { x: t.unit.x, y: t.unit.y }, kind: 'attack' };
    }
    case 'retreat': {
      const p = b.retreat[u.team];
      return p ? { unitId: u.id, from, to: { x: p.x, y: p.y }, kind: 'retreat' } : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Text for the side panel

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return fmt(T.battle.clock, { m: Math.floor(s / 60), ss: String(s % 60).padStart(2, '0') });
}

export function timeLine(b: Pick<BattleView, 'time' | 'timeLimit'>): string {
  return fmt(T.battle.time, { time: formatClock(b.time), limit: formatClock(b.timeLimit) });
}

export function planLines(b: Pick<BattleView, 'plans'>): string[] {
  const out: string[] = [];
  for (const team of ['player', 'enemy'] as Team[]) {
    const p = b.plans[team];
    if (p) {
      out.push(
        fmt(T.battle.plan, { team: T.battle.sides[team] ?? team, plan: renderText(p.name) }),
      );
    }
  }
  return out;
}

export interface ObjectiveSummary {
  id: string;
  team: Team;
  status: 'active' | 'done' | 'failed';
  text: string;
  /** 0..1 for timed objectives, null otherwise */
  frac: number | null;
}

export function objectiveSummaries(b: Pick<BattleView, 'objectives'>): ObjectiveSummary[] {
  return b.objectives.map((o) => {
    const head = fmt(T.battle.objectiveLine, {
      team: T.battle.objectiveTeams[o.team] ?? o.team,
      label: renderText(o.label),
    });
    const timed = (o.kind === 'hold' || o.kind === 'survive') && (o.seconds ?? 0) > 0;
    const seconds = o.seconds ?? 0;
    const progress = Math.min(seconds, Math.floor(o.progress));
    const parts = [head];
    if (timed) parts.push(fmt(T.battle.objectiveProgress, { progress, seconds }));
    parts.push(T.battle.objectiveStatus[o.status] ?? o.status);
    return {
      id: o.id,
      team: o.team,
      status: o.status,
      text: parts.join('，'),
      frac: timed ? Math.max(0, Math.min(1, o.progress / seconds)) : null,
    };
  });
}

export function victorText(victor: Victor): string {
  return T.battle.victors[victor] ?? victor;
}

export function outcomeText(outcome: { victor: Victor; reason: TextParam } | null): string {
  if (!outcome) return '';
  return fmt(T.battle.outcome, {
    result: victorText(outcome.victor),
    reason: renderText(outcome.reason),
  });
}

export function logLines(b: Pick<BattleView, 'log'>, n = 5): string[] {
  return b.log
    .slice(-n)
    .map((e) => fmt(T.battle.logLine, { time: formatClock(e.t), text: renderText(e.text) }));
}

export type BattleReport = EventMap['war.battle_report'];

/** The most recent battle report among the recent world events. */
export function lastReport(events: readonly AnyWorldEvent[]): BattleReport | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.kind === 'war.battle_report') return e.data as BattleReport;
  }
  return null;
}

export function reportLines(r: BattleReport): string[] {
  return [
    fmt(T.battle.lastResult, { result: victorText(r.victor), reason: renderText(r.reason) }),
    fmt(T.battle.casualties, { player: r.casualties.player, enemy: r.casualties.enemy }),
  ];
}

export function scaleText(scale: string): string {
  return fmt(T.battle.scale, { scale: T.battle.scales[scale] ?? scale });
}

export function formationName(f: string): string {
  return T.battle.formations[f] ?? f;
}

export function formationOptions(r: RegimentView): { value: Formation; label: string }[] {
  return r.formations.map((f) => ({ value: f, label: formationName(f) }));
}

function orderText(
  b: BattleView,
  order: UnitOrder | { kind: 'move'; x: number; y: number } | null,
): string {
  if (!order) return T.battle.orders.none;
  switch (order.kind) {
    case 'move':
      return fmt(T.battle.orders.move, { x: Math.round(order.x), y: Math.round(order.y) });
    case 'attack': {
      const t = findUnit(b, order.targetId);
      return fmt(T.battle.orders.attack, {
        target: t ? renderText(t.unit.name) : T.battle.unknownTarget,
      });
    }
    case 'hold':
      return T.battle.orders.hold;
    case 'retreat':
      return T.battle.orders.retreat;
  }
  return T.battle.orders.none;
}

/** Detail lines for the selected or inspected unit. */
export function unitDetail(b: BattleView, u: UnitRef): string[] {
  const lines: string[] = [];
  if (u.kind === 'regiment') {
    const r = u.unit;
    lines.push(
      fmt(T.battle.regimentTitle, { name: renderText(r.name), type: renderText(r.typeName) }),
    );
    lines.push(
      fmt(T.battle.regimentStats, {
        count: r.count,
        max: r.maxCount,
        morale: Math.round(moraleShare(r.morale) * 100),
        fatigue: Math.round(r.fatigue),
      }),
    );
    lines.push(
      fmt(T.battle.regimentState, {
        state: T.battle.states[r.state] ?? r.state,
        formation: formationName(r.formation),
        order: orderText(b, r.order),
      }),
    );
    if (r.broken) lines.push(T.battle.brokenNote);
    if (r.general) {
      const g = b.heroes.find((h) => h.id === r.general);
      lines.push(fmt(T.battle.generalNote, { name: g ? g.name : r.general }));
    }
  } else {
    const h = u.unit;
    lines.push(fmt(T.battle.heroTitle, { name: h.name }));
    lines.push(h.down ? T.battle.heroDown : fmt(T.battle.heroStats, { hp: h.hp, max: h.maxHp }));
  }
  if (u.unit.team === 'enemy') lines.push(T.battle.enemyUnit);
  else if (u.unit.controller !== 'player') lines.push(T.battle.allied);
  const block = orderBlock(u);
  if (block) lines.push(block);
  return lines;
}

/** One-line summary for the hover strip. */
export function unitSummary(u: UnitRef): string {
  if (u.kind === 'regiment') {
    const r = u.unit;
    return `${fmt(T.battle.regimentTitle, { name: renderText(r.name), type: renderText(r.typeName) })} ${fmt(
      T.battle.regimentStats,
      {
        count: r.count,
        max: r.maxCount,
        morale: Math.round(moraleShare(r.morale) * 100),
        fatigue: Math.round(r.fatigue),
      },
    )}`;
  }
  const h = u.unit;
  return `${fmt(T.battle.heroTitle, { name: h.name })} ${
    h.down ? T.battle.heroDown : fmt(T.battle.heroStats, { hp: h.hp, max: h.maxHp })
  }`;
}

export interface AbilityButton {
  id: string;
  kind: string;
  name: string;
  label: string;
  title: string;
  disabled: boolean;
  range: number;
}

export function abilityButtons(h: HeroView): AbilityButton[] {
  return h.abilities.map((a) => ({
    id: a.id,
    kind: a.kind,
    name: a.name,
    label: a.ready
      ? fmt(T.battle.abilityReady, { name: a.name })
      : fmt(T.battle.abilityCooldown, { name: a.name, sec: Math.ceil(a.readyIn) }),
    title: T.battle.abilityKinds[a.kind] ?? a.name,
    disabled: h.down || !a.ready,
    range: a.range,
  }));
}

// ---------------------------------------------------------------------------
// Motion smoothing between kernel steps (5 Hz steps drawn at the frame rate)

export type PosMap = Map<string, { x: number; y: number }>;

export function positionsOf(b: BattleView): PosMap {
  const m: PosMap = new Map();
  for (const r of b.regiments) m.set(r.id, { x: r.x, y: r.y });
  for (const h of b.heroes) m.set(h.id, { x: h.x, y: h.y });
  return m;
}

/** Jumps longer than this many cells (charges, rallies) are not smoothed. */
export const SNAP_DISTANCE = 3;

export function lerpPos(
  prev: PosMap | null,
  id: string,
  x: number,
  y: number,
  alpha: number,
): { x: number; y: number } {
  const p = prev?.get(id);
  if (!p || alpha >= 1) return { x, y };
  if (Math.hypot(x - p.x, y - p.y) > SNAP_DISTANCE) return { x, y };
  const t = Math.max(0, alpha);
  return { x: p.x + (x - p.x) * t, y: p.y + (y - p.y) * t };
}

export function stepAlpha(nowMs: number, snapAt: number, stepMs: number): number {
  if (stepMs <= 0) return 1;
  return Math.max(0, Math.min(1, (nowMs - snapAt) / stepMs));
}
