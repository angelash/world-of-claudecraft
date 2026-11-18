// Offerings and Merca's coin (catalog_goddess_interventions.md 9 and 10; prologue 4.9;
// act1_borderstone.md S09): an offering through her token is worth points by its tier
// (her first tier, things of Earth, counts double the first time and decays after the third),
// the coin terms of the prologue set the exchange rate, the points go to her ledger with
// the player (merca_ledger), and at most one return gift a game day goes out (cd_offering):
// a token blessing or a piece of her intel. A gift may run the ledger into debt down to the
// credit her valuation gave; a negative ledger draws interest every 30 days unless the coin
// was lent interest free, and a debt past the credit is overdue (her reaction rows 05 and
// 06). The first use of the coin lands the scripted act DB-A1-01 (her manifestation). Rules
// are data: data/goddess/offerings.json.

import { contentText } from '../../core/content_key';
import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { type KeyText, type TextParam, tr } from '../../core/text';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../core/time';
import { countItem, type ItemDef, itemDef, removeItem } from '../inventory';
import { evaluate, flagResolver } from '../quests/conditions';
import { sanitizeText } from '../quests/lore';
import { displayName, executeAct, toolsActive } from './actions';
import { beatEvent } from './beats';
import { advanceSchemes } from './brain/schemes';
import { offeringAccount } from './brain/state';
import { goddessByRole } from './roster';
import { recordIntervention } from './state';
import type { GoddessDef } from './types';

export interface OfferingTierDef {
  id: string;
  /** item tags that put an item in this tier (the first tier that matches wins) */
  tags: string[];
  /** fixed points */
  points?: number;
  /** points per gold of the item's value (1 gold = 10000 copper) */
  perGold?: number;
  /** cap on one item's points */
  max?: number;
  /** her novelty decay applies (catalog 9.1) */
  novelty?: boolean;
}

export interface OfferingRules {
  /** the goddess these rules price for (her card holds the offering role) */
  goddess: string;
  tiers: OfferingTierDef[];
  /** per-item overrides: the tier (and fixed points, else the tier's rule) */
  items: Record<string, { tier: string; points?: number }>;
  novelty: { first: number; plain: number; plainUntil: number; decay: number; floor: number };
  /** credit by her prologue valuation (p_merca_valuation) */
  credit: Record<string, number>;
  /** exchange rate by coin terms (p_coin_terms); first_free is 1 for the first offering */
  rates: Record<string, number>;
  interest: { days: number; rate: Record<string, number> };
  gifts: { want: 'blessing' | 'intel'; points: number; action?: string; days?: number }[];
}

/** Copper in one gold (economy_and_trade.md 1: 1 gold = 100 silver = 10000 copper). */
export const COPPER_PER_GOLD = 10000;

type OfferingContent = { offeringRules?: OfferingRules[] };

export function offeringRules(content: OfferingContent): OfferingRules | undefined {
  return content.offeringRules?.[0];
}

/** The tier of an item and its base points (before novelty and the exchange rate). */
export function offeringTier(
  rules: OfferingRules,
  item: Pick<ItemDef, 'id' | 'tags' | 'value'>,
): { tier: string; base: number; novelty: boolean } {
  const over = rules.items[item.id];
  const tags = item.tags ?? [];
  for (const t of rules.tiers) {
    if (over ? over.tier !== t.id : !t.tags.some((x) => tags.includes(x))) continue;
    if (over?.points !== undefined) return { tier: t.id, base: over.points, novelty: !!t.novelty };
    let base = t.points ?? (Math.max(0, item.value) / COPPER_PER_GOLD) * (t.perGold ?? 0);
    if (t.max !== undefined) base = Math.min(t.max, base);
    return { tier: t.id, base, novelty: !!t.novelty };
  }
  return { tier: 'none', base: 0, novelty: false };
}

