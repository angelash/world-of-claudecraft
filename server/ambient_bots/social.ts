import { ambientBotProfileById } from './profiles';
import type {
  AmbientBotLlmFriendPolicy,
  AmbientBotPlanDecisionV1,
  AmbientBotLlmPresenceEmote,
} from './llm_types';
import type { AmbientPlayerBotRecord } from './types';
import type { AmbientPlayerBotLiveState } from './ws_client';
import type { SimEvent } from '../../src/sim/types';

const FRIEND_ADD_COOLDOWN_MS = 6 * 3600 * 1000;
const EMOTE_COOLDOWN_MS = 90_000;
const EMOTE_RADIUS = 18;
const MAX_CONTACTS = 48;
const MAX_PENDING_REPLIES = 6;
const MAX_SOCIAL_COMMANDS_PER_TICK = 2;
const SIGHTING_GAP_MS = 30_000;

interface AmbientIncomingWhisper {
  from: string;
  text: string;
}

interface AmbientIncomingFriendAdd {
  from: string;
}

interface AmbientBotContactMemory {
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  sightingCount: number;
  outgoingFriendAtMs: number | null;
  whispersReceived: number;
  whispersSent: number;
  lastWhisperAtMs: number | null;
  lastReplyAtMs: number | null;
}

interface AmbientBotSocialPersistentState {
  contacts: Record<string, AmbientBotContactMemory>;
  friendNames: string[];
  blockNames: string[];
}

export interface AmbientPlayerBotPendingReply {
  toName: string;
  incomingText: string;
  fallbackText: string;
  dueAtMs: number;
  askedForFriend: boolean;
  revision: number;
  llmStatus?: 'idle' | 'pending' | 'ready' | 'rejected' | 'error' | 'budget_denied' | 'disabled';
  llmReplyText?: string;
  llmFriendAction?: 'none' | 'send';
  llmPresenceEmote?: AmbientBotLlmPresenceEmote;
  llmMemoryTags?: string[];
  llmRequestedAtMs?: number;
}

export interface AmbientPlayerBotSocialRuntimeState {
  pendingReplies: AmbientPlayerBotPendingReply[];
  lastPresenceEmoteAtByName: Record<string, number>;
}

export type AmbientPlayerBotSocialCommand =
  | { type: 'chat'; text: string }
  | { type: 'friendAdd'; name: string };

export interface AmbientPlayerBotSocialResult {
  commands: AmbientPlayerBotSocialCommand[];
  socialState: Record<string, unknown>;
  shouldPersist: boolean;
  runnerStatePatch: Record<string, unknown>;
}

export interface TickAmbientPlayerBotSocialInput {
  bot: AmbientPlayerBotRecord;
  liveState: AmbientPlayerBotLiveState;
  recentEvents: readonly SimEvent[];
  ambientBotNames: ReadonlySet<string>;
  llmPlan?: AmbientBotPlanDecisionV1 | null;
  nowMs: number;
}

interface NearbyHuman {
  name: string;
  distanceSq: number;
}

export function createAmbientPlayerBotSocialRuntimeState(): AmbientPlayerBotSocialRuntimeState {
  return {
    pendingReplies: [],
    lastPresenceEmoteAtByName: {},
  };
}

