// Content checks of the topic graph (builtin_ai.md 6.2 and 7.10 "话题编号已在话题图登记";
// feeds the data validation gate through the dialogue pack): ids and their prefixes, the
// closed sets, scope fields, act windows, conditions that parse and read registered
// variables only, references to topics, quests, scenes, maps and people, the misdirection
// and refusal names, and the free-text words. Pure.

import type { ContentMap } from '../../../core/contracts';
import { defaultRegistry } from '../../../core/registry';
import { FUNCTIONAL_ROLES } from '../../npc/types';
import { actIndex, checkCondition, referencedVars } from '../../quests/conditions';
import { isActId, TOPIC_PREFIXES } from '../lines/grammar';
import {
  REFUSALS,
  TOPIC_CATEGORIES,
  TOPIC_REPEATS,
  TOPIC_SCOPES,
  TOPIC_VERSION_BY,
  type TopicDef,
} from './types';

const ID = /^[a-z0-9_]+$/;
const TIERS = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];

type TopicContent = Partial<
  Pick<
    ContentMap,
    | 'topics'
    | 'topicCast'
    | 'npcs'
    | 'companions'
    | 'goddesses'
    | 'maps'
    | 'quests'
    | 'scenes'
    | 'intentLexicon'
    | 'atlas_maps'
  >
>;

function conditionProblems(at: string, cond: string | undefined, out: string[]): void {
  if (cond === undefined) return;
  if (typeof cond !== 'string' || cond.trim() === '') {
    out.push(`${at}: empty condition`);
    return;
  }
  const bad = checkCondition(cond);
  if (bad) {
    out.push(`${at}: condition does not parse: ${bad}`);
    return;
  }
  for (const name of referencedVars(cond))
    if (!defaultRegistry().resolve(name)) out.push(`${at}: reads unregistered variable ${name}`);
}

