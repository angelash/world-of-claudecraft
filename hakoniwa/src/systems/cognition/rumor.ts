// Rumors as first-class data (reputation_and_cognition.md 4, society.md 7.4): every
// rumor is anchored on a kernel event; each holder keeps its own structured version;
// retelling applies the distortion operations of the teller (exaggeration, subject
// swap, simplification, templating, polarity, time and place drift) or the reverse
// "it was probably luck" shrinking; caps and eyewitness fact checks keep it bounded.

import type { Rng } from '../../core/rng';
import type { SystemContext } from '../../core/system';
import { type KeyText, type TextParam, textEquals, tr } from '../../core/text';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { addMemory } from '../npc/memory';
import { npcEntityId, personaById, personaIndex } from '../npc/personas';
import { bumpHeat } from '../npc/ports';
import { relationOf } from '../npc/relations';
import type { PersonaCard } from '../npc/types';
import { mapById } from '../world';
import { type EvidenceInput, observe } from './belief';
import { comedyGate } from './comedy';
import { ceilingOf, subjectName } from './params';
import { rumorText } from './rumor_text';
import type {
  CognitionSlice,
  ExplanationId,
  Rumor,
  RumorHolding,
  RumorTemplate,
  RumorVersion,
} from './types';

const HOLD_CAP = 12;
const PLAYER_RUMOR_CAP = 40;
const MAINSTREAM_CAP = 3;
export const STORY_DISTORTION = 0.8;
export const HEAT_FLOOR = 0.05;

const PLACE_FACTOR: Record<string, number> = {
  tavern: 1.5,
  market: 1.3,
  well: 1.3,
  creek: 1.3,
  guild: 1.2,
  plaza: 1.2,
  safe: 1.2,
  bakery: 1.1,
  slum: 1.2,
  church: 1.0,
  home: 0.6,
};

export function holdingsOf(slice: CognitionSlice, holder: string): RumorHolding[] {
  return slice.holdings[holder] ?? [];
}

export function findHolding(
  slice: CognitionSlice,
  holder: string,
  rumorId: string,
): RumorHolding | undefined {
  return slice.holdings[holder]?.find((h) => h.rumor === rumorId);
}

function weightOf(slice: CognitionSlice, h: RumorHolding): number {
  return (slice.rumors[h.rumor]?.heat ?? 0) * h.cred;
}

/** Store a holding, replacing a weaker copy of the same rumor; keeps the hottest few. */
export function addHolding(slice: CognitionSlice, holder: string, h: RumorHolding): void {
  let list = slice.holdings[holder];
  if (!list) {
    list = [];
    slice.holdings[holder] = list;
  }
  const i = list.findIndex((x) => x.rumor === h.rumor);
  if (i >= 0) {
    if ((list[i] as RumorHolding).from === 'seen') return;
    list.splice(i, 1);
  }
  list.push(h);
  if (list.length > HOLD_CAP) {
    let worst = 0;
    for (let k = 1; k < list.length; k++)
      if (weightOf(slice, list[k] as RumorHolding) < weightOf(slice, list[worst] as RumorHolding))
        worst = k;
    list.splice(worst, 1);
  }
}

/** Distance of a version from the anchored truth (4.3 contributions, capped at 1). */
export function distortionOf(truth: RumorVersion, v: RumorVersion): number {
  let d = Math.min(
    0.4,
    0.15 * Math.abs(Math.log2(Math.max(0.01, v.count) / Math.max(0.01, truth.count))),
  );
  if (v.subject !== truth.subject) d += 0.4;
  const kept = v.details.filter((x) => truth.details.some((y) => textEquals(x, y))).length;
  d += 0.05 * Math.max(0, truth.details.length - kept);
  if (v.template) d += 0.3;
  if (v.polarity !== truth.polarity) d += 0.15;
  d += 0.05 * v.when;
  if (!textEquals(v.place, truth.place)) d += 0.1;
  if (v.explanation && v.explanation !== 'real' && v.explanation !== truth.explanation) d += 0.1;
  return Math.round(Math.min(1, d) * 1000) / 1000;
}

