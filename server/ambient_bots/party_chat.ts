import type { SimEvent } from '../../src/sim/types';
import type { PartyInfo } from '../../src/world_api';
import type { AmbientBotPlanDecisionV1 } from './llm_types';
import {
  ambientPartyRoleAssignmentForPid,
  planAmbientPartyRoles,
  type AmbientPartyRoleAssignment,
} from './party_roles';
import type { AmbientPlayerBotRecord } from './types';
import type { AmbientPlayerBotLiveState } from './ws_client';

const MAX_PARTY_COMMANDS_PER_TICK = 1;
const MAX_PENDING_UTTERANCES = 2;

export type AmbientPlayerBotPartyChatMode = 'leader_brief' | 'member_ack';
export type AmbientPlayerBotPartyChatLlmStatus =
  | 'idle'
  | 'pending'
  | 'ready'
  | 'rejected'
  | 'error'
  | 'budget_denied'
  | 'disabled';

export interface AmbientPlayerBotPendingPartyUtterance {
  mode: AmbientPlayerBotPartyChatMode;
  briefKey: string;
  dueAtMs: number;
  revision: number;
  fallbackText: string;
  leaderPromptText: string;
  llmStatus?: AmbientPlayerBotPartyChatLlmStatus;
  llmLineText?: string;
  llmRequestedAtMs?: number;
}

export interface AmbientPlayerBotPartyChatRuntimeState {
  pendingUtterances: AmbientPlayerBotPendingPartyUtterance[];
  lastLeaderBriefKey: string;
  lastAckedBriefKey: string;
  nextRevision: number;
}

export interface TickAmbientPlayerBotPartyChatInput {
  bot: AmbientPlayerBotRecord;
  liveState: AmbientPlayerBotLiveState;
  recentEvents: readonly SimEvent[];
  ambientBotNames: ReadonlySet<string>;
  llmPlan?: AmbientBotPlanDecisionV1 | null;
  objectiveId: string;
  objectiveLabel: string;
  objectiveQuestId?: string;
  objectiveDungeonId?: string;
  groupMode: string;
  nowMs: number;
}

export interface AmbientPlayerBotPartyChatCommand {
  type: 'chat';
  text: string;
}

export interface AmbientPlayerBotPartyChatResult {
  commands: AmbientPlayerBotPartyChatCommand[];
  runnerStatePatch: Record<string, unknown>;
}

export function createAmbientPlayerBotPartyChatRuntimeState(): AmbientPlayerBotPartyChatRuntimeState {
  return {
    pendingUtterances: [],
    lastLeaderBriefKey: '',
    lastAckedBriefKey: '',
    nextRevision: 1,
  };
}

