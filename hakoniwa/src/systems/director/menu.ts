// The director's menu (catalog_goddess_interventions.md 2.8; goddess_gm.md 8.3; builtin_ai.md
// 13.3): twelve written coincidences and respites, plus the dynamic events the guild offers
// it (ev_ items, quests_and_events.md 3.8). An item is open when its condition, its place
// (outdoor, wild), its closed preconditions (a friend near, a running dispute, a pending
// event, the player hurt or short of supplies, an open quest) and its cooldown allow; open
// items are scored by the tension gap, the data weight, freshness and story fit, ties by id.
// Landing an item leaves Moira's fate thread in the miracle ledger (D-035): her power, a
// trace of sediment, never a change to a fight's result or a locked revelation.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import { unitView } from '../combat/queries';
import { recordDensity } from '../goddess/actions';
import { goddessByRole } from '../goddess/roster';
import { recordIntervention } from '../goddess/state';
import { registerModifier } from '../modifiers';
import { conditionHolds } from '../quests/effects';
import { forceWeather, mapById, playerEntity, type Weather } from '../world';
import { itemScore, tensionGap } from './tension';

/** Closed preconditions an item may need (catalog 2.8 前置 column). */
export const ITEM_NEEDS = [
  'outdoor',
  'wild',
  'friend_near',
  'dispute',
  'pending_event',
  'hurt',
  'low_supply',
  'open_quest',
] as const;
export type ItemNeed = (typeof ITEM_NEEDS)[number];

/** What an item touches for the story fit of 13.3. */
export const ITEM_RELATES = ['dispute', 'quest', 'delivery'] as const;
export type ItemRelates = (typeof ITEM_RELATES)[number];

export interface DirectorItemDef {
  id: string;
  kind: 'coincidence' | 'respite';
  label: string;
  /** reveal-ledger condition */
  requires?: string;
  /** only on these maps (empty: anywhere) */
  maps?: string[];
  /** closed preconditions, all must hold */
  needs?: ItemNeed[];
  /** what it touches (13.3 story fit) */
  relates?: ItemRelates;
  /** monster pressure factor on the player's map while it lasts */
  monsterFactor?: number;
  /** duration of modifiers and weather in game hours */
  hours?: number;
  weather?: Weather;
  /** beat delay: hours a pending event is pushed back (asked of the guild by event) */
  delayHours?: number;
  /** one narration line */
  narration: string;
  flag?: { key: string; value: string | number | boolean };
  cooldownHours: number;
  /** Moira's power cost (1 to 5, with the flow) */
  power: number;
  weight?: number;
}

/** What the predicates of items and rules read from the world (gathered once an hour). */
export interface MenuFacts {
  tension: number;
  band: { low: number; high: number };
  mapId: string;
  outdoor: boolean;
  wild: boolean;
  friendNear: boolean;
  dispute: boolean;
  pendingEvent: string | null;
  hurt: boolean;
  lowSupply: boolean;
  openQuest: boolean;
  undelivered: boolean;
}

function needHolds(need: ItemNeed, f: MenuFacts): boolean {
  switch (need) {
    case 'outdoor':
      return f.outdoor;
    case 'wild':
      return f.wild;
    case 'friend_near':
      return f.friendNear;
    case 'dispute':
      return f.dispute;
    case 'pending_event':
      return f.pendingEvent !== null;
    case 'hurt':
      return f.hurt;
    case 'low_supply':
      return f.lowSupply;
    case 'open_quest':
      return f.openQuest;
  }
}

/** Whether a menu item may be landed now (its condition, place, needs and cooldown). */
export function itemOpen(
  ctx: SystemContext,
  item: DirectorItemDef,
  f: MenuFacts,
  used: Record<string, number>,
): boolean {
  if (item.maps && item.maps.length > 0 && !item.maps.includes(f.mapId)) return false;
  const last = used[item.id];
  if (last !== undefined && ctx.tick - last < item.cooldownHours * TICKS_PER_GAME_HOUR)
    return false;
  if (!(item.needs ?? []).every((n) => needHolds(n, f))) return false;
  return conditionHolds(ctx, item.requires);
}

function fits(item: DirectorItemDef, f: MenuFacts): boolean {
  switch (item.relates) {
    case 'dispute':
      return f.dispute;
    case 'quest':
      return f.openQuest;
    case 'delivery':
      return f.undelivered;
    default:
      return false;
  }
}