function finalize(truth: RumorVersion, v: RumorVersion): RumorVersion {
  const ratio = Math.max(0.5, Math.min(2, (v.count / Math.max(0.01, truth.count)) ** 0.25));
  v.apparent = Math.round(truth.apparent * ratio * 10) / 10;
  v.distortion = distortionOf(truth, v);
  v.story = v.distortion >= STORY_DISTORTION;
  return v;
}

/** Create the rumor anchored on a witnessed event. */
export function seedRumor(
  ctx: SystemContext,
  args: {
    anchor: string;
    topic: string;
    subject: string;
    mapId: string;
    place: TextParam;
    apparent: number;
    count: number;
    details: TextParam[];
    famous: string[];
    tier: number;
  },
): Rumor {
  const slice = ctx.world.slices.cognition;
  const truth: RumorVersion = {
    subject: args.subject,
    count: args.count,
    place: args.place,
    when: 0,
    details: args.details.slice(0, 4),
    template: null,
    polarity: 'awe',
    explanation: null,
    apparent: args.apparent,
    distortion: 0,
    story: false,
  };
  const r: Rumor = {
    id: ctx.newId('rumor'),
    anchor: args.anchor,
    tick: ctx.tick,
    topic: args.topic,
    subject: args.subject,
    mapId: args.mapId,
    truth,
    heat: Math.min(1, 0.35 + 0.1 * Math.max(0, args.tier)),
    famous: args.famous,
    tellings: 0,
  };
  slice.rumors[r.id] = r;
  if (args.subject === 'player') {
    const active = Object.values(slice.rumors)
      .filter((x) => x.subject === 'player' && x.heat >= HEAT_FLOOR)
      .sort((a, b) => a.heat - b.heat || a.tick - b.tick);
    for (const cold of active.slice(0, Math.max(0, active.length - PLAYER_RUMOR_CAP)))
      cold.heat = 0;
  }
  return r;
}

export function witnessVersion(r: Rumor, explanation: ExplanationId | 'real' | null): RumorVersion {
  const v: RumorVersion = { ...r.truth, details: [...r.truth.details], explanation };
  return finalize(r.truth, v);
}

/** Fraction of named residents of a map who know of the player at all. */
function playerFame(ctx: SystemContext, mapId: string): number {
  const npcs = ctx.world.slices.npc.npcs;
  const beliefs = ctx.world.slices.cognition.beliefs;
  let n = 0;
  let aware = 0;
  for (const id of Object.keys(npcs)) {
    const st = npcs[id];
    if (!st || st.resident || st.mapId !== mapId) continue;
    n++;
    if (beliefs[id]?.player && beliefs[id]?.player?.state !== 'unaware') aware++;
  }
  return n === 0 ? 0 : aware / n;
}

/** Famous strong people of a map (misattribution targets), most famous first. */
function famousOf(ctx: SystemContext, mapId: string): PersonaCard[] {
  return [...personaIndex(ctx.content).values()]
    .filter(
      (p) => p.map === mapId && (p.fame ?? 0) >= 0.5 && !ctx.world.slices.npc.npcs[p.id]?.gone,
    )
    .sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0) || a.id.localeCompare(b.id));
}

function exaggeration(rng: Rng, speaker: PersonaCard | undefined): number {
  const s = speaker?.spread ?? 1;
  if (s >= 1.5) return rng.range(1.5, 2.0);
  if (s <= 0.6) return rng.range(1.0, 1.2);
  return rng.range(1.2, 1.6);
}

const KILL_TOPICS = new Set(['kill', 'elite_kill', 'boss_kill']);

