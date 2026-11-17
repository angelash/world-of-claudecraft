// Rest rules (travel_and_exploration.md 7.1 to 7.4): may this entity wait or sleep where
// it stands, and how likely a night ambush is. Pure queries over the world and the
// content, so the client can show the reason before the player asks (ui_pop_wait); the
// kernel asks them again when the command comes and every game hour while a skip runs.
// Every place rule reads data roles (the atlas role of the map, location kinds and tags,
// map fields), never content ids.

import type { ContentMap } from '../../core/contracts';
import { type TextRef, tr } from '../../core/text';
import {
  calendarAt,
  TICKS_PER_GAME_DAY,
  TICKS_PER_GAME_HOUR,
  TICKS_PER_GAME_MINUTE,
} from '../../core/time';
import type { World } from '../../core/world';
import { COMBAT_LINGER, monsterDef, secs, waveDef } from '../combat/defs';
import { isHostilePair, unitOf } from '../combat/units';
import { currentConversation } from '../dialogue';
import { mapById } from '../world';
import type { Entity, LocationDef, MapDef } from '../world/types';

/** What the rest rules read: a SystemContext, the Engine or any pair of world and content. */
export interface RestView {
  readonly world: World;
  readonly content: ContentMap;
}

export type RestCheck = { ok: true } | { ok: false; code: string; reason: TextRef };

/** Extra margin around a hostile's alert circle (7.2 rule 1), in metres (tiles). */
export const ALERT_MARGIN = 6;
/** Fought a hostile this recently (7.2 rule 2). */
export const RECENT_FIGHT_TICKS = secs(10);
/** Aggro radius of a hostile combatant that is not a bestiary monster. */
const DEFAULT_AGGRO = 5;
/** The longest wait (7.1). */
export const MAX_WAIT_HOURS = 8;
/** Sleep may start from this hour (inclusive) ... */
export const SLEEP_FROM_HOUR = 18;
/** ... until the morning hour the sleeper wakes at (7.1). */
export const WAKE_HOUR = 6;

/** Location kinds with a bed anyone may take (inns; the room fee is the economy's). */
const INN_KINDS: ReadonlySet<string> = new Set(['tavern']);
/** Location kinds of a camp with a fire: a camp or a marked safe point (7.3). */
const CAMP_KINDS: ReadonlySet<string> = new Set(['camp', 'safe']);
/** Location tags: an explicit bed, a ward-stone circle, a deep-sediment timed spot. */
const BED_TAG = 'bed';
const WARD_TAG = 'ward';
const SEDIMENT_CLOCK_TAG = 'sediment_clock';

/** Atlas map roles where nobody skips time: battle grids and the divine stage (7.2 rule 6). */
const NO_SKIP_ROLES: ReadonlySet<string> = new Set(['battle', 'stage']);

const no = (code: string, reason: TextRef): RestCheck => ({ ok: false, code, reason });

/** The atlas role of a map ('hub', 'field', 'dungeon', 'private', ...), or undefined. */
export function mapRole(content: ContentMap, mapId: string): string | undefined {
  return content.atlas_maps?.find((m) => m.id === mapId)?.role;
}

function inside(loc: LocationDef, x: number, y: number): boolean {
  return x >= loc.x && x <= loc.x + loc.w && y >= loc.y && y <= loc.y + loc.h;
}

/** The locations of a map the point stands in. */
export function locationsAt(map: MapDef, x: number, y: number): LocationDef[] {
  return map.locations.filter((l) => inside(l, x, y));
}

/** Sleeping out in the field: a camp location (with its fire) on a field or dungeon map. */
function campHere(role: string | undefined, here: readonly LocationDef[]): boolean {
  if (role !== 'field' && role !== 'dungeon') return false;
  return here.some((l) => CAMP_KINDS.has(l.kind));
}

/** A bed: an inn, an explicitly tagged bed, or the home on a private map (the court cabin). */
function bedHere(role: string | undefined, here: readonly LocationDef[]): boolean {
  return here.some(
    (l) =>
      INN_KINDS.has(l.kind) ||
      (l.tags ?? []).includes(BED_TAG) ||
      (role === 'private' && l.kind === 'home'),
  );
}

/**
 * 7.2 rule 3: inside a deep-sediment timed zone (the map, or a location tagged
 * `sediment_clock`, carries `sedimentClock`) and not in a ward-stone circle or a camp's light.
 */
