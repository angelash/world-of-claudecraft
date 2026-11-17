// Implements the model of `ui_mode_corridor` (ux_and_onboarding.md 9; thousand_doors.md 2, 3):
// the flat diagram form of the Thousand Doors corridor (9.1: the same structure and the same
// information as the HD-2D scene). Segments in order, each with its wings and its end hall;
// doors placed by segment, wing and hall; the door states of 9.2 told by shape and text, not by
// colour alone; the door card of 9.3; the door mirror of the front hall (rank, blockage,
// fatigue; never the seal); the filter tabs and the keyboard and pad navigation. What a door
// discloses follows its hint level as the kernel view already cut it (a crack: no name and only
// the hint; a glimpse: the name, the keys met or under way and how many are left). Pure;
// Node-tested. The painter is ./corridor_mode.ts.

import { t } from '../../../shared_ui/i18n';
import { WINGS, type WingId } from '../../../systems/doors/types';
import type { CorridorData, CorridorDoorView } from '../../view/adapters';

export const CORRIDOR_FILTERS = ['all', 'openable', 'glimpsed', 'opened'] as const;
export type CorridorFilter = (typeof CORRIDOR_FILTERS)[number];

/** How a door is drawn (9.2): a crack, a glimpse, openable, opened, locked or closed. */
export type DoorShape = 'crack' | 'glimpse' | 'openable' | 'opened' | 'locked' | 'closed';

export interface DoorNode {
  id: string;
  /** the door's name, or the crack wording while the name is not shown */
  label: string;
  shape: DoorShape;
  /** the state in words (shape and text, never colour alone) */
  mark: string;
  /** "钥 2/3" for a glimpsed door, '' otherwise */
  keys: string;
  danger: boolean;
  selected: boolean;
  pinned: boolean;
  /** hover text: why a locked door cannot open, the crack hint */
  title: string;
}

export interface WingRow {
  wing: WingId;
  label: string;
  doors: DoorNode[];
}

export interface SegmentSection {
  segment: number;
  title: string;
  wings: WingRow[];
  /** doors in the segment's end hall */
  hall: DoorNode[];
}

export interface DoorKeyRow {
  text: string;
  met: boolean;
  /** "已得" or "未得": the key's state in words */
  mark: string;
}

export interface DoorCard {
  id: string;
  title: string;
  /** segment and wing (or end hall) */
  place: string;
  shape: DoorShape;
  state: string;
  category: string;
  keys: DoorKeyRow[];
  /** "还差 N 把钥" while keys are left undisclosed, else '' */
  keysLeft: string;
  /** what the door gives, only once opened or closed */
  effect: string;
  /** the crack sentence while the effect is not known */
  hint: string;
  /** the danger as text ('' for a door that is not forbidden) */
  danger: string;
  canOpen: boolean;
  canClose: boolean;
  /** why it cannot open now ('' when it can, or it is open) */
  refusal: string;
  pinned: boolean;
}

export interface CorridorMirror {
  rank: string;
  blockage: string;
  fatigue: string;
}

export interface CorridorModel {
  filter: CorridorFilter;
  filters: { id: CorridorFilter; label: string; count: number }[];
  sections: SegmentSection[];
  card: DoorCard | null;
  mirror: CorridorMirror;
  /** the empty state ('' when some door shows under the filter) */
  empty: string;
  /** selectable door ids in display order */
  order: string[];
  /** the selected door, after falling back to the first one shown */
  selected: string | null;
}

export interface CorridorState {
  filter: CorridorFilter;
  selected: string | null;
  /** the door pinned to the tracker */
  pinned: string | null;
  /** the last refusal the kernel gave for a door, shown on its card (9.6) */
  refused?: { doorId: string; reason: string } | null;
}

/**
 * The "N keys left" count a door may show (thousand_doors.md 3.2; ux_and_onboarding.md 9.2):
 * only from a glimpse on (a crack shows the hint and its first key, never how many there are),
 * and only while the door is not opened or closed. 0 when nothing may be said.
 */
export function keysLeftShown(
  d: Pick<CorridorDoorView, 'state' | 'hintLevel' | 'keysLeft'>,
): number {
  if (d.state === 'opened' || d.state === 'closed' || d.hintLevel < 2) return 0;
  return Math.max(0, d.keysLeft);
}

