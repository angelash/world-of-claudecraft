#!/usr/bin/env node
// Live hosted-play harness against the persistent LAN/IP stack.
// It uses only public REST and WebSocket paths so failures match the real client.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const BASE = (process.env.SERVER_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');
const DEFAULT_PASSWORD = 'hunter22';
const DEFAULT_PARTY_SIZE = 5;
const DEFAULT_SAMPLE_MS = 2_000;
const DEFAULT_CHECKPOINT_MS = 30_000;
const DEFAULT_SHORT_DURATION_MS = 120_000;
const DEFAULT_LONG_DURATION_MS = 90 * 60_000;
const DEFAULT_MIN_RUN_MS = 45_000;
const RECENT_EVENT_LIMIT = 240;
const STATUS_SAMPLE_LIMIT = 2_000;
const STATUS_POLL_ERROR_LIMIT = 120;
const STATUS_FETCH_RETRIES = 3;
const STATUS_FETCH_RETRY_DELAY_MS = 500;
const MAX_CONSECUTIVE_STATUS_SAMPLE_FAILURES = 3;
const SAFE_NAME_SUFFIX_LETTERS = 'bcdfghjklmnpqrstvwxyz';

const DELTA_SELF_KEYS = [
  'inv',
  'equip',
  'qlog',
  'qdone',
  'cds',
  'stats',
  'weapon',
  'party',
  'trade',
  'duel',
  'auras',
  'marks',
];
const ENTITY_IDENTITY_KEYS = ['k', 'tid', 'nm', 'lv', 'sc', 'c', 'dgn'];

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out('Usage: node scripts/hosted_play_live_harness.mjs [options]');
  out('');
  out('Options:');
  out('  --duration-ms=N        Max run time. Defaults to 120000, or 90 minutes with --target-level.');
  out('  --sample-ms=N          Hosted status sample interval. Defaults to 2000.');
  out('  --checkpoint-ms=N      Progress report write interval. Defaults to 30000.');
  out('  --target-level=N       Run until the hosted leader reaches this level.');
  out('  --party-size=N         Target party size, 2 to 5. Defaults to 5.');
  out('  --max-stuck-resets=N   Allowed path stuck resets before failing. Defaults to 4.');
  out('  --no-early-exit        Keep running until duration even after short checks pass.');
  out('  --report=PATH          Report path. Defaults under tmp/.');
  out('  --resume-report=PATH   Continue with the roster from a previous harness report.');
  out('  --resume-run-id=ID     Run id for older reports that do not include usernames.');
  out('  --help                 Show this help.');
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    durationMs: null,
    sampleMs: DEFAULT_SAMPLE_MS,
    checkpointMs: DEFAULT_CHECKPOINT_MS,
    targetLevel: 0,
    partySize: DEFAULT_PARTY_SIZE,
    maxStuckResets: 4,
    earlyExit: true,
    reportPath: '',
    resumeReportPath: '',
    resumeRunId: '',
  };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--no-early-exit') {
      args.earlyExit = false;
      continue;
    }
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    if (!match) usage(1);
    const [, key, value] = match;
    switch (key) {
      case 'duration-ms':
        args.durationMs = positiveInt(value, key);
        break;
      case 'sample-ms':
        args.sampleMs = positiveInt(value, key);
        break;
      case 'checkpoint-ms':
        args.checkpointMs = positiveInt(value, key);
        break;
      case 'target-level':
        args.targetLevel = positiveInt(value, key);
        break;
      case 'party-size':
        args.partySize = positiveInt(value, key);
        break;
      case 'max-stuck-resets':
        args.maxStuckResets = positiveInt(value, key);
        break;
      case 'report':
        args.reportPath = value;
        break;
      case 'resume-report':
        args.resumeReportPath = value;
        break;
      case 'resume-run-id':
        args.resumeRunId = value;
        break;
      default:
        usage(1);
    }
  }
  if (args.partySize < 2 || args.partySize > 5) {
    throw new Error('--party-size must be between 2 and 5');
  }
  if (args.sampleMs < 500) throw new Error('--sample-ms must be at least 500');
  if (args.checkpointMs < args.sampleMs) throw new Error('--checkpoint-ms must be at least --sample-ms');
  return {
    ...args,
    durationMs: args.durationMs ?? (args.targetLevel > 0 ? DEFAULT_LONG_DURATION_MS : DEFAULT_SHORT_DURATION_MS),
  };
}