/** Novelty factor of the n-th offering of one kind (n from 1; catalog 9.1). */
export function noveltyFactor(rules: OfferingRules, n: number): number {
  const v = rules.novelty;
  if (n <= 1) return v.first;
  if (n <= v.plainUntil) return v.plain;
  return Math.max(v.floor, v.plain * v.decay ** (n - v.plainUntil));
}

/** Merca's exchange rate by coin terms (prologue 4.9). */
export function offeringRate(
  rules: OfferingRules | undefined,
  terms: FlagValue | undefined,
  offeringsSoFar: number,
): number {
  if (terms === 'first_free' && offeringsSoFar === 0) return 1;
  if (typeof terms === 'string' && rules?.rates[terms] !== undefined) return rules.rates[terms];
  return offeringsSoFar === 0 ? 1 : 0.7;
}

/** The credit her valuation gave (catalog 9.3: wide 12, middling 6, tight 0). */
export function creditLimit(rules: OfferingRules | undefined, valuation: FlagValue | undefined) {
  return typeof valuation === 'string' ? (rules?.credit[valuation] ?? 0) : 0;
}

/** The ledger value (points, may be negative). */
export function ledger(ctx: {
  flag(key: string): FlagValue | undefined;
  world: SystemContext['world'];
}): number {
  const flag = Number(ctx.flag('merca_ledger') ?? 0);
  const exact = ctx.world.slices.goddess?.offerings?.exact;
  // the flag holds whole points (the registry's integer); the account keeps the fraction
  return exact !== undefined && Math.round(exact) === flag ? exact : flag;
}

function setLedger(ctx: SystemContext, v: number): void {
  const exact = Math.round(v * 100) / 100;
  offeringAccount(ctx.world.slices.goddess).exact = exact;
  ctx.setFlag('merca_ledger', Math.round(exact));
}

function speak(ctx: SystemContext, def: GoddessDef, text: TextParam): void {
  ctx.emit('dialogue.line', {
    speakerId: def.id,
    speakerName: displayName(ctx, def),
    text: typeof text === 'string' ? sanitizeText(text, ctx.world, ctx.content) : text,
    listenerId: ctx.world.slices.world.playerId,
    kind: 'divine',
  });
}

/** Hooks of the reaction table the offerings raise (wired by the goddess system). */
export interface OfferingHooks {
  react(
    ctx: SystemContext,
    event: 'player.offering' | 'player.coin_used' | 'debt.overdue' | 'debt.paid',
    goddess: string,
    facts: { tier_id?: string; first?: boolean; mapId?: string },
  ): void;
}

/**
 * The coin was used: the first-use act (DB-A1-01) lands, her reaction row reads the coin's
 * place, her scheme step advances. Returns how many scripted acts landed.
 */
export function coinUsed(ctx: SystemContext, merca: GoddessDef, hooks: OfferingHooks): number {
  const mapId = ctx.world.slices.world.entities[ctx.world.slices.world.playerId]?.mapId ?? '';
  const landed = beatEvent(ctx, 'coin_used');
  hooks.react(ctx, 'player.coin_used', merca.id, { mapId });
  advanceSchemes(ctx, merca.id, { on: 'coin_used' });
  return landed;
}

/** Validate the coin channel: the offering goddess is there and the player holds her token. */
function coinChannel(
  ctx: SystemContext,
): { merca: GoddessDef; coin: string } | { code: string; reason: KeyText } {
  const playerId = ctx.world.slices.world.playerId;
  const merca = goddessByRole(ctx.content, 'offering');
  const s = merca ? ctx.world.slices.goddess.goddesses[merca.id] : undefined;
  if (!merca || !s)
    return { code: 'no_goddess', reason: tr('sys.goddess.reject.no_goddess.offering') };
  if (!toolsActive(ctx, merca, s))
    return { code: 'inactive', reason: tr('sys.goddess.reject.inactive.offering') };
  const coin = merca.token ?? '';
  if (countItem(ctx.world, playerId, coin) <= 0)
    return {
      code: 'no_coin',
      reason: tr('sys.goddess.reject.no_coin', { goddess: contentText('goddesses', merca) }),
    };
  return { merca, coin };
}

