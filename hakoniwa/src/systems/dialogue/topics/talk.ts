// Talking about a topic in a conversation (builtin_ai.md 6.2, 6.5 R1, R3, R4, 6.6, 7.3,
// 7.7, 7.9): who the speaker is to the graph, the topic's fill values, whether a line
// exists, the menu, the answer or the refusal with its line, the progress of each pair
// (rotation, talked out, people named), and the redirect. The rules are the pure modules
// next to this one; this file reads the live world and writes only the dialogue slice.

import { contentText } from '../../../core/content_key';
import type { SystemContext } from '../../../core/system';
import { type TextParam, tr } from '../../../core/text';
import { calendarAt } from '../../../core/time';
import { beliefRaw } from '../../cognition/queries';
import { holdingsOf } from '../../cognition/rumor';
import { rumorText } from '../../cognition/rumor_text';
import { moodOf } from '../../npc/brain/mood';
import { personaById } from '../../npc/personas';
import { locationById } from '../../npc/places';
import { relationOf } from '../../npc/relations';
import type { KnowledgeTier } from '../../npc/types';
import { conditionHolds } from '../../quests/effects';
import { getEntity, mapById } from '../../world';
import { unmetNeed } from '../commissions/needs';
import { fillSlotsOf } from '../lines/grammar';
import { slotSources, type VersionBy } from '../lines/packs';
import { isLine, lineEntry } from '../lines/types';
import { addressOf, trustBand, varsFor } from '../replies';
import { speak, speakerLayers } from '../speak';
import {
  decideTopic,
  inActWindow,
  inScope,
  type SpeakerView,
  type TopicEnv,
  versionsOf,
} from './access';
import { allTopics, topicById } from './graph';
import { type MenuCandidate, type MenuSlot, rankMenu, rankRedirect } from './menu';
import type { Refusal, TopicAnswer, TopicDef, TopicTalk } from './types';

/** Fill slots `speak` always provides itself (7.9: catch may stay empty). */
const SELF_FILLED = new Set(['name', 'memory', 'diary', 'catch']);
/** Trust at which a person tells where another one is right now (6.4 row 18). */
export const WHEREABOUTS_TRUST = 60;
/** A topic refused this many times in one talk ends it (6.6 anti-loop). */
export const REFUSALS_TO_END = 3;

// ---------------------------------------------------------------------------
// The speaker and the environment

function homeRegion(ctx: SystemContext, mapId: string | undefined): string | undefined {
  return mapId ? mapById(ctx.content, mapId)?.region : undefined;
}

/** The speaker as the topic rules see them (persona card, resident card, or a bare id). */
export function speakerView(ctx: SystemContext, npcRef: string): SpeakerView {
  const trust = relationOf(ctx.world.slices.npc, npcRef, 'player').trust;
  const p = personaById(ctx.content, npcRef);
  if (p)
    return {
      id: npcRef,
      tier: p.knowledge,
      socialClass: p.class,
      roles: p.roles ?? [],
      region: homeRegion(ctx, p.map),
      trust,
    };
  const r = ctx.world.slices.npc.residents[npcRef];
  return {
    id: npcRef,
    tier: r?.knowledge ?? ('K0' as KnowledgeTier),
    socialClass: r?.class,
    roles: [],
    region: homeRegion(ctx, r?.map),
    trust,
  };
}

function actNow(ctx: SystemContext): string {
  const a = ctx.flag('act');
  return typeof a === 'string' ? a : 'act1';
}

/** The dialogue slice's topic progress of one person toward the player. */
export function talksOf(ctx: SystemContext, npcRef: string): Record<string, TopicTalk> {
  const slice = ctx.world.slices.dialogue;
  slice.topics ??= {};
  slice.topics[npcRef] ??= {};
  return slice.topics[npcRef] as Record<string, TopicTalk>;
}

export function topicEnv(ctx: SystemContext, npcRef: string): TopicEnv {
  const talks = ctx.world.slices.dialogue.topics?.[npcRef] ?? {};
  return {
    holds: (c) => conditionHolds(ctx, c),
    act: actNow(ctx),
    talked: (id) => talks[id] !== undefined,
  };
}

export function topicDecision(ctx: SystemContext, npcRef: string, t: TopicDef): TopicAnswer {
  return decideTopic(t, speakerView(ctx, npcRef), topicEnv(ctx, npcRef));
}

