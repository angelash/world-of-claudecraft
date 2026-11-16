// Pure logic of the continent window: fitting province coordinates (0..100) into the
// canvas, node radius, army token layout, picking, the provinces a selected army may
// march to next, siege and war markers, colours, the founding gate, and every summary
// text the side panel shows. No DOM, no clock, no randomness; Node-tested.

import type { FlagValue } from '../../core/contracts';
import { t, tOr } from '../../shared_ui/i18n';
import type {
  ContinentView,
  DiplomacyAction,
  DiplomacyRow,
  NationView,
  TreatyType,
} from '../../systems/strategy';
import { FOUNDING_AUTONOMY } from '../../systems/strategy/commands';
import { PLAYER } from '../../systems/strategy/state';
import { flagOn } from '../view/game_view';

export { PLAYER };

export type Province = ContinentView['provinces'][number];
export type Army = ContinentView['armies'][number];
export type Link = ContinentView['links'][number];
export type War = ContinentView['wars'][number];
export type SizeMode = 'population' | 'garrison';
export type Tone = 'warn' | 'ok' | 'muted';

/** Canvas colours (mirror the --hk-* variables of client.css). */
export const SG_COLORS = {
  bg: '#16131f',
  grid: 'rgba(226, 176, 74, 0.06)',
  label: '#ece4d2',
  labelMuted: '#a49a88',
  labelPlayer: '#f2d78a',
  labelStroke: 'rgba(10, 8, 16, 0.9)',
  outline: 'rgba(10, 8, 16, 0.85)',
  gold: '#e2b04a',
  select: '#f2d78a',
  hover: 'rgba(255, 255, 255, 0.55)',
  reach: '#9ee08a',
  blocked: '#ff8a78',
  war: '#ff8a78',
  dian: '#b07ae0',
  impassable: '#4a4652',
  impassableEdge: '#8a8494',
  token: '#999999',
  tokenEdge: 'rgba(10, 8, 16, 0.9)',
  tokenSelected: '#ffffff',
  path: 'rgba(236, 228, 210, 0.45)',
  pathPlayer: '#e2b04a',
} as const;

const LINK_COLORS: Record<string, string> = {
  road: '#8a7a5c',
  river: '#4f7fa8',
  sea: '#3f6d9a',
  pass: '#a08a68',
  trail: '#6d6458',
};

const LINK_DASH: Record<string, number[]> = {
  road: [],
  river: [7, 3],
  sea: [2, 4],
  pass: [5, 2, 1, 2],
  trail: [3, 3],
};

/** AE at which another power starts to join coalitions against us (ai.ts). */
export const AE_WARN = 40;
/** The system's per-order recruit ceiling (commands.ts). */
export const RECRUIT_MAX = 5000;
/** Share of a province's people that may be levied at once (commands.ts). */
export const RECRUIT_SHARE = 0.05;

// ---------------------------------------------------------------------------
// Geometry

