import type { SimEvent } from '../../src/sim/types';
import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import type { AmbientPartyRolePlan } from './party_roles';
import type { AmbientPlayerBotLiveState } from './ws_client';

const PARTY_REGROUP_RANGE = 18;
const RECOVERY_HEALTH_RATIO = 0.72;
const RECOVERY_HEALER_MANA_RATIO = 0.45;
const RECOVERY_FRAGILE_THREAT_HEALTH_RATIO = 0.9;
const RECOVERY_FRAGILE_THREAT_MAX_LEVEL = 4;

const INTENT_KINDS = [
  'route_plan',
  'buffs',
  'focus',
  'praise',
  'correction',
  'recovery',
] as const;

const INTENT_BEHAVIORS = [
  'advance',
  'prepare',
  'assist',
  'celebrate',
  'regroup',
  'recover',
] as const;

export type AmbientPartyCoordinationIntentKind = (typeof INTENT_KINDS)[number];
export type AmbientPartyCoordinationBehavior = (typeof INTENT_BEHAVIORS)[number];

export interface AmbientPartyCoordinationIntent {
  schemaVersion: 1;
  kind: AmbientPartyCoordinationIntentKind;
  behavior: AmbientPartyCoordinationBehavior;
  key: string;
  summary: string;
  targetName: string;
  focusCallerName: string;
  holdAdvance: boolean;
  preferAssist: boolean;
}

export interface BuildAmbientPartyCoordinationIntentInput {
  party: PartyInfo;
  liveState: AmbientPlayerBotLiveState;
  recentEvents: readonly SimEvent[];
  rolePlan: AmbientPartyRolePlan;
  objectiveId: string;
  objectiveLabel: string;
  groupMode: string;
}

interface PartyIntentFacts {
  partyInCombat: boolean;
  deadCount: number;
  criticalHealthCount: number;
  criticalResourceCount: number;
  laggingCount: number;
}

export function buildAmbientPartyCoordinationIntent(
  input: BuildAmbientPartyCoordinationIntentInput,
): AmbientPartyCoordinationIntent {
  const facts = partyIntentFacts(input.party, input.liveState);
  const milestone = latestPartyMilestone(input.recentEvents, input.party);
  const objectiveLabel = compactText(input.objectiveLabel || input.objectiveId || 'the route', 64);
  const focusCallerName = input.rolePlan.focusCallerName || input.rolePlan.leaderName;
  const targetName = focusCallerName || input.rolePlan.tankName || input.rolePlan.leaderName;
  let kind: AmbientPartyCoordinationIntentKind = 'route_plan';
  let behavior: AmbientPartyCoordinationBehavior = 'advance';
  let summary = `Plan the route for ${objectiveLabel}`;
  let holdAdvance = false;
  let preferAssist = false;

  if (
    facts.deadCount > 0
    || facts.criticalHealthCount > 0
    || facts.criticalResourceCount > 0
    || isRecoveryGroupMode(input.groupMode)
  ) {
    kind = 'recovery';
    behavior = 'recover';
    summary = facts.deadCount > 0
      ? 'Recover the party before moving'
      : facts.criticalResourceCount > 0
        ? 'Recover health and mana before moving'
        : 'Stabilize health before the next pull';
    holdAdvance = true;
  } else if (input.groupMode === 'hold_regroup' || input.groupMode === 'wait_party' || facts.laggingCount > 0) {
    kind = 'correction';
    behavior = 'regroup';
    summary = facts.laggingCount > 0
      ? 'Tighten formation before moving'
      : 'Hold the group together before moving';
    holdAdvance = true;
  } else if (isPreparationGroupMode(input.groupMode)) {
    kind = 'buffs';
    behavior = 'prepare';
    summary = 'Finish buffs and ready checks before pulling';
    holdAdvance = true;
  } else if (facts.partyInCombat || isFocusGroupMode(input.groupMode)) {
    kind = 'focus';
    behavior = 'assist';
    summary = targetName
      ? `Assist ${targetName} and peel danger`
      : 'Assist the called target and peel danger';
    preferAssist = true;
  } else if (milestone) {
    kind = 'praise';
    behavior = 'celebrate';
    summary = milestone;
  }

  return validateAmbientPartyCoordinationIntent({
    schemaVersion: 1,
    kind,
    behavior,
    key: intentKey({
      kind,
      behavior,
      objectiveId: input.objectiveId,
      objectiveLabel,
      groupMode: input.groupMode,
      targetName,
      summary,
    }),
    summary,
    targetName,
    focusCallerName,
    holdAdvance,
    preferAssist,
  });
}