export function doorShape(d: Pick<CorridorDoorView, 'state' | 'hintLevel'>): DoorShape {
  switch (d.state) {
    case 'openable':
    case 'opened':
    case 'locked':
    case 'closed':
      return d.state;
    default:
      return d.hintLevel >= 2 ? 'glimpse' : 'crack';
  }
}

export function passesFilter(d: CorridorDoorView, filter: CorridorFilter): boolean {
  switch (filter) {
    case 'openable':
      return d.state === 'openable';
    case 'glimpsed':
      return d.state === 'hinted';
    case 'opened':
      return d.state === 'opened';
    default:
      return true;
  }
}

function shapeMark(shape: DoorShape): string {
  return t(`ui.mode.corridor.shape.${shape}`);
}

/** Why a door cannot open now ('' when it can or already is open). */
export function refusalOf(d: Pick<CorridorDoorView, 'state'>): string {
  switch (d.state) {
    case 'hinted':
      return t('sys.doors.reject.no_key');
    case 'locked':
      return t('sys.doors.reject.locked');
    case 'closed':
      return t('sys.doors.reject.closed');
    default:
      return '';
  }
}

/** "钥 2/3": the keys met out of every key the door has, for a glimpsed door only (9.2). */
export function keyProgressText(d: CorridorDoorView): string {
  if (d.state !== 'hinted' || d.hintLevel < 2) return '';
  const met = d.keys.filter((k) => k.met).length;
  return t('ui.mode.corridor.keys', { met, total: d.keys.length + d.keysLeft });
}

function segmentTitle(segment: number): string {
  return t('ui.mode.corridor.segment', { n: segment });
}

function node(d: CorridorDoorView, st: CorridorState, selected: string | null): DoorNode {
  const shape = doorShape(d);
  return {
    id: d.id,
    label: d.nameShown && d.name ? d.name : t('ui.mode.corridor.unnamed'),
    shape,
    mark: shapeMark(shape),
    keys: keyProgressText(d),
    danger: d.danger,
    selected: d.id === selected,
    pinned: d.id === st.pinned,
    title: d.state === 'locked' ? refusalOf(d) : d.nameShown ? '' : d.hint,
  };
}

const WING_ORDER = new Map<string, number>(WINGS.map((w, i) => [w, i]));

