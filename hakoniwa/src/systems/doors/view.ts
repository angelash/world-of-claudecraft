// Corridor view (千门回廊界面, thousand_doors.md 3.2, 19): each door's state, place (segment,
// wing, end hall), hint and key progress. Hidden doors are left out unless asked for; what
// a shown door discloses follows its hint level: a crack shows the first key only, a
// glimpse the keys met or under way plus how many are left, a full glimpse (and any
// openable, opened, closed or locked door) every key. The door card's fields of
// ux_and_onboarding.md 9.3 and 9.5 ride along: the danger band (five bands, the cracks on
// the frame), the cost preview (blockage and fatigue the opening adds), the shown doors the
// opening would shut, and per key the quest where it is found once the player knows it.
// Nothing here writes the world.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, type TextParam, tr } from '../../core/text';
import type { World } from '../../core/world';
import { blockageOf, blockageTier, openCostNow } from './costs';
import { grownSegments } from './hints';
import { actNumber, type KeyProgress, keyProgress } from './keys';
import {
  DANGER_BANDS,
  type DoorCategory,
  type DoorDanger,
  type DoorDef,
  type DoorRuntime,
  type DoorStatus,
  type WingId,
} from './types';

/** Display name of a door category (a fresh text key each call; it ends up in views). */
export function categoryName(category: DoorCategory): KeyText {
  return tr(`sys.doors.category.${category}`);
}

/** Display name of a door state (a fresh text key each call). */
export function statusName(state: DoorStatus): KeyText {
  return tr(`sys.doors.status.${state}`);
}

/** Display name of a wing (a fresh text key each call). */
export function wingName(wing: WingId): KeyText {
  return tr(`sys.doors.wing.${wing}`);
}

/** Display name of a danger band (a fresh text key each call). */
export function dangerName(band: DoorDanger): KeyText {
  return tr(`sys.doors.danger.${band}`);
}

/** A door's danger band (none when its data names none) and its level 1 (none) to 5. */
export function doorDanger(door: Pick<DoorDef, 'dangerBand'>): {
  band: DoorDanger;
  level: number;
} {
  const band = door.dangerBand && DANGER_BANDS.includes(door.dangerBand) ? door.dangerBand : 'none';
  return { band, level: DANGER_BANDS.indexOf(band) + 1 };
}

/** One door in the corridor; labels are text keys in the kernel, strings once rendered. */
export interface DoorView<Text = TextParam> {
  id: string;
  name: string;
  code?: string;
  category: DoorCategory;
  categoryName: Text;
  act: number;
  segment: number;
  /** the wing (its display name: wingName) */
  wing: WingId;
  /** the door stands in its segment's end hall */
  hall: boolean;
  state: DoorStatus;
  stateName: Text;
  /** 0 unseen, 1 crack, 2 glimpse, 3 full glimpse, 4 waypoint (3.2) */
  hintLevel: number;
  /** a crack shows no door name yet (3.2): `name` and `code` are empty until it does */
  nameShown: boolean;
  hint: string;
  /** what the door gives; only once opened or closed */
  desc?: string;
  /** the keys this hint level discloses, in key order */
  keys: KeyProgress[];
  /** keys not disclosed yet that are still unmet ("N more to go") */
  keysLeft: number;
  /** a forbidden door (the draft wing's weight, counted in danger_doors_opened) */
  danger: boolean;
  // The door card's fields (ux 9.3, 9.5). corridorView always fills them; they are optional
  // only so a view built by hand (an interface fixture) may leave them out.
  /** the danger band (catalog_doors.md 1.7; its display name: dangerName) */
  dangerBand?: DoorDanger;
  /** the band as 1 (none) to 5 (extreme): the cracks on the door frame (ux 9.2) */
  dangerLevel?: number;
  /** blockage and door fatigue the opening adds (ux 9.3; the seal never shows here) */
  costPreview?: { clog: number; fatigue: number };
  /** ids of the shown doors this one shuts when it opens (9.2: never an unseen one) */
  exclusiveWith?: string[];
  closable: boolean;
}

/** The hint level the view reads: a state past hinted discloses everything. */
function shownLevel(state: DoorStatus, level: number | undefined): number {
  if (state === 'hidden') return 0;
  if (state === 'hinted') return Math.max(1, level ?? 2);
  return 4;
}

function disclose(keys: KeyProgress[], level: number): { keys: KeyProgress[]; left: number } {
  const marked = keys.map((k, i) => ({
    ...k,
    shown: level >= 3 || (level === 2 && (k.met || (k.cur ?? 0) > 0)) || (level === 1 && i === 0),
  }));
  return {
    keys: marked.filter((k) => k.shown),
    left: marked.filter((k) => !k.shown && !k.met).length,
  };
}

/** Is a door in sight in the corridor (shown, and not locked before it was ever shown)? */
function inSight(rt: DoorRuntime | undefined): boolean {
  const state = rt?.state ?? 'hidden';
  if (state === 'hidden') return false;
  return !(state === 'locked' && (rt?.hintLevel ?? 0) < 1);
}

/**
 * The shown doors that opening `door` would lock or close now (thousand_doors.md 9.1, 9.2):
 * the other members of its groups, by their own entry's mode (a one-way group's source,
 * a freeze and a rack shut nothing; an act lock only in its act), still open to change,
 * and in sight. Empty once the door itself is past opening.
 */
