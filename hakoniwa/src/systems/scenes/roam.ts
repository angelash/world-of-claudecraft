// Roam nodes (onboarding_interaction.md 5): a scene node whose choices are touch points on a
// stage map. While one is open the run waits in 'roam': the kernel keeps time, the player
// walks about, and `scenes.choose` takes a touch point only within ROAM_REACH tiles of its
// location (a choice without `at` is an action usable anywhere). Standing choices are never
// picked by hand: when the node's timed choice runs out while the player stands inside one's
// location, the first such choice is taken instead (the prologue's eavesdropping stance, P5).
// Everything here reads positions and flags only, so replays agree.

import type { ContentMap } from '../../core/contracts';
import type { TextParam } from '../../core/text';
import type { World } from '../../core/world';
import { evaluate } from '../quests/conditions';
import { worldResolver } from '../quests/effects';
import { playerEntity } from '../world';
import type { LocationDef } from '../world/types';
import type { SceneChoice, SceneDef, SceneNode, SceneRun } from './types';

/** How far outside a touch point's location (in tiles) the interact key still reaches it. */
export const ROAM_REACH = 2;

type Pos = { mapId: string; x: number; y: number };

/** The location a roam choice stands at, on the node's roam map; undefined when it has none. */
export function roamLocation(
  content: Pick<ContentMap, 'maps'>,
  node: SceneNode,
  choice: SceneChoice,
): LocationDef | undefined {
  if (!node.roam || !choice.at) return undefined;
  const map = content.maps.find((m) => m.id === node.roam?.mapId);
  return map?.locations.find((l) => l.id === choice.at);
}

/** Whether a position lies inside a location grown by `margin` tiles on every side. */
export function insideLocation(loc: LocationDef, x: number, y: number, margin: number): boolean {
  return (
    x >= loc.x - margin &&
    x <= loc.x + loc.w + margin &&
    y >= loc.y - margin &&
    y <= loc.y + loc.h + margin
  );
}

function centre(loc: LocationDef): { x: number; y: number } {
  return { x: loc.x + loc.w / 2, y: loc.y + loc.h / 2 };
}

/**
 * Whether the player at `at` may pick this roam choice by hand: never a standing or hidden
 * choice (the timer takes those); an action without `at` anywhere on the roam map; a touch
 * point within ROAM_REACH.
 */
export function roamPickable(
  content: Pick<ContentMap, 'maps'>,
  node: SceneNode,
  choice: SceneChoice,
  at: Pos | undefined,
): boolean {
  if (!node.roam || choice.stand || choice.hidden) return false;
  if (!at || at.mapId !== node.roam.mapId) return false;
  if (!choice.at) return true;
  const loc = roamLocation(content, node, choice);
  return !!loc && insideLocation(loc, at.x, at.y, ROAM_REACH);
}

/**
 * The standing choice the player stands in when the node's timer runs out (in choice order),
 * or null. `open` are the node's open choices (conditions held, not used up).
 */
export function standingChoice(
  content: Pick<ContentMap, 'maps'>,
  node: SceneNode,
  open: readonly SceneChoice[],
  at: Pos | undefined,
): SceneChoice | null {
  if (!node.roam || !at || at.mapId !== node.roam.mapId) return null;
  for (const c of open) {
    if (!c.stand) continue;
    const loc = roamLocation(content, node, c);
    if (loc && insideLocation(loc, at.x, at.y, 0)) return c;
  }
  return null;
}

/** A touch point of the open roam node as the client and the autoplayer see it. */
export interface RoamPoint {
  id: string;
  label: TextParam;
  /** the location's centre; the player's own position for an action usable anywhere */
  x: number;
  y: number;
  /** the location id, '' for an action usable anywhere */
  location: string;
  /** tiles from the player to the location's centre (0 for an action usable anywhere) */
  distance: number;
  /** the interact key picks it now */
  inReach: boolean;
  /** a standing choice: shown as a place to stand, never picked by hand */
  stand: boolean;
  /** the node's timed choice (seconds left are in the run's timer) */
  timed: boolean;
}