export function validateAmbientPartyCoordinationIntent(
  value: AmbientPartyCoordinationIntent,
): AmbientPartyCoordinationIntent {
  if (value.schemaVersion !== 1) throw new Error('party intent schemaVersion must be 1');
  if (!isIntentKind(value.kind)) throw new Error('party intent kind is invalid');
  if (!isIntentBehavior(value.behavior)) throw new Error('party intent behavior is invalid');
  return {
    schemaVersion: 1,
    kind: value.kind,
    behavior: value.behavior,
    key: compactText(value.key, 180),
    summary: compactText(value.summary, 120),
    targetName: compactText(value.targetName, 40),
    focusCallerName: compactText(value.focusCallerName, 40),
    holdAdvance: value.holdAdvance === true,
    preferAssist: value.preferAssist === true,
  };
}

export function partyIntentRunnerStatePatch(
  intent: AmbientPartyCoordinationIntent,
): Record<string, unknown> {
  return {
    partyIntentKind: intent.kind,
    partyIntentBehavior: intent.behavior,
    partyIntentKey: intent.key,
    partyIntentSummary: intent.summary,
    partyIntentTargetName: intent.targetName,
    partyIntentFocusCaller: intent.focusCallerName,
    partyIntentHoldAdvance: intent.holdAdvance,
    partyIntentPreferAssist: intent.preferAssist,
  };
}

export function emptyPartyIntentRunnerStatePatch(): Record<string, unknown> {
  return {
    partyIntentKind: '',
    partyIntentBehavior: '',
    partyIntentKey: '',
    partyIntentSummary: '',
    partyIntentTargetName: '',
    partyIntentFocusCaller: '',
    partyIntentHoldAdvance: false,
    partyIntentPreferAssist: false,
  };
}

export function ambientPartyCoordinationIntentFromRunnerState(
  value: Record<string, unknown>,
): AmbientPartyCoordinationIntent | null {
  const kind = readString(value, 'partyIntentKind');
  const behavior = readString(value, 'partyIntentBehavior');
  if (!isIntentKind(kind) || !isIntentBehavior(behavior)) return null;
  return validateAmbientPartyCoordinationIntent({
    schemaVersion: 1,
    kind,
    behavior,
    key: readString(value, 'partyIntentKey'),
    summary: readString(value, 'partyIntentSummary'),
    targetName: readString(value, 'partyIntentTargetName'),
    focusCallerName: readString(value, 'partyIntentFocusCaller'),
    holdAdvance: value.partyIntentHoldAdvance === true,
    preferAssist: value.partyIntentPreferAssist === true,
  });
}

function partyIntentFacts(
  party: PartyInfo,
  liveState: AmbientPlayerBotLiveState,
): PartyIntentFacts {
  const partyIds = new Set(party.members.map((member) => member.pid));
  const leader = party.members.find((member) => member.pid === party.leader) ?? null;
  let deadCount = 0;
  let criticalHealthCount = 0;
  let criticalResourceCount = 0;
  let laggingCount = 0;
  const threatenedPids = threatenedPartyPids(liveState, partyIds);
  for (const member of party.members) {
    if (member.dead) deadCount++;
    else if (memberNeedsRecoveryIntent(member, threatenedPids)) {
      criticalHealthCount++;
    }
    if (memberNeedsResourceRecoveryIntent(member)) criticalResourceCount++;
    if (leader && member.pid !== leader.pid && distanceBetweenMembers(member, leader) > PARTY_REGROUP_RANGE) {
      laggingCount++;
    }
  }
  return {
    partyInCombat: party.members.some((member) => member.inCombat === 1) || hasPartyThreat(liveState, partyIds),
    deadCount,
    criticalHealthCount,
    criticalResourceCount,
    laggingCount,
  };
}