/** Display order: segment, then wings in corridor order, wing doors before the hall's. */
function compareDoors(a: CorridorDoorView, b: CorridorDoorView): number {
  return (
    a.segment - b.segment ||
    Number(a.hall) - Number(b.hall) ||
    (WING_ORDER.get(a.wing) ?? 99) - (WING_ORDER.get(b.wing) ?? 99) ||
    a.act - b.act ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function card(d: CorridorDoorView, st: CorridorState): DoorCard {
  const shape = doorShape(d);
  const known = d.state === 'opened' || d.state === 'closed';
  const refused = st.refused && st.refused.doorId === d.id ? st.refused.reason : '';
  return {
    id: d.id,
    title: d.nameShown && d.name ? d.name : t('ui.mode.corridor.unnamed'),
    place: d.hall
      ? t('ui.mode.corridor.place_hall', { segment: segmentTitle(d.segment) })
      : t('ui.mode.corridor.place', { segment: segmentTitle(d.segment), wing: d.wingName }),
    shape,
    state: shapeMark(shape),
    category: d.categoryName,
    keys: d.keys.map((k) => ({
      text: k.need
        ? t('ui.mode.corridor.key_count', { label: k.label, cur: k.cur ?? 0, need: k.need })
        : k.label,
      met: k.met,
      mark: t(k.met ? 'ui.mode.corridor.key_met' : 'ui.mode.corridor.key_unmet'),
    })),
    keysLeft: keysLeftShown(d) > 0 ? t('ui.mode.corridor.keys_left', { n: keysLeftShown(d) }) : '',
    effect: known ? (d.desc ?? '') : '',
    hint: known ? '' : d.hint,
    danger: d.danger ? t('ui.win.doors.danger') : '',
    canOpen: d.state === 'openable',
    canClose: d.state === 'opened' && d.closable,
    refusal: refused || refusalOf(d),
    pinned: d.id === st.pinned,
  };
}

const BLOCKAGE_TIERS = 6;

function mirrorOf(m: CorridorData['mirror']): CorridorMirror {
  const tier = Math.max(0, Math.min(BLOCKAGE_TIERS - 1, Math.floor(m.blockageTier)));
  return {
    rank: t('ui.mode.corridor.mirror_rank', { n: m.rank }),
    blockage: t('ui.mode.corridor.mirror_blockage', {
      tier: t(`ui.hud.gauges.blockage_tier.${tier}`),
      n: m.blockage,
    }),
    fatigue: t('ui.mode.corridor.mirror_fatigue', { n: m.fatigue }),
  };
}

export function corridorModel(data: CorridorData, st: CorridorState): CorridorModel {
  const all = [...data.doors].sort(compareDoors);
  const shown = all.filter((d) => passesFilter(d, st.filter));
  const order = shown.map((d) => d.id);
  const selected = st.selected && order.includes(st.selected) ? st.selected : (order[0] ?? null);
  const segments = [...new Set([...data.segments, ...shown.map((d) => d.segment)])].sort(
    (a, b) => a - b,
  );
  const sections: SegmentSection[] = [];
  for (const segment of segments) {
    const inSeg = shown.filter((d) => d.segment === segment);
    if (inSeg.length === 0 && st.filter !== 'all') continue;
    const wings: WingRow[] = [];
    for (const d of inSeg) {
      if (d.hall) continue;
      let row = wings.find((w) => w.wing === d.wing);
      if (!row) {
        row = { wing: d.wing, label: d.wingName, doors: [] };
        wings.push(row);
      }
      row.doors.push(node(d, st, selected));
    }
    sections.push({
      segment,
      title: segmentTitle(segment),
      wings,
      hall: inSeg.filter((d) => d.hall).map((d) => node(d, st, selected)),
    });
  }
  const sel = selected ? (shown.find((d) => d.id === selected) ?? null) : null;
  return {
    filter: st.filter,
    filters: CORRIDOR_FILTERS.map((id) => ({
      id,
      label: t(`ui.mode.corridor.filter.${id}`),
      count: all.filter((d) => passesFilter(d, id)).length,
    })),
    sections,
    card: sel ? card(sel, st) : null,
    mirror: mirrorOf(data.mirror),
    empty:
      shown.length > 0
        ? ''
        : all.length === 0
          ? t('ui.win.doors.empty_state')
          : t('ui.mode.corridor.empty_filter'),
    order,
    selected,
  };
}

/** The next or previous door in display order (wrapping), or the first when none is selected. */
export function moveSelection(
  order: readonly string[],
  selected: string | null,
  dir: 1 | -1,
): string | null {
  if (order.length === 0) return null;
  const i = selected ? order.indexOf(selected) : -1;
  if (i < 0) return order[dir === 1 ? 0 : order.length - 1] ?? null;
  return order[(i + dir + order.length) % order.length] ?? null;
}

/** The first door of the next or previous segment that shows a door (wrapping). */
export function stepSegment(
  m: Pick<CorridorModel, 'sections'>,
  selected: string | null,
  dir: 1 | -1,
): string | null {
  const segs = m.sections.filter((s) => s.wings.length > 0 || s.hall.length > 0);
  if (segs.length === 0) return null;
  const idsOf = (s: SegmentSection) => [...s.wings.flatMap((w) => w.doors), ...s.hall];
  const cur = segs.findIndex((s) => idsOf(s).some((d) => d.id === selected));
  const next =
    cur < 0 ? (dir === 1 ? 0 : segs.length - 1) : (cur + dir + segs.length) % segs.length;
  return idsOf(segs[next] as SegmentSection)[0]?.id ?? null;
}

/** The filter one step along the tabs (the pad's triggers), wrapping. */
export function stepFilter(f: CorridorFilter, dir: 1 | -1): CorridorFilter {
  const i = CORRIDOR_FILTERS.indexOf(f);
  return CORRIDOR_FILTERS[
    (i + dir + CORRIDOR_FILTERS.length) % CORRIDOR_FILTERS.length
  ] as CorridorFilter;
}

/**
 * The kernel's answer to the player's last door command after `afterSeq`: its refusal text,
 * or '' when it went through (or has not come yet: undefined).
 */
export function doorCommandResult(
  events: readonly { kind: string; seq: number; data: unknown }[],
  afterSeq: number,
): { ok: boolean; reason: unknown } | undefined {
  for (const e of events) {
    if (e.seq <= afterSeq || e.kind !== 'command.result') continue;
    const d = e.data as {
      kind?: string;
      ok?: boolean;
      reason?: unknown;
      source?: { type?: string };
    };
    if ((d.kind === 'doors.open' || d.kind === 'doors.close') && d.source?.type === 'player')
      return { ok: !!d.ok, reason: d.reason };
  }
  return undefined;
}