export function tickAmbientPlayerBotSocialShell(
  input: TickAmbientPlayerBotSocialInput,
  runtimeState: AmbientPlayerBotSocialRuntimeState,
): AmbientPlayerBotSocialResult {
  const persistent = normalizePersistentState(input.bot.socialState);
  const ambientBotNames = new Set(input.ambientBotNames);
  ambientBotNames.add(input.bot.characterName);
  const profile = ambientBotProfileById(input.bot.profileId);
  const objectiveLabel = typeof input.bot.runnerState.objectiveLabel === 'string'
    ? input.bot.runnerState.objectiveLabel
    : '';
  const llmPlan = input.llmPlan ?? null;
  const friendPolicy = llmPlan?.friendPolicy ?? 'afterWhisper';

  let shouldPersist = false;
  let changed = false;
  const commands: AmbientPlayerBotSocialCommand[] = [];
  let lastWhisperFrom = '';

  const friendNames = sortedUniqueNames(input.liveState.social?.friends.map((friend) => friend.name) ?? persistent.friendNames);
  const blockNames = sortedUniqueNames(input.liveState.social?.blocks.map((block) => block.name) ?? persistent.blockNames);
  const friendNameSet = new Set(friendNames);
  const blockNameSet = new Set(blockNames);
  if (!sameStringArray(persistent.friendNames, friendNames)) {
    persistent.friendNames = friendNames;
    changed = true;
    shouldPersist = true;
  }
  if (!sameStringArray(persistent.blockNames, blockNames)) {
    persistent.blockNames = blockNames;
    changed = true;
    shouldPersist = true;
  }

  const nearbyHumans = collectNearbyHumans(input.liveState, ambientBotNames);
  for (const human of nearbyHumans) {
    const contact = ensureContact(persistent, human.name, input.nowMs);
    if (contact.created) {
      changed = true;
      shouldPersist = true;
    }
    if (contact.entry.lastSeenAtMs <= input.nowMs - SIGHTING_GAP_MS) {
      contact.entry.sightingCount++;
      changed = true;
      shouldPersist = true;
    }
    contact.entry.lastSeenAtMs = input.nowMs;
  }
  trimContacts(persistent, input.nowMs);

  for (const event of input.recentEvents) {
    const friendAdd = incomingFriendAdd(event, ambientBotNames);
    if (friendAdd) {
      const contact = ensureContact(persistent, friendAdd.from, input.nowMs);
      if (contact.created) {
        changed = true;
        shouldPersist = true;
      }
      contact.entry.lastSeenAtMs = input.nowMs;
      if (
        !blockNameSet.has(friendAdd.from)
        && !friendNameSet.has(friendAdd.from)
        && canSendFriendAdd(contact.entry, input.nowMs)
        && commands.length < MAX_SOCIAL_COMMANDS_PER_TICK
      ) {
        commands.push({ type: 'friendAdd', name: friendAdd.from });
        contact.entry.outgoingFriendAtMs = input.nowMs;
        changed = true;
        shouldPersist = true;
      }
      continue;
    }
    const whisper = incomingWhisper(event, input.liveState.self?.id ?? -1, ambientBotNames);
    if (!whisper) continue;
    lastWhisperFrom = whisper.from;
    const contact = ensureContact(persistent, whisper.from, input.nowMs);
    if (contact.created) {
      changed = true;
      shouldPersist = true;
    }
    contact.entry.lastSeenAtMs = input.nowMs;
    contact.entry.whispersReceived++;
    contact.entry.lastWhisperAtMs = input.nowMs;
    changed = true;
    shouldPersist = true;
    if (blockNameSet.has(whisper.from)) continue;
    const sentFriendAdd = (
      !friendNameSet.has(whisper.from)
      && canSendFriendAdd(contact.entry, input.nowMs)
      && allowImmediateFriendAdd(friendPolicy, whisper.text)
      && commands.length < MAX_SOCIAL_COMMANDS_PER_TICK
    );
    if (sentFriendAdd) {
      commands.push({ type: 'friendAdd', name: whisper.from });
      contact.entry.outgoingFriendAtMs = input.nowMs;
      changed = true;
      shouldPersist = true;
    }
    upsertPendingReply(
      runtimeState,
      whisper.from,
      buildReplyText({
        objectiveLabel,
        llmPlan,
        profileArchetype: profile?.archetype ?? 'quester',
        incomingText: whisper.text,
        sentFriendAdd,
      }),
      input.nowMs + replyDelayMs(input.bot.botId, whisper.from, whisper.text),
      whisper.text,
      whisperAskedForFriend(whisper.text),
    );
  }

  if (commands.length < MAX_SOCIAL_COMMANDS_PER_TICK) {
    const emoteTarget = nextEmoteTarget(
      nearbyHumans,
      runtimeState,
      friendNameSet,
      blockNameSet,
      input.nowMs,
      profile?.archetype ?? 'quester',
      llmPlan,
    );
    if (emoteTarget) {
      commands.push({
        type: 'chat',
        text: `/${presenceEmoteFor(profile?.archetype ?? 'quester')} ${emoteTarget.name}`,
      });
      runtimeState.lastPresenceEmoteAtByName[emoteTarget.name] = input.nowMs;
    }
  }

  if (commands.length < MAX_SOCIAL_COMMANDS_PER_TICK) {
    const dueReplies = runtimeState.pendingReplies
      .filter((reply) => reply.dueAtMs <= input.nowMs)
      .sort((a, b) => a.dueAtMs - b.dueAtMs || a.toName.localeCompare(b.toName));
    for (const reply of dueReplies) {
      if (commands.length >= MAX_SOCIAL_COMMANDS_PER_TICK) break;
      if (ambientBotNames.has(reply.toName) || blockNameSet.has(reply.toName)) {
        removePendingReply(runtimeState, reply.toName);
        continue;
      }
      const contact = ensureContact(persistent, reply.toName, input.nowMs).entry;
      if (
        reply.llmFriendAction === 'send'
        && !friendNameSet.has(reply.toName)
        && canSendFriendAdd(contact, input.nowMs)
        && commands.length < MAX_SOCIAL_COMMANDS_PER_TICK
      ) {
        commands.push({ type: 'friendAdd', name: reply.toName });
        contact.outgoingFriendAtMs = input.nowMs;
        changed = true;
        shouldPersist = true;
      }
      if (
        reply.llmPresenceEmote
        && reply.llmPresenceEmote !== 'none'
        && commands.length + 1 < MAX_SOCIAL_COMMANDS_PER_TICK
      ) {
        commands.push({ type: 'chat', text: `/${reply.llmPresenceEmote} ${reply.toName}` });
      }
      if (commands.length >= MAX_SOCIAL_COMMANDS_PER_TICK) continue;
      commands.push({ type: 'chat', text: `/w ${reply.toName} ${replyTextForPendingReply(reply)}` });
      contact.whispersSent++;
      contact.lastReplyAtMs = input.nowMs;
      changed = true;
      shouldPersist = true;
      removePendingReply(runtimeState, reply.toName);
    }
  }

  return {
    commands,
    socialState: serializePersistentState(persistent),
    shouldPersist: shouldPersist || changed && commands.some((command) => command.type === 'friendAdd'),
    runnerStatePatch: {
      socialPendingReplies: runtimeState.pendingReplies.length,
      socialFriends: friendNames.length,
      socialBlocks: blockNames.length,
      ...(llmPlan ? {
        llmPlanMode: llmPlan.socialMode,
        llmPlanFocus: llmPlan.focusLabel,
      } : {}),
      ...(lastWhisperFrom ? { lastWhisperFrom } : {}),
      ...(commands[0]
        ? { lastSocialAction: describeCommand(commands[0]) }
        : {}),
    },
  };
}