export interface FitTransform {
  scale: number;
  ox: number;
  oy: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Uniform scale and offset that centre the points' bounding box inside the padded canvas. */
export function fitTransform(
  points: readonly Point[],
  width: number,
  height: number,
  pad: number,
): FitTransform {
  if (points.length === 0) return { scale: 1, ox: 0, oy: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const availW = Math.max(1, width - 2 * pad);
  const availH = Math.max(1, height - 2 * pad);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const sx = spanX > 0 ? availW / spanX : Number.POSITIVE_INFINITY;
  const sy = spanY > 0 ? availH / spanY : Number.POSITIVE_INFINITY;
  let scale = Math.min(sx, sy);
  if (!Number.isFinite(scale)) scale = 1;
  return {
    scale,
    ox: (width - spanX * scale) / 2 - minX * scale,
    oy: (height - spanY * scale) / 2 - minY * scale,
  };
}

export function toCanvas(t: FitTransform, x: number, y: number): Point {
  return { x: t.ox + x * t.scale, y: t.oy + y * t.scale };
}

/** Node radius in css pixels: square root of population or garrison, clamped to 5..18. */
export function nodeRadius(p: Pick<Province, 'population' | 'garrison'>, mode: SizeMode): number {
  const raw =
    mode === 'garrison'
      ? 5 + Math.sqrt(Math.max(0, p.garrison)) / 12
      : 5 + Math.sqrt(Math.max(0, p.population)) / 150;
  return Math.round(Math.max(5, Math.min(18, raw)) * 10) / 10;
}

export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface ArmyToken {
  armyId: string;
  owner: string;
  province: string;
  /** centre */
  x: number;
  y: number;
  size: number;
  player: boolean;
  frozen: boolean;
  marching: boolean;
}

export interface MapLayout {
  width: number;
  height: number;
  transform: FitTransform;
  nodes: NodeLayout[];
  byId: Map<string, NodeLayout>;
  tokens: ArmyToken[];
}

export const TOKEN_SIZE = 9;
export const MAP_PAD = 30;

/** Provinces as circles and armies as small squares stacked to the upper right of their node. */
export function layoutMap(
  view: Pick<ContinentView, 'provinces' | 'armies'>,
  width: number,
  height: number,
  mode: SizeMode,
  pad = MAP_PAD,
): MapLayout {
  const transform = fitTransform(view.provinces, width, height, pad);
  const nodes: NodeLayout[] = view.provinces.map((p) => {
    const c = toCanvas(transform, p.x, p.y);
    return { id: p.id, x: c.x, y: c.y, r: nodeRadius(p, mode) };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const tokens: ArmyToken[] = [];
  const stack = new Map<string, number>();
  for (const a of view.armies) {
    const n = byId.get(a.province);
    if (!n) continue;
    const i = stack.get(a.province) ?? 0;
    stack.set(a.province, i + 1);
    const left = n.x + n.r * 0.6 + i * (TOKEN_SIZE + 2);
    const top = n.y - n.r * 0.6 - TOKEN_SIZE;
    tokens.push({
      armyId: a.id,
      owner: a.owner,
      province: a.province,
      x: left + TOKEN_SIZE / 2,
      y: top + TOKEN_SIZE / 2,
      size: TOKEN_SIZE,
      player: a.owner === PLAYER,
      frozen: a.frozen,
      marching: a.path.length > 0,
    });
  }
  return { width, height, transform, nodes, byId, tokens };
}

/** The army token under a canvas point (topmost, that is the last drawn, first). */
export function pickToken(layout: MapLayout, px: number, py: number, slack = 2): string | null {
  for (let i = layout.tokens.length - 1; i >= 0; i--) {
    const t = layout.tokens[i] as ArmyToken;
    const h = t.size / 2 + slack;
    if (Math.abs(px - t.x) <= h && Math.abs(py - t.y) <= h) return t.armyId;
  }
  return null;
}

/** The nearest province whose circle (plus slack) contains the point. */
export function pickProvince(layout: MapLayout, px: number, py: number, slack = 4): string | null {
  let best: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const n of layout.nodes) {
    const d = Math.hypot(px - n.x, py - n.y);
    if (d <= n.r + slack && d < bestD) {
      best = n.id;
      bestD = d;
    }
  }
  return best;
}

export type MapPick = { kind: 'army'; id: string } | { kind: 'province'; id: string } | null;

export function pickAt(layout: MapLayout, px: number, py: number): MapPick {
  const army = pickToken(layout, px, py);
  if (army) return { kind: 'army', id: army };
  const prov = pickProvince(layout, px, py);
  return prov ? { kind: 'province', id: prov } : null;
}

/** Canvas points of an army's march: its province, then every province still on its path. */
export function armyPathPoints(layout: MapLayout, army: Pick<Army, 'province' | 'path'>): Point[] {
  if (army.path.length === 0) return [];
  const out: Point[] = [];
  for (const id of [army.province, ...army.path]) {
    const n = layout.byId.get(id);
    if (n) out.push({ x: n.x, y: n.y });
  }
  return out.length >= 2 ? out : [];
}

// ---------------------------------------------------------------------------
// Graph and movement

export interface Neighbour {
  id: string;
  days: number;
  kind?: string;
}

/** Provinces linked to `id`, shortest march first. */
export function neighbours(links: readonly Link[], id: string): Neighbour[] {
  const out: Neighbour[] = [];
  for (const l of links) {
    if (l.a === id) out.push({ id: l.b, days: l.days, kind: l.kind });
    else if (l.b === id) out.push({ id: l.a, days: l.days, kind: l.kind });
  }
  return out.sort((x, y) => x.days - y.days || x.id.localeCompare(y.id));
}

/**
 * Whether the player's army may enter land held by `owner`, from the diplomacy rows:
 * unowned or own land, an ally, a nation at war with us, or a passage treaty (map.ts
 * canEnter, seen from the player).
 */
export function entryAllowed(owner: string | null, rows: readonly DiplomacyRow[]): boolean {
  if (owner === null || owner === PLAYER) return true;
  const row = rows.find((r) => r.nation === owner);
  if (!row) return false;
  return row.atWar || row.treaties.includes('alliance') || row.treaties.includes('passage');
}

export interface MoveTarget {
  id: string;
  days: number;
  allowed: boolean;
}

/** Linked provinces a player army may be ordered into next (impassable ones excluded). */
export function moveTargets(
  view: Pick<ContinentView, 'provinces' | 'links' | 'armies'>,
  armyId: string,
  rows: readonly DiplomacyRow[],
): MoveTarget[] {
  const army = view.armies.find((a) => a.id === armyId);
  if (!army || army.owner !== PLAYER || army.frozen) return [];
  const out: MoveTarget[] = [];
  for (const n of neighbours(view.links, army.province)) {
    const p = view.provinces.find((x) => x.id === n.id);
    if (!p || p.impassable) continue;
    out.push({ id: n.id, days: n.days, allowed: entryAllowed(p.owner, rows) });
  }
  return out;
}

export function isPlayerArmy(view: Pick<ContinentView, 'armies'>, armyId: string): boolean {
  return view.armies.some((a) => a.id === armyId && a.owner === PLAYER);
}

// ---------------------------------------------------------------------------
// Markers and colours

export type WarMark = 'none' | 'war' | 'player';

export interface ProvinceMarks {
  capital: boolean;
  impassable: boolean;
  dian: number;
  siege: { progress: number; color: string; byName: string } | null;
  war: WarMark;
}

function inWar(w: War, n: string): boolean {
  return w.attackers.includes(n) || w.defenders.includes(n);
}

function opposed(w: War, a: string, b: string): boolean {
  return (
    (w.attackers.includes(a) && w.defenders.includes(b)) ||
    (w.attackers.includes(b) && w.defenders.includes(a))
  );
}

/** Whether `owner` is at war at all, and whether against the player. */
export function warMark(wars: readonly War[], owner: string | null): WarMark {
  if (!owner) return 'none';
  if (owner !== PLAYER && wars.some((w) => opposed(w, owner, PLAYER))) return 'player';
  return wars.some((w) => inWar(w, owner)) ? 'war' : 'none';
}

/** Colour of each nation on the map, taken from the provinces it holds. */
export function ownerColors(view: Pick<ContinentView, 'provinces'>): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of view.provinces) if (p.owner && !m.has(p.owner)) m.set(p.owner, p.color);
  return m;
}

export function ownerColor(colors: ReadonlyMap<string, string>, owner: string): string {
  return colors.get(owner) ?? SG_COLORS.token;
}

export function provinceMarks(
  view: Pick<ContinentView, 'provinces' | 'wars'>,
  p: Province,
  colors: ReadonlyMap<string, string> = ownerColors(view),
): ProvinceMarks {
  return {
    capital: !!p.capitalOf,
    impassable: p.impassable,
    dian: Math.max(0, Math.min(5, Math.round(p.dian))),
    siege: p.siege
      ? {
          progress: Math.max(0, Math.min(100, p.siege.progress)),
          color: ownerColor(colors, p.siege.by),
          byName: t(p.siege.byName),
        }
      : null,
    war: warMark(view.wars, p.owner),
  };
}

export function nodeFill(p: Pick<Province, 'impassable' | 'color'>): string {
  return p.impassable ? SG_COLORS.impassable : p.color;
}

/** Multiply a #rrggbb colour's channels (0..2); other strings pass through. */
export function shade(color: string, factor: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const v = Number.parseInt(m[1] as string, 16);
  const ch = (shift: number) => {
    const c = Math.round(((v >> shift) & 0xff) * factor);
    return Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

export interface LinkStyle {
  width: number;
  dash: number[];
  color: string;
}

/** Thicker for short marches; dashed for rivers, sea lanes, passes and trails. */
export function linkStyle(link: Pick<Link, 'days' | 'kind'>): LinkStyle {
  const kind = link.kind ?? 'road';
  return {
    width: Math.max(1, Math.min(3.5, 4 - 0.5 * link.days)),
    dash: [...(LINK_DASH[kind] ?? [])],
    color: LINK_COLORS[kind] ?? (LINK_COLORS.road as string),
  };
}

// ---------------------------------------------------------------------------
// Names and numbers

/** Province name without its parenthesised note: "灰烬边境（边石镇）" to "灰烬边境". */
export function shortName(name: string): string {
  const cut = name.search(/[（(]/);
  const s = (cut > 0 ? name.slice(0, cut) : name).trim();
  return s || name;
}

/** Counts in the Chinese style: 3500000 reads "350 万", 12345 reads "1.2 万". */
export function formatCount(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) < 10000) return String(v);
  const w = v / 10000;
  const shown = Math.abs(w) >= 100 ? Math.round(w) : Math.round(w * 10) / 10;
  return t('ui.win.strategy.wan', { n: shown });
}

export function signed(n: number): string {
  const v = Math.round(n);
  return v > 0 ? `+${v}` : String(v);
}

function oneDecimal(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

export interface Names {
  nation(id: string): string;
  province(id: string): string;
}

/** Display names gathered from everything the views already carry. */
export function buildNames(
  view: Pick<ContinentView, 'provinces' | 'armies'>,
  rows: readonly DiplomacyRow[] = [],
  player?: Pick<NationView, 'id' | 'name'> | null,
): Names {
  const nations = new Map<string, string>();
  for (const p of view.provinces) {
    if (p.owner) nations.set(p.owner, t(p.ownerName));
    if (p.siege) nations.set(p.siege.by, t(p.siege.byName));
  }
  for (const a of view.armies) nations.set(a.owner, t(a.ownerName));
  for (const r of rows) nations.set(r.nation, t(r.name));
  if (player) nations.set(player.id, t(player.name));
  const provinces = new Map(view.provinces.map((p) => [p.id, shortName(p.name)]));
  return {
    nation: (id) => nations.get(id) ?? id,
    province: (id) => provinces.get(id) ?? id,
  };
}

function joinNames(ids: readonly string[], name: (id: string) => string): string {
  return ids.length === 0
    ? t('ui.win.strategy.none')
    : ids.map(name).join(t('ui.win.strategy.list_sep'));
}

// ---------------------------------------------------------------------------
// Summaries

export interface InfoRow {
  label: string;
  value: string;
  tone?: Tone;
  /** css colour of a small swatch before the value */
  swatch?: string;
}

export function provinceTooltip(p: Province): string {
  return t('ui.win.strategy.tooltip', {
    name: shortName(p.name),
    owner: t(p.ownerName),
    population: formatCount(p.population),
  });
}

export function provinceRows(
  view: Pick<ContinentView, 'provinces' | 'armies' | 'wars'>,
  p: Province,
  names: Names = buildNames(view),
): InfoRow[] {
  const marks = provinceMarks(view, p);
  const rows: InfoRow[] = [
    { label: t('ui.win.strategy.fields.owner'), value: t(p.ownerName), swatch: p.color },
    {
      label: t('ui.win.strategy.fields.terrain'),
      value: tOr(`ui.win.strategy.terrains.${p.terrain}`, p.terrain),
    },
    { label: t('ui.win.strategy.fields.population'), value: formatCount(p.population) },
    { label: t('ui.win.strategy.fields.garrison'), value: formatCount(p.garrison) },
    {
      label: t('ui.win.strategy.fields.dian'),
      value: String(p.dian),
      tone: p.dian >= 3 ? 'warn' : undefined,
    },
    {
      label: t('ui.win.strategy.fields.siege'),
      value: p.siege
        ? t('ui.win.strategy.siege_by', {
            name: t(p.siege.byName),
            progress: Math.round(p.siege.progress),
          })
        : t('ui.win.strategy.no_siege'),
      tone: p.siege ? 'warn' : 'muted',
    },
  ];
  if (p.capitalOf) {
    rows.push({
      label: t('ui.win.strategy.fields.status'),
      value: t('ui.win.strategy.capital_of', { name: names.nation(p.capitalOf) }),
    });
  }
  if (p.impassable)
    rows.push({
      label: t('ui.win.strategy.fields.status'),
      value: t('ui.win.strategy.impassable'),
      tone: 'muted',
    });
  if (marks.war === 'player')
    rows.push({
      label: t('ui.win.strategy.fields.status'),
      value: t('ui.win.strategy.war_with_player'),
      tone: 'warn',
    });
  else if (marks.war === 'war')
    rows.push({
      label: t('ui.win.strategy.fields.status'),
      value: t('ui.win.strategy.at_war'),
      tone: 'warn',
    });
  return rows;
}

export function armyLine(a: Army): string {
  return t('ui.win.strategy.army_line', {
    name: t(a.name),
    owner: t(a.ownerName),
    soldiers: formatCount(a.soldiers),
  });
}

export function armyStatus(a: Army, names: Names): string {
  if (a.frozen) return t('ui.win.strategy.army_frozen');
  const next = a.path[0];
  if (next !== undefined) {
    return t('ui.win.strategy.army_marching', { next: names.province(next), steps: a.path.length });
  }
  return t('ui.win.strategy.army_idle');
}

/** The status line of an army card, with its general when it has one. */
export function armyDetail(a: Army, names: Names): string {
  const status = armyStatus(a, names);
  return a.general ? t('ui.win.strategy.army_with_general', { status, name: a.general }) : status;
}

export function armiesAt(view: Pick<ContinentView, 'armies'>, provinceId: string): Army[] {
  return view.armies.filter((a) => a.province === provinceId);
}

export function nationRows(n: NationView, names: Names): InfoRow[] {
  const ae = [...n.aeAgainst].sort((x, y) => y.value - x.value || x.nation.localeCompare(y.nation));
  return [
    { label: t('ui.win.strategy.nation_fields.name'), value: t(n.name) },
    { label: t('ui.win.strategy.nation_fields.ruler'), value: t(n.ruler) },
    {
      label: t('ui.win.strategy.nation_fields.capital'),
      value: n.capital ? names.province(n.capital) : t('ui.win.strategy.none'),
    },
    {
      label: t('ui.win.strategy.nation_fields.treasury'),
      value: t('ui.win.strategy.gold', { n: formatCount(n.treasury) }),
    },
    {
      label: t('ui.win.strategy.nation_fields.income'),
      value: t('ui.win.strategy.gold_gain', { n: oneDecimal(n.income) }),
      tone: 'ok',
    },
    {
      label: t('ui.win.strategy.nation_fields.upkeep'),
      value: t('ui.win.strategy.gold_loss', { n: oneDecimal(n.upkeep) }),
      tone: n.upkeep > n.income ? 'warn' : undefined,
    },
    {
      label: t('ui.win.strategy.nation_fields.tax_rate'),
      value: t('ui.win.strategy.percent', { n: Math.round(n.taxRate * 100) }),
    },
    {
      label: t('ui.win.strategy.nation_fields.stability'),
      value: String(n.stability),
      tone: n.stability < 30 ? 'warn' : undefined,
    },
    {
      label: t('ui.win.strategy.nation_fields.legitimacy'),
      value: String(n.legitimacy),
      tone: n.legitimacy < 30 ? 'warn' : undefined,
    },
    {
      label: t('ui.win.strategy.nation_fields.war_weariness'),
      value: String(n.warWeariness),
      tone: n.warWeariness >= 50 ? 'warn' : undefined,
    },
    { label: t('ui.win.strategy.nation_fields.autonomy'), value: String(n.autonomy) },
    { label: t('ui.win.strategy.nation_fields.divine_reliance'), value: String(n.divineReliance) },
    { label: t('ui.win.strategy.nation_fields.credibility'), value: String(n.credibility) },
    { label: t('ui.win.strategy.nation_fields.population'), value: formatCount(n.population) },
    { label: t('ui.win.strategy.nation_fields.soldiers'), value: formatCount(n.soldiers) },
    { label: t('ui.win.strategy.nation_fields.power'), value: formatCount(n.power) },
    {
      label: t('ui.win.strategy.nation_fields.provinces'),
      value: t('ui.win.strategy.province_count', { n: n.provinces.length }),
    },
    {
      label: t('ui.win.strategy.nation_fields.enemies'),
      value: joinNames(n.enemies, names.nation),
      tone: n.enemies.length > 0 ? 'warn' : 'muted',
    },
    {
      label: t('ui.win.strategy.nation_fields.recognized_by'),
      value: joinNames(n.recognizedBy, names.nation),
      tone: n.recognizedBy.length > 0 ? undefined : 'muted',
    },
    {
      label: t('ui.win.strategy.nation_fields.ae_against'),
      value:
        ae.length === 0
          ? t('ui.win.strategy.none')
          : ae
              .map((x) =>
                t('ui.win.strategy.ae_entry', { name: names.nation(x.nation), value: x.value }),
              )
              .join(t('ui.win.strategy.list_sep')),
      tone: ae.some((x) => x.value >= AE_WARN) ? 'warn' : ae.length === 0 ? 'muted' : undefined,
    },
  ];
}

export interface InfoLine {
  text: string;
  tone?: Tone;
}

export function treatyName(t: TreatyType | string): string {
  return tOr(`ui.win.strategy.treaty_names.${t}`, t);
}

/** The text lines of one diplomacy row (band and name are shown separately). */
export function diplomacyLines(row: DiplomacyRow): InfoLine[] {
  const lines: InfoLine[] = [
    { text: t('ui.win.strategy.scores', { to: signed(row.scoreTo), from: signed(row.scoreFrom) }) },
    {
      text: t('ui.win.strategy.treaties', {
        list:
          row.treaties.length === 0
            ? t('ui.win.strategy.none')
            : [...new Set(row.treaties)].map(treatyName).join(t('ui.win.strategy.list_sep')),
      }),
      tone: row.treaties.length === 0 ? 'muted' : undefined,
    },
  ];
  if (row.atWar) lines.push({ text: t('ui.win.strategy.row_at_war'), tone: 'warn' });
  if (row.truce) lines.push({ text: t('ui.win.strategy.row_truce'), tone: 'muted' });
  if (row.aeTowardUs > 0) {
    lines.push({
      text: t('ui.win.strategy.row_ae', { n: row.aeTowardUs }),
      tone: row.aeTowardUs >= AE_WARN ? 'warn' : undefined,
    });
  }
  return lines;
}

export interface DiplomacyButton {
  action: DiplomacyAction;
  treaty?: TreatyType;
  label: string;
  tone: 'treaty' | 'peace' | 'break' | 'war';
  hint?: string;
}

const OFFERS: { action: DiplomacyAction; treaty: TreatyType }[] = [
  { action: 'alliance', treaty: 'alliance' },
  { action: 'trade', treaty: 'trade' },
  { action: 'non_aggression', treaty: 'non_aggression' },
  { action: 'passage', treaty: 'passage' },
  { action: 'recognize', treaty: 'recognition' },
];

/**
 * The actions a row offers (diplomacy.ts preconditions): peace or truce while at war;
 * otherwise each treaty not yet in force, breaking each one that is, and war unless a
 * truce still binds. Nothing before the player has a living nation.
 */
export function diplomacyActions(row: DiplomacyRow, hasNation: boolean): DiplomacyButton[] {
  if (!hasNation) return [];

  const label = (a: DiplomacyAction) => tOr(`ui.win.strategy.actions.${a}`, a);
  const out: DiplomacyButton[] = [];
  if (row.atWar) {
    out.push({ action: 'truce', label: label('truce'), tone: 'peace' });
    out.push({ action: 'peace', label: label('peace'), tone: 'peace' });
  } else {
    for (const o of OFFERS) {
      if (!row.treaties.includes(o.treaty)) {
        out.push({ action: o.action, label: label(o.action), tone: 'treaty' });
      }
    }
  }
  for (const treaty of [...new Set(row.treaties)]) {
    out.push({
      action: 'break_treaty',
      treaty,
      label: t('ui.win.strategy.break_treaty', { treaty: treatyName(treaty) }),
      tone: 'break',
    });
  }
  if (!row.atWar && !row.truce) {
    out.push({
      action: 'declare_war',
      label: label('declare_war'),
      tone: 'war',
      hint: t('ui.win.strategy.declare_war_hint'),
    });
  }
  return out;
}

export interface WarSummary {
  id: string;
  title: string;
  detail: string;
  involvesPlayer: boolean;
}

export function warSummaries(view: Pick<ContinentView, 'wars'>, names: Names): WarSummary[] {
  return view.wars.map((w) => ({
    id: w.id,
    title: t('ui.win.strategy.war_line', {
      attackers: w.attackers.map(names.nation).join(t('ui.win.strategy.list_sep')),
      defenders: w.defenders.map(names.nation).join(t('ui.win.strategy.list_sep')),
    }),
    detail: t('ui.win.strategy.war_detail', { score: signed(w.score), day: w.startDay }),
    involvesPlayer: inWar(w, PLAYER),
  }));
}

/** The conclave line: the summit result, the running stage, or not yet convened. */
export function conferenceText(view: Pick<ContinentView, 'conference' | 'summit'>): string {
  if (view.summit) return t('ui.win.strategy.summit_result', { name: t(view.summit.name) });
  const c = view.conference;
  if (c && c.stage !== 'done')
    return t('ui.win.strategy.conference_stage', { stage: t(c.stageName), day: c.endsDay });
  return t('ui.win.strategy.conference_idle');
}

/** commands.ts convene: once, not while running, and only after feature.slg. */
export function canConvene(
  view: Pick<ContinentView, 'conference' | 'summit'>,
  flags: Readonly<Record<string, FlagValue>>,
): boolean {
  return (
    !view.conference &&
    !view.summit &&
    !flagOn(flags['a4_conclave_done']) &&
    flagOn(flags['feature.slg'])
  );
}

/** Newest first: "第 12 日：……". */
export function logLines(view: Pick<ContinentView, 'log'>, max = 20): string[] {
  return view.log
    .slice(-max)
    .reverse()
    .map((e) => t('ui.win.strategy.log_line', { day: e.day, text: t(e.text) }));
}

export function pendingText(
  view: Pick<ContinentView, 'pendingBattle'>,
  names: Names,
): string | null {
  const p = view.pendingBattle;
  return p ? t('ui.win.strategy.pending_battle', { province: names.province(p.province) }) : null;
}

export function statusText(view: Pick<ContinentView, 'day' | 'releaseIndex' | 'wars'>): string {
  return t('ui.win.strategy.status', {
    day: view.day,
    release: Math.round(view.releaseIndex),
    wars: view.wars.length,
  });
}

// ---------------------------------------------------------------------------
// Founding and recruiting

export interface FoundingState {
  /** show the founding box at all */
  show: boolean;
  can: boolean;
  /** why it cannot be done now (empty when it can) */
  reason: string;
}

/** commands.ts foundNation, seen from the client: once, after feature.slg, autonomy 40. */
export function foundingState(
  flags: Readonly<Record<string, FlagValue>>,
  nation: Pick<NationView, 'alive'> | null,
): FoundingState {
  if (nation?.alive) return { show: false, can: false, reason: '' };
  if (nation) return { show: true, can: false, reason: t('ui.win.strategy.nation_fallen') };
  if (flagOn(flags['a4_nation_founded']))
    return { show: true, can: false, reason: t('ui.win.strategy.found_already') };
  if (!flagOn(flags['feature.slg']))
    return { show: true, can: false, reason: t('ui.win.strategy.found_locked') };
  const autonomy = Number(flags.territory_autonomy ?? 0);
  if (!(autonomy >= FOUNDING_AUTONOMY)) {
    return {
      show: true,
      can: false,
      reason: t('ui.win.strategy.found_autonomy', {
        have: Number.isFinite(autonomy) ? Math.floor(autonomy) : 0,
        need: FOUNDING_AUTONOMY,
      }),
    };
  }
  return { show: true, can: true, reason: '' };
}

/** The most soldiers one order may levy here (5 percent of the people, at most 5000). */
export function recruitLimit(population: number): number {
  return Math.max(0, Math.min(RECRUIT_MAX, Math.floor(Math.max(0, population) * RECRUIT_SHARE)));
}

/** A typed count clamped to 1..limit (0 when nobody can be levied or the input is junk). */
export function clampRecruit(raw: number, limit: number): number {
  if (limit <= 0 || !Number.isFinite(raw)) return 0;
  return Math.max(1, Math.min(limit, Math.floor(raw)));
}

/** Only the player's own provinces, while the player's nation lives. */
export function canRecruitIn(
  p: Pick<Province, 'owner'>,
  nation: Pick<NationView, 'alive'> | null,
): boolean {
  return p.owner === PLAYER && !!nation?.alive;
}

/** The battle mode from the raw strategy slice (ContinentView does not carry it). */
export function battleModeFrom(slices: unknown): 'auto' | 'manual' | null {
  const s = (slices as { strategy?: { battleMode?: unknown } } | null | undefined)?.strategy;
  const m = s?.battleMode;
  return m === 'auto' || m === 'manual' ? m : null;
}

// ---------------------------------------------------------------------------
// Change detection

/** Everything the map drawing depends on, as one cheap string. */
export function continentSignature(view: ContinentView): string {
  return JSON.stringify([
    view.provinces.map((p) => [
      p.id,
      p.owner,
      p.color,
      p.population,
      p.garrison,
      p.siege ? `${p.siege.by}:${p.siege.progress}` : '',
    ]),
    view.links.length,
    view.armies.map((a) => [a.id, a.owner, a.province, a.path.join(','), a.frozen]),
    view.wars.map((w) => [w.id, w.attackers.join(','), w.defenders.join(',')]),
  ]);
}