export function tickAmbientPlayerBotPartyChatShell(
  input: TickAmbientPlayerBotPartyChatInput,
  state: AmbientPlayerBotPartyChatRuntimeState,
): AmbientPlayerBotPartyChatResult {
  const self = input.liveState.self;
  const party = parsePartyInfo(self?.party);
  if (!self || !party || party.members.length <= 1) {
    state.pendingUtterances = [];
    return {
      commands: [],
      runnerStatePatch: emptyPartyRunnerStatePatch(),
    };
  }

  const ambientBotNames = new Set(input.ambientBotNames);
  ambientBotNames.add(input.bot.characterName);
  const leader = party.members.find((member) => member.pid === party.leader) ?? null;
  const leaderIsAmbientBot = !!leader && ambientBotNames.has(leader.name);
  const rolePlan = planAmbientPartyRoles({
    party,
    liveState: input.liveState,
    objectiveId: input.objectiveId,
    objectiveLabel: input.objectiveLabel,
    objectiveQuestId: input.objectiveQuestId,
    objectiveDungeonId: input.objectiveDungeonId,
  });
  const selfRole = ambientPartyRoleAssignmentForPid(rolePlan, input.bot.characterId ?? -1)
    ?? rolePlan.assignments.find((assignment) => assignment.name === input.bot.characterName)
    ?? null;
  if (!selfRole) {
    state.pendingUtterances = [];
    return {
      commands: [],
      runnerStatePatch: emptyPartyRunnerStatePatch(),
    };
  }

  state.pendingUtterances = state.pendingUtterances
    .filter((utterance) => utterance.briefKey.startsWith(rolePlan.key))
    .slice(0, MAX_PENDING_UTTERANCES);

  if (leaderIsAmbientBot && leader?.pid === input.bot.characterId) {
    const leaderBriefKey = `${rolePlan.key}|${leaderBriefReason(input.groupMode)}`;
    if (
      leaderBriefKey !== state.lastLeaderBriefKey
      && !state.pendingUtterances.some((utterance) =>
        utterance.mode === 'leader_brief' && utterance.briefKey === leaderBriefKey)
    ) {
      enqueueUtterance(state, {
        mode: 'leader_brief',
        briefKey: leaderBriefKey,
        dueAtMs: input.nowMs + leaderBriefDelayMs(input.bot.botId, leaderBriefKey),
        revision: nextRevision(state),
        fallbackText: buildLeaderFallbackText(rolePlan, selfRole, input.groupMode),
        leaderPromptText: '',
        llmStatus: 'idle',
      });
    }
  }

  if (leaderIsAmbientBot && leader?.pid !== input.bot.characterId && leader) {
    const leaderEvent = latestLeaderPartyEvent(input.recentEvents, leader.name);
    if (leaderEvent) {
      const ackKey = `${rolePlan.key}|ack|${normalizeChatText(leaderEvent.text)}`;
      if (
        ackKey !== state.lastAckedBriefKey
        && !state.pendingUtterances.some((utterance) =>
          utterance.mode === 'member_ack' && utterance.briefKey === ackKey)
      ) {
        enqueueUtterance(state, {
          mode: 'member_ack',
          briefKey: ackKey,
          dueAtMs: input.nowMs + memberAckDelayMs(input.bot.botId, ackKey),
          revision: nextRevision(state),
          fallbackText: buildMemberAckFallbackText(rolePlan, selfRole),
          leaderPromptText: leaderEvent.text,
          llmStatus: 'idle',
        });
      }
    }
  }

  const commands: AmbientPlayerBotPartyChatCommand[] = [];
  const dueUtterances = [...state.pendingUtterances]
    .filter((utterance) => utterance.dueAtMs <= input.nowMs)
    .sort((a, b) => a.dueAtMs - b.dueAtMs || a.revision - b.revision);
  for (const utterance of dueUtterances) {
    if (commands.length >= MAX_PARTY_COMMANDS_PER_TICK) break;
    const lineText = partyLineText(utterance);
    commands.push({ type: 'chat', text: `/p ${lineText}` });
    if (utterance.mode === 'leader_brief') state.lastLeaderBriefKey = utterance.briefKey;
    else state.lastAckedBriefKey = utterance.briefKey;
    state.pendingUtterances = state.pendingUtterances.filter((candidate) => candidate.revision !== utterance.revision);
  }

  return {
    commands,
    runnerStatePatch: {
      partyRole: selfRole.combatRole,
      partyDuty: selfRole.dutyLabel,
      partyLeaderName: rolePlan.leaderName,
      partyTankName: rolePlan.tankName,
      partyHealerName: rolePlan.healerName,
      partyFocusCaller: rolePlan.focusCallerName,
      partyChatPending: state.pendingUtterances.length,
      partyLastLeaderBriefKey: state.lastLeaderBriefKey,
      partyLastAckBriefKey: state.lastAckedBriefKey,
      partyComposition: rolePlan.compositionSummary,
      ...(commands[0]
        ? {
          lastPartyChatAction: commands[0].text.startsWith('/p ') ? commands[0].text.slice(3) : commands[0].text,
        }
        : {}),
      ...(input.llmPlan
        ? {
          llmPlanMode: input.llmPlan.socialMode,
          llmPlanFocus: input.llmPlan.focusLabel,
        }
        : {}),
    },
  };
}

function enqueueUtterance(
  state: AmbientPlayerBotPartyChatRuntimeState,
  utterance: AmbientPlayerBotPendingPartyUtterance,
): void {
  state.pendingUtterances = [
    ...state.pendingUtterances.filter((candidate) =>
      !(candidate.mode === utterance.mode && candidate.briefKey === utterance.briefKey)),
    utterance,
  ]
    .sort((a, b) => a.dueAtMs - b.dueAtMs || a.revision - b.revision)
    .slice(0, MAX_PENDING_UTTERANCES);
}

function nextRevision(state: AmbientPlayerBotPartyChatRuntimeState): number {
  const revision = state.nextRevision;
  state.nextRevision++;
  return revision;
}