/** Whether a version already carries a detail (structural text equality). */
function hasDetail(v: RumorVersion, d: KeyText): boolean {
  return v.details.some((x) => textEquals(x, d));
}

/** Details a 'detail' teller may add (one is picked). */
const SPIN_DETAILS: readonly (() => KeyText)[] = [
  () => tr('sys.cognition.detail.dusk'),
  () => tr('sys.cognition.detail.dusty'),
  () => tr('sys.cognition.detail.unhurt'),
];

/** One hop of distortion by the teller (society.md 7.4). */
export function distort(
  ctx: SystemContext,
  rng: Rng,
  r: Rumor,
  src: RumorVersion,
  speaker: PersonaCard | undefined,
  hops: number,
  mapId: string,
): { v: RumorVersion; misattributed: boolean } {
  const v: RumorVersion = { ...src, details: [...src.details] };
  let misattributed = false;
  const spin = speaker?.spin ?? 'plain';
  // exaggeration (or flattening)
  if (spin === 'flatten') v.count = Math.max(1, v.count / 2);
  else if (spin === 'x5') v.count *= 5;
  else v.count *= exaggeration(rng, speaker);
  v.count = Math.round(v.count * 10) / 10;
  // subject swap
  if (v.subject === 'player' && playerFame(ctx, mapId) < 0.3) {
    const first = hops === 1 && r.famous.length > 0;
    const p = first ? 0.7 : Math.min(0.3, 0.15 + 0.05 * hops);
    if (rng.chance(p)) {
      const famous = first ? r.famous : famousOf(ctx, mapId).map((x) => x.id);
      const pick = famous.find((id) => id !== speaker?.id);
      v.subject = pick ?? 'stranger';
      misattributed = !!pick;
    }
  }
  // the teller's own spin (act1_borderstone.md 6.1)
  if (spin === 'cute' && !hasDetail(v, tr('sys.cognition.detail.amazing')))
    v.details.push(tr('sys.cognition.detail.amazing'));
  if (spin === 'fear') {
    v.polarity = 'fear';
    if (
      v.explanation !== 'sorcery' &&
      (!v.explanation || v.explanation === 'real' || rng.chance(0.7))
    )
      v.explanation = 'sorcery';
    if (rng.chance(0.3)) v.template = 'witch';
  }
  if (spin === 'ghost') {
    v.template = 'ghost';
    v.polarity = 'fear';
  }
  if (spin === 'flatten') v.explanation = 'luck';
  if (spin === 'self_credit') {
    if (speaker && rng.chance(0.5)) v.subject = speaker.id;
    else v.explanation = KILL_TOPICS.has(r.topic) ? 'wounded' : 'luck';
  }
  if (spin === 'deflect') v.explanation = rng.chance(0.5) ? 'luck' : 'gadget';
  if (spin === 'detail' && v.details.length < 4) v.details.push(rng.pick(SPIN_DETAILS)());
  if (spin === 'price') {
    if (!hasDetail(v, tr('sys.cognition.detail.pricey')))
      v.details.push(tr('sys.cognition.detail.pricey'));
    v.polarity = 'curious';
  }
  if (spin === 'light') {
    const sawNoRecord = speaker
      ? ctx.world.slices.cognition.beliefs[speaker.id]?.player?.evidence.some(
          (e) => e.kind === 'appraisal',
        )
      : false;
    v.explanation = sawNoRecord ? 'sorcery' : 'miracle';
  }
  // polarity by faction
  if (spin === 'plain' && speaker) {
    if (speaker.class === 'clergy') v.polarity = v.explanation === 'sorcery' ? 'fear' : 'awe';
    else if (speaker.class === 'merchant') v.polarity = 'curious';
    else if (speaker.class === 'noble') v.polarity = 'fear';
  }
  // templating grows with hops (over half after five)
  if (!v.template && hops >= 2 && rng.chance(Math.min(0.6, 0.12 * hops))) {
    const church = speaker?.faction === 'church' || speaker?.faction === 'inquisition';
    const pool: RumorTemplate[] = church
      ? ['witch', 'goddess']
      : ['hero_legend', 'demon_return', 'noble_bastard'];
    v.template = rng.pick(pool);
  }
  // simplification, time drift, place drift
  if (v.details.length > 0 && rng.chance(0.2))
    v.details.splice(rng.int(0, v.details.length - 1), 1);
  if (hops >= 3 && v.details.length > 3) v.details.length = 3;
  // time drift: a hop may blur the date; old news is old news anyway
  const days = Math.floor((ctx.tick - r.tick) / TICKS_PER_GAME_DAY);
  const age = days <= 0 ? 0 : days <= 3 ? 1 : days <= 60 ? 2 : 3;
  v.when = Math.min(3, Math.max(age, v.when + (rng.chance(0.3) ? 1 : 0)));
  if (mapId !== r.mapId)
    v.place = tr('sys.cognition.place.around', {
      map: mapById(ctx.content, r.mapId)?.name ?? tr('sys.cognition.place.north'),
    });
  return { v: finalize(r.truth, v), misattributed };
}

