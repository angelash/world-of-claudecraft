// Implements the model of `ui_pop_offer`, Merca's account and the offering (ux_and_onboarding.md
// 6.4; goddess_gm.md 10.2): the state of the account between you as words, never the number
// her ledger keeps (UX-3); the offerings and her answers so far (each exchange's receipt, in
// her voice; a refused exchange shows its receipt the same way); and the offering form: one
// held item (never the coin itself) and what to ask for, a blessing or news. Without the coin
// the form is greyed and says why (6.2.12 T.goddess.noCoin). Pure; Node-tested.

import { contentKey } from '../../core/content_key';
import { type TextParam, t, tOr } from '../../shared_ui/i18n';
import type { EquipSlot, ItemDef, ItemKind } from '../../systems/inventory';

export type OfferWant = 'blessing' | 'intel';

/**
 * Kinds the form never lists. The kernel takes any held item but her coin (`makeOffering`,
 * src/systems/goddess/offerings.ts: the coin, an unknown item and an item not held are its
 * only refusals) and consumes one, so a key, a piece of evidence or a book would be lost for
 * nothing her tiers price: the form keeps them out (UX-9: no silent loss).
 */
export const NEVER_OFFERED: ReadonlySet<ItemKind> = new Set(['key', 'evidence', 'lore']);

/**
 * The items the form may offer: held, known to the content, not her coin, not a kept kind,
 * and not the last of a kind the player is wearing (the kernel would take the worn piece).
 * Names go through the content key. Sorted by id, so the select keeps its order.
 */
export function offerableItems(
  items: Readonly<Record<string, number>>,
  itemDef: (id: string) => ItemDef | undefined,
  coinItem: string | null,
  equipped: Readonly<Partial<Record<EquipSlot, string>>> = {},
): { id: string; name: string; count: number }[] {
  const worn = new Map<string, number>();
  for (const id of Object.values(equipped)) if (id) worn.set(id, (worn.get(id) ?? 0) + 1);
  const out: { id: string; name: string; count: number }[] = [];
  for (const id of Object.keys(items).sort()) {
    const def = itemDef(id);
    if (!def || id === coinItem || NEVER_OFFERED.has(def.kind)) continue;
    const count = (items[id] ?? 0) - (worn.get(id) ?? 0);
    if (count <= 0) continue;
    out.push({ id, name: tOr(contentKey('items', id, 'name'), def.name), count });
  }
  return out;
}

/** Receipts kept in the popup (newest first). */
export const RECEIPTS_KEPT = 8;

export interface OfferReceipt {
  /** the exchange went through (a kept gift is still an accepted offering) */
  ok: boolean;
  text: string;
}

export interface OfferPopInput {
  holdsCoin: boolean;
  /** her token's item id: never offered back to her */
  coinItem: string | null;
  /** what the player holds: item id, display name, count */
  items: readonly { id: string; name: string; count: number }[];
  /** her ledger as the kernel mirrors it (`merca_ledger`), null when it is not set */
  ledger: number | null;
  receipts: readonly OfferReceipt[];
}

export interface OfferPopModel {
  title: string;
  /** the account between you, in words */
  account: string;
  receipts: OfferReceipt[];
  /** an empty-history line when there are no receipts yet ('' otherwise) */
  historyEmpty: string;
  options: { id: string; label: string }[];
  /** the form can be sent */
  canOffer: boolean;
  /** why the form is greyed ('' when it is not) */
  blocked: string;
  wants: { id: OfferWant; label: string }[];
}

/** The account in words: she owes you, you are square, or you owe her (never the points). */
export function accountText(ledger: number | null): string {
  if (ledger === null || ledger === 0) return t('ui.pop.offer.account.square');
  return ledger > 0 ? t('ui.pop.offer.account.credit') : t('ui.pop.offer.account.debt');
}

export function offerPopModel(i: OfferPopInput): OfferPopModel {
  const options = i.items
    .filter((it) => it.count > 0 && it.id !== i.coinItem)
    .map((it) => ({ id: it.id, label: t('ui.pop.offer.item', { name: it.name, n: it.count }) }));
  const blocked = !i.holdsCoin
    ? t('ui.pop.offer.no_coin')
    : options.length === 0
      ? t('ui.pop.offer.nothing')
      : '';
  return {
    title: t('ui.pop.offer.title'),
    account: accountText(i.ledger),
    receipts: i.receipts.slice(0, RECEIPTS_KEPT).map((r) => ({ ...r })),
    historyEmpty: i.receipts.length === 0 ? t('ui.pop.offer.history_empty') : '',
    options,
    canOffer: blocked === '',
    blocked,
    wants: [
      { id: 'blessing', label: t('ui.pop.offer.want.blessing') },
      { id: 'intel', label: t('ui.pop.offer.want.intel') },
    ],
  };
}

/**
 * The receipt of an offering from the kernel's answer to `goddess.offer` (`command.result`:
 * the note of an accepted exchange or the reason of a refused one, both in her terms), or null
 * for any other event.
 */
export function offerReceipt(ev: { kind: string; data: unknown }): OfferReceipt | null {
  if (ev.kind !== 'command.result') return null;
  const d = ev.data as { kind?: string; ok?: boolean; reason?: TextParam } | undefined;
  if (d?.kind !== 'goddess.offer') return null;
  const text = d.reason !== undefined ? t(d.reason) : '';
  return {
    ok: d.ok === true,
    text: text || t(d.ok ? 'ui.pop.offer.done' : 'ui.pop.offer.refused'),
  };
}

/** Keep a new receipt first, the list capped. */
export function pushReceipt(list: readonly OfferReceipt[], r: OfferReceipt): OfferReceipt[] {
  return [r, ...list].slice(0, RECEIPTS_KEPT);
}