function parsePartyInfo(value: unknown): PartyInfo | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as PartyInfo;
  return typeof record.leader === 'number' && Array.isArray(record.members)
    ? record
    : null;
}

function emptyPartyRunnerStatePatch(): Record<string, unknown> {
  return {
    partyRole: '',
    partyDuty: '',
    partyLeaderName: '',
    partyTankName: '',
    partyHealerName: '',
    partyFocusCaller: '',
    partyChatPending: 0,
    partyLastLeaderBriefKey: '',
    partyLastAckBriefKey: '',
    partyComposition: '',
    lastPartyChatAction: '',
  };
}

function leaderBriefReason(groupMode: string): string {
  if (groupMode === 'hold_regroup' || groupMode === 'wait_party') return groupMode;
  return 'plan';
}

function latestLeaderPartyEvent(
  events: readonly SimEvent[],
  leaderName: string,
): { text: string } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (
      event.type === 'chat'
      && event.channel === 'party'
      && event.from === leaderName
      && typeof event.text === 'string'
      && event.text.trim() !== ''
    ) {
      return { text: event.text };
    }
  }
  return null;
}

function buildLeaderFallbackText(
  rolePlan: ReturnType<typeof planAmbientPartyRoles>,
  selfRole: AmbientPartyRoleAssignment,
  groupMode: string,
): string {
  const prepLine = groupMode === 'hold_regroup' || groupMode === 'wait_party'
    ? 'Regroup on me, finish buffs, then move together'
    : 'Buff up first, then collapse on one target';
  const healerCall = rolePlan.healerName
    ? `${rolePlan.healerName} keeps us topped`
    : 'watch your health and peel fast';
  const focusCall = rolePlan.focusCallerName && rolePlan.focusCallerName !== selfRole.name
    ? `assist ${rolePlan.focusCallerName}`
    : 'assist my target';
  const templates = [
    `I take point. ${healerCall}, then ${focusCall}.`,
    `${prepLine}. ${rolePlan.tankName || 'Frontline'} sets the pace, everyone stay on focus.`,
    `Quick split: ${rolePlan.compositionSummary}. ${focusCall}.`,
    `Settle in, ${prepLine.toLowerCase()}. ${focusCall}.`,
  ];
  return chooseTemplate(rolePlan.key, templates);
}

function buildMemberAckFallbackText(
  rolePlan: ReturnType<typeof planAmbientPartyRoles>,
  selfRole: AmbientPartyRoleAssignment,
): string {
  const focusCall = rolePlan.focusCallerName
    ? `${rolePlan.focusCallerName}'s target`
    : 'the called target';
  const templates = selfRole.combatRole === 'tank'
    ? [
      'Copy, I take point and keep loose mobs off the backline.',
      `On it, I will anchor the pull and keep everyone safe.`,
      `Got it, I will hold the front and pull strays back in.`,
    ]
    : selfRole.combatRole === 'healer'
      ? [
        `On heals, I will keep ${rolePlan.tankName || 'the frontline'} stable.`,
        'Copy, I am watching health bars and danger spikes.',
        `Got it, I will top the group and call if I need space.`,
      ]
      : [
        `Copy, I will stay on ${focusCall} and peel loose mobs.`,
        'On it, I am sticking to focus and cleaning up runners.',
        `Got it, I will keep pressure on the called target.`,
      ];
  return chooseTemplate(`${rolePlan.key}|${selfRole.name}`, templates);
}

function partyLineText(utterance: AmbientPlayerBotPendingPartyUtterance): string {
  const text = utterance.llmStatus === 'ready' && utterance.llmLineText
    ? utterance.llmLineText
    : utterance.fallbackText;
  return normalizeChatText(text);
}

function chooseTemplate(
  key: string,
  templates: readonly string[],
): string {
  if (templates.length === 0) return '';
  const index = stableHash(key) % templates.length;
  return templates[index] ?? templates[0] ?? '';
}

function leaderBriefDelayMs(botId: string, key: string): number {
  return 500 + (stableHash(`${botId}|leader|${key}`) % 700);
}

function memberAckDelayMs(botId: string, key: string): number {
  return 1_100 + (stableHash(`${botId}|ack|${key}`) % 1_200);
}

function normalizeChatText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}
