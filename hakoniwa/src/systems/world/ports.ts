// World ports for the entity fields the world system owns: life, tags, movement orders
// and speed (release_engineering.md 13.1). Other systems never assign those Entity
// fields; they call these ports (combat: death and revival, its lvl:, tier: and hostile
// tags, crowd-control halts, aura slows). tests/architecture.test.ts guards the rule.
// The ports emit no events: the direct writes they replace never did, so behaviour and
// world hashes stay exactly as they were.

import type { SystemContext } from '../../core/system';
import type { Entity } from './types';

function entity(ctx: SystemContext, id: string): Entity | undefined {
  return ctx.world.slices.world.entities[id];
}

/** Mark an entity alive or dead; a dead entity drops its move order and intent. */
export function setLife(ctx: SystemContext, id: string, alive: boolean): boolean {
  const e = entity(ctx, id);
  if (!e) return false;
  e.alive = alive;
  if (!alive) {
    e.move = null;
    e.intent = null;
  }
  return true;
}

/** Replace every `${prefix}:*` tag with `${prefix}:${value}` (appended last). */
export function setTagValue(
  ctx: SystemContext,
  id: string,
  prefix: string,
  value: string | number,
): boolean {
  const e = entity(ctx, id);
  if (!e) return false;
  const head = `${prefix}:`;
  const next = e.tags.filter((t) => !t.startsWith(head));
  next.push(`${head}${value}`);
  e.tags = next;
  return true;
}

/** Add or remove a plain tag; the tag list is left untouched when nothing changes. */
export function setTag(ctx: SystemContext, id: string, tag: string, on: boolean): boolean {
  const e = entity(ctx, id);
  if (!e) return false;
  const has = e.tags.includes(tag);
  if (on && !has) e.tags = [...e.tags, tag];
  else if (!on && has) e.tags = e.tags.filter((t) => t !== tag);
  return true;
}

/** Stop an entity where it stands: clear its move order and its steering intent. */
export function haltEntity(ctx: SystemContext, id: string): boolean {
  const e = entity(ctx, id);
  if (!e) return false;
  e.move = null;
  e.intent = null;
  return true;
}

/** Set the walking speed in tiles per second; negative speeds clamp to 0. */
export function setMoveSpeed(ctx: SystemContext, id: string, speed: number): boolean {
  const e = entity(ctx, id);
  if (!e) return false;
  e.speed = Math.max(0, speed);
  return true;
}

/** The value part of the first `${prefix}:*` tag (the read side of setTagValue). */
export function tagValue(e: Entity, prefix: string): string | undefined {
  const head = `${prefix}:`;
  const t = e.tags.find((x) => x.startsWith(head));
  return t ? t.slice(head.length) : undefined;
}