/** Reverse distortion: a listener who cannot believe it retells the "reasonable" version. */
function rationalize(r: Rumor, v: RumorVersion): RumorVersion {
  const out: RumorVersion = { ...v, details: [...v.details] };
  out.count = Math.max(1, Math.round((out.count / 2) * 10) / 10);
  out.explanation = KILL_TOPICS.has(r.topic) ? 'wounded' : 'luck';
  if (out.subject === 'player') out.subject = 'lucky_newbie';
  return finalize(r.truth, out);
}

function versionKey(v: RumorVersion): string {
  return `${v.subject}|${v.explanation ?? ''}|${v.template ?? ''}`;
}

/** At most three mainstream versions of a rumor per map: merge new ones into the nearest. */
function capMainstream(ctx: SystemContext, r: Rumor, v: RumorVersion, mapId: string): RumorVersion {
  const slice = ctx.world.slices.cognition;
  const npcs = ctx.world.slices.npc.npcs;
  const versions = new Map<string, RumorVersion>();
  for (const holder of Object.keys(slice.holdings).sort()) {
    if (npcs[holder]?.mapId !== mapId) continue;
    const h = findHolding(slice, holder, r.id);
    if (h && !versions.has(versionKey(h.v))) versions.set(versionKey(h.v), h.v);
  }
  if (versions.has(versionKey(v)) || versions.size < MAINSTREAM_CAP) return v;
  const list = [...versions.values()];
  const near = list.find((x) => x.subject === v.subject) ?? (list[0] as RumorVersion);
  return { ...near, details: [...near.details] };
}

/** Believe a version when its credibility clears the listener's threshold (4.3). */
export function believes(
  ctx: SystemContext,
  listener: PersonaCard | undefined,
  v: RumorVersion,
  cred: number,
): boolean {
  if (v.story) return false;
  const ceiling = listener ? ceilingOf(ctx.content, listener) : 20;
  const threshold = Math.min(0.95, 0.3 + Math.max(0, v.apparent - ceiling) / 50);
  return cred > threshold;
}

export interface Telling {
  rumor: Rumor;
  v: RumorVersion;
  cred: number;
  origin: string;
  hops: number;
  fromId: string;
  fromName: TextParam;
}

