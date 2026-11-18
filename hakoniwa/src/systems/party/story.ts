// What the story does to the roster (companions_and_party.md 2.1, 8.5, 9.1, 13): red lines
// (the bond drops once per line and the confrontation hook fires; a third sends a main
// companion cold, an escort companion away), story departures and returns (Shiya leaves
// with her family on the east-slope eviction unless her trust reached 70; she comes back
// in act 2, act1_borderstone.md 4.4), presence records the recruit conditions read, and the
// personal-line segments that lift the bond gates. Conditions are content (`when`, `back`)
// evaluated by the rules; nothing here names a person or a flag.

import type { SystemContext } from '../../core/system';
import { playerEntity } from '../world';
import { addBond } from './bond';
import { companionDef, holds, lineStage, partyConfig } from './config';
import { enterParty, leave, sortedMembers, standBy, stateOf } from './roster';
import type { CompanionDef, Member } from './types';

/** A red line's key: its hook and its condition (stable when the content is reordered). */
const lineKey = (hook: string, when: string) => `${hook}|${when}`;

/** Mark the red lines that already hold when a companion joins (the bond starts at 0). */
export function seenRedLines(ctx: SystemContext, def: CompanionDef, m: Member): void {
  for (const r of def.redLines ?? []) {
    const key = lineKey(r.hook, r.when);
    if (m.redSeen?.includes(key) || m.redLines?.includes(key) || !holds(ctx, r.when)) continue;
    if (!m.redSeen) m.redSeen = [];
    m.redSeen.push(key);
  }
}

/**
 * Cross every red line that newly holds (8.5): the bond drops once per line and the
 * confrontation hook fires; the third crossed line sends a main companion cold (it stays
 * cold wherever it is, resting or away, until the reconciliation) and an escort companion
 * away for good.
 */
export function checkRedLines(ctx: SystemContext, def: CompanionDef, m: Member): void {
  for (const r of def.redLines ?? []) {
    const key = lineKey(r.hook, r.when);
    if (m.redLines?.includes(key) || m.redSeen?.includes(key) || !holds(ctx, r.when)) continue;
    if (!m.redLines) m.redLines = [];
    m.redLines.push(key);
    addBond(ctx, m, r.delta, `red_line:${r.hook}`, 'story');
    const count = m.redLines.length;
    ctx.emit('party.red_line', { companionId: m.id, hook: r.hook, delta: r.delta, count });
    if (count < partyConfig(ctx.content).coldAfter) continue;
    if ((def.tier ?? 'main') === 'main') {
      m.cold = true;
      const s = stateOf(m);
      if (s === 'party' || s === 'waiting' || s === 'standby') standBy(ctx, m, 'cold');
    } else {
      leave(ctx, m.id);
      if (ctx.flag(`companion.${m.id}.recruited`))
        ctx.setFlag(`companion.${m.id}.recruited`, false);
      return;
    }
  }
}

/** Story departures (13): leave when a `when` holds; back once its `back` holds (once each). */
export function checkLeaves(ctx: SystemContext, def: CompanionDef, m: Member): void {
  const leaves = def.leaves ?? [];
  if (m.leftBy !== undefined) {
    const l = leaves.find((x) => x.when === m.leftBy);
    const back = l?.back ? holds(ctx, l.back.when) : !l || !holds(ctx, l.when);
    if (!back) return;
    if (!m.leavesDone) m.leavesDone = [];
    m.leavesDone.push(m.leftBy);
    delete m.leftBy;
    standBy(ctx, m, 'standby');
    enterParty(ctx, m);
    return;
  }
  const s = stateOf(m);
  if (s === 'spring' || s === 'dead' || s === 'away') return;
  const l = leaves.find((x) => !m.leavesDone?.includes(x.when) && holds(ctx, x.when));
  if (!l) return;
  m.leftBy = l.when;
  standBy(ctx, m, 'away');
}

/** Write the presence records whose condition just came to hold (2.1). */
export function checkPresence(ctx: SystemContext): void {
  const p = playerEntity(ctx.world);
  if (!p) return;
  for (const def of ctx.content.companions ?? []) {
    for (const pr of def.presence ?? []) {
      if (ctx.flag(pr.storeAs) || !holds(ctx, pr.when)) continue;
      const near = Object.values(ctx.world.slices.world.entities).some(
        (e) =>
          e.ref === def.id &&
          e.alive &&
          !e.hidden &&
          e.mapId === p.mapId &&
          Math.hypot(e.x - p.x, e.y - p.y) <= pr.range,
      );
      if (near) ctx.setFlag(pr.storeAs, true);
    }
  }
}

/** A personal-line segment is done (9.1): `pl.<id>` only rises; the bond change is the story's. */
export function completeSegment(ctx: SystemContext, id: string, stage: number, bond = 0): boolean {
  if (!companionDef(ctx.content, id) || !Number.isInteger(stage) || stage < 1 || stage > 5)
    return false;
  // a segment only counts once: the bond change comes with the first report of it
  if (stage <= lineStage(ctx.world, id)) return true;
  ctx.setFlag(`pl.${id}`, stage);
  const m = ctx.world.slices.party.members[id];
  if (m && bond !== 0) addBond(ctx, m, bond, `segment:${stage}`, 'story');
  ctx.emit('party.segment', { companionId: id, stage });
  return true;
}

/** After a flag change or a new day: red lines, departures and returns of every member. */
export function settleStory(ctx: SystemContext): void {
  for (const m of sortedMembers(ctx.world)) {
    const s = stateOf(m);
    if (m.temp || m.pet || s === 'spring' || s === 'dead') continue;
    const def = companionDef(ctx.content, m.id);
    if (!def) continue;
    if (def.redLines) checkRedLines(ctx, def, m);
    if (def.leaves && ctx.world.slices.party.members[m.id]) checkLeaves(ctx, def, m);
  }
}
