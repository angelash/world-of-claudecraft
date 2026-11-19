// The shapeshift door purifies a sediment spring (act1_borderstone.md 7.2 "借形之门开启后在
// 北泉净化：每次 -10（每周一次）"; PK-M1-51 routed it here). The spring, the variable it
// lowers, the amount, the floor, the week flag and the condition are data
// (data/doors/readers.json, `springPurify`); the gate is the door's feature flag. The
// command acts where the player stands; the offer query tells the interface whether the
// interaction shows at all and whether it would succeed now. Pure apart from the command.

import { type CommandResult, ok, reject } from '../../core';
import type { ContentMap, FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import type { World } from '../../core/world';
import { evaluate, flagResolver } from '../quests/conditions';
import { mapById, playerEntity } from '../world';
import { actNumber } from './keys';
import { doorReaders } from './readers';
import type { DoorReaders } from './types';

type Purify = NonNullable<DoorReaders['springPurify']>;

/** Why the purification cannot run now (a reject code), or null when it can. */
export type PurifyBlock = 'locked' | 'not_here' | 'not_now' | 'done' | 'clear';

function num(v: FlagValue | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** The configured spring the player stands inside, if any. */
function placeHere(
  world: World,
  content: ContentMap,
  cfg: Purify,
): { mapId: string; location: string } | null {
  const p = playerEntity(world);
  if (!p) return null;
  for (const place of cfg.places) {
    if (place.mapId !== p.mapId) continue;
    const l = mapById(content, place.mapId)?.locations.find((x) => x.id === place.location);
    if (l && p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h) return place;
  }
  return null;
}

/** The week key of the purification: `<act>:<week>`, or null before the first week. */
function weekKey(world: World, cfg: Purify): string | null {
  const week = num(world.meta.flags[cfg.weekFlag]);
  if (week === undefined || week < 1) return null;
  return `${actNumber(world.meta.flags.act)}:${week}`;
}

function blockOf(world: World, content: ContentMap, cfg: Purify): PurifyBlock | null {
  if (!world.meta.flags[`feature.${cfg.feature}`]) return 'locked';
  if (!placeHere(world, content, cfg)) return 'not_here';
  if (cfg.when && !evaluate(cfg.when, flagResolver(world.meta.flags))) return 'not_now';
  const week = weekKey(world, cfg);
  if (!week) return 'not_now';
  if (world.slices.doors?.purifiedWeek === week) return 'done';
  const cur = num(world.meta.flags[cfg.var]);
  if (cur === undefined || cur <= (cfg.min ?? 0)) return 'clear';
  return null;
}

/**
 * The purification as the interface offers it: null when the player lacks the door or
 * stands at no spring of the data (no interaction shows); else whether it would run now,
 * and the reason when it would not.
 */
export function purifyOffer(
  world: World,
  content: ContentMap,
): { mapId: string; location: string; ready: boolean; block: PurifyBlock | null } | null {
  const cfg = doorReaders(content).springPurify;
  if (!cfg || !world.meta.flags[`feature.${cfg.feature}`]) return null;
  const place = placeHere(world, content, cfg);
  if (!place) return null;
  const block = blockOf(world, content, cfg);
  return { ...place, ready: block === null, block };
}

const REJECT = {
  locked: () => tr('sys.doors.reject.purify_locked'),
  not_here: () => tr('sys.doors.reject.purify_not_here'),
  not_now: () => tr('sys.doors.reject.purify_not_now'),
  done: () => tr('sys.doors.reject.purify_done'),
  clear: () => tr('sys.doors.reject.purify_clear'),
} as const;

/** The `doors.purify` command: lower the spring's variable once this week. */
export function purifySpring(ctx: SystemContext): CommandResult {
  const cfg = doorReaders(ctx.content).springPurify;
  if (!cfg) return reject('locked', REJECT.locked());
  const block = blockOf(ctx.world, ctx.content, cfg);
  if (block) return reject(block, REJECT[block]());
  const place = placeHere(ctx.world, ctx.content, cfg);
  const week = weekKey(ctx.world, cfg);
  if (!place || !week) return reject('not_here', REJECT.not_here());
  const from = num(ctx.flag(cfg.var)) ?? 0;
  const to = Math.max(cfg.min ?? 0, from + cfg.amount);
  ctx.setFlag(cfg.var, to);
  ctx.world.slices.doors.purifiedWeek = week;
  ctx.emit('doors.purified', {
    mapId: place.mapId,
    location: place.location,
    var: cfg.var,
    from,
    to,
  });
  return ok(tr('sys.doors.info.purified'));
}
