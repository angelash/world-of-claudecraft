import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import type { AmbientPlayerBotRecord } from './types';

const PARTY_HEAL_HOLD_RATIO = 0.92;
const PARTY_MANA_HOLD_RATIO = 0.45;
const ACTIVE_PREPARATION_MODES = ['buff_party', 'prepare_party', 'heal_party'] as const;

export type AmbientPartyPreparationMode = (typeof ACTIVE_PREPARATION_MODES)[number];

export interface AmbientPartyPreparationStatus {
  mode: AmbientPartyPreparationMode;
  lowHealthMembers: number;
  lowManaMembers: number;
  preparingBots: number;
}

export function inspectAmbientPartyPreparation(input: {
  botId: string;
  party: PartyInfo;
  coordinatorBots: readonly AmbientPlayerBotRecord[];
}): AmbientPartyPreparationStatus | null {
  const lowHealthMembers = input.party.members.filter(memberNeedsHealing).length;
  const lowManaMembers = input.party.members.filter(memberNeedsManaRecovery).length;
  const activePreparation = detectActivePreparation(input.coordinatorBots, input.botId);
  if (lowHealthMembers <= 0 && lowManaMembers <= 0 && !activePreparation) return null;
  return {
    mode: lowHealthMembers > 0
      ? 'heal_party'
      : lowManaMembers > 0
        ? 'prepare_party'
        : activePreparation?.mode ?? 'prepare_party',
    lowHealthMembers,
    lowManaMembers,
    preparingBots: activePreparation?.count ?? 0,
  };
}

function memberNeedsHealing(member: PartyMemberInfo): boolean {
  if (member.dead || member.inCombat === 1 || member.mhp <= 0) return false;
  return member.hp / member.mhp < PARTY_HEAL_HOLD_RATIO;
}

function memberNeedsManaRecovery(member: PartyMemberInfo): boolean {
  if (member.dead || member.inCombat === 1 || member.rtype !== 'mana' || member.mres <= 0) return false;
  return member.res / member.mres < PARTY_MANA_HOLD_RATIO;
}

function detectActivePreparation(
  coordinatorBots: readonly AmbientPlayerBotRecord[],
  selfBotId: string,
): { mode: AmbientPartyPreparationMode; count: number } | null {
  let count = 0;
  let mode: AmbientPartyPreparationMode | null = null;
  for (const record of coordinatorBots) {
    if (record.botId === selfBotId) continue;
    const groupMode = readRunnerString(record.runnerState, 'groupMode');
    if (!isPreparationMode(groupMode)) continue;
    count++;
    mode = prioritizePreparationMode(mode, groupMode);
  }
  return mode ? { mode, count } : null;
}

function prioritizePreparationMode(
  current: AmbientPartyPreparationMode | null,
  candidate: AmbientPartyPreparationMode,
): AmbientPartyPreparationMode {
  const currentPriority = current ? preparationPriority(current) : Number.POSITIVE_INFINITY;
  const candidatePriority = preparationPriority(candidate);
  return candidatePriority < currentPriority ? candidate : (current ?? candidate);
}

function preparationPriority(mode: AmbientPartyPreparationMode): number {
  switch (mode) {
    case 'heal_party':
      return 0;
    case 'prepare_party':
      return 1;
    case 'buff_party':
    default:
      return 2;
  }
}

function isPreparationMode(value: string): value is AmbientPartyPreparationMode {
  return ACTIVE_PREPARATION_MODES.includes(value as AmbientPartyPreparationMode);
}

function readRunnerString(
  value: Record<string, unknown>,
  key: string,
): string {
  const field = value[key];
  return typeof field === 'string' ? field : '';
}