/** Whether the person closed this topic for today after the third refusal (6.6). */
export function closedToday(ctx: SystemContext, npcRef: string, topicId: string): boolean {
  const c = ctx.world.slices.dialogue.closedTopics?.[npcRef];
  return !!c && c.day === calendarAt(ctx.tick).dayIndex && c.topics.includes(topicId);
}

function closeForToday(ctx: SystemContext, npcRef: string, topicId: string): void {
  const slice = ctx.world.slices.dialogue;
  slice.closedTopics ??= {};
  const day = calendarAt(ctx.tick).dayIndex;
  const prev = slice.closedTopics[npcRef];
  const topics = prev && prev.day === day ? prev.topics : [];
  if (!topics.includes(topicId)) topics.push(topicId);
  slice.closedTopics[npcRef] = { day, topics };
}

/** A once topic talked about, a daily one talked about today, is not offered again (6.2). */
export function repeatOpen(ctx: SystemContext, npcRef: string, t: TopicDef): boolean {
  const talk = ctx.world.slices.dialogue.topics?.[npcRef]?.[t.id];
  if (!talk || t.repeat === 'evergreen') return true;
  if (t.repeat === 'once') return false;
  return talk.day !== calendarAt(ctx.tick).dayIndex;
}

/** Troubled now: a troubled mood, or a need under the line that maps to a request (6.2). */
export function troubled(ctx: SystemContext, npcRef: string): boolean {
  const st = ctx.world.slices.npc.npcs[npcRef];
  if (!st) return false;
  const mood = moodOf(st, ctx.tick);
  if (mood === 'worried' || mood === 'tired' || mood === 'angry' || mood === 'fear') return true;
  const rules = ctx.content.dialogueCommissions?.requests;
  return !!rules && unmetNeed(rules, st) !== null;
}

/** Whether the person was named to the player (person topics enter the menu then). */
export function introduced(ctx: SystemContext, personId: string): boolean {
  return ctx.world.slices.dialogue.introduced?.[personId] !== undefined;
}

export function introduce(ctx: SystemContext, personId: string): void {
  const slice = ctx.world.slices.dialogue;
  slice.introduced ??= {};
  slice.introduced[personId] ??= ctx.tick;
}

// ---------------------------------------------------------------------------
// Titles and fill values

/** The menu title of a topic (a person topic without one says the person's name). */
export function topicTitle(ctx: SystemContext, t: TopicDef): TextParam {
  if (t.title !== undefined) return contentText('topics', t, t.id, 'title');
  const who = t.id.slice('person_'.length);
  const p = personaById(ctx.content, who);
  return tr('sys.dialogue.topic.about', { who: p?.name ?? who });
}

