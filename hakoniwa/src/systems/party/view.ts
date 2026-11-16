// Party window view: each companion's frame, order, bond and the next bond threshold.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, tr } from '../../core/text';
import type { World } from '../../core/world';
import { unitView } from '../combat';
import type { UnitView } from '../combat/queries';
import type { PartyOrder } from './types';

const THRESHOLDS = [20, 40, 60, 80, 100];

/** Display name of a party order, as a fresh text key. */
export function orderName(order: PartyOrder): KeyText {
  return tr(`sys.party.order.${order}`);
}

export interface CompanionView {
  id: string;
  name: string;
  title: string;
  classId: string;
  className: string;
  role: string;
  personality: string[];
  order: PartyOrder;
  orderName: KeyText;
  bond: number;
  nextThreshold: number | null;
  downed: boolean;
  unit: UnitView | null;
}

export function partyView(world: World, content: ContentMap): CompanionView[] {
  const slice = world.slices.party;
  if (!slice) return [];
  const out: CompanionView[] = [];
  for (const id of Object.keys(slice.members).sort()) {
    const m = slice.members[id];
    const def = (content.companions ?? []).find((c) => c.id === id);
    if (!m || !def) continue;
    const unit = unitView(world, content, m.entityId);
    out.push({
      id,
      name: def.name,
      title: def.title,
      classId: def.classId,
      className: (content.classes ?? []).find((c) => c.id === def.classId)?.name ?? def.classId,
      role: def.role,
      personality: def.personality,
      order: m.order,
      orderName: orderName(m.order),
      bond: Math.floor(m.bond),
      nextThreshold: THRESHOLDS.find((t) => t > m.bond) ?? null,
      downed: !!unit && !unit.alive,
      unit,
    });
  }
  return out;
}

export function bondOf(world: World, companionId: string): number {
  return Math.floor(world.slices.party?.members[companionId]?.bond ?? 0);
}

export function isInParty(world: World, companionId: string): boolean {
  return !!world.slices.party?.members[companionId];
}