function positiveInt(value, key) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${key} must be a positive integer`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function alphaSuffix(seed) {
  const chars = [];
  for (const char of seed) {
    chars.push(SAFE_NAME_SUFFIX_LETTERS[char.charCodeAt(0) % SAFE_NAME_SUFFIX_LETTERS.length]);
  }
  return chars.slice(-6).join('').padStart(6, 'b');
}

function mergeSelf(prev, next) {
  if (prev) {
    for (const key of DELTA_SELF_KEYS) {
      if (!(key in next)) next[key] = prev[key];
    }
  }
  return next;
}

function mergeEnts(prevEnts, snap) {
  const next = new Map();
  for (const wire of snap.ents ?? []) {
    const prev = prevEnts.get(wire.id);
    if (prev && wire.k === undefined) {
      for (const key of ENTITY_IDENTITY_KEYS) {
        if (key in prev) wire[key] = prev[key];
      }
    }
    next.set(wire.id, wire);
  }
  for (const id of snap.keep ?? []) {
    const prev = prevEnts.get(id);
    if (prev) next.set(id, prev);
  }
  return next;
}

async function api(pathname, opts = {}, token = null) {
  const res = await fetch(BASE + pathname, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

class Client {
  constructor(label, characterClass) {
    this.label = label;
    this.characterClass = characterClass;
    this.username = '';
    this.name = '';
    this.token = '';
    this.characterId = 0;
    this.pid = -1;
    this.self = null;
    this.entities = new Map();
    this.events = [];
    this.errors = [];
    this.snapshots = 0;
    this.inviteCursor = 0;
    this.hostedEnabled = false;
    this.ws = null;
  }

  async provision(runId, suffix) {
    this.username = `hosted_${runId}_${this.label.toLowerCase()}`;
    const registered = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username: this.username, password: DEFAULT_PASSWORD }),
    });
    if (registered.status !== 200 || !registered.body.token) {
      throw new Error(`register failed for ${this.label}: ${registered.status} ${registered.body.error ?? ''}`);
    }
    this.token = registered.body.token;

    const created = await api('/api/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: `${this.label}${suffix}`.slice(0, 16),
        class: this.characterClass,
      }),
    }, this.token);
    if (created.status !== 200 || !created.body.id) {
      throw new Error(`character create failed for ${this.label}: ${created.status} ${created.body.error ?? ''}`);
    }
    this.name = created.body.name ?? `${this.label}${suffix}`.slice(0, 16);
    this.characterId = created.body.id;
  }

  async loginExisting(username, name, characterId) {
    this.username = username;
    this.name = name;
    this.characterId = characterId;
    const loggedIn = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: DEFAULT_PASSWORD }),
    });
    if (loggedIn.status !== 200 || !loggedIn.body.token) {
      throw new Error(`login failed for ${this.label}: ${loggedIn.status} ${loggedIn.body.error ?? ''}`);
    }
    this.token = loggedIn.body.token;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_BASE}/ws`);
      this.ws = ws;
      const timeout = setTimeout(() => reject(new Error(`connect timeout for ${this.label}`)), 8_000);
      ws.on('open', () => {
        this.send({ t: 'auth', token: this.token, character: this.characterId });
      });
      ws.on('message', (data) => {
        const msg = JSON.parse(String(data));
        if (msg.t === 'hello') {
          this.pid = msg.pid;
          clearTimeout(timeout);
          resolve(msg);
          return;
        }
        if (msg.t === 'snap') {
          this.self = mergeSelf(this.self, msg.self);
          this.entities = mergeEnts(this.entities, msg);
          if (this.self) this.entities.set(this.self.id, this.self);
          this.snapshots++;
          return;
        }
        if (msg.t === 'events') {
          const atMs = Date.now();
          for (const event of msg.list ?? []) {
            this.events.push({ atMs, ...event });
          }
          return;
        }
        if (msg.t === 'error') {
          const text = String(msg.error ?? 'unknown ws error');
          this.errors.push(text);
          clearTimeout(timeout);
          reject(new Error(text));
        }
      });
      ws.on('error', (err) => {
        const text = err instanceof Error ? err.message : String(err);
        this.errors.push(text);
        clearTimeout(timeout);
        reject(err);
      });
      ws.on('close', () => {
        if (this.pid > 0) this.events.push({ atMs: Date.now(), type: 'socketClosed' });
      });
    });
  }

  send(payload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  cmd(payload) {
    this.send({ t: 'cmd', ...payload });
  }

  input(mi, facing) {
    this.send({ t: 'input', mi, ...(facing !== undefined ? { facing } : {}) });
  }

  close() {
    this.ws?.close();
  }
}

