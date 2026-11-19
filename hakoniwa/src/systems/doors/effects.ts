// Door effects on the player: abilities, stat bonuses, resource pools and passives go
// through the combat ports keyed by the door id (so closing a door revokes exactly what
// it gave); features and flags go through world flags; items through the inventory port;
// a `door` effect opens another door as a gift (thousand_doors.md 14, the hearth past
// life). What a door gave of its abilities, features and gift doors is noted in the slice
// (`granted`), so the catch-up can give an opened door the effects a save from before its
// data lacks (PK-M1-26's abyss summon, the past-life readers of PK-M1-56), once each.

import type { SystemContext } from '../../core/system';
import {
  addPassive,
  grantAbility,
  grantPool,
  removePassives,
  revokeAbility,
  revokePools,
  setBonus,
  unitOf,
} from '../combat';
import { addItem } from '../inventory';
import { setState } from './state';
import type { DoorDef, DoorEffect } from './types';

function playerId(ctx: SystemContext): string {
  return ctx.world.slices.world.playerId;
}

/** Note that a door gave `what` (`ability:<id>`, `feature:<name>`, `door:<id>`). */
function noteGiven(ctx: SystemContext, doorId: string, what: string): void {
  const slice = ctx.world.slices.doors;
  if (!slice) return;
  const list = slice.granted?.[doorId] ?? [];
  if (list.includes(what)) return;
  slice.granted ??= {};
  slice.granted[doorId] = [...list, what];
}

function grantNoted(ctx: SystemContext, doorId: string, ability: string): void {
  if (grantAbility(ctx, playerId(ctx), ability)) noteGiven(ctx, doorId, `ability:${ability}`);
}

function unlockFeature(ctx: SystemContext, doorId: string, feature: string): void {
  if (!ctx.flag(`feature.${feature}`)) {
    ctx.setFlag(`feature.${feature}`, true);
    ctx.emit('feature.unlocked', { feature });
  }
  noteGiven(ctx, doorId, `feature:${feature}`);
}

export function applyDoorEffects(ctx: SystemContext, door: DoorDef): void {
  const pid = playerId(ctx);
  const source = `door:${door.id}`;
  for (const f of door.effects) {
    switch (f.type) {
      case 'abilities':
        for (const a of f.abilities) grantNoted(ctx, door.id, a);
        break;
      case 'stats':
        setBonus(ctx, pid, source, f.stats);
        break;
      case 'pool':
        grantPool(ctx, pid, source, f.resource, f.base);
        break;
      case 'passive':
        addPassive(ctx, pid, f.aura, source);
        break;
      case 'feature':
        unlockFeature(ctx, door.id, f.feature);
        break;
      case 'flag':
        ctx.setFlag(f.key, f.value);
        break;
      case 'item':
        addItem(ctx, pid, f.itemId, f.count ?? 1, `door:${door.id}`);
        if (f.equip)
          ctx.dispatch(
            'inventory.equip',
            { ownerId: pid, itemId: f.itemId },
            { type: 'system', system: 'doors' },
          );
        break;
      case 'door':
        giftDoor(ctx, f.doorId, door.id);
        noteGiven(ctx, door.id, `door:${f.doorId}`);
        break;
    }
  }
}

/**
 * Open `doorId` as a gift of `giverId` (thousand_doors.md 14, last line): its effects, its
 * flag, the opened state and the fact; no rank value, no seal, no door count and no
 * exclusion. A door already opened, locked or closed is left alone; the state is set
 * before the effects, so even a cycle the validator would refuse ends at once.
 */
function giftDoor(ctx: SystemContext, doorId: string, giverId: string): void {
  const target = (ctx.content.doors ?? []).find((d) => d.id === doorId);
  const rt = ctx.world.slices.doors?.doors[doorId];
  if (!target || !rt || doorId === giverId) return;
  if (rt.state === 'opened' || rt.state === 'locked' || rt.state === 'closed') return;
  setState(ctx, doorId, 'opened');
  rt.openedTick = ctx.tick;
  ctx.setFlag(`door.${doorId}`, true);
  applyDoorEffects(ctx, target);
  ctx.emit('door.opened', { doorId, sealDelta: 0 });
}

/** The effect parts the catch-up gives, as noted in `granted`. */
function catchable(f: DoorEffect): string[] {
  if (f.type === 'abilities') return f.abilities.map((a) => `ability:${a}`);
  if (f.type === 'feature') return [`feature:${f.feature}`];
  if (f.type === 'door') return [`door:${f.doorId}`];
  return [];
}

/**
 * Give every opened door the abilities, features and gift doors it has not given yet (a
 * save from before the door's data named them): whatever is noted in `granted` is never
 * given again, so a power taken away later (a jam, a story) stays away. Stats, pools and
 * passives are keyed by the door and rebuilt by the combat system; items and flags are
 * not caught up (an item may have been sold or used up). A fresh game noted everything at
 * the opening, so the catch-up finds nothing. Returns how many parts it went through.
 */
export function catchUpDoors(ctx: SystemContext): number {
  const slice = ctx.world.slices.doors;
  const unit = unitOf(ctx.world, playerId(ctx));
  if (!slice) return 0;
  let given = 0;
  for (const door of ctx.content.doors ?? []) {
    if (slice.doors[door.id]?.state !== 'opened') continue;
    for (const f of door.effects) {
      for (const part of catchable(f)) {
        if (slice.granted?.[door.id]?.includes(part)) continue;
        const cut = part.indexOf(':');
        const kind = part.slice(0, cut);
        const id = part.slice(cut + 1);
        if (kind === 'ability') {
          // no unit yet (a door that opened before the body): try again on the next pass
          if (!unit) continue;
          grantNoted(ctx, door.id, id);
        } else if (kind === 'feature') unlockFeature(ctx, door.id, id);
        else {
          giftDoor(ctx, id, door.id);
          noteGiven(ctx, door.id, part);
        }
        given++;
      }
    }
  }
  return given;
}

/** Closing a door takes back its powers (items given stay; flags other than features stay). */
export function revertDoorEffects(ctx: SystemContext, door: DoorDef): void {
  const pid = playerId(ctx);
  const source = `door:${door.id}`;
  for (const f of door.effects) {
    switch (f.type) {
      case 'abilities':
        for (const a of f.abilities) revokeAbility(ctx, pid, a);
        break;
      case 'stats':
        setBonus(ctx, pid, source, null);
        break;
      case 'pool':
        revokePools(ctx, pid, source);
        break;
      case 'passive':
        removePassives(ctx, pid, source);
        break;
      case 'feature':
        ctx.setFlag(`feature.${f.feature}`, false);
        break;
      default:
        break;
    }
  }
  // a closed door gives nothing any more: its notes go with it
  if (ctx.world.slices.doors?.granted?.[door.id]) delete ctx.world.slices.doors.granted[door.id];
}