/**
 * The open roam node's choices that the player can see: touch points nearest first, then the
 * actions usable anywhere (stable by id).
 */
export function roamPoints(
  world: World,
  content: ContentMap,
  aiEnabled = world.ai.mode !== 'off',
): RoamPoint[] {
  const run = world.slices.scenes.current;
  if (run?.waiting !== 'roam') return [];
  const node = roamNodeOf(content, run);
  if (!node?.roam) return [];
  const resolve = worldResolver(world, aiEnabled);
  const p = playerEntity(world);
  const at = p ? { mapId: p.mapId, x: p.x, y: p.y } : undefined;
  const out: RoamPoint[] = [];
  for (const c of node.choices ?? []) {
    if (!evaluate(c.when, resolve) || (c.once && run.picked.includes(c.id))) continue;
    if (c.hidden && !c.stand) continue;
    const loc = roamLocation(content, node, c);
    if (c.at && !loc) continue;
    const point = loc ? centre(loc) : { x: p?.x ?? 0, y: p?.y ?? 0 };
    out.push({
      id: c.id,
      label: c.label,
      x: point.x,
      y: point.y,
      location: loc?.id ?? '',
      distance: loc && p ? Math.hypot(point.x - p.x, point.y - p.y) : 0,
      inReach: roamPickable(content, node, c, at),
      stand: !!c.stand,
      timed: run.timed?.choice === c.id,
    });
  }
  // touch points nearest first; actions usable anywhere after them (the prompt falls back to one)
  const key = (r: RoamPoint) => (r.location ? r.distance : Number.POSITIVE_INFINITY);
  return out.sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id));
}

/**
 * The touch point the interact key takes now: the nearest one in reach, else an action usable
 * anywhere (roamPoints lists those last); null when nothing can be taken by hand.
 */
export function interactPoint(points: readonly RoamPoint[]): RoamPoint | null {
  return points.find((p) => p.inReach && !p.stand) ?? null;
}

/** The node a run stands at, when it is a roam node. */
function roamNodeOf(content: Pick<ContentMap, 'scenes'>, run: SceneRun): SceneNode | undefined {
  const scene = content.scenes.find((s) => s.id === run.sceneId);
  return scene?.nodes.find((n) => n.id === run.nodeId);
}

/**
 * Content problems of the roam nodes (onboarding_interaction.md 5.4): a roam node writes no
 * lines, names a known stage map, every `at` is a location on it, a standing choice has an
 * `at`, and the node has a timed choice, so a player who never finds a touch point (or stands
 * off the map) is still carried on.
 */
export function roamProblems(content: Pick<ContentMap, 'maps' | 'scenes'>): string[] {
  const out: string[] = [];
  for (const scene of content.scenes as SceneDef[]) {
    for (const node of scene.nodes) {
      if (!node.roam) continue;
      const where = `scene ${scene.id} node ${node.id}`;
      const map = content.maps.find((m) => m.id === node.roam?.mapId);
      if (!map) out.push(`${where}: roam map ${node.roam.mapId} is not a known map`);
      if (node.lines?.length) out.push(`${where}: a roam node writes no lines`);
      if (node.input || node.court) out.push(`${where}: a roam node takes no input or court`);
      const choices = node.choices ?? [];
      if (choices.length === 0) out.push(`${where}: a roam node needs touch points`);
      for (const c of choices) {
        if (c.stand && !c.at) out.push(`${where} choice ${c.id}: a standing choice needs at`);
        if (c.at && map && !map.locations.some((l) => l.id === c.at))
          out.push(`${where} choice ${c.id}: location ${c.at} is not on ${map.id}`);
      }
      if (!choices.some((c) => c.timeout !== undefined))
        out.push(`${where}: no timed choice (a roam node must carry the player on by itself)`);
    }
  }
  return out;
}