/** The best open item of a move by the 13.3 score (null when none is open). */
export function pickItem(
  ctx: SystemContext,
  move: 'coincidence' | 'respite',
  f: MenuFacts,
  used: Record<string, number>,
  filter: (item: DirectorItemDef) => boolean = () => true,
): DirectorItemDef | null {
  const gap = Math.max(0.01, tensionGap(move, f.tension, f.band));
  let best: { item: DirectorItemDef; score: number } | null = null;
  for (const item of ctx.content.directorMenu ?? []) {
    if (item.kind !== move || !filter(item) || !itemOpen(ctx, item, f, used)) continue;
    const last = used[item.id];
    const score = itemScore({
      gap,
      prereq: 1,
      weight: item.weight ?? 1,
      fresh: last === undefined || ctx.tick - last >= 2 * item.cooldownHours * TICKS_PER_GAME_HOUR,
      fit: fits(item, f),
    });
    if (!best || score > best.score || (score === best.score && item.id < best.item.id))
      best = { item, score };
  }
  return best?.item ?? null;
}

/** How a move lands: the narration may be replaced (a delivery), or muted (background). */
export interface LandOptions {
  narration?: TextParam;
  /** the comedy throttle put the player's map in the background today: no narration */
  quiet?: boolean;
  /** who chose it, for the ledger (the director, or a written act) */
  origin?: 'director' | 'beat';
}

/** Land a menu item: its modifiers, weather, flag and narration, and Moira's fate thread. */
export function landItem(ctx: SystemContext, item: DirectorItemDef, opts: LandOptions = {}): void {
  const player = playerEntity(ctx.world);
  const mapId = player?.mapId ?? '';
  const until = ctx.tick + Math.max(1, item.hours ?? 6) * TICKS_PER_GAME_HOUR;
  const note = tr('sys.director.note.fate', { label: item.label });
  if (item.monsterFactor !== undefined && mapId) {
    registerModifier(ctx, {
      target: 'monster',
      key: mapId,
      factor: item.monsterFactor,
      untilTick: until,
      source: 'director',
      visibility: 'hidden',
      stackGroup: item.id,
      note,
    });
  }
  if (item.weather && mapId) {
    forceWeather(ctx, item.weather, until, 'director');
    registerModifier(ctx, {
      target: 'weather',
      key: mapId,
      add: 1,
      tag: item.weather,
      untilTick: until,
      source: 'director',
      visibility: 'public',
      stackGroup: item.id,
      note,
    });
  }
  if (item.delayHours !== undefined)
    ctx.emit('director.delay', { hours: item.delayHours, itemId: item.id });
  if (!opts.quiet)
    ctx.emit('dialogue.line', {
      speakerId: 'narrator',
      speakerName: '',
      text: opts.narration ?? item.narration,
      kind: 'narrate',
    });
  if (item.flag) ctx.setFlag(item.flag.key, item.flag.value);
  const fate = goddessByRole(ctx.content, 'fate_director');
  // a written move is the executor's, outside the density limit like written divine acts
  if (mapId && opts.origin !== 'beat') recordDensity(ctx, mapId, item.power, true);
  recordIntervention(ctx, {
    goddess: fate?.id ?? '',
    action: item.kind,
    mapId,
    power: item.power,
    sediment: Math.round(item.power * 0.01 * 100) / 100,
    public: false,
    breach: false,
    note: tr('sys.director.note.arranged', {
      fate: fate?.name ?? '',
      move: tr(
        item.kind === 'coincidence' ? 'sys.director.move.coincidence' : 'sys.director.move.respite',
      ),
      label: item.label,
    }),
    // the player was there for it, unless it happened in the background
    seen: !opts.quiet && mapId !== '',
    origin: opts.origin ?? 'director',
  });
}

/** Whether the player is hurt (below half health): the healer's precondition. */
export function playerHurt(ctx: SystemContext): boolean {
  const p = playerEntity(ctx.world);
  if (!p || !ctx.world.slices.combat) return false;
  const v = unitView(ctx.world, ctx.content, p.id);
  return !!v && v.maxHp > 0 && v.hp / v.maxHp < 0.5;
}

/** Whether the player's map is outdoors, and wild (outdoors with no market). */
export function placeOf(
  ctx: SystemContext,
  mapId: string,
): { outdoor: boolean; wild: boolean; town: boolean } {
  const map = mapById(ctx.content, mapId);
  const town = (ctx.content.markets ?? []).some((m) => m.mapIds?.includes(mapId));
  const outdoor = !!map && !map.indoor;
  return { outdoor, wild: outdoor && !town, town };
}
