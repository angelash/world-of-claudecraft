// Implements the model of `ui_hud_coin`, Merca's coin badge (ux_and_onboarding.md 5.2): she
// only senses where the player is while the coin is in use (D-028), so the badge is absent at
// every other moment. Using the coin (a prayer, a trade, speaking her honorific) flips it
// alight at the bottom right for 1.5 s; clicking it opens `ui_pop_offer`. With reduce
// flashing on (18.8) the glow is a static outline for the same span instead of a flip.
// Pure; the caller passes the clock (ms) and the setting. Node-tested.

import { t } from '../../shared_ui/i18n';

/** How long the badge shows after the coin is used (5.2: the coin turns for 1.5 s). */
export const COIN_SHOW_MS = 1500;

export interface CoinBadgeRow {
  /** the badge is on screen */
  shown: boolean;
  /** play the flip, else hold a static outline (reduce flashing) */
  spin: boolean;
  label: string;
  /** reader and hover text: what clicking it opens */
  title: string;
}

export interface CoinBadgeInput {
  /** ms clock the caller reads once per frame */
  now: number;
  /** when the coin was last used (ms on the same clock), null when it has not been */
  usedAt: number | null;
  /** the player holds her token at all (GoddessAdapter.canOffer) */
  holdsCoin: boolean;
  reduceFlashing: boolean;
}

/** The badge row, or null when nothing shows (the usual case). */
export function coinBadgeModel(i: CoinBadgeInput): CoinBadgeRow | null {
  if (!i.holdsCoin || i.usedAt === null) return null;
  if (i.now - i.usedAt >= COIN_SHOW_MS || i.now < i.usedAt) return null;
  return {
    shown: true,
    spin: !i.reduceFlashing,
    label: t('ui.hud.coin.label'),
    title: t('ui.hud.coin.open'),
  };
}

/**
 * Whether an event means the coin was used: the coin command came back accepted. The command
 * is `goddess.coin` and the kernel answers every player command with `command.result`
 * (core/contracts.ts), so the badge needs no new kernel field.
 */
export function coinUsedByEvent(ev: { kind: string; data: unknown }): boolean {
  if (ev.kind !== 'command.result') return false;
  const d = ev.data as { kind?: string; ok?: boolean } | undefined;
  return d?.kind === 'goddess.coin' && d.ok === true;
}

/** The coin command the badge's action queues (no payload). */
export function coinCommand(): { kind: 'goddess.coin'; data: Record<string, never> } {
  return { kind: 'goddess.coin', data: {} };
}