function normalizePersistentState(value: Record<string, unknown>): AmbientBotSocialPersistentState {
  const rawContacts = value.contacts;
  const contacts: Record<string, AmbientBotContactMemory> = {};
  if (rawContacts && typeof rawContacts === 'object') {
    for (const [name, entry] of Object.entries(rawContacts as Record<string, unknown>)) {
      const normalized = normalizeContact(entry);
      if (normalized) contacts[name] = normalized;
    }
  }
  return {
    contacts,
    friendNames: sortedUniqueNames(arrayOfStrings(value.friendNames)),
    blockNames: sortedUniqueNames(arrayOfStrings(value.blockNames)),
  };
}

function normalizeContact(value: unknown): AmbientBotContactMemory | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const firstSeenAtMs = finiteNumber(row.firstSeenAtMs) ?? 0;
  const lastSeenAtMs = finiteNumber(row.lastSeenAtMs) ?? firstSeenAtMs;
  if (firstSeenAtMs <= 0 || lastSeenAtMs <= 0) return null;
  return {
    firstSeenAtMs,
    lastSeenAtMs,
    sightingCount: Math.max(1, finiteNumber(row.sightingCount) ?? 1),
    outgoingFriendAtMs: finiteNumber(row.outgoingFriendAtMs),
    whispersReceived: Math.max(0, finiteNumber(row.whispersReceived) ?? 0),
    whispersSent: Math.max(0, finiteNumber(row.whispersSent) ?? 0),
    lastWhisperAtMs: finiteNumber(row.lastWhisperAtMs),
    lastReplyAtMs: finiteNumber(row.lastReplyAtMs),
  };
}

function serializePersistentState(value: AmbientBotSocialPersistentState): Record<string, unknown> {
  const contacts = Object.fromEntries(
    Object.entries(value.contacts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, entry]) => [name, { ...entry }]),
  );
  return {
    contacts,
    friendNames: [...value.friendNames],
    blockNames: [...value.blockNames],
  };
}

