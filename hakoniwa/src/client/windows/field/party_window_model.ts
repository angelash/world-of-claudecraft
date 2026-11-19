// Implements the model of `ui_win_party` (ux_and_onboarding.md 6.2.7) with PK-M1-15's
// additions: the whole roster (`rosterView`: walking along, standing by, waiting at a gate,
// resting with the days left, away, cold, dead), each walking companion's stance among the
// four orders the party ring also offers, bond and the next bond step, the bond gate, and the
// ironman switch (one way: turning it off asks for a confirm and can never be undone, 11.4;
// 6.4 lists it among the irreversible confirms). Names come through the companion's content
// key; the companion's title is left out (Yeyu's carries the messenger, a later reveal: 6.3.5,
// reveal_ledger.md), and the class and the combat role render through text keys, never the raw
// data strings. Pure; Node-tested. The painter is ./party_window.ts.

import { contentKey } from '../../../core/content_key';
import { TICKS_PER_GAME_DAY } from '../../../core/time';
import { t, tOr } from '../../../shared_ui/i18n';
import type { MemberState, PartyOrder } from '../../../systems/party/types';
import type { CompanionView } from '../../../systems/party/view';

/** The four stances of the window and the party ring (16.5). */
export const PARTY_ORDERS: readonly PartyOrder[] = ['follow', 'assist', 'passive', 'stay'];

/** Roster groups in display order: who walks with you first, the dead last. */
export const ROSTER_GROUPS = ['along', 'standby', 'resting', 'away', 'dead'] as const;
export type RosterGroup = (typeof ROSTER_GROUPS)[number];

export function rosterGroup(state: MemberState): RosterGroup {
  switch (state) {
    case 'party':
    case 'waiting':
      return 'along';
    case 'standby':
      return 'standby';
    case 'resting':
    case 'spring':
      return 'resting';
    case 'dead':
      return 'dead';
    default:
      return 'away';
  }
}

export interface CompanionRow {
  id: string;
  name: string;
  /** class and combat role (never the title: it can carry a later reveal) */
  sub: string;
  state: string;
  /** days of rest left while resting, '' otherwise */
  rest: string;
  /** bond and the next bond step */
  bond: string;
  /** the bond gate when gated, '' otherwise */
  gate: string;
  hp: { value: number; max: number; text: string } | null;
  downed: boolean;
  /** the stance buttons (only for a companion walking with you) */
  orders: { order: PartyOrder; label: string; active: boolean }[];
  /** wait here or come along (waiting at a gate outside a dungeon) */
  wait: { on: boolean; label: string } | null;
}

export interface PartyWindowModel {
  groups: { group: RosterGroup; label: string; rows: CompanionRow[] }[];
  /** the "everyone" order row shows when anyone walks along */
  allOrders: { order: PartyOrder; label: string }[];
  /** the ironman line; null in a run that never had the switch */
  ironman: { on: boolean; text: string; canTurnOff: boolean; confirm: string } | null;
  empty: boolean;
}

export interface PartyModelInput {
  roster: readonly CompanionView[];
  ironman: 'on' | 'off' | null;
  tick: number;
}

/** The companion's display name through its content key, the record's name as fallback. */
export function companionName(c: Pick<CompanionView, 'id' | 'name'>): string {
  return tOr(contentKey('companions', c.id, 'name'), c.name);
}

/** Class and combat role, both through text keys ('' parts dropped). */
export function companionSub(c: Pick<CompanionView, 'classId' | 'className' | 'role'>): string {
  const cls = c.classId ? tOr(contentKey('classes', c.classId, 'name'), c.className) : '';
  const role = c.role ? tOr(`ui.win.party.role.${c.role}`, '') : '';
  return [cls, role].filter(Boolean).join('  ');
}

function row(c: CompanionView, tick: number): CompanionRow {
  const walking = c.state === 'party' || c.state === 'waiting';
  const days =
    c.restUntil !== null && c.restUntil > tick
      ? Math.ceil((c.restUntil - tick) / TICKS_PER_GAME_DAY)
      : 0;
  return {
    id: c.id,
    name: companionName(c),
    sub: companionSub(c),
    state: t(c.stateName),
    rest: days > 0 ? t('ui.win.party.rest_days', { n: days }) : '',
    bond:
      c.nextThreshold !== null
        ? t('ui.win.party.bond_next', { n: c.bond, next: c.nextThreshold })
        : t('ui.win.party.bond', { n: c.bond }),
    gate: c.bondGate !== null ? t('ui.win.party.bond_gate', { n: c.bondGate }) : '',
    hp: c.unit
      ? {
          value: c.unit.hp,
          max: c.unit.maxHp,
          text: t('ui.win.party.hp', { hp: c.unit.hp, max: c.unit.maxHp }),
        }
      : null,
    downed: c.downed,
    orders: walking
      ? PARTY_ORDERS.map((o) => ({
          order: o,
          label: t(`sys.party.order.${o}`),
          active: c.order === o,
        }))
      : [],
    wait: walking
      ? {
          on: c.state === 'waiting',
          label: t(c.state === 'waiting' ? 'ui.win.party.come_along' : 'ui.win.party.wait_here'),
        }
      : null,
  };
}

export function partyWindowModel(i: PartyModelInput): PartyWindowModel {
  const groups = ROSTER_GROUPS.map((g) => ({
    group: g,
    label: t(`ui.win.party.group.${g}`),
    rows: i.roster.filter((c) => rosterGroup(c.state) === g).map((c) => row(c, i.tick)),
  })).filter((g) => g.rows.length > 0);
  const anyAlong = groups.some((g) => g.group === 'along');
  return {
    groups,
    allOrders: anyAlong
      ? PARTY_ORDERS.map((o) => ({ order: o, label: t(`sys.party.order.${o}`) }))
      : [],
    ironman:
      i.ironman === null
        ? null
        : {
            on: i.ironman === 'on',
            text: t(i.ironman === 'on' ? 'ui.win.party.ironman_on' : 'ui.win.party.ironman_off'),
            canTurnOff: i.ironman === 'on',
            confirm: t('ui.win.party.ironman_confirm'),
          },
    empty: i.roster.length === 0,
  };
}