/** A listener receives a version: holding, belief update, memory and heat. */
export function receive(
  ctx: SystemContext,
  listenerId: string,
  t: Telling,
  mapId: string,
): { believed: boolean; multi: boolean } {
  const slice = ctx.world.slices.cognition;
  const listener = personaById(ctx.content, listenerId);
  const prev = findHolding(slice, listenerId, t.rumor.id);
  const multi = !!prev && prev.origin !== t.origin && prev.from !== 'seen';
  let cred = Math.min(1, t.cred * (multi ? 1.3 : 1));
  cred = Math.round(cred * 1000) / 1000;
  // every incoming version joins (or merges into) the map's mainstream versions
  const heard = capMainstream(ctx, t.rumor, t.v, mapId);
  const believed = believes(ctx, listener, heard, cred);
  let kept = heard;
  if (!believed && ctx.rng('cognition.rumor').chance(0.5))
    kept = capMainstream(ctx, t.rumor, rationalize(t.rumor, heard), mapId);
  addHolding(slice, listenerId, {
    rumor: t.rumor.id,
    v: kept,
    cred,
    from: t.fromId,
    origin: t.origin,
    hops: t.hops,
    tick: ctx.tick,
    believed,
    told: 0,
  });
  ctx.emit('cognition.rumor_spread', {
    rumorId: t.rumor.id,
    fromId: t.fromId,
    toId: listenerId,
    mapId,
    distortion: t.v.distortion,
    believed,
  });
  if (!listener) return { believed, multi };
  const subject = t.v.subject;
  const text = rumorText(ctx.content, t.v, t.rumor.topic);
  addMemory(ctx, listenerId, {
    text: tr('sys.cognition.memory.heard', { from: t.fromName, text }),
    src: 'heard',
    cred,
    about: subject === 'stranger' || subject === 'lucky_newbie' ? undefined : subject,
    imp: subject === 'player' ? 0.35 : 0.2,
  });
  if (subject === 'player' || t.rumor.subject === 'player')
    bumpHeat(ctx, listenerId, 0.15 * t.rumor.heat);
  if (subject !== 'stranger' && subject !== 'lucky_newbie' && subject !== listenerId) {
    const kinds: EvidenceInput[] = [{ kind: 'rumor', weight: believed ? cred : 0 }];
    if (multi && believed) kinds.push({ kind: 'multi', weight: 3 });
    observe(ctx, listenerId, subject, {
      key: t.rumor.anchor,
      ind: `rumor:${t.rumor.id}:${t.origin}`,
      apparent: believed ? t.v.apparent : 0,
      feat: undefined,
      kinds,
      direct: false,
      suggested: t.v.explanation,
      what: tr('sys.cognition.belief.what.heard', {
        from: t.fromName,
        who: subjectName(ctx.content, subject),
      }),
    });
  }
  return { believed, multi };
}

