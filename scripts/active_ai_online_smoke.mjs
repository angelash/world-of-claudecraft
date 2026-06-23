// Online active-AI smoke test against a running realm.
// Verifies: status, register/login, character create, WS join,
// nearby NPC discovery, live aiThinking, and live aiSpeech delivery.
import WebSocket from 'ws';

const BASE = process.env.SERVER_URL ?? 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');

let pass = 0;
let fail = 0;
let warn = 0;

function ok(name, extra = '') {
  pass++;
  console.log(`OK   ${name}${extra ? ` ${extra}` : ''}`);
}

function no(name, extra = '') {
  fail++;
  console.log(`FAIL ${name}${extra ? ` ${extra}` : ''}`);
}

function caution(name, extra = '') {
  warn++;
  console.log(`WARN ${name}${extra ? ` ${extra}` : ''}`);
}

async function api(path, opts = {}, token = null) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const DELTA_SELF_KEYS = ['inv', 'equip', 'qlog', 'qdone', 'cds', 'stats', 'weapon', 'party', 'trade', 'duel'];
function mergeSelf(prev, next) {
  if (prev) {
    for (const key of DELTA_SELF_KEYS) {
      if (!(key in next)) next[key] = prev[key];
    }
  }
  return next;
}

const ENTITY_IDENTITY_KEYS = ['k', 'tid', 'nm', 'lv', 'sc', 'c', 'dgn'];
function mergeEnts(prevEnts, snap) {
  const next = new Map();
  for (const wire of snap.ents) {
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Client {
  constructor() {
    this.pid = -1;
    this.self = null;
    this.entities = new Map();
    this.events = [];
    this.errors = [];
  }

  connect(token, characterId) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws`);
      const timeout = setTimeout(() => reject(new Error('connect timeout')), 8000);
      this.ws.on('open', () => {
        this.send({ t: 'auth', token, character: characterId });
      });
      this.ws.on('message', (data) => {
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
          return;
        }
        if (msg.t === 'events') {
          this.events.push(...msg.list);
          return;
        }
        if (msg.t === 'error') {
          this.errors.push(String(msg.error ?? 'unknown error'));
          clearTimeout(timeout);
          reject(new Error(String(msg.error ?? 'unknown error')));
        }
      });
      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  cmd(payload) {
    this.send({ t: 'cmd', ...payload });
  }

  clearEvents() {
    this.events.length = 0;
  }

  async waitForEvent(predicate, timeoutMs, stepMs = 100) {
    const deadline = Date.now() + timeoutMs;
    let cursor = 0;
    while (Date.now() < deadline) {
      for (; cursor < this.events.length; cursor++) {
        const event = this.events[cursor];
        if (predicate(event)) return event;
      }
      await sleep(stepMs);
    }
    return null;
  }

  nearestNpc(maxDistance = 28) {
    if (!this.self) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const entity of this.entities.values()) {
      if (entity.id === this.self.id || entity.k !== 'npc') continue;
      const dx = Number(entity.x ?? 0) - Number(this.self.x ?? 0);
      const dz = Number(entity.z ?? 0) - Number(this.self.z ?? 0);
      const distance = Math.hypot(dx, dz);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { id: entity.id, tid: entity.tid ?? '?', name: entity.nm ?? '?', distance };
      }
    }
    return best && best.distance <= maxDistance ? best : null;
  }

  close() {
    this.ws?.close();
  }
}

async function main() {
  const status = await api('/api/status');
  if (status.status === 200 && status.body.ok) {
    ok('server status', `realm=${status.body.realm ?? 'unknown'} online=${status.body.players_online ?? 'n/a'}`);
  } else {
    no('server status', `status=${status.status}`);
  }

  const uniq = Date.now().toString(36);
  const alpha = uniq.replace(/[0-9]/g, (digit) => 'abcdefghij'[Number(digit)]).slice(-6);
  const username = `active_ai_${uniq}`;
  const charName = `Aivox${alpha}`;
  const password = 'hunter22';

  const registered = await api('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (registered.status === 200 && registered.body.token) ok('register account');
  else no('register account', `status=${registered.status} error=${registered.body.error ?? 'unknown'}`);
  const token = registered.body.token;
  if (!token) throw new Error('registration did not return a token');

  const created = await api('/api/characters', {
    method: 'POST',
    body: JSON.stringify({ name: charName, class: 'warrior' }),
  }, token);
  if (created.status === 200 && created.body.id > 0) ok('create character', `id=${created.body.id}`);
  else no('create character', `status=${created.status} error=${created.body.error ?? 'unknown'}`);
  const characterId = created.body.id;
  if (!characterId) throw new Error('character creation did not return an id');

  const client = new Client();
  try {
    await client.connect(token, characterId);
    ok('join websocket', `pid=${client.pid}`);
    await sleep(1200);

    const npc = client.nearestNpc();
    if (npc) ok('find nearby npc', `${npc.tid} #${npc.id} dist=${npc.distance.toFixed(1)}`);
    else no('find nearby npc', `visible entities=${client.entities.size}`);
    if (!npc) throw new Error('no nearby npc visible from the spawn area');

    const proactive = await client.waitForEvent(
      (event) => (event.type === 'aiThinking' || event.type === 'aiSpeech') && event.pid === client.pid,
      40_000,
    );
    if (proactive) ok('observe proactive active AI', `type=${proactive.type}`);
    else caution('observe proactive active AI', 'no spontaneous event arrived within 40s');

    client.clearEvents();
    client.cmd({ cmd: 'ai_interact_npc', npc: npc.id, locale: 'en', topic: 'recent' });
    const thinking = await client.waitForEvent(
      (event) => event.type === 'aiThinking' && event.speakerId === npc.id && event.pid === client.pid,
      20_000,
    );
    if (thinking) ok('manual aiThinking', `${thinking.speakerName ?? npc.name} ${thinking.durationMs}ms`);
    else no('manual aiThinking', `npc=${npc.id}`);

    const speech = await client.waitForEvent(
      (event) => event.type === 'aiSpeech' && event.speakerId === npc.id && event.pid === client.pid,
      60_000,
    );
    if (speech && speech.speech) {
      const summary = speech.speech.mode === 'dynamicText'
        ? speech.speech.text
        : speech.speech.lineId;
      ok('manual aiSpeech', `${speech.source ?? 'unknown'} ${summary}`);
    } else {
      const recent = client.events.slice(-6).map((event) => event.type).join(', ');
      no('manual aiSpeech', `npc=${npc.id} recent=${recent || 'none'}`);
    }
  } finally {
    client.close();
  }

  console.log(`\nSummary: ${pass} passed, ${warn} warnings, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