function hostedPreferences(targetPartySize, autoInviteNearbyPlayers = true) {
  return {
    resumeOnLogin: false,
    partyMode: 'follow_leader',
    actionLogEnabled: true,
    autoInviteNearbyPlayers,
    autoInviteNearbyTargetPartySize: targetPartySize,
  };
}

async function configureAndEnableHosted(client, targetPartySize, autoInviteNearbyPlayers = true) {
  const prefs = hostedPreferences(targetPartySize, autoInviteNearbyPlayers);
  const settings = await api(
    `/api/characters/${client.characterId}/hosted-play/settings`,
    { method: 'PUT', body: JSON.stringify(prefs) },
    client.token,
  );
  if (settings.status !== 200) {
    throw new Error(`hosted settings failed for ${client.name}: ${settings.status} ${settings.body.error ?? ''}`);
  }
  const enabled = await api(
    `/api/characters/${client.characterId}/hosted-play`,
    { method: 'POST', body: JSON.stringify({}) },
    client.token,
  );
  if (enabled.status !== 200 || enabled.body.enabled !== true) {
    throw new Error(`hosted enable failed for ${client.name}: ${enabled.status} ${enabled.body.error ?? ''}`);
  }
  client.hostedEnabled = true;
  return enabled.body;
}

async function hostedStatus(client) {
  let lastError = null;
  for (let attempt = 1; attempt <= STATUS_FETCH_RETRIES; attempt++) {
    try {
      const res = await api(`/api/characters/${client.characterId}/hosted-play`, {}, client.token);
      if (res.status !== 200) {
        throw new Error(`hosted status failed for ${client.name}: ${res.status} ${res.body.error ?? ''}`);
      }
      return res.body;
    } catch (err) {
      lastError = err;
      if (attempt < STATUS_FETCH_RETRIES) await sleep(STATUS_FETCH_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`hosted status failed for ${client.name}`);
}

function partyMembers(client) {
  return client.self?.party?.members ?? [];
}

function partySize(client) {
  return partyMembers(client).length || 1;
}

function samePartyAsLeader(leader, client) {
  const members = partyMembers(leader);
  return members.some((member) => member.pid === client.pid || member.name === client.name);
}

function samePartyAsClient(client, peer) {
  const members = partyMembers(client);
  return members.some((member) => member.pid === peer.pid || member.name === peer.name);
}

function distance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(Number(a.x ?? 0) - Number(b.x ?? 0), Number(a.z ?? 0) - Number(b.z ?? 0));
}

function guideWaitingHelpersTowardLeader(leader, helpers) {
  for (const helper of helpers) {
    if (helper.hostedEnabled || samePartyAsLeader(leader, helper)) {
      helper.input({});
      continue;
    }
    const dist = distance(helper.self, leader.self);
    if (!Number.isFinite(dist)) continue;
    if (dist > 24) {
      const facing = Math.atan2(
        Number(leader.self.x ?? 0) - Number(helper.self.x ?? 0),
        Number(leader.self.z ?? 0) - Number(helper.self.z ?? 0),
      );
      helper.input({ f: 1 }, facing);
    } else {
      helper.input({});
    }
  }
}

function acceptPendingInvites(clients, report) {
  for (const client of clients) {
    for (; client.inviteCursor < client.events.length; client.inviteCursor++) {
      const event = client.events[client.inviteCursor];
      if (event.type !== 'partyInvite') continue;
      report.metrics.invitesReceived++;
      report.recentEvents.push(slimEvent(client, event));
      trimArray(report.recentEvents, RECENT_EVENT_LIMIT);
      client.cmd({ cmd: 'paccept' });
      report.metrics.invitesAccepted++;
    }
  }
}

async function enableHostedForJoinedMembers(leader, members, targetPartySize, report) {
  for (const member of members) {
    if (member.hostedEnabled) continue;
    const joinedByLeaderView = samePartyAsLeader(leader, member);
    const joinedByMemberView = samePartyAsClient(member, leader);
    const nearFullLeader = partySize(leader) >= targetPartySize
      && distance(member.self, leader.self) <= 8;
    if (!joinedByLeaderView && !joinedByMemberView && !nearFullLeader) continue;
    const joined = joinedByLeaderView || joinedByMemberView;
    const status = await configureAndEnableHosted(member, targetPartySize, joined);
    report.lifecycle.push({
      atMs: Date.now(),
      action: joined ? 'enable-member-hosted' : 'enable-near-leader-hosted',
      name: member.name,
      mode: status.mode,
      groupMode: status.groupMode,
    });
  }
}

function collectEvents(clients, report, eventCursorByPid) {
  for (const client of clients) {
    const cursor = eventCursorByPid.get(client.pid) ?? 0;
    for (let index = cursor; index < client.events.length; index++) {
      const event = client.events[index];
      const key = event.type === 'chat' && event.channel ? `chat:${event.channel}` : event.type;
      report.eventCounts[key] = (report.eventCounts[key] ?? 0) + 1;
      if (event.type === 'chat') {
        report.metrics.chatMessages++;
        if (event.channel === 'party') report.metrics.partyChatMessages++;
      }
      if (event.type === 'questAccepted' || event.type === 'questProgress' || event.type === 'questReady' || event.type === 'questDone') {
        report.metrics.questEvents++;
      }
      if (event.type === 'aura' && event.gained) report.metrics.auraGainedEvents++;
      if (event.type === 'heal') report.metrics.healEvents++;
      if (event.type === 'castStart' || event.type === 'castStop') report.metrics.castEvents++;
      if (event.type === 'death') {
        const entityId = Number(event.entityId ?? -1);
        const victim = clients.find((candidate) => candidate.pid === entityId);
        if (victim) recordPlayerDeath(report, victim, event);
        else report.metrics.mobDeathEvents++;
      }
      if (event.type === 'playerDeath') {
        const pid = Number(event.pid ?? -1);
        const victim = clients.find((candidate) => candidate.pid === pid);
        recordPlayerDeath(report, victim ?? client, event);
      }
      if (event.type === 'error') {
        report.metrics.errorEvents++;
        const text = typeof event.text === 'string' ? event.text : 'unknown error';
        report.metrics.errorTexts[text] = (report.metrics.errorTexts[text] ?? 0) + 1;
      }
      report.recentEvents.push(slimEvent(client, event));
      trimArray(report.recentEvents, RECENT_EVENT_LIMIT);
    }
    eventCursorByPid.set(client.pid, client.events.length);
  }
}

function recordPlayerDeath(report, victim, event) {
  const victimPid = Number(event.entityId ?? event.pid ?? victim.pid ?? -1);
  const killerId = Number(event.killerId ?? -1);
  const timeBucketMs = Math.floor(Number(event.atMs ?? 0) / 1_000) * 1_000;
  const key = `${victimPid}:${timeBucketMs}`;
  if (report.metrics.playerDeathRecords.some((record) => record.key === key)) return;
  report.metrics.playerDeathRecords.push({
    key,
    atMs: Number(event.atMs ?? 0),
    victimPid,
    victimName: victim.name,
    killerId,
    eventType: event.type,
  });
  report.metrics.playerDeathEvents = report.metrics.playerDeathRecords.length;
}

function slimEvent(client, event) {
  const slim = {
    atMs: event.atMs,
    player: client.name,
    type: event.type,
  };
  for (const key of [
    'from',
    'fromName',
    'channel',
    'text',
    'questId',
    'targetId',
    'name',
    'gained',
    'amount',
    'ability',
    'entityId',
    'killerId',
    'pid',
  ]) {
    if (event[key] !== undefined) slim[key] = event[key];
  }
  return slim;
}

function trimArray(values, limit) {
  if (values.length > limit) values.splice(0, values.length - limit);
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

async function sampleHostedRows(clients) {
  const statuses = await Promise.all(clients.map((client) => hostedStatus(client)));
  return statuses.map((statusRow, index) => summarizeStatus(clients[index], statusRow));
}

function summarizeStatus(client, status) {
  const debug = status.debug ?? {};
  const party = debug.party ?? {};
  const brainState = debug.brainState ?? {};
  const commands = Array.isArray(debug.commands) ? debug.commands.map((command) => command.summary) : [];
  return {
    character: client.name,
    level: client.self?.lv ?? client.self?.level ?? 0,
    xp: client.self?.xp ?? 0,
    hp: client.self?.hp ?? 0,
    maxHp: client.self?.mhp ?? 0,
    dead: client.self?.dead === 1 || client.self?.dead === true || (client.self?.hp ?? 1) <= 0,
    x: round(client.self?.x ?? 0),
    z: round(client.self?.z ?? 0),
    partySize: partySize(client),
    partyMembers: partyMembers(client).map((member) => member.name ?? String(member.pid ?? 'unknown')),
    qlog: client.self?.qlog?.length ?? 0,
    qdone: client.self?.qdone?.length ?? 0,
    hosted: {
      mode: status.mode,
      active: status.active,
      groupMode: status.groupMode,
      objectiveId: status.objectiveId,
      objectiveLabel: status.objectiveLabel,
      lastError: status.lastError,
      partyRole: party.partyRole ?? '',
      partyDuty: party.partyDuty ?? '',
      intentKind: party.intentKind ?? '',
      intentBehavior: party.intentBehavior ?? '',
      intentSummary: party.intentSummary ?? '',
      lastPartyChatAction: party.lastPartyChatAction ?? '',
      commands,
      stuckResets: brainState.stuckResets ?? 0,
      pathLength: brainState.pathLength ?? 0,
    },
  };
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function updateMetricsFromStatus(report, statusRows) {
  const leaderRow = statusRows[0];
  report.metrics.maxPartySize = Math.max(report.metrics.maxPartySize, leaderRow?.partySize ?? 1);
  report.metrics.maxLeaderLevel = Math.max(report.metrics.maxLeaderLevel, leaderRow?.level ?? 0);
  report.metrics.maxQuestLog = Math.max(report.metrics.maxQuestLog, leaderRow?.qlog ?? 0);
  report.metrics.maxQuestDone = Math.max(report.metrics.maxQuestDone, leaderRow?.qdone ?? 0);
  for (const row of statusRows) {
    const hosted = row.hosted;
    if (hosted.groupMode) report.metrics.groupModes[hosted.groupMode] = (report.metrics.groupModes[hosted.groupMode] ?? 0) + 1;
    if (hosted.partyRole) report.metrics.partyRoles[hosted.partyRole] = (report.metrics.partyRoles[hosted.partyRole] ?? 0) + 1;
    if (hosted.intentKind) report.metrics.intentKinds[hosted.intentKind] = (report.metrics.intentKinds[hosted.intentKind] ?? 0) + 1;
    if (hosted.lastPartyChatAction) report.metrics.partyChatActions[hosted.lastPartyChatAction] =
      (report.metrics.partyChatActions[hosted.lastPartyChatAction] ?? 0) + 1;
    if (hosted.commands.includes('pinvite')) report.metrics.pinviteCommandSamples++;
    if (hosted.commands.includes('paccept')) report.metrics.pacceptCommandSamples++;
    if (hosted.commands.some((command) => command === 'cast' || command === 'target' || command === 'attack')) {
      report.metrics.combatCommandSamples++;
    }
    if (hosted.lastError) report.metrics.hostedErrors.push({ character: row.character, error: hosted.lastError });
    if (hosted.stuckResets > 0) report.metrics.maxStuckResets = Math.max(report.metrics.maxStuckResets, hosted.stuckResets);
    const questState = row.qlog + row.qdone;
    report.metrics.questStateByCharacter[row.character] = Math.max(
      report.metrics.questStateByCharacter[row.character] ?? 0,
      questState,
    );
    if (row.dead && !report.metrics.deadPlayerNames.includes(row.character)) {
      report.metrics.deadPlayerNames.push(row.character);
    }
  }
}

function createReport(options, clients, statusBody) {
  return {
    startedAt: new Date().toISOString(),
    completedAt: '',
    baseUrl: BASE,
    serverStatus: statusBody,
    options,
    ...(options.runId ? { runId: options.runId } : {}),
    ...(options.resumedFrom ? { resumedFrom: options.resumedFrom } : {}),
    roster: clients.map((client) => ({
      label: client.label,
      name: client.name,
      class: client.characterClass,
      username: client.username,
      characterId: client.characterId,
      pid: client.pid,
    })),
    lifecycle: [],
    statusSamples: [],
    eventCounts: {},
    recentEvents: [],
    metrics: {
      invitesReceived: 0,
      invitesAccepted: 0,
      pinviteCommandSamples: 0,
      pacceptCommandSamples: 0,
      maxPartySize: 1,
      maxLeaderLevel: 1,
      maxQuestLog: 0,
      maxQuestDone: 0,
      questEvents: 0,
      chatMessages: 0,
      partyChatMessages: 0,
      auraGainedEvents: 0,
      healEvents: 0,
      castEvents: 0,
      combatCommandSamples: 0,
      mobDeathEvents: 0,
      playerDeathEvents: 0,
      playerDeathRecords: [],
      errorEvents: 0,
      errorTexts: {},
      maxStuckResets: 0,
      groupModes: {},
      partyRoles: {},
      intentKinds: {},
      partyChatActions: {},
      questStateByCharacter: {},
      deadPlayerNames: [],
      wsErrors: [],
      hostedErrors: [],
      statusPollErrors: [],
    },
    checks: [],
  };
}

function buildChecks(report, options) {
  const metrics = report.metrics;
  const targetLevelReached = options.targetLevel <= 0 || metrics.maxLeaderLevel >= options.targetLevel;
  const supportIntentObserved =
    Object.keys(metrics.partyRoles).length > 0
    && Object.keys(metrics.intentKinds).length > 0;
  const cooperationObserved =
    ['follow_leader', 'assist_party', 'prepare_party', 'recover_party', 'hold_regroup', 'brain']
      .some((mode) => metrics.groupModes[mode] > 0);
  const questSignalObserved = metrics.questEvents > 0 || metrics.maxQuestLog > 0 || metrics.maxQuestDone > 0;
  const allMembersTouchedQuestState = report.roster.every((entry) => (metrics.questStateByCharacter[entry.name] ?? 0) > 0);
  const latestRows = report.statusSamples.at(-1)?.rows ?? [];
  const allClientsCurrentlyInTargetParty = latestRows.length >= options.partySize
    && latestRows.every((row) => row.partySize >= options.partySize);
  const supportEventObserved =
    metrics.auraGainedEvents > 0
    || metrics.healEvents > 0
    || metrics.castEvents > 0
    || metrics.combatCommandSamples > 0;
  const followStartStopNoise = countErrorTexts(metrics, (text) =>
    text.startsWith('Now following ') || text === 'You stop following.');
  const programRuntimeClean =
    metrics.hostedErrors.length === 0
    && metrics.wsErrors.length === 0;
  const stuckWithinLimit = metrics.maxStuckResets <= options.maxStuckResets;

  return [
    check('server status ok', report.serverStatus?.ok === true),
    check('all clients connected', report.roster.every((entry) => entry.pid > 0)),
    check('hosted invite observed', metrics.invitesReceived > 0 || metrics.pinviteCommandSamples > 0),
    check('party reached target size', metrics.maxPartySize >= options.partySize),
    check('all clients currently see target party', allClientsCurrentlyInTargetParty),
    check('party chat observed', metrics.partyChatMessages > 0),
    check('party intent and roles observed', supportIntentObserved),
    check('cooperation mode observed', cooperationObserved),
    check('quest signal observed', questSignalObserved),
    check('all party members touched quest state', allMembersTouchedQuestState),
    check('support or combat signal observed', supportEventObserved),
    check('hosted follow start-stop noise absent', followStartStopNoise === 0),
    check('program runtime stayed clean', programRuntimeClean),
    check(`stuck resets at or below ${options.maxStuckResets}`, stuckWithinLimit),
    check(
      options.targetLevel > 0 ? `leader reached level ${options.targetLevel}` : 'target level not requested',
      targetLevelReached,
    ),
  ];
}

function check(name, pass) {
  return { name, pass: !!pass };
}

function countErrorTexts(metrics, predicate) {
  let count = 0;
  for (const [text, value] of Object.entries(metrics.errorTexts ?? {})) {
    if (!predicate(text)) continue;
    count += Number(value) || 0;
  }
  return count;
}

function reportPath(options) {
  if (options.reportPath) return path.resolve(repoRoot, options.reportPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(repoRoot, 'tmp', `hosted-play-live-harness-${stamp}.json`);
}

function loadReport(reportPath) {
  const fullPath = path.resolve(repoRoot, reportPath);
  return {
    fullPath,
    report: JSON.parse(readFileSync(fullPath, 'utf8')),
  };
}

function usernameFromResumeEntry(entry, options, sourceReport) {
  if (typeof entry.username === 'string' && entry.username.length > 0) return entry.username;
  const runId = options.resumeRunId || sourceReport.runId || '';
  if (runId) return `hosted_${runId}_${String(entry.label).toLowerCase()}`;
  throw new Error(
    `resume report entry for ${entry.label ?? entry.name ?? 'unknown'} does not include a username; pass --resume-run-id`,
  );
}

async function resumeClients(options) {
  const { fullPath, report } = loadReport(options.resumeReportPath);
  if (!Array.isArray(report.roster) || report.roster.length === 0) {
    throw new Error(`resume report has no roster: ${fullPath}`);
  }
  const clients = [];
  for (const entry of report.roster.slice(0, options.partySize)) {
    const label = String(entry.label ?? '');
    const characterClass = String(entry.class ?? '');
    const name = String(entry.name ?? '');
    const characterId = Number(entry.characterId ?? 0);
    if (!label || !characterClass || !name || !Number.isInteger(characterId) || characterId <= 0) {
      throw new Error(`resume report has an invalid roster entry: ${JSON.stringify(entry)}`);
    }
    const client = new Client(label, characterClass);
    const username = usernameFromResumeEntry(entry, options, report);
    await client.loginExisting(username, name, characterId);
    clients.push(client);
  }
  return {
    clients,
    source: fullPath,
    sourceRunId: report.runId || options.resumeRunId || '',
  };
}

function writeReport(report, outPath) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const status = await api('/api/status');
  if (status.status !== 200 || status.body.ok !== true) {
    throw new Error(`server status failed: ${status.status}`);
  }

  let runId = Date.now().toString(36);
  let clients;
  if (options.resumeReportPath) {
    const resumed = await resumeClients(options);
    clients = resumed.clients;
    options.resumedFrom = resumed.source;
    if (resumed.sourceRunId) runId = resumed.sourceRunId;
  } else {
    const suffix = alphaSuffix(runId);
    clients = [
      new Client('Alden', 'warrior'),
      new Client('Mira', 'priest'),
      new Client('Corin', 'mage'),
      new Client('Tovin', 'paladin'),
      new Client('Liora', 'druid'),
    ].slice(0, options.partySize);

    for (const client of clients) {
      await client.provision(runId, suffix);
    }
  }
  options.runId = runId;
  await Promise.all(clients.map((client) => client.connect()));
  await sleep(1_200);

  const report = createReport(options, clients, status.body);
  const outPath = reportPath(options);
  writeReport(report, outPath);
  const leader = clients[0];
  const members = clients.slice(1);
  const enabledLeader = await configureAndEnableHosted(leader, options.partySize, true);
  report.lifecycle.push({
    atMs: Date.now(),
    action: 'enable-leader-hosted',
    name: leader.name,
    mode: enabledLeader.mode,
    groupMode: enabledLeader.groupMode,
  });

  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + options.durationMs;
  const eventCursorByPid = new Map(clients.map((client) => [client.pid, 0]));
  let nextSampleAtMs = 0;
  let nextCheckpointAtMs = startedAtMs + options.checkpointMs;
  let finalReason = 'duration';
  let consecutiveStatusSampleFailures = 0;

  while (Date.now() < deadlineMs) {
    acceptPendingInvites(clients, report);
    collectEvents(clients, report, eventCursorByPid);
    guideWaitingHelpersTowardLeader(leader, members);
    await enableHostedForJoinedMembers(leader, members, options.partySize, report);

    const nowMs = Date.now();
    if (nowMs >= nextSampleAtMs) {
      let rows = null;
      try {
        rows = await sampleHostedRows(clients);
        consecutiveStatusSampleFailures = 0;
      } catch (err) {
        consecutiveStatusSampleFailures++;
        report.metrics.statusPollErrors.push({
          atMs: nowMs,
          elapsedMs: nowMs - startedAtMs,
          consecutiveFailures: consecutiveStatusSampleFailures,
          error: errorMessage(err),
        });
        trimArray(report.metrics.statusPollErrors, STATUS_POLL_ERROR_LIMIT);
        nextSampleAtMs = nowMs + options.sampleMs;
        if (consecutiveStatusSampleFailures >= MAX_CONSECUTIVE_STATUS_SAMPLE_FAILURES) throw err;
      }
      if (rows) {
        updateMetricsFromStatus(report, rows);
        report.statusSamples.push({
          atMs: nowMs,
          elapsedMs: nowMs - startedAtMs,
          rows,
        });
        trimArray(report.statusSamples, STATUS_SAMPLE_LIMIT);
        nextSampleAtMs = nowMs + options.sampleMs;

        const checks = buildChecks(report, options);
        const allRequiredPassed = checks.every((entry) => entry.pass || entry.name === 'target level not requested');
        const targetLevelReached = options.targetLevel <= 0 || report.metrics.maxLeaderLevel >= options.targetLevel;
        const minRunElapsed = nowMs - startedAtMs >= DEFAULT_MIN_RUN_MS;
        if (options.earlyExit && minRunElapsed && allRequiredPassed && targetLevelReached) {
          finalReason = options.targetLevel > 0 ? 'target-level' : 'checks-passed';
          break;
        }
      }
    }
    if (nowMs >= nextCheckpointAtMs) {
      report.completedAt = new Date().toISOString();
      report.finalReason = 'running';
      report.metrics.wsErrors = clients.flatMap((client) =>
        client.errors.map((error) => ({ character: client.name, error })),
      );
      report.checks = buildChecks(report, options);
      writeReport(report, outPath);
      console.log(
        `progress ${Math.round((nowMs - startedAtMs) / 1000)}s `
        + `level=${report.metrics.maxLeaderLevel} `
        + `party=${report.metrics.maxPartySize} `
        + `quests=${Object.values(report.metrics.questStateByCharacter).join(',')} `
        + `stuck=${report.metrics.maxStuckResets}`,
      );
      nextCheckpointAtMs = nowMs + options.checkpointMs;
    }

    await sleep(250);
  }

  collectEvents(clients, report, eventCursorByPid);
  let finalRows = null;
  try {
    finalRows = await sampleHostedRows(clients);
  } catch (err) {
    report.metrics.statusPollErrors.push({
      atMs: Date.now(),
      elapsedMs: Date.now() - startedAtMs,
      consecutiveFailures: consecutiveStatusSampleFailures + 1,
      final: true,
      error: errorMessage(err),
    });
    trimArray(report.metrics.statusPollErrors, STATUS_POLL_ERROR_LIMIT);
    if (report.statusSamples.length === 0) throw err;
  }
  if (finalRows) {
    updateMetricsFromStatus(report, finalRows);
    report.statusSamples.push({
      atMs: Date.now(),
      elapsedMs: Date.now() - startedAtMs,
      rows: finalRows,
      final: true,
    });
    trimArray(report.statusSamples, STATUS_SAMPLE_LIMIT);
  }
  report.completedAt = new Date().toISOString();
  report.finalReason = finalReason;
  report.metrics.wsErrors = clients.flatMap((client) =>
    client.errors.map((error) => ({ character: client.name, error })),
  );
  report.checks = buildChecks(report, options);

  for (const client of clients) client.close();

  writeReport(report, outPath);

  for (const entry of report.checks) {
    console.log(`${entry.pass ? 'OK  ' : 'FAIL'} ${entry.name}`);
  }
  console.log(`Report: ${outPath}`);
  const failed = report.checks.some((entry) => !entry.pass);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