function memberNeedsRecoveryIntent(
  member: PartyMemberInfo,
  threatenedPids: ReadonlySet<number>,
): boolean {
  if (member.mhp <= 0) return false;
  const ratio = member.hp / member.mhp;
  if (ratio <= RECOVERY_HEALTH_RATIO) return true;
  return threatenedPids.has(member.pid)
    && isFragileLowLevelMember(member)
    && ratio <= RECOVERY_FRAGILE_THREAT_HEALTH_RATIO;
}

function isFragileLowLevelMember(member: PartyMemberInfo): boolean {
  if (member.level > RECOVERY_FRAGILE_THREAT_MAX_LEVEL) return false;
  return member.cls === 'mage' || member.cls === 'priest' || member.cls === 'warlock';
}

function memberNeedsResourceRecoveryIntent(member: PartyMemberInfo): boolean {
  return !member.dead
    && member.rtype === 'mana'
    && member.mres > 0
    && canClassHeal(member.cls)
    && member.res / member.mres <= RECOVERY_HEALER_MANA_RATIO;
}

function canClassHeal(cls: PartyMemberInfo['cls']): boolean {
  return cls === 'priest' || cls === 'paladin' || cls === 'shaman' || cls === 'druid';
}

function latestPartyMilestone(
  events: readonly SimEvent[],
  party: PartyInfo,
): string | null {
  const partyIds = new Set(party.members.map((member) => member.pid));
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) continue;
    switch (event.type) {
      case 'questDone':
        return 'Nice turn-in, keep the route rolling';
      case 'questReady':
        return 'Quest objective is ready, clean work';
      case 'questProgress':
        return 'Good progress, keep the pressure steady';
      case 'death':
        if (partyIds.has(event.killerId)) return 'Clean kill, keep the rhythm';
        break;
      default:
        break;
    }
  }
  return null;
}

function isPreparationGroupMode(groupMode: string): boolean {
  return groupMode === 'buff_party'
    || groupMode === 'prepare_party';
}

function isRecoveryGroupMode(groupMode: string): boolean {
  return groupMode === 'heal_party'
    || groupMode === 'shield_party'
    || groupMode === 'recover_party';
}

function isFocusGroupMode(groupMode: string): boolean {
  return groupMode === 'assist_party'
    || groupMode === 'focus_fire'
    || groupMode === 'tank_party'
    || groupMode === 'taunt_party';
}

function hasPartyThreat(
  liveState: AmbientPlayerBotLiveState,
  partyIds: ReadonlySet<number>,
): boolean {
  return threatenedPartyPids(liveState, partyIds).size > 0;
}

function threatenedPartyPids(
  liveState: AmbientPlayerBotLiveState,
  partyIds: ReadonlySet<number>,
): Set<number> {
  const threatened = new Set<number>();
  for (const entity of liveState.entities.values()) {
    if (entity.k !== 'mob' || entity.dead === 1 || entity.dead === true) continue;
    if (typeof entity.aggro === 'number' && partyIds.has(entity.aggro)) threatened.add(entity.aggro);
  }
  return threatened;
}

function distanceBetweenMembers(a: PartyMemberInfo, b: PartyMemberInfo): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function intentKey(input: {
  kind: AmbientPartyCoordinationIntentKind;
  behavior: AmbientPartyCoordinationBehavior;
  objectiveId: string;
  objectiveLabel: string;
  groupMode: string;
  targetName: string;
  summary: string;
}): string {
  return compactText([
    'party-intent',
    input.kind,
    input.behavior,
    input.objectiveId,
    input.objectiveLabel,
    input.groupMode,
    input.targetName,
    input.summary,
  ].join('|'), 180);
}

function compactText(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
}

function readString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  return typeof field === 'string' ? field : '';
}

function isIntentKind(value: string): value is AmbientPartyCoordinationIntentKind {
  return (INTENT_KINDS as readonly string[]).includes(value);
}

function isIntentBehavior(value: string): value is AmbientPartyCoordinationBehavior {
  return (INTENT_BEHAVIORS as readonly string[]).includes(value);
}