function sedimentClockOn(map: MapDef, here: readonly LocationDef[]): boolean {
  const timed =
    map.sedimentClock === true || here.some((l) => (l.tags ?? []).includes(SEDIMENT_CLOCK_TAG));
  if (!timed) return false;
  return !here.some((l) => (l.tags ?? []).includes(WARD_TAG) || CAMP_KINDS.has(l.kind));
}

/**
 * 7.2 rule 1: a hostile combatant on the map whose alert circle (aggro radius plus its
 * spawn's wander radius) plus the margin covers the entity. The first such id, or null.
 */
export function hostileInReach(view: RestView, e: Entity): string | null {
  const world = view.world;
  const me = unitOf(world, e.id);
  const units = world.slices.combat?.units;
  if (!me || !units) return null;
  for (const id of Object.keys(units).sort()) {
    const u = units[id];
    const other = world.slices.world.entities[id];
    if (!u || !other || id === e.id || !other.alive || other.hidden) continue;
    if (other.mapId !== e.mapId || !isHostilePair(me, u) || !u.attackable) continue;
    if (u.ai?.state === 'yielded') continue;
    const def = u.monsterId ? monsterDef(view.content, u.monsterId) : undefined;
    const aggro = def?.aggroRadius ?? DEFAULT_AGGRO;
    let wander = 0;
    if (u.spawnKey) {
      const slash = u.spawnKey.indexOf('/');
      const spawn = mapById(view.content, u.spawnKey.slice(0, slash))?.spawns.find(
        (s) => s.id === u.spawnKey?.slice(slash + 1),
      );
      wander = spawn?.radius ?? 1;
    }
    if (Math.hypot(other.x - e.x, other.y - e.y) <= aggro + wander + ALERT_MARGIN) return id;
  }
  return null;
}

/** 7.2 rule 5 (story lock) and rule 6: what stops any skip on this map right now. */
function storyLock(view: RestView, e: Entity): RestCheck | null {
  const { world, content } = view;
  if (NO_SKIP_ROLES.has(mapRole(content, e.mapId) ?? '')) {
    return no('place', tr('sys.travel.rest.reject.place'));
  }
  const scenes = world.slices.scenes;
  if (scenes && (scenes.current || scenes.queue.length > 0)) {
    return no('story', tr('sys.travel.rest.reject.scene'));
  }
  if (world.slices.warfare?.battle || world.meta.flags['war.pending']) {
    return no('story', tr('sys.travel.rest.reject.battle'));
  }
  // a scripted wave (a beast tide, a tide at the walls) under way on this map
  const waves = world.slices.combat?.waves ?? {};
  for (const id of Object.keys(waves).sort()) {
    if (waves[id]?.state !== 'active') continue;
    if (waveDef(content, id)?.mapId === e.mapId) {
      return no('story', tr('sys.travel.rest.reject.tide'));
    }
  }
  if (world.slices.dialogue && currentConversation(world)) {
    return no('busy', tr('sys.travel.rest.reject.talking'));
  }
  return null;
}

/** The rules that hold for both waiting and sleeping (7.2), for the entity as it stands. */
function stayCheck(view: RestView, entityId: string): RestCheck {
  const { world, content } = view;
  const e = world.slices.world.entities[entityId];
  if (!e || !e.alive) return no('no_entity', tr('sys.travel.rest.reject.no_entity'));
  const map = mapById(content, e.mapId);
  if (!map) return no('no_entity', tr('sys.travel.rest.reject.no_entity'));
  const lock = storyLock(view, e);
  if (lock) return lock;
  // in combat now, or engaged within the last 10 seconds (combatUntil runs COMBAT_LINGER
  // past the last blow)
  const me = unitOf(world, entityId);
  if (
    me &&
    me.combatUntil > 0 &&
    me.combatUntil - COMBAT_LINGER + RECENT_FIGHT_TICKS > world.meta.tick
  ) {
    return no('combat', tr('sys.travel.rest.reject.combat'));
  }
  const foe = hostileInReach(view, e);
  if (foe) {
    const f = world.slices.world.entities[foe];
    return no('hostile', tr('sys.travel.rest.reject.hostile', { name: f?.name ?? '' }));
  }
  const here = locationsAt(map, e.x, e.y);
  if (sedimentClockOn(map, here)) {
    return no('sediment', tr('sys.travel.rest.reject.sediment'));
  }
  // dungeons: only at a safe point (an entrance platform, a shortcut platform, a camp)
  if (mapRole(content, e.mapId) === 'dungeon' && !campHere('dungeon', here)) {
    return no('place', tr('sys.travel.rest.reject.dungeon'));
  }
  return { ok: true };
}

