// The few direct writes combat makes on world entities. The world system exposes no
// ports yet for life state, combat-owned tags (implementation_conventions.md 5 makes
// the spawning and combat systems responsible for lvl:, tier:, hostile), crowd-control
// movement locks, or speed under slows. Keeping them in this one file lets the
// integrator swap them for world ports without touching the combat rules.

import type { Entity } from '../world/types';

export function setAlive(e: Entity, alive: boolean): void {
  e.alive = alive;
  if (!alive) {
    e.move = null;
    e.intent = null;
  }
}

/** Replace every `${prefix}:*` tag with `${prefix}:${value}`. */
export function setValueTag(e: Entity, prefix: string, value: string | number): void {
  const head = `${prefix}:`;
  const next = e.tags.filter((t) => !t.startsWith(head));
  next.push(`${head}${value}`);
  e.tags = next;
}

export function setTag(e: Entity, tag: string, on: boolean): void {
  const has = e.tags.includes(tag);
  if (on && !has) e.tags = [...e.tags, tag];
  else if (!on && has) e.tags = e.tags.filter((t) => t !== tag);
}

export function halt(e: Entity): void {
  e.move = null;
  e.intent = null;
}

export function setSpeed(e: Entity, speed: number): void {
  e.speed = Math.max(0, speed);
}

export function tagValue(e: Entity, prefix: string): string | undefined {
  const head = `${prefix}:`;
  const t = e.tags.find((x) => x.startsWith(head));
  return t ? t.slice(head.length) : undefined;
}