function collectNearbyHumans(
  liveState: AmbientPlayerBotLiveState,
  ambientBotNames: ReadonlySet<string>,
): NearbyHuman[] {
  const self = liveState.self;
  if (!self) return [];
  const nearby: NearbyHuman[] = [];
  for (const entity of liveState.entities.values()) {
    if (entity.k !== 'player' || entity.id === self.id) continue;
    if (typeof entity.nm !== 'string' || ambientBotNames.has(entity.nm)) continue;
    if (typeof entity.x !== 'number' || typeof entity.z !== 'number') continue;
    nearby.push({
      name: entity.nm,
      distanceSq: distanceSq(self.x, self.z, entity.x, entity.z),
    });
  }
  return nearby.sort((a, b) => a.distanceSq - b.distanceSq || a.name.localeCompare(b.name));
}

function ensureContact(
  state: AmbientBotSocialPersistentState,
  name: string,
  nowMs: number,
): { entry: AmbientBotContactMemory; created: boolean } {
  const existing = state.contacts[name];
  if (existing) return { entry: existing, created: false };
  const created: AmbientBotContactMemory = {
    firstSeenAtMs: nowMs,
    lastSeenAtMs: nowMs,
    sightingCount: 1,
    outgoingFriendAtMs: null,
    whispersReceived: 0,
    whispersSent: 0,
    lastWhisperAtMs: null,
    lastReplyAtMs: null,
  };
  state.contacts[name] = created;
  return { entry: created, created: true };
}

function trimContacts(state: AmbientBotSocialPersistentState, nowMs: number): void {
  const entries = Object.entries(state.contacts);
  if (entries.length <= MAX_CONTACTS) return;
  entries
    .sort((a, b) => a[1].lastSeenAtMs - b[1].lastSeenAtMs || a[0].localeCompare(b[0]))
    .slice(0, entries.length - MAX_CONTACTS)
    .forEach(([name]) => {
      delete state.contacts[name];
    });
  for (const [name, atMs] of Object.entries(state.contacts)) {
    if (atMs.lastSeenAtMs > nowMs + 1) atMs.lastSeenAtMs = nowMs;
    if (atMs.firstSeenAtMs > atMs.lastSeenAtMs) atMs.firstSeenAtMs = atMs.lastSeenAtMs;
  }
}

function incomingWhisper(
  event: SimEvent,
  selfEntityId: number,
  ambientBotNames: ReadonlySet<string>,
): AmbientIncomingWhisper | null {
  if (event.type !== 'chat' || event.channel !== 'whisper') return null;
  if ('to' in event && event.to !== undefined) return null;
  if (event.fromPid === selfEntityId) return null;
  if (ambientBotNames.has(event.from)) return null;
  return {
    from: event.from,
    text: event.text,
  };
}

function incomingFriendAdd(
  event: SimEvent,
  ambientBotNames: ReadonlySet<string>,
): AmbientIncomingFriendAdd | null {
  const row = event as SimEvent & { type?: unknown; fromName?: unknown };
  if (row.type !== 'friendAddedBy') return null;
  if (typeof row.fromName !== 'string' || ambientBotNames.has(row.fromName)) return null;
  return { from: row.fromName };
}

function canSendFriendAdd(contact: AmbientBotContactMemory, nowMs: number): boolean {
  return contact.outgoingFriendAtMs === null || contact.outgoingFriendAtMs <= nowMs - FRIEND_ADD_COOLDOWN_MS;
}

function upsertPendingReply(
  state: AmbientPlayerBotSocialRuntimeState,
  toName: string,
  fallbackText: string,
  dueAtMs: number,
  incomingText: string,
  askedForFriend: boolean,
): void {
  const existing = state.pendingReplies.find((reply) => reply.toName === toName);
  if (existing) {
    existing.incomingText = incomingText;
    existing.fallbackText = fallbackText;
    existing.dueAtMs = dueAtMs;
    existing.askedForFriend = askedForFriend;
    existing.revision++;
    existing.llmStatus = 'idle';
    existing.llmReplyText = undefined;
    existing.llmFriendAction = undefined;
    existing.llmPresenceEmote = undefined;
    existing.llmMemoryTags = undefined;
    existing.llmRequestedAtMs = undefined;
    return;
  }
  state.pendingReplies.push({
    toName,
    incomingText,
    fallbackText,
    dueAtMs,
    askedForFriend,
    revision: 1,
    llmStatus: 'idle',
  });
  state.pendingReplies.sort((a, b) => a.dueAtMs - b.dueAtMs || a.toName.localeCompare(b.toName));
  if (state.pendingReplies.length > MAX_PENDING_REPLIES) {
    state.pendingReplies.length = MAX_PENDING_REPLIES;
  }
}