/** Try to pass one rumor from a teller to a listener during a conversation. */
export function tryTell(
  ctx: SystemContext,
  fromId: string,
  toId: string,
  mapId: string,
  placeKind: string,
  visible: boolean,
): boolean {
  const slice = ctx.world.slices.cognition;
  const speaker = personaById(ctx.content, fromId);
  const npcSlice = ctx.world.slices.npc;
  // a secret keeper only talks to someone they trust (builtin_ai.md 5.2: trust 70)
  if ((speaker?.spread ?? 1) <= 0.2 && relationOf(npcSlice, fromId, toId).trust < 70) return false;
  // which news: heat x the listener's interest (1.5 when it is about someone they know)
  const interest = (h: RumorHolding) => {
    const subject = h.v.subject;
    const knows =
      subject === 'player' ? !!slice.beliefs[toId]?.player : !!npcSlice.minds[toId]?.rel[subject];
    return knows ? 1.5 : 1;
  };
  const list = [...holdingsOf(slice, fromId)]
    .filter((h) => (slice.rumors[h.rumor]?.heat ?? 0) >= HEAT_FLOOR)
    .sort(
      (a, b) =>
        weightOf(slice, b) * interest(b) - weightOf(slice, a) * interest(a) ||
        a.rumor.localeCompare(b.rumor),
    );
  // news the listener lacks first; then a second, independent source; then an eyewitness
  // listener (who may set a wild version straight)
  const pick =
    list.find((h) => !findHolding(slice, toId, h.rumor)) ??
    list.find((h) => {
      const theirs = findHolding(slice, toId, h.rumor);
      return (
        !!theirs && theirs.from !== fromId && (theirs.from === 'seen' || theirs.origin !== h.origin)
      );
    });
  if (!pick) return false;
  const r = slice.rumors[pick.rumor];
  if (!r) return false;
  const rng = ctx.rng('cognition.rumor');
  const devout = (personaById(ctx.content, toId)?.devotion ?? 0) >= 0.6;
  const place = (PLACE_FACTOR[placeKind] ?? 0.9) * (placeKind === 'church' && devout ? 1.5 : 1);
  const rel = relationOf(ctx.world.slices.npc, fromId, toId).like >= 0 ? 1 : 0.5;
  const p = Math.min(0.95, r.heat * place * (speaker?.spread ?? 1) * rel);
  if (!rng.chance(p)) return false;
  pick.told += 1;
  r.tellings += 1;
  const listener = personaById(ctx.content, toId);
  // eyewitness fact check (4.5): an eyewitness corrects an outlandish version
  const own = findHolding(slice, toId, r.id);
  const hops = pick.hops + 1;
  const { v: raw, misattributed } = distort(ctx, rng, r, pick.v, speaker, hops, mapId);
  if (own?.from === 'seen') {
    if (raw.distortion <= 0.5) return true;
    pick.v = { ...own.v, details: [...own.v.details] };
    pick.cred = Math.min(pick.cred, 0.9);
    if (visible && listener) {
      ctx.emit('dialogue.line', {
        speakerId: npcEntityId(toId),
        speakerName: listener.name,
        text: tr('sys.cognition.line.correct', { text: rumorText(ctx.content, own.v, r.topic) }),
        listenerId: npcEntityId(fromId),
        kind: 'say',
      });
    }
    return true;
  }
  const v = capMainstream(ctx, r, raw, mapId);
  const cred = pick.cred * 0.8 * (speaker?.reliability ?? 0.8);
  const telling: Telling = {
    rumor: r,
    v,
    cred,
    origin: pick.origin,
    hops,
    fromId,
    fromName: speaker?.name ?? tr('sys.cognition.teller.someone'),
  };
  receive(ctx, toId, telling, mapId);
  if (visible && speaker) {
    const gate = misattributed ? comedyGate(ctx, mapId, 'misattribute') : 'full';
    if (gate !== 'none') {
      ctx.emit('dialogue.line', {
        speakerId: npcEntityId(fromId),
        speakerName: speaker.name,
        text: tr('sys.cognition.line.heard', { text: rumorText(ctx.content, v, r.topic) }),
        listenerId: npcEntityId(toId),
        kind: gate === 'full' ? 'say' : 'narrate',
      });
    }
  }
  return true;
}

/** Residents (L4) carry rumors as shares of the crowd on a map (2.3, 4.2). */
export function crowdTell(
  ctx: SystemContext,
  mapId: string,
  namedId: string,
  toCrowd: boolean,
): void {
  const slice = ctx.world.slices.cognition;
  let crowd = slice.crowd[mapId];
  if (!crowd) {
    crowd = {};
    slice.crowd[mapId] = crowd;
  }
  const rng = ctx.rng('cognition.crowd');
  if (toCrowd) {
    const best = [...holdingsOf(slice, namedId)]
      .filter((h) => (slice.rumors[h.rumor]?.heat ?? 0) >= HEAT_FLOOR)
      .sort((a, b) => weightOf(slice, b) - weightOf(slice, a) || a.rumor.localeCompare(b.rumor))[0];
    if (!best) return;
    const r = slice.rumors[best.rumor];
    if (!r || !rng.chance(Math.min(0.9, r.heat * 1.2))) return;
    const speaker = personaById(ctx.content, namedId);
    const entry = crowd[r.id];
    const { v } = distort(ctx, rng, r, best.v, speaker, best.hops + 1, mapId);
    const share = entry ? entry.share : 0;
    crowd[r.id] = {
      share: Math.min(1, share + Math.max(0.05, 0.3 * share * (1 - share) + 0.05)),
      v,
    };
    return;
  }
  const top = Object.entries(crowd)
    .filter(([id, c]) => c.share >= 0.15 && (slice.rumors[id]?.heat ?? 0) >= HEAT_FLOOR)
    .sort((a, b) => b[1].share - a[1].share || a[0].localeCompare(b[0]))[0];
  if (!top) return;
  const r = slice.rumors[top[0]];
  if (!r || findHolding(slice, namedId, r.id) || !rng.chance(top[1].share)) return;
  receive(
    ctx,
    namedId,
    {
      rumor: r,
      v: top[1].v,
      cred: 0.5 * top[1].share + 0.2,
      origin: `crowd:${mapId}`,
      hops: 3,
      fromId: `crowd:${mapId}`,
      fromName: tr('sys.cognition.teller.neighbors'),
    },
    mapId,
  );
}

