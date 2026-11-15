// Party window view: each companion's frame, order, bond and the next bond threshold.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { unitView } from '../combat';
import type { UnitView } from '../combat/queries';
import type { PartyOrder } from './types';

const THRESHOLDS = [20, 40, 60, 80, 100];

export const ORDER_NAMES: Record<PartyOrder, string> = {
  follow: '跟随',
  assist: '协助',
  passive: '被动',
  stay: '原地',
};

export interface CompanionView {
  id: string;
  name: string;
  title: string;
  classId: string;
  className: string;
  role: string;
  personality: string[];
  order: PartyOrder;
  orderName: string;
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
      orderName: ORDER_NAMES[m.order],
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
