// Party window view: each companion's frame, stance, tactical order, bond and the next bond
// threshold, plus the roster (3.2: who stands by, rests or is away) and the beasts.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, tr } from '../../core/text';
import type { World } from '../../core/world';
import { unitView } from '../combat';
import type { UnitView } from '../combat/queries';
import { bondCeiling } from './bond';
import { DEFAULT_PARTY_CONFIG, lineStage } from './config';
import type { Member, MemberState, PartyOrder, TacticKind } from './types';

const THRESHOLDS = [20, 40, 60, 80, 100];

/** Display name of a party order, as a fresh text key. */
export function orderName(order: PartyOrder): KeyText {
  return tr(`sys.party.order.${order}`);
}

export function tacticName(tactic: TacticKind): KeyText {
  return tr(`sys.party.tactic.${tactic}`);
}

export function stateName(state: MemberState): KeyText {
  return tr(`sys.party.state.${state}`);
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
  state: MemberState;
  stateName: KeyText;
  tactic: TacticKind | null;
  bond: number;
  nextThreshold: number | null;
  /** the bond gate in force (8.3): daily sources stop here until the personal line moves */
  bondGate: number | null;
  downed: boolean;
  /** resting until this tick (11.3) */
  restUntil: number | null;
  unit: UnitView | null;
}

const stateOf = (m: Member): MemberState => m.state ?? 'party';

function viewOf(world: World, content: ContentMap, m: Member): CompanionView | null {
  const def = (content.companions ?? []).find((c) => c.id === m.id);
  if (!def || m.temp || m.pet) return null;
  const unit = m.entityId ? unitView(world, content, m.entityId) : null;
  const cfg = content.partyConfig ?? DEFAULT_PARTY_CONFIG;
  const gate = bondCeiling(cfg, lineStage(world, m.id));
  const state = stateOf(m);
  return {
    id: m.id,
    name: def.name,
    title: def.title,
    classId: def.classId,
    className: (content.classes ?? []).find((c) => c.id === def.classId)?.name ?? def.classId,
    role: def.role,
    personality: def.personality,
    order: m.order,
    orderName: orderName(m.order),
    state,
    stateName: stateName(state),
    tactic: m.tactic?.kind ?? null,
    bond: Math.floor(m.bond),
    nextThreshold: THRESHOLDS.find((t) => t > m.bond) ?? null,
    bondGate: gate < 100 ? gate : null,
    downed: !!unit && !unit.alive,
    restUntil: m.restUntil ?? null,
    unit,
  };
}

/** The companions walking with the party (in it, or waiting at a gate). */
export function partyView(world: World, content: ContentMap): CompanionView[] {
  const slice = world.slices.party;
  if (!slice) return [];
  const out: CompanionView[] = [];
  for (const id of Object.keys(slice.members).sort()) {
    const m = slice.members[id];
    if (!m) continue;
    const s = stateOf(m);
    if (s !== 'party' && s !== 'waiting') continue;
    const v = viewOf(world, content, m);
    if (v) out.push(v);
  }
  return out;
}

/** Every recruited companion and where they are (3.2). */
export function rosterView(world: World, content: ContentMap): CompanionView[] {
  const slice = world.slices.party;
  if (!slice) return [];
  const out: CompanionView[] = [];
  for (const id of Object.keys(slice.members).sort()) {
    const m = slice.members[id];
    const v = m ? viewOf(world, content, m) : null;
    if (v) out.push(v);
  }
  return out;
}

export interface BeastView {
  id: string;
  species: string;
  kind: 'half' | 'retainer';
  state: MemberState;
  /** the drop bag it keeps, if any */
  guarding: string | null;
  unit: UnitView | null;
}

/** The beast companion and the retainers. */
export function beastsView(world: World, content: ContentMap): BeastView[] {
  const slice = world.slices.party;
  if (!slice) return [];
  const out: BeastView[] = [];
  for (const id of Object.keys(slice.members).sort()) {
    const m = slice.members[id];
    if (!m?.pet) continue;
    out.push({
      id,
      species: m.pet.species,
      kind: m.pet.kind,
      state: stateOf(m),
      guarding: m.pet.guarding ?? null,
      unit: m.entityId ? unitView(world, content, m.entityId) : null,
    });
  }
  return out;
}

export function bondOf(world: World, companionId: string): number {
  return Math.floor(world.slices.party?.members[companionId]?.bond ?? 0);
}

/** In the party now: walking with the player, not waiting at a gate, not a temporary tie. */
export function isInParty(world: World, companionId: string): boolean {
  const m = world.slices.party?.members[companionId];
  return !!m && !m.temp && stateOf(m) === 'party';
}

/** The ironman switch as the party keeps it (11.4). */
export function ironmanState(world: World): 'on' | 'off' | null {
  return world.slices.party?.ironman ?? null;
}