/** May the entity wait here now (7.2)? A rejection carries the reason key. */
export function canWait(view: RestView, entityId: string): RestCheck {
  return stayCheck(view, entityId);
}

/** The sleeping hours of 7.1: 18:00 to 05:59. */
export function isSleepHour(tick: number): boolean {
  const h = calendarAt(tick).hour;
  return h >= SLEEP_FROM_HOUR || h < WAKE_HOUR;
}

/**
 * May the entity sleep here now (7.1 to 7.3)? The hour window, every rule of waiting, and
 * a bed (inn, tagged bed, the private home) or a camp out in the field.
 */
export function canSleep(view: RestView, entityId: string): RestCheck {
  if (!isSleepHour(view.world.meta.tick)) {
    return no('too_early', tr('sys.travel.rest.reject.too_early'));
  }
  return sleepPlaceCheck(view, entityId);
}

/**
 * canSleep without the hour window: the hourly check of a sleep under way.
 *
 * 7.3's table has a fourth row this does not cover yet: sleeping in the open with a
 * tent-type consumable (no camp, no fire, double the ambush chance of a lit camp). No such
 * item exists in `data/` yet (checked against `catalog_consumables_magitools.md`), and
 * systems do not write content ids (implementation_conventions.md 6.7), so there is
 * nothing to key this branch off; whichever package adds the tent item should add the
 * check here (an item tag or `use.group`, not a hardcoded id) alongside `sleepAmbushChance`.
 */
export function sleepPlaceCheck(view: RestView, entityId: string): RestCheck {
  const stay = stayCheck(view, entityId);
  if (!stay.ok) return stay;
  const e = view.world.slices.world.entities[entityId] as Entity;
  const map = mapById(view.content, e.mapId) as MapDef;
  const role = mapRole(view.content, e.mapId);
  const here = locationsAt(map, e.x, e.y);
  if (bedHere(role, here) || campHere(role, here)) return { ok: true };
  if (role === 'field' || role === 'dungeon') {
    return no('need_camp', tr('sys.travel.rest.reject.need_camp'));
  }
  return no('need_bed', tr('sys.travel.rest.reject.need_bed'));
}

/** The tick of the next WAKE_HOUR:00 after `tick` (a sleep's end, 7.1). */
export function wakeTick(tick: number): number {
  const cal = calendarAt(tick);
  const minutesLeft = ((WAKE_HOUR * 60 - cal.minuteOfDay + 24 * 60 - 1) % (24 * 60)) + 1;
  return tick + minutesLeft * TICKS_PER_GAME_MINUTE - (tick % TICKS_PER_GAME_MINUTE);
}

/** Ticks from `tick` to the next given time of day (strictly later; at most one day). */
export function ticksUntil(tick: number, hour: number, minute = 0): number {
  const cal = calendarAt(tick);
  const target = hour * 60 + minute;
  let minutes = target - cal.minuteOfDay;
  if (minutes <= 0) minutes += 24 * 60;
  const ticks = minutes * TICKS_PER_GAME_MINUTE - (tick % TICKS_PER_GAME_MINUTE);
  return Math.min(ticks, TICKS_PER_GAME_DAY);
}

/**
 * The night-ambush roll per game hour while sleeping out (7.4): the map's sediment grade
 * times 1%, doubled at night, halved by a camp fire. Towns, indoors and private maps are 0.
 */
export function ambushChance(sediment: number, opts: { night: boolean; fire: boolean }): number {
  const base = Math.max(0, sediment) * 0.01;
  return base * (opts.night ? 2 : 1) * (opts.fire ? 0.5 : 1);
}

/**
 * The per-hour ambush chance for the entity sleeping where it stands: a field or dungeon
 * camp (which has its fire) rolls; a bed (inn, home, the private map) never does.
 */
export function sleepAmbushChance(view: RestView, entityId: string, tick: number): number {
  const e = view.world.slices.world.entities[entityId];
  const map = e ? mapById(view.content, e.mapId) : undefined;
  if (!e || !map || map.indoor) return 0;
  const role = mapRole(view.content, e.mapId);
  const here = locationsAt(map, e.x, e.y);
  if (bedHere(role, here) || !campHere(role, here)) return 0;
  const cal = calendarAt(tick);
  const night = cal.hour < WAKE_HOUR || cal.hour >= 20;
  return ambushChance(map.sediment ?? 0, { night, fire: true });
}

/** Whole hours of a tick span, rounded down (for the summary). */
export function wholeHours(ticks: number): number {
  return Math.floor(ticks / TICKS_PER_GAME_HOUR);
}
