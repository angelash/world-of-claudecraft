// The party order ring, `ui_hud_wheel` (ux_and_onboarding.md 16.5, 5.2): the whole party's
// orders, a "single order" sector that asks whom to order, the members ring, and a ring for
// one companion (opened from that companion's party frame, or picked from the members ring).
// The orders are the ones the party system takes (`party.order`: follow, assist, passive,
// stay). A ring's target says whom it acts for: none is the whole party, PARTY_MEMBERS is the
// "whom" ring, any other value is a companion id. Picking answers either an order (with the
// companion, when the ring had one) or the next ring to open. Pure: labels come from the
// string tables, the members from the caller.

import { contentKey } from '../../core/content_key';
import { t, tOr } from '../../shared_ui/i18n';
import type { RingSector } from './radial';

/** The orders of the party ring, in sector order (16.5: the party system's own set). */
export const PARTY_RING_ORDERS = ['follow', 'assist', 'passive', 'stay'] as const;
export type PartyRingOrder = (typeof PARTY_RING_ORDERS)[number];

/** The sector that turns the whole-party ring into "whom do you order". */
export const PARTY_SINGLE = 'party:single';
/** The target of the "whom" ring (its sectors are the members). */
export const PARTY_MEMBERS = 'party:members';

export interface PartyRingMember {
  id: string;
  /** the display name, already in the interface language */
  name: string;
}

/**
 * The ring's members from the party view's companions: each named through the content table
 * (`c.companions.<id>.name`, so the name follows the language), the view's name as fallback.
 */
export function partyRingMembers(
  companions: readonly { id: string; name: string }[],
): PartyRingMember[] {
  return companions.map((c) => ({
    id: c.id,
    name: tOr(contentKey('companions', c.id, 'name'), c.name || c.id),
  }));
}

export function isPartyRingOrder(v: string): v is PartyRingOrder {
  return (PARTY_RING_ORDERS as readonly string[]).includes(v);
}

function orderSectors(): RingSector[] {
  return PARTY_RING_ORDERS.map((o) => ({ id: o, label: t(`sys.party.order.${o}`) }));
}

/**
 * The sectors of a party ring: empty when there is nobody to order (the ring does not open,
 * 16.5) or the target is not in the party any more.
 */
export function partyRingSectors(
  members: readonly PartyRingMember[],
  target?: string,
): RingSector[] {
  if (members.length === 0) return [];
  if (target === PARTY_MEMBERS) return members.map((m) => ({ id: m.id, label: m.name }));
  if (target !== undefined) return members.some((m) => m.id === target) ? orderSectors() : [];
  // one companion: the whole party is that companion, no "whom" step
  const out = orderSectors();
  if (members.length > 1) out.push({ id: PARTY_SINGLE, label: t('ui.hud.wheel.party.single') });
  return out;
}

/** The title of a party ring opened for a target; undefined keeps the ring's own title. */
export function partyRingTitle(
  members: readonly PartyRingMember[],
  target?: string,
): string | undefined {
  if (target === undefined) return undefined;
  if (target === PARTY_MEMBERS) return t('ui.hud.wheel.party.pick_member');
  const m = members.find((x) => x.id === target);
  return m ? t('ui.hud.wheel.party.orders_for', { name: m.name }) : undefined;
}

export type PartyRingPick =
  | { type: 'order'; order: PartyRingOrder; companionId?: string }
  | { type: 'next'; target: string }
  | { type: 'none' };

/** What picking sector `id` of a party ring with `target` does. */
export function partyRingPick(
  members: readonly PartyRingMember[],
  id: string,
  target?: string,
): PartyRingPick {
  if (target === PARTY_MEMBERS) {
    return members.some((m) => m.id === id) ? { type: 'next', target: id } : { type: 'none' };
  }
  if (target === undefined && id === PARTY_SINGLE) {
    return members.length > 1 ? { type: 'next', target: PARTY_MEMBERS } : { type: 'none' };
  }
  if (!isPartyRingOrder(id)) return { type: 'none' };
  if (target === undefined) return { type: 'order', order: id };
  return members.some((m) => m.id === target)
    ? { type: 'order', order: id, companionId: target }
    : { type: 'none' };
}
