// Sediment exposure of the party and of named people (progression_and_pacing.md 9.1, 9.3;
// act1_borderstone.md 7.2). The ailments system tracks every body it holds; this module
// enrols the companions in the field and the named NPCs each game hour before the hour is
// sampled (the party's phase runs first), so their taint grows where they stand. Bodies
// carrying an immune tag (the door-marked children: "the sediment only warms the mark") are
// never enrolled and any taint on them is washed off. When a crystallised body's days run
// out (`ailments.crystal_due`): a companion leaves gravely hurt with its taint set to 50
// (dies under ironman, outside its protection); a named mortal dies.

import type { SystemContext } from '../../core/system';
import { calendarAt } from '../../core/time';
import { addTaint, ailmentsConfig, bodyOf, freshBody, readAilments, taintOf } from '../ailments';
import { getEntity, setLife } from '../world';
import type { Entity } from '../world/types';
import { partyConfig } from './config';
import { fieldMembers, sortedMembers } from './roster';
import { fall } from './wounds';

function immune(ctx: SystemContext, e: Entity): boolean {
  const tags = partyConfig(ctx.content).exposure.immuneTags;
  return e.tags.some((t) => tags.includes(t));
}

function named(ctx: SystemContext): Set<string> {
  return new Set((ctx.content.npcs ?? []).map((p) => p.id));
}

/** Enrol the bodies the party answers for, ahead of the ailments system's hour (world.hour). */
export function enrolBodies(ctx: SystemContext): void {
  const cfg = partyConfig(ctx.content).exposure;
  const ids: string[] = [];
  for (const m of fieldMembers(ctx.world)) if (!m.temp) ids.push(m.entityId);
  if (cfg.named) {
    const people = named(ctx);
    for (const id of Object.keys(ctx.world.slices.world.entities).sort()) {
      const e = ctx.world.slices.world.entities[id];
      if (e?.kind === 'npc' && e.ref && people.has(e.ref)) ids.push(id);
    }
  }
  // a companion back from the inn with a crystal older than its days: its end is due now
  const days = ailmentsConfig(ctx)?.crystalDays;
  const today = calendarAt(ctx.tick).dayIndex;
  for (const m of fieldMembers(ctx.world)) {
    const b = readAilments(ctx.world)?.bodies[m.entityId];
    if (!m.temp && days !== undefined && b?.stage === 'crystal' && today - b.since > days)
      onCrystalDue(ctx, m.entityId);
  }
  for (const id of ids) {
    const e = getEntity(ctx.world, id);
    if (!e?.alive) continue;
    if (immune(ctx, e)) {
      const t = taintOf(ctx.world, id);
      if (t > 0) addTaint(ctx, id, -t);
      continue;
    }
    bodyOf(ctx.world, id);
  }
}

/** A crystallised body's days ran out (`ailments.crystal_due`). */
export function onCrystalDue(ctx: SystemContext, entityId: string): void {
  const cfg = partyConfig(ctx.content).exposure;
  const m = sortedMembers(ctx.world).find((x) => x.entityId === entityId && !x.temp);
  if (m) {
    fall(ctx, m, 'crystal');
    // the crystal is cut out while resting; the taint stays at 50 (progression 9.3)
    if (m.state === 'resting') m.body = { ...freshBody(), taint: cfg.crystalTaint };
    return;
  }
  const e = getEntity(ctx.world, entityId);
  if (!e?.alive || e.kind !== 'npc' || !e.ref || !named(ctx).has(e.ref)) return;
  setLife(ctx, entityId, false);
  ctx.emit('entity.died', {
    id: entityId,
    name: e.name,
    ref: e.ref,
    kind: e.kind,
    mapId: e.mapId,
    x: e.x,
    y: e.y,
  });
}