/** The player asks an NPC for rumors: the hottest one this NPC holds (player's ones first). */
export function tellPlayer(
  ctx: SystemContext,
  npcId: string,
): { rumorId: string; text: TextParam } | null {
  const slice = ctx.world.slices.cognition;
  const speaker = personaById(ctx.content, npcId);
  const list = [...holdingsOf(slice, npcId)]
    .filter(
      (h) =>
        !findHolding(slice, 'player', h.rumor) ||
        findHolding(slice, 'player', h.rumor)?.from !== npcId,
    )
    .sort(
      (a, b) =>
        Number(b.v.subject === 'player') - Number(a.v.subject === 'player') ||
        weightOf(slice, b) - weightOf(slice, a) ||
        a.rumor.localeCompare(b.rumor),
    );
  const pick = list[0];
  if (!pick) return null;
  const r = slice.rumors[pick.rumor];
  if (!r) return null;
  pick.told += 1;
  const text = rumorText(ctx.content, pick.v, r.topic);
  addHolding(slice, 'player', {
    rumor: r.id,
    v: { ...pick.v, details: [...pick.v.details] },
    cred: Math.round(pick.cred * 0.8 * (speaker?.reliability ?? 0.8) * 1000) / 1000,
    from: npcId,
    origin: pick.origin,
    hops: pick.hops + 1,
    tick: ctx.tick,
    believed: true,
    told: 0,
  });
  ctx.emit('cognition.rumor_heard', { rumorId: r.id, fromId: npcId, text });
  return { rumorId: r.id, text };
}

/** Public fact (4.5): versions about the subject on the map drop to at most 0.3 distortion. */
export function publishFact(ctx: SystemContext, mapId: string, subject: string): number {
  const slice = ctx.world.slices.cognition;
  const npcs = ctx.world.slices.npc.npcs;
  let fixed = 0;
  for (const holder of Object.keys(slice.holdings).sort()) {
    if (npcs[holder]?.mapId !== mapId) continue;
    for (const h of slice.holdings[holder] ?? []) {
      const r = slice.rumors[h.rumor];
      if (!r || r.subject !== subject || h.v.distortion <= 0.3) continue;
      h.v = witnessVersion(r, h.v.explanation === 'real' ? 'real' : null);
      fixed++;
    }
  }
  return fixed;
}

/** Daily cooling: heat x 0.85, crowd shares fade. */
export function coolRumors(slice: CognitionSlice): void {
  for (const r of Object.values(slice.rumors)) r.heat = Math.round(r.heat * 0.85 * 1000) / 1000;
  for (const crowd of Object.values(slice.crowd)) {
    for (const [id, c] of Object.entries(crowd)) {
      c.share = Math.round(c.share * 0.9 * 1000) / 1000;
      if (c.share < 0.02) delete crowd[id];
    }
  }
}
