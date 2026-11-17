// The smith's repair service (catalog_equipment.md 2.7; implementation_conventions.md 6.5):
// a person whose entity carries the `smith` tag offers "repair" in conversation when the
// player carries damaged gear they can mend, with the price in the hint; choosing it
// repairs everything that smith may repair, worn pieces first, from the player's purse.
// Until crafting skills arrive (PK-M1-49) a smith counts as an ordinary one: common and
// uncommon pieces, plus any piece of their own making.

import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { distance, getEntity } from '../world';
import { damagedInstances, type RepairFailure, repairInstance } from './durability';
import { canRepair, repairQuote, type Smith } from './rules';
import type { ItemInstance } from './types';

/** Entity tags that offer a service (a closed vocabulary of tags, not content ids). */
export const SERVICE_TAGS = ['smith'] as const;
export const REPAIR_OPTION = 'repair';
/** How close the owner must stand to a smith to hand pieces over (tiles). */
export const SMITH_REACH = 4;

type WorldArg = Parameters<typeof getEntity>[0];

/** The smith an entity is, or undefined when it offers no repairs. */
export function smithOf(ctx: SystemContext, npcId: string): Smith | undefined {
  const e = getEntity(ctx.world as unknown as WorldArg, npcId);
  if (!e?.tags.includes(SERVICE_TAGS[0])) return undefined;
  return { skill: 0, id: e.ref ?? npcId };
}

/** Whether the owner stands within reach of the smith (same map). */
export function nearSmith(ctx: SystemContext, ownerId: string, npcId: string): boolean {
  const w = ctx.world as unknown as WorldArg;
  const a = getEntity(w, ownerId);
  const b = getEntity(w, npcId);
  return !!a && !!b && a.mapId === b.mapId && distance(a, b) <= SMITH_REACH;
}

/** The damaged pieces of an owner the smith may mend (worn first). */
export function repairable(ctx: SystemContext, ownerId: string, smith: Smith): ItemInstance[] {
  return damagedInstances(ctx, ownerId).filter((inst) => {
    const def = ctx.content.items.find((i) => i.id === inst.defId);
    return !!def && canRepair(def, inst, smith);
  });
}

/** What the smith would charge for every piece they may mend. */
export function repairPrice(ctx: SystemContext, ownerId: string, smith: Smith): number {
  let copper = 0;
  for (const inst of repairable(ctx, ownerId, smith)) {
    const def = ctx.content.items.find((i) => i.id === inst.defId);
    copper += def ? (repairQuote(def, inst)?.copper ?? 0) : 0;
  }
  return copper;
}

export interface RepairRun {
  repaired: number;
  copper: number;
  /** the first reason a piece was not mended */
  failure?: RepairFailure;
}

/**
 * Repair one instance, or every damaged one (worn first). Stops at the first piece the
 * payer cannot afford; pieces the smith may not mend are skipped.
 */
export function repairAll(
  ctx: SystemContext,
  ownerId: string,
  smith: Smith,
  payerId: string = ownerId,
  instanceId?: string,
): RepairRun {
  const targets = instanceId
    ? [instanceId]
    : damagedInstances(ctx, ownerId).map((i) => i.instanceId);
  const run: RepairRun = { repaired: 0, copper: 0 };
  if (targets.length === 0) return { ...run, failure: 'intact' };
  for (const id of targets) {
    const r = repairInstance(ctx, ownerId, id, smith, payerId);
    if (r.ok) {
      run.repaired++;
      run.copper += r.quote?.copper ?? 0;
      continue;
    }
    run.failure ??= r.failure;
    if (r.failure === 'money' || r.failure === 'material') break;
  }
  return run;
}

function say(ctx: SystemContext, npcId: string, text: ReturnType<typeof tr>): void {
  const npc = getEntity(ctx.world as unknown as WorldArg, npcId);
  ctx.emit('dialogue.line', {
    speakerId: npcId,
    speakerName: npc?.name ?? npcId,
    text,
    listenerId: ctx.world.slices.world.playerId,
    kind: 'say',
  });
}

/** `player.talked`: a smith offers repair when the player has something they may mend. */
export function offerRepair(ctx: SystemContext, npcId: string): void {
  const smith = smithOf(ctx, npcId);
  const player = ctx.world.slices.world?.playerId;
  if (!smith || !player) return;
  if (repairable(ctx, player, smith).length === 0) return;
  const copper = repairPrice(ctx, player, smith);
  ctx.emit('dialogue.options_offered', {
    npcId,
    system: 'inventory',
    options: [
      {
        id: REPAIR_OPTION,
        label: tr('sys.inventory.option.repair'),
        hint: tr('sys.inventory.option.repair_hint', { m: copper }),
      },
    ],
  });
}

/** `dialogue.option_chosen`: the smith mends what they may and says how it went. */
export function chooseRepair(ctx: SystemContext, npcId: string, optionId: string): void {
  if (optionId !== REPAIR_OPTION) return;
  const smith = smithOf(ctx, npcId);
  const player = ctx.world.slices.world?.playerId;
  if (!smith || !player) return;
  const run = repairAll(ctx, player, smith);
  if (run.repaired > 0) say(ctx, npcId, tr('sys.inventory.say.repaired', { m: run.copper }));
  else if (run.failure === 'money') say(ctx, npcId, tr('sys.inventory.say.no_money'));
  else say(ctx, npcId, tr('sys.inventory.say.cannot'));
}