function removePendingReply(state: AmbientPlayerBotSocialRuntimeState, toName: string): void {
  const index = state.pendingReplies.findIndex((reply) => reply.toName === toName);
  if (index >= 0) state.pendingReplies.splice(index, 1);
}

function nextEmoteTarget(
  nearbyHumans: readonly NearbyHuman[],
  runtimeState: AmbientPlayerBotSocialRuntimeState,
  friendNames: ReadonlySet<string>,
  blockNames: ReadonlySet<string>,
  nowMs: number,
  archetype: string,
  llmPlan: AmbientBotPlanDecisionV1 | null,
): NearbyHuman | null {
  if (llmPlan && !llmPlan.allowPresenceEmote) return null;
  if (archetype !== 'helper' && archetype !== 'newcomer') return null;
  for (const human of nearbyHumans) {
    if (human.distanceSq > EMOTE_RADIUS * EMOTE_RADIUS) continue;
    if (friendNames.has(human.name) || blockNames.has(human.name)) continue;
    const lastAt = runtimeState.lastPresenceEmoteAtByName[human.name];
    if (lastAt !== undefined && lastAt > nowMs - EMOTE_COOLDOWN_MS) continue;
    return human;
  }
  return null;
}

function presenceEmoteFor(archetype: string): string {
  switch (archetype) {
    case 'helper':
      return 'wave';
    case 'newcomer':
      return 'cheer';
    default:
      return 'wave';
  }
}

function buildReplyText(input: {
  incomingText: string;
  profileArchetype: string;
  objectiveLabel: string;
  llmPlan: AmbientBotPlanDecisionV1 | null;
  sentFriendAdd: boolean;
}): string {
  const text = input.incomingText.toLowerCase();
  if (/\b(friend|add)\b/.test(text)) return 'sure, adding you now';
  if (/\b(thanks|thank you|ty)\b/.test(text)) return 'sure thing';
  if (/\b(hello|hey|hi|yo)\b/.test(text)) return input.sentFriendAdd ? 'hey there, good to see you' : 'hey there';
  if (/\b(help|party|group|invite|dungeon)\b/.test(text)) return 'sticking to solo questing for now';
  if (/\b(where|what|quest|doing|up to)\b/.test(text) && input.objectiveLabel) {
    return `working on ${replyFocusLabel(input.objectiveLabel, input.llmPlan).toLowerCase()} right now`;
  }
  switch (input.profileArchetype) {
    case 'traveler':
      return 'just passing through this road';
    case 'grinder':
      return 'keeping to the grind route';
    case 'helper':
      return 'happy to keep you company out here';
    default:
      return input.objectiveLabel
        ? `following ${replyFocusLabel(input.objectiveLabel, input.llmPlan).toLowerCase()} for a bit`
        : input.llmPlan?.selfSummary || 'just working through the local quests';
  }
}

function allowImmediateFriendAdd(
  policy: AmbientBotLlmFriendPolicy,
  incomingText: string,
): boolean {
  if (policy === 'never') return false;
  if (policy === 'afterWhisper') return true;
  return whisperAskedForFriend(incomingText);
}

function whisperAskedForFriend(text: string): boolean {
  return /\b(friend|add)\b/i.test(text);
}

function replyFocusLabel(
  objectiveLabel: string,
  llmPlan: AmbientBotPlanDecisionV1 | null,
): string {
  return llmPlan?.focusLabel || objectiveLabel;
}

function replyTextForPendingReply(reply: AmbientPlayerBotPendingReply): string {
  return reply.llmReplyText?.trim() || reply.fallbackText;
}

function replyDelayMs(botId: string, fromName: string, text: string): number {
  const hash = stringHash(`${botId}|${fromName}|${text}`);
  return 2_500 + (hash % 3_500);
}

function describeCommand(command: AmbientPlayerBotSocialCommand): string {
  switch (command.type) {
    case 'friendAdd':
      return `friend_add:${command.name}`;
    case 'chat':
      return command.text.startsWith('/w ') ? `reply:${command.text.slice(3).split(/\s+/)[0] ?? ''}` : command.text;
  }
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function sortedUniqueNames(names: readonly string[]): string[] {
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function distanceSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function stringHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
