// Implements the model of `ui_hud_party` (ux_and_onboarding.md 5.2): the servant and the
// companions as small frames under the player frame, at most five: name, health, main resource,
// up to four debuffs (shortest left first), the current order, and "down" for a fallen member.
// Members away recovering are left out (5.2: they show in `ui_win_party` instead). No members:
// the block hides (empty state); the party adapter missing hides it too (not yet open, 6.1).
// More than five members turn into the raid grid in M2. Pure; Node-tested. The painter is
// ./party_frames.ts.

import { contentKey } from '../../core/content_key';
import { t, tOr } from '../../shared_ui/i18n';
import type { PartyOrder } from '../../systems/party';
import type { BarView, UnitFrameData } from '../view/adapters';

/** At most this many party frames (5.2); larger parties use the raid grid (M2). */
export const PARTY_FRAMES = 5;
/** At most this many debuffs per frame (5.2). */
export const PARTY_DEBUFFS = 4;

/** The companion fields the frames read (CompanionView of the party system). */
export interface PartyMemberInput {
  id: string;
  name: string;
  order: PartyOrder;
  downed: boolean;
  /** the companion's entity, null while it has none on the map */
  unit: { id: string } | null;
  /** set once a member is away recovering (D-073; the party system adds it later) */
  recovering?: boolean;
}

export interface PartyDebuff {
  id: string;
  name: string;
  /** whole seconds left, null for permanent */
  seconds: number | null;
}

export interface PartyRow {
  id: string;
  entityId: string | null;
  name: string;
  order: PartyOrder;
  orderText: string;
  downed: boolean;
  hp: BarView | null;
  resource: { value: number; max: number; label: string; color?: string } | null;
  debuffs: PartyDebuff[];
}

export interface PartyModel {
  rows: PartyRow[];
  /** more members than frames: the rest wait for the raid grid (M2) */
  overflow: number;
  key: string;
}

function memberName(m: PartyMemberInput): string {
  return m.name ? tOr(contentKey('companions', m.id, 'name'), m.name) : m.id;
}

export function partyModel(
  members: readonly PartyMemberInput[],
  frame: (entityId: string) => UnitFrameData | null,
): PartyModel {
  const present = members.filter((m) => !m.recovering);
  const rows: PartyRow[] = present.slice(0, PARTY_FRAMES).map((m) => {
    const d = m.unit ? frame(m.unit.id) : null;
    const r = d?.resources?.[0];
    const debuffs = (d?.auras ?? [])
      .filter((a) => a.harmful)
      .sort(
        (a, b) =>
          (a.remaining ?? Number.POSITIVE_INFINITY) - (b.remaining ?? Number.POSITIVE_INFINITY),
      )
      .slice(0, PARTY_DEBUFFS)
      .map((a) => ({
        id: a.id,
        name: a.name,
        seconds: a.remaining === null ? null : Math.ceil(a.remaining),
      }));
    const downed = m.downed || !!d?.dead;
    return {
      id: m.id,
      entityId: m.unit?.id ?? null,
      name: memberName(m),
      order: m.order,
      orderText: t(`sys.party.order.${m.order}`),
      downed,
      hp: d?.hp ? { value: Math.round(d.hp.value), max: Math.round(d.hp.max) } : null,
      resource: r
        ? { value: Math.round(r.value), max: Math.round(r.max), label: r.label, color: r.color }
        : null,
      debuffs,
    };
  });
  return {
    rows,
    overflow: Math.max(0, present.length - rows.length),
    key: JSON.stringify(rows),
  };
}