export function topicProblems(content: TopicContent): string[] {
  const out: string[] = [];
  const topics = content.topics ?? [];
  const ids = new Set<string>();
  const people = new Set<string>([
    ...(content.npcs ?? []).map((p) => p.id),
    ...(content.companions ?? []).map((c) => c.id),
    ...(content.goddesses ?? []).map((g) => g.id),
    ...(content.topicCast ?? []),
  ]);
  const peopleKnown = !!content.npcs && !!content.companions && !!content.goddesses;
  const regions = new Set((content.maps ?? []).map((m) => m.region).filter((r) => !!r));
  // references into tables of other packs are checked when those tables are merged in
  const quests = content.quests ? new Set(content.quests.map((q) => q.id)) : null;
  const words = new Set(Object.values(content.intentLexicon?.entities ?? {}).flat());
  const placeIds = new Set<string>();
  for (const m of content.maps ?? []) {
    placeIds.add(m.id);
    for (const l of m.locations ?? []) placeIds.add(`${m.id}/${l.id}`);
  }
  // maps of the atlas whose map data is not merged in (a partial content): their own ids
  // and locations are taken on trust; the atlas still catches a misspelt map
  const loaded = new Set((content.maps ?? []).map((m) => m.id));
  const atlas = new Set((content.atlas_maps ?? []).map((m) => m.id));
  const placeOk = (s: string) => {
    if (placeIds.has(s)) return true;
    const map = s.split('/')[0] as string;
    return atlas.has(map) && !loaded.has(map);
  };
  for (const t of topics) {
    const at = `topic ${t.id}`;
    if (typeof t.id !== 'string' || !ID.test(t.id)) {
      out.push(`${at}: id must be lowercase letters, digits and underscores`);
      continue;
    }
    if (ids.has(t.id)) out.push(`${at}: duplicate id`);
    ids.add(t.id);
    if (!TOPIC_PREFIXES.some((p) => t.id.startsWith(p)))
      out.push(`${at}: id has no registered prefix`);
    if (!(TOPIC_CATEGORIES as readonly string[]).includes(t.category))
      out.push(`${at}: unknown category ${t.category}`);
    if (!(TOPIC_SCOPES as readonly string[]).includes(t.scope))
      out.push(`${at}: unknown scope ${t.scope}`);
    if (!(TOPIC_VERSION_BY as readonly string[]).includes(t.versionBy))
      out.push(`${at}: unknown versionBy ${t.versionBy}`);
    if (!(TOPIC_REPEATS as readonly string[]).includes(t.repeat))
      out.push(`${at}: unknown repeat ${t.repeat}`);
    if (!TIERS.includes(t.tier)) out.push(`${at}: tier ${t.tier} is not K0 to K5`);
    if (t.title !== undefined && (typeof t.title !== 'string' || t.title.trim() === ''))
      out.push(`${at}: empty title`);
    if (t.title === undefined) {
      const who = t.id.startsWith('person_') ? t.id.slice(7) : '';
      if (!who || !people.has(who) || t.category !== 'person')
        out.push(`${at}: needs a title (only a person topic says the person's name)`);
    }
    if (t.scope === 'persona' && (t.owners ?? []).length === 0)
      out.push(`${at}: a persona topic needs owners`);
    if (t.scope === 'region' && (!t.region || (regions.size > 0 && !regions.has(t.region))))
      out.push(`${at}: region ${t.region} is no map's region`);
    // people are checked once every table of people is merged in (personas, companions,
    // goddesses, the offstage cast)
    if (peopleKnown)
      for (const who of new Set([...(t.owners ?? []), ...(t.knowers ?? [])]))
        if (!people.has(who)) out.push(`${at}: unknown person ${who}`);
    if (!isActId(t.act)) out.push(`${at}: act ${t.act} is not an act`);
    if (t.until !== undefined) {
      if (!isActId(t.until)) out.push(`${at}: until ${t.until} is not an act`);
      else if (actIndex(t.until) < actIndex(t.act)) out.push(`${at}: until before act`);
    }
    conditionProblems(`${at} requires`, t.requires, out);
    if (t.trustMin !== undefined && !(t.trustMin >= 0 && t.trustMin <= 100))
      out.push(`${at}: trustMin must be 0 to 100`);
    for (const a of t.after ?? [])
      if (!topics.some((x) => x.id === a)) out.push(`${at}: after unknown topic ${a}`);
    for (const u of t.unlocks?.topics ?? [])
      if (!topics.some((x) => x.id === u)) out.push(`${at}: unlocks unknown topic ${u}`);
    for (const q of t.unlocks?.quests ?? [])
      if (quests && !quests.has(q)) out.push(`${at}: unlocks unknown quest ${q}`);
    if (t.locked !== undefined && !(REFUSALS as readonly string[]).includes(t.locked))
      out.push(`${at}: locked ${t.locked} is not a refusal`);
    for (const [who, r] of Object.entries(t.lockedBy ?? {})) {
      if (peopleKnown && !people.has(who)) out.push(`${at}: lockedBy unknown person ${who}`);
      if (!(REFUSALS as readonly string[]).includes(r))
        out.push(`${at}: lockedBy ${who} ${r} is not a refusal`);
    }
    if (t.mis) {
      if ((t.mis.by ?? []).length === 0) out.push(`${at}: mis needs who says it`);
      for (const b of t.mis.by ?? []) {
        const ok = b.startsWith('class:')
          ? ID.test(b.slice(6))
          : b.startsWith('tier:')
            ? TIERS.includes(b.slice(5))
            : !peopleKnown || people.has(b);
        if (!ok) out.push(`${at}: mis.by ${b} is no person, class: or tier:`);
      }
      conditionProblems(`${at} mis.until`, t.mis.until, out);
    }
    for (const s of t.aliases ?? []) {
      const ok = placeOk(s) || people.has(s) || words.has(s);
      if (!ok) out.push(`${at}: alias ${s} is no place, person or lexicon word`);
    }
    for (const g of t.keywords ?? [])
      if (!Array.isArray(g) || g.length === 0 || g.some((w) => typeof w !== 'string' || !w))
        out.push(`${at}: keyword groups need words`);
    if (t.scene && content.scenes) {
      const scene = (content.scenes ?? []).find((s) => s.id === t.scene?.id);
      if (!scene) out.push(`${at}: unknown scene ${t.scene.id}`);
      else if (!scene.nodes.some((n) => (n.choices ?? []).some((c) => c.id === t.scene?.choice)))
        out.push(`${at}: scene ${t.scene.id} has no choice ${t.scene.choice}`);
    }
    if (t.service !== undefined && !(FUNCTIONAL_ROLES as readonly string[]).includes(t.service))
      out.push(`${at}: service ${t.service} is not a functional role`);
  }
  return out;
}