/** goddess.coin: the player uses the coin to reach her (a greeting through the coin). */
export function useCoin(
  ctx: SystemContext,
  hooks: OfferingHooks,
  greet: (ctx: SystemContext, merca: GoddessDef) => TextParam | null,
): { code: string; reason: KeyText } | null {
  const ch = coinChannel(ctx);
  if ('code' in ch) return ch;
  // the first use lands her manifestation; after it the coin answers with her greeting
  if (coinUsed(ctx, ch.merca, hooks) === 0)
    speak(ctx, ch.merca, greet(ctx, ch.merca) ?? tr('sys.goddess.line.manifest'));
  return null;
}

/**
 * Validate and run an offering through the coin; returns an error or null. The offering is
 * taken even when no gift can go out today (it waits in her ledger).
 */
export function makeOffering(
  ctx: SystemContext,
  d: { itemId: string; want: 'blessing' | 'intel' },
  hooks: OfferingHooks,
): { code: string; reason: KeyText } | { gifted: boolean; noIntel?: boolean } {
  const ch = coinChannel(ctx);
  if ('code' in ch) return ch;
  const { merca, coin } = ch;
  const playerId = ctx.world.slices.world.playerId;
  if (d.itemId === coin) return { code: 'coin', reason: tr('sys.goddess.reject.coin') };
  const item = itemDef(ctx.content, d.itemId);
  if (!item) return { code: 'no_item', reason: tr('sys.goddess.reject.no_item') };
  if (countItem(ctx.world, playerId, d.itemId) <= 0)
    return { code: 'missing', reason: tr('sys.goddess.reject.missing') };
  const rules = offeringRules(ctx.content);
  const done = Number(ctx.flag('merca_offerings') ?? 0);
  const tier = rules ? offeringTier(rules, item) : { tier: 'none', base: 0, novelty: false };
  const seenKey = `offering_novelty.${item.id}`;
  const nth = Number(ctx.flag(seenKey) ?? 0) + 1;
  const novelty = rules && tier.novelty ? noveltyFactor(rules, nth) : 1;
  const points =
    Math.round(tier.base * novelty * offeringRate(rules, ctx.flag('p_coin_terms'), done) * 100) /
    100;
  // the coin is used: the first time she shows herself (DB-A1-01)
  coinUsed(ctx, merca, hooks);
  removeItem(ctx, playerId, d.itemId, 1, 'offering');
  ctx.setFlag('merca_offerings', done + 1);
  if (tier.novelty) ctx.setFlag(seenKey, nth);
  const before = ledger(ctx);
  setLedger(ctx, before + points);
  const mapId = ctx.world.slices.world.entities[playerId]?.mapId ?? '';
  hooks.react(ctx, 'player.offering', merca.id, { tier_id: tier.tier, first: nth === 1, mapId });
  const gift = giveGift(ctx, merca, rules, d.want);
  const gifted = gift === 'gifted';
  // her scheme reads the intel sale before the offering (catalog 5.3: 情报买卖 → 收受供品)
  advanceSchemes(ctx, merca.id, { on: 'offering' });
  recordIntervention(ctx, {
    goddess: merca.id,
    action: 'offering',
    mapId,
    power: 0,
    sediment: 0,
    public: false,
    breach: false,
    note:
      d.want === 'blessing'
        ? tr('sys.goddess.note.offering_blessing', { goddess: contentText('goddesses', merca) })
        : tr('sys.goddess.note.offering_intel', { goddess: contentText('goddesses', merca) }),
    seen: true,
    origin: 'offering',
  });
  settleDebt(ctx, merca, hooks);
  return gift === 'no_intel' ? { gifted, noIntel: true } : { gifted };
}

/**
 * The return gift of the day (catalog 9.2), if the ledger and the daily gift allow it: what
 * happened ('kept': the gift waits, already sent today, the ledger short or her act refused;
 * 'no_intel': she has no news to sell).
 */