export function exclusionPreview(world: World, content: ContentMap, door: DoorDef): string[] {
  const doors = world.slices.doors?.doors ?? {};
  const own = doors[door.id]?.state ?? 'hidden';
  if (own === 'opened' || own === 'locked' || own === 'closed') return [];
  const groups = new Set((door.exclusive ?? []).map((e) => e.group));
  if (groups.size === 0) return [];
  const act = actNumber(world.meta.flags.act);
  const out: string[] = [];
  for (const other of content.doors ?? []) {
    if (other.id === door.id) continue;
    const rt = doors[other.id];
    if (!inSight(rt) || rt?.state === 'locked' || rt?.state === 'closed') continue;
    const hits = (other.exclusive ?? []).some((e) => {
      if (!groups.has(e.group) || e.source) return false;
      if (e.mode === 'lock' || e.mode === 'vanish') return rt?.state !== 'opened';
      if (e.mode === 'actLock')
        return rt?.state !== 'opened' && (e.act === undefined || e.act === act);
      return e.mode === 'forceClose';
    });
    if (hits) out.push(other.id);
  }
  return out;
}

/** The quest states of a quest the player took up (outcomes such as a miss do not count). */
const TAKEN_UP: readonly string[] = ['active', 'ready', 'done'] as const;

/**
 * A key's "where to find" quest (ux 9.3), once the player has taken that quest up: a quest
 * the player never heard of is no link (14.1: unknown goals do not show). Only top-level
 * keys carry links; the validator refuses one on a nested key.
 */
function withLink(world: World, key: DoorDef['keys'][number] | undefined, p: KeyProgress) {
  const id = key?.link;
  const status = id ? world.meta.flags[`quest.${id}`] : undefined;
  if (!id || typeof status !== 'string' || !TAKEN_UP.includes(status)) return p;
  return { ...p, link: { kind: 'quest' as const, id } };
}

export function corridorView(world: World, content: ContentMap, includeHidden = false): DoorView[] {
  const out: DoorView[] = [];
  for (const door of content.doors ?? []) {
    const rt = world.slices.doors?.doors[door.id];
    const state = rt?.state ?? 'hidden';
    if (state === 'hidden' && !includeHidden) continue;
    // a door locked before it was ever shown stays out of sight (9.2: no word of the other)
    if (state === 'locked' && !includeHidden && (rt?.hintLevel ?? 0) < 1) continue;
    const level = includeHidden ? 4 : shownLevel(state, rt?.hintLevel);
    const progress =
      level > 0
        ? keyProgress(world, door, content).map((p, i) => withLink(world, door.keys[i], p))
        : [];
    const shown = disclose(progress, level);
    const danger = doorDanger(door);
    const cost = openCostNow(door, actNumber(world.meta.flags.act));
    const named = level >= 2;
    out.push({
      id: door.id,
      // a crack shows neither the door's look nor its name (3.2)
      name: named ? door.name : '',
      code: named ? door.code : undefined,
      category: door.category,
      categoryName: categoryName(door.category),
      act: door.act,
      segment: door.segment,
      wing: door.wing,
      hall: !!door.hall,
      state,
      stateName: statusName(state),
      hintLevel: includeHidden ? (rt?.hintLevel ?? 0) : level,
      nameShown: named,
      hint: door.hint,
      desc: state === 'opened' || state === 'closed' ? door.desc : undefined,
      keys: shown.keys,
      keysLeft: shown.left,
      danger: !!door.forbidden,
      dangerBand: danger.band,
      dangerLevel: danger.level,
      costPreview: { clog: cost.blockage, fatigue: cost.fatigue },
      exclusiveWith: exclusionPreview(world, content, door),
      closable: !!door.closable,
    });
  }
  return out;
}

export function doorState(world: World, doorId: string): DoorStatus {
  return world.slices.doors?.doors[doorId]?.state ?? 'hidden';
}

/** Is the corridor open to the player at all (feature.door_corridor, 8 row 1)? */
export function corridorOpen(world: World): boolean {
  return !!world.meta.flags['feature.door_corridor'];
}

/** The grown segments and, per wing, how many doors the player has seen there (18.4). */
export function corridorLayout(
  world: World,
  content: ContentMap,
): { segments: number[]; wings: { wing: WingId; seen: number }[] } {
  const seen = new Map<WingId, number>();
  for (const door of content.doors ?? []) {
    const st = world.slices.doors?.doors[door.id]?.state ?? 'hidden';
    if (st === 'hidden') continue;
    seen.set(door.wing, (seen.get(door.wing) ?? 0) + 1);
  }
  return {
    segments: grownSegments(world),
    wings: [...seen.entries()].map(([wing, n]) => ({ wing, seen: n })),
  };
}

/** The hidden seal variables (for the editor workbench; never shown to the player). */
export function sealState(world: World): { looseness: number; unrest: number; opened: number } {
  const f = world.meta.flags;
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  return {
    looseness: num(f.seal_looseness),
    unrest: num(f.seal_unrest),
    opened: num(f.doors_opened),
  };
}

/**
 * The door mirror's readings and the hidden seal state (4, 6): door rank, blockage and its
 * tier, door fatigue, seal points and stage. The rank, blockage and fatigue are what the
 * mirror shows the player; the seal is for the editor and tests.
 */
export function doorCosts(world: World): {
  rank: number;
  rankPoints: number;
  blockage: number;
  blockageTier: number;
  fatigue: number;
  sealPoints: number;
  sealStage: number;
} {
  const s = world.slices.doors;
  const blockage = blockageOf(s?.blockage ?? 0);
  return {
    rank: s?.rank ?? 1,
    rankPoints: s?.rankPoints ?? 0,
    blockage,
    blockageTier: blockageTier(blockage),
    fatigue: s?.fatigue ?? 0,
    sealPoints: s?.sealPoints ?? 0,
    sealStage: s?.sealStage ?? 0,
  };
}