/** People the speaker knows best on their home map, strongest tie first (gen_people). */
export function peopleKnown(ctx: SystemContext, npcRef: string): string[] {
  const p = personaById(ctx.content, npcRef);
  const map = p?.map ?? ctx.world.slices.npc.residents[npcRef]?.map;
  if (!map) return [];
  const slice = ctx.world.slices.npc;
  return (ctx.content.npcs ?? [])
    .filter((o) => o.id !== npcRef && o.map === map && slice.npcs[o.id] && !slice.npcs[o.id]?.gone)
    .map((o) => {
      const r = relationOf(slice, npcRef, o.id);
      return { id: o.id, tie: Math.abs(r.like) + r.trust };
    })
    .sort((a, b) => b.tie - a.tie || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((x) => x.id);
}

/** A neighbouring map with monsters, for "don't go there" (gen_danger). */
function dangerPlace(ctx: SystemContext, npcRef: string): TextParam | undefined {
  const st = ctx.world.slices.npc.npcs[npcRef];
  const here = st ? mapById(ctx.content, st.mapId) : undefined;
  for (const x of here?.exits ?? []) {
    const m = mapById(ctx.content, x.toMap);
    if (m?.spawns.some((s) => s.kind === 'monster')) return m.name;
  }
  return undefined;
}

const DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;

/** Compass word and distance band from the speaker toward a place (gen_directions). */
export function directionsTo(
  ctx: SystemContext,
  npcRef: string,
  target: string,
): { place: TextParam; dir: TextParam; dist: TextParam } | null {
  const st = ctx.world.slices.npc.npcs[npcRef];
  const e = st ? getEntity(ctx.world, st.entityId) : undefined;
  if (!st || !e) return null;
  const [mapId, locId] = target.split('/');
  const here = mapById(ctx.content, st.mapId);
  let to: { x: number; y: number } | null = null;
  let place: TextParam | undefined;
  if (mapId === st.mapId && locId) {
    const loc = locationById(ctx.content, mapId, locId);
    if (loc) {
      to = { x: loc.x + loc.w / 2, y: loc.y + loc.h / 2 };
      place = loc.name;
    }
  } else if (mapId && !locId) {
    const exit = here?.exits.find((x) => x.toMap === mapId);
    const m = mapById(ctx.content, mapId);
    if (exit && m) {
      to = { x: exit.x, y: exit.y };
      place = m.name;
    }
  }
  if (!to || place === undefined) return null;
  const dx = to.x - e.x;
  const dy = to.y - e.y;
  const d = Math.hypot(dx, dy);
  // screen y grows southward; eight sectors of 45 degrees from east
  const sector = Math.round((Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8) % 8;
  const dir = d < 2 ? 'here' : (DIRS[sector] as string);
  const dist = d < 12 ? 'near' : d < 40 ? 'mid' : 'far';
  return {
    place,
    dir: tr(`sys.dialogue.dir.${dir}`),
    dist: tr(`sys.dialogue.dist.${dist}`),
  };
}

export interface TopicFill {
  vars: Record<string, TextParam | undefined>;
  /** the person a gen_people line names (introduced once said) */
  who?: string;
}

/** Fill values of a topic's lines (builtin_ai 7.9); a slot left out voids its lines. */
export function topicFill(
  ctx: SystemContext,
  npcRef: string,
  t: TopicDef,
  target?: string,
): TopicFill {
  const base = varsFor(ctx, npcRef);
  const vars: Record<string, TextParam | undefined> = { ...base, player: addressOf(ctx, npcRef) };
  let who: string | undefined;
  if (t.id === 'gen_people') {
    const known = peopleKnown(ctx, npcRef);
    const n = talksOf(ctx, npcRef).gen_people?.k.length ?? 0;
    who = known.length > 0 ? known[n % known.length] : undefined;
    vars.who = who ? personaById(ctx.content, who)?.name : undefined;
  } else if (t.id === 'gen_news') {
    const held = holdingsOf(ctx.world.slices.cognition, npcRef);
    const h = held.at(-1);
    const r = h ? ctx.world.slices.cognition.rumors[h.rumor] : undefined;
    vars.event = h && r ? rumorText(ctx.content, h.v, r.topic) : undefined;
  } else if (t.id === 'gen_danger') {
    vars.place = dangerPlace(ctx, npcRef);
  } else if (t.id === 'gen_you') {
    const b = beliefRaw(ctx.world, npcRef, 'player');
    const def = b?.explanation
      ? (ctx.content.cognitionExplanations ?? []).find((x) => x.id === b.explanation)
      : undefined;
    vars.expl = def ? contentText('cognitionExplanations', def, def.id, 'label') : undefined;
  } else if (t.id === 'gen_directions') {
    const d = target ? directionsTo(ctx, npcRef, target) : null;
    vars.place = d?.place;
    vars.dir = d?.dir;
    vars.dist = d?.dist;
  } else if (t.id === 'gen_faith') {
    // the goddess a person names depends on their knowledge and the reveal stage (7.9);
    // that table is the goddess brain's (PK-M1-20): lines with {goddess} wait for it
    vars.goddess = undefined;
  } else if (t.category === 'person' && t.id.startsWith('person_')) {
    const other = t.id.slice('person_'.length);
    const p = personaById(ctx.content, other);
    vars.who = p?.name;
    const st = ctx.world.slices.npc.npcs[other];
    const loc = st ? locationById(ctx.content, st.mapId, st.locId) : undefined;
    const trust = relationOf(ctx.world.slices.npc, npcRef, 'player').trust;
    vars.place = trust >= WHEREABOUTS_TRUST ? loc?.name : undefined;
  }
  return { vars, who };
}

// ---------------------------------------------------------------------------
// Lines

interface Versioned {
  version?: string;
  versionBy?: VersionBy;
}

/** The version requests to try for the speaker, nearest first (null: a plain list). */
function versionTries(ctx: SystemContext, npcRef: string, t: TopicDef, mis: boolean): Versioned[] {
  if (mis) return [{ version: 'mis', versionBy: 'exact' }];
  const b = beliefRaw(ctx.world, npcRef, 'player');
  const list = versionsOf(t, speakerView(ctx, npcRef), {
    act: actNow(ctx),
    cognition: b?.state,
    band: trustBand(ctx, npcRef),
  });
  if (list === null) return [{}];
  const by: VersionBy =
    t.versionBy === 'knowledge' || t.versionBy === 'act' || t.versionBy === 'cognition'
      ? t.versionBy
      : 'exact';
  return list.map((v) => ({ version: v, versionBy: by }));
}

function unfillable(vars: Record<string, TextParam | undefined>): Set<string> {
  const out = new Set<string>();
  for (const s of [
    'player',
    'who',
    'other',
    'place',
    'next',
    'dir',
    'landmark',
    'dist',
    'item',
    'num',
    'price',
    'feat',
    'event',
    'rumor',
    'expl',
    'topic_hint',
    'goddess',
  ])
    if (vars[s] === undefined || vars[s] === '') out.add(s);
  return out;
}

/** Whether the speaker's chain has a line for the topic now (6.2 "可用性"). */
export function topicHasLine(
  ctx: SystemContext,
  npcRef: string,
  t: TopicDef,
  mis = false,
  fill: TopicFill = topicFill(ctx, npcRef, t),
): boolean {
  const gaps = unfillable(fill.vars);
  // speak fills {name} only for a named person (a resident's line needing it is void)
  const selfFilled = personaById(ctx.content, npcRef)
    ? SELF_FILLED
    : new Set([...SELF_FILLED].filter((s) => s !== 'name'));
  const act = actNow(ctx);
  for (const v of versionTries(ctx, npcRef, t, mis)) {
    const sources = slotSources(ctx.content, npcRef, `topic.${t.id}`, {
      ...speakerLayers(ctx, npcRef),
      act,
      ...v,
    });
    for (const src of sources)
      for (const line of src.lines) {
        if (!isLine(line)) continue;
        const e = lineEntry(line);
        if (e.when && !conditionHolds(ctx, e.when)) continue;
        if (fillSlotsOf(e.zh).some((s) => !selfFilled.has(s) && (gaps.has(s) || s === 'name')))
          continue;
        return true;
      }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Availability and the menu

/** A topic on the menu: open now, or short of trust (the person evades when asked). */
export interface MenuEntry {
  topic: TopicDef;
  evade: boolean;
}

function freshness(ctx: SystemContext, npcRef: string, t: TopicDef): number {
  const talk = ctx.world.slices.dialogue.topics?.[npcRef]?.[t.id];
  if (!talk) return 1;
  if (talk.done) return 0;
  const tries = versionTries(ctx, npcRef, t, false);
  if (tries[0]?.version !== undefined && tries[0].version !== talk.v) return 0.8;
  return 0.5;
}

function menuSlot(t: TopicDef, here: string | undefined): MenuSlot | null {
  if (t.id === 'gen_trouble' || t.category === 'quest') return 'quest';
  if (t.id === 'gen_news' || t.category === 'event' || t.category === 'rumor') return 'news';
  if (t.category === 'self' || t.category === 'secret' || t.category === 'you') return 'interest';
  if (t.id === 'gen_place' || (here && (t.aliases ?? []).includes(here))) return 'situation';
  return null;
}

/** Every topic the speaker could offer now (menu candidates), in data order. */
export function availableTopics(ctx: SystemContext, npcRef: string): MenuEntry[] {
  const sp = speakerView(ctx, npcRef);
  const env = topicEnv(ctx, npcRef);
  const out: MenuEntry[] = [];
  for (const t of allTopics(ctx.content)) {
    if (t.askOnly || t.scene) continue;
    if (!inActWindow(t, env.act) || !inScope(t, sp)) continue;
    if (t.introduced && !introduced(ctx, t.id.slice('person_'.length))) continue;
    if (t.id === `person_${npcRef}`) continue;
    if (closedToday(ctx, npcRef, t.id)) continue;
    if (!repeatOpen(ctx, npcRef, t)) continue;
    if (t.trouble && !troubled(ctx, npcRef)) continue;
    const d = decideTopic(t, sp, env);
    if (d.kind === 'refuse' && d.reason !== 'trust') continue;
    const mis = d.kind === 'answer' && d.version === 'mis';
    if (!topicHasLine(ctx, npcRef, t, mis)) continue;
    out.push({ topic: t, evade: d.kind === 'refuse' });
  }
  return out;
}

function candidates(ctx: SystemContext, npcRef: string, list: MenuEntry[]): MenuCandidate[] {
  const p = personaById(ctx.content, npcRef);
  const st = ctx.world.slices.npc.npcs[npcRef];
  const here = st ? `${st.mapId}/${st.locId}` : undefined;
  const order = new Map(allTopics(ctx.content).map((t, i) => [t.id, i]));
  return list.map(({ topic: t }) => {
    const own = (t.owners ?? []).includes(npcRef);
    const drawn = (t.interest ?? []).some(
      (w) => (p?.traits ?? []).includes(w) || (p?.roles ?? []).includes(w as never),
    );
    const questTie = (t.unlocks?.quests ?? []).some((q) => !ctx.world.slices.quests?.quests[q]);
    return {
      topic: t,
      order: order.get(t.id) ?? 0,
      fresh: freshness(ctx, npcRef, t),
      quest: questTie || t.id === 'gen_trouble' ? 1 : 0,
      interest: own || drawn ? 1 : 0,
      recent: t.category === 'event' && t.requires ? 1 : 0,
      slot: menuSlot(t, here),
    };
  });
}

/** The topic menu of a speaker (6.2: at most six, quotas, talked-out topics last). */
export function topicMenu(ctx: SystemContext, npcRef: string): MenuEntry[] {
  const list = availableTopics(ctx, npcRef);
  const ids = rankMenu(candidates(ctx, npcRef, list));
  return ids.map((id) => list.find((e) => e.topic.id === id) as MenuEntry);
}

/** Two open topics to offer instead of a refused one (6.6). */
export function redirectFor(
  ctx: SystemContext,
  npcRef: string,
  refused: TopicDef | null,
): string[] {
  const list = availableTopics(ctx, npcRef).filter((e) => !e.evade);
  return rankRedirect(refused, candidates(ctx, npcRef, list));
}

// ---------------------------------------------------------------------------
// Saying it

export interface TopicSaid {
  topic: TopicDef;
  line: TextParam;
  /** answered, or the refusal used */
  outcome: 'answer' | Refusal;
  /** topics offered instead (a refusal) */
  suggest: string[];
  /** the third refusal of the topic in this talk: the person ends it (6.6) */
  end: boolean;
  recalled: boolean;
  /** no line at all (a gap): the caller falls back */
  silent: boolean;
}

/** A reaction line (refusals, nothing more) with the redirect hint filled. */
function reactLine(
  ctx: SystemContext,
  npcRef: string,
  slot: string,
  vars: Record<string, TextParam | undefined>,
  said?: ReadonlySet<string>,
): TextParam | null {
  const st = ctx.world.slices.npc.npcs[npcRef];
  const r = speak(ctx, {
    speaker: npcRef,
    slot,
    vars,
    mood: st ? moodOf(st, ctx.tick) : undefined,
    saidThisSession: said,
  });
  return r ? r.text : null;
}

function record(
  ctx: SystemContext,
  npcRef: string,
  t: TopicDef,
  version: string | undefined,
  key: string,
  fill: TopicFill,
): void {
  const talks = talksOf(ctx, npcRef);
  const day = calendarAt(ctx.tick).dayIndex;
  const prev = talks[t.id];
  const v = version ?? '';
  const k = prev && prev.v === v ? [...prev.k, key] : [key];
  talks[t.id] = { v, k: k.slice(-16), day, ...(prev?.done && prev.v === v ? { done: true } : {}) };
  if (fill.who) introduce(ctx, fill.who);
  for (const u of t.unlocks?.topics ?? []) {
    const other = topicById(ctx.content, u);
    if (other?.introduced) introduce(ctx, u.slice('person_'.length));
  }
}

/**
 * Answer a topic, or refuse it by the 6.6 table: the line, the outcome, the redirect for a
 * refusal and whether the person now ends the talk (the third refusal of one topic). Writes
 * the pair's progress (rotation, talked out, people named) and the refusal count.
 */
export function sayTopic(
  ctx: SystemContext,
  npcRef: string,
  topicId: string,
  opts: { target?: string; refusals?: Record<string, number> } = {},
): TopicSaid | null {
  const t = topicById(ctx.content, topicId);
  if (!t) return null;
  const st = ctx.world.slices.npc.npcs[npcRef];
  const mood = st ? moodOf(st, ctx.tick) : undefined;
  const d = closedToday(ctx, npcRef, t.id)
    ? ({ kind: 'refuse', refusal: 'evade', reason: 'locked_knower' } as const)
    : topicDecision(ctx, npcRef, t);
  const fill = topicFill(ctx, npcRef, t, opts.target);
  // a trouble topic of someone with no trouble now has nothing to say (the caller falls back)
  if (d.kind === 'answer' && t.trouble && !troubled(ctx, npcRef))
    return {
      topic: t,
      line: tr('sys.dialogue.intent.fallback'),
      outcome: 'answer',
      suggest: [],
      end: false,
      recalled: false,
      silent: true,
    };
  if (d.kind === 'answer') {
    const mis = d.version === 'mis';
    const talks = talksOf(ctx, npcRef);
    for (const v of versionTries(ctx, npcRef, t, mis)) {
      const prev = talks[t.id];
      const heard = prev && prev.v === (v.version ?? '') ? new Set(prev.k) : new Set<string>();
      let said = speak(ctx, {
        speaker: npcRef,
        slot: `topic.${t.id}`,
        vars: fill.vars,
        mood,
        version: v.version,
        versionBy: v.versionBy,
        saidThisSession: heard,
        rotate: true,
      });
      if (!said && heard.size > 0) {
        // talked out: the rotation starts over and the menu marks it as talked (7.7)
        talks[t.id] = { v: v.version ?? '', k: [], day: prev?.day ?? 0, done: true };
        said = speak(ctx, {
          speaker: npcRef,
          slot: `topic.${t.id}`,
          vars: fill.vars,
          mood,
          version: v.version,
          versionBy: v.versionBy,
          rotate: true,
        });
      }
      if (!said) continue;
      record(ctx, npcRef, t, v.version, said.key, fill);
      return {
        topic: t,
        line: said.text,
        outcome: 'answer',
        suggest: [],
        end: false,
        recalled: said.recalled,
        silent: false,
      };
    }
    return {
      topic: t,
      line: tr('sys.dialogue.intent.fallback'),
      outcome: 'answer',
      suggest: [],
      end: false,
      recalled: false,
      silent: true,
    };
  }
  // the misdirection is said sincerely (6.6): an answer to the speaker, never a refusal
  if (d.refusal === 'mis') {
    const said = speak(ctx, {
      speaker: npcRef,
      slot: `topic.${t.id}`,
      vars: fill.vars,
      mood,
      version: 'mis',
      versionBy: 'exact',
    });
    if (said)
      return {
        topic: t,
        line: said.text,
        outcome: 'mis',
        suggest: [],
        end: false,
        recalled: said.recalled,
        silent: false,
      };
  }
  // a refusal: the refusal reaction of the person, and the anti-loop
  const refusals = opts.refusals ?? {};
  refusals[t.id] = (refusals[t.id] ?? 0) + 1;
  const end = refusals[t.id] >= REFUSALS_TO_END;
  if (end) {
    closeForToday(ctx, npcRef, t.id);
    const bye = reactLine(ctx, npcRef, 'farewell', fill.vars);
    return {
      topic: t,
      line: bye ?? tr('sys.dialogue.intent.fallback'),
      outcome: d.refusal,
      suggest: [],
      end: true,
      recalled: false,
      silent: bye === null,
    };
  }
  const suggest =
    d.refusal === 'evade' || d.refusal === 'unknown' ? redirectFor(ctx, npcRef, t) : [];
  const hint = suggest[0] ? topicById(ctx.content, suggest[0]) : undefined;
  const vars = { ...fill.vars, topic_hint: hint ? topicTitle(ctx, hint) : undefined };
  const slot = `react.${d.refusal === 'mis' ? 'unknown' : d.refusal}`;
  const line = reactLine(ctx, npcRef, slot, vars) ?? reactLine(ctx, npcRef, 'react.unknown', vars);
  return {
    topic: t,
    line: line ?? tr('sys.dialogue.intent.fallback'),
    outcome: d.refusal,
    suggest,
    end: false,
    recalled: false,
    silent: line === null,
  };
}