function giveGift(
  ctx: SystemContext,
  merca: GoddessDef,
  rules: OfferingRules | undefined,
  want: 'blessing' | 'intel',
): 'gifted' | 'kept' | 'no_intel' {
  const acc = offeringAccount(ctx.world.slices.goddess);
  const day = calendarAt(ctx.tick).dayIndex;
  if (acc.day !== day) {
    acc.day = day;
    acc.gifted = [];
  }
  if (acc.gifted.includes(merca.id)) return 'kept';
  const gift = rules?.gifts.find((g) => g.want === want);
  const cost = gift?.points ?? 0;
  const credit = creditLimit(rules, ctx.flag('p_merca_valuation'));
  if (ledger(ctx) - cost < -credit) return 'kept';
  if (want === 'blessing') {
    // the gift is her token blessing (catalog 9.1: a gift is her own act, through the
    // arbiter, paid with her power)
    const s = ctx.world.slices.goddess.goddesses[merca.id];
    const playerMap = ctx.world.slices.world.entities[ctx.world.slices.world.playerId]?.mapId ?? '';
    const res = executeAct(
      ctx,
      {
        goddessId: merca.id,
        action: gift?.action ?? '',
        revision: s?.revision ?? 0,
        params: { mapId: playerMap, days: gift?.days ?? 3 },
        origin: 'offering',
      },
      { type: 'system', system: 'goddess' },
    );
    if (!res.ok) return 'kept';
  } else {
    const resolve = flagResolver(ctx.world.meta.flags);
    const intel = (ctx.content.mercaIntel ?? []).find(
      (i) => !ctx.flag(`intel.${merca.id}.${i.id}`) && evaluate(i.when, resolve),
    );
    // nothing to sell: she says so and keeps the points
    if (!intel) {
      speak(ctx, merca, tr('sys.goddess.line.no_intel'));
      return 'no_intel';
    }
    ctx.setFlag(`intel.${merca.id}.${intel.id}`, true);
    speak(ctx, merca, intel.text);
    advanceSchemes(ctx, merca.id, { on: 'intel' });
  }
  setLedger(ctx, ledger(ctx) - cost);
  acc.gifted.push(merca.id);
  return 'gifted';
}

/**
 * The daily ledger step: interest on a negative ledger every interest.days game days (none
 * when the coin was lent interest free), the overdue reaction while the debt is past the
 * credit, and the paid reaction when it clears.
 */
export function ledgerDay(ctx: SystemContext, hooks: OfferingHooks): void {
  const rules = offeringRules(ctx.content);
  const merca = goddessByRole(ctx.content, 'offering');
  if (!rules || !merca || ctx.flag('merca_ledger') === undefined) return;
  const acc = offeringAccount(ctx.world.slices.goddess);
  const v = ledger(ctx);
  if (v < 0) {
    if (acc.interestAt === 0) acc.interestAt = ctx.tick;
    if (ctx.tick - acc.interestAt >= rules.interest.days * TICKS_PER_GAME_DAY) {
      acc.interestAt = ctx.tick;
      const terms = ctx.flag('p_coin_terms');
      const rate = typeof terms === 'string' ? (rules.interest.rate[terms] ?? 0.1) : 0.1;
      if (rate > 0) setLedger(ctx, v - Math.max(1, Math.ceil(-v * rate)));
    }
  } else acc.interestAt = 0;
  settleDebt(ctx, merca, hooks);
}

/** Raise overdue while the debt is past the credit, paid once it clears. */
function settleDebt(ctx: SystemContext, merca: GoddessDef, hooks: OfferingHooks): void {
  const rules = offeringRules(ctx.content);
  const credit = creditLimit(rules, ctx.flag('p_merca_valuation'));
  const acc = offeringAccount(ctx.world.slices.goddess);
  const v = ledger(ctx);
  if (v < -credit) {
    acc.overdue = true;
    hooks.react(ctx, 'debt.overdue', merca.id, {});
  } else if (acc.overdue && v >= 0) {
    acc.overdue = false;
    hooks.react(ctx, 'debt.paid', merca.id, {});
  }
}
