// Validation of the quest model of PK-M1-58 (quests_and_events.md 3, 5): quest kinds, the
// new objective kinds and their references, solution paths, stage failure branches, the
// closing outcomes (byOther, expiry, failure), dispute chains and nodes, and the key event
// effect. Pure checks over the content; the quests pack calls them.

import type { ContentMap } from '../../core/contracts';
import { checkCondition } from '../../systems/quests/conditions';
import { type Effect, KEY_KINDS } from '../../systems/quests/effect_types';
import {
  OBJECTIVE_TYPES,
  type Objective,
  QUEST_KINDS,
  type QuestDef,
  type QuestStage,
} from '../../systems/quests/types';

/** A key id is one registry name segment (world_state_registry.md 2.1). */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_]*$/;

function cond(expr: string | undefined, where: string): string[] {
  if (expr === undefined || expr === '') return [];
  const err = checkCondition(expr);
  return err ? [`${where}: ${err}`] : [];
}

function wholeAtLeast(v: number | undefined, min: number): boolean {
  return v === undefined || (Number.isInteger(v) && v >= min);
}

/** Problems in a key event effect (the rest of an effect is checked by effectProblems). */
export function keyEffectProblems(e: Effect, at: string, content: ContentMap): string[] {
  if (e.type !== 'key') return [];
  const out: string[] = [];
  const doors = (content as { doors?: { id: string }[] }).doors;
  if (doors && !doors.some((d) => d.id === e.doorId)) out.push(`${at}: unknown door ${e.doorId}`);
  if (!(KEY_KINDS as readonly string[]).includes(e.keyKind))
    out.push(`${at}: unknown key kind ${String(e.keyKind)}`);
  if (typeof e.keyId !== 'string' || !SEGMENT.test(e.keyId))
    out.push(`${at}: key id must be one name segment (${String(e.keyId)})`);
  return out;
}

function placeProblems(
  content: ContentMap,
  at: string,
  mapId: string | undefined,
  location: string | undefined,
): string[] {
  if (!mapId || !content.maps) return [];
  const map = content.maps.find((m) => m.id === mapId);
  if (!map) return [`${at}: unknown map ${mapId}`];
  if (location && !map.locations.some((l) => l.id === location))
    return [`${at}: unknown location ${location} on ${mapId}`];
  return [];
}

/** A person an objective names: a persona or a companion of the content. */
function personProblems(content: ContentMap, at: string, npc: string): string[] {
  const people = [
    ...((content as { npcs?: { id: string }[] }).npcs ?? []),
    ...((content as { companions?: { id: string }[] }).companions ?? []),
  ];
  if (people.length === 0 || people.some((p) => p.id === npc)) return [];
  return [`${at}: unknown person ${npc}`];
}

function positive(v: number | undefined, at: string, what: string): string[] {
  return v === undefined || v > 0 ? [] : [`${at}: ${what} must be positive`];
}

function itemProblems(content: ContentMap, at: string, item: string | undefined): string[] {
  if (!item || content.items?.some((it) => it.id === item)) return [];
  return [`${at}: unknown item ${item}`];
}

/** Problems in one objective of the model. */
export function objectiveProblems(o: Objective, at: string, content: ContentMap): string[] {
  const out: string[] = [];
  if (!OBJECTIVE_TYPES.includes(o.type)) return [`${at}: unknown objective type ${String(o.type)}`];
  if (o.path !== undefined && !SEGMENT.test(o.path)) out.push(`${at}: bad path ${o.path}`);
  if ('npc' in o && typeof o.npc === 'string' && o.type !== 'talk' && o.type !== 'choice')
    out.push(...personProblems(content, at, o.npc));
  switch (o.type) {
    case 'deliver':
      out.push(...itemProblems(content, at, o.item));
      if (!o.npc) out.push(`${at}: deliver needs npc`);
      if (!wholeAtLeast(o.count, 1)) out.push(`${at}: bad count ${o.count}`);
      break;
    case 'escort':
    case 'stealth':
      out.push(...placeProblems(content, at, o.mapId, o.location));
      break;
    case 'follow':
      out.push(...placeProblems(content, at, o.mapId, o.location));
      if (!o.location) out.push(`${at}: follow needs the location the person walks to`);
      out.push(...positive(o.range, at, 'range'), ...positive(o.hours, at, 'hours'));
      break;
    case 'rescue':
      out.push(...placeProblems(content, at, o.mapId, o.location));
      out.push(...cond(o.when, `${at} when`));
      break;
    case 'investigate': {
      if (o.clues.length === 0) out.push(`${at}: investigate needs clues`);
      const ids = new Set<string>();
      for (const c of o.clues) {
        if (ids.has(c.id)) out.push(`${at}: duplicate clue ${c.id}`);
        ids.add(c.id);
        out.push(...cond(c.when, `${at} clue ${c.id}`));
      }
      if (
        o.need !== undefined &&
        !(Number.isInteger(o.need) && o.need >= 1 && o.need <= o.clues.length)
      )
        out.push(`${at}: need ${o.need} out of 1 to ${o.clues.length}`);
      break;
    }
    case 'persuade':
      out.push(...cond(o.when, `${at} when`));
      if (!o.when) out.push(`${at}: persuade needs its threshold condition`);
      break;
    case 'duel':
      if (o.outcome && !['win', 'lose', 'any'].includes(o.outcome))
        out.push(`${at}: bad outcome ${o.outcome}`);
      break;
    case 'gather':
    case 'craft':
      out.push(...itemProblems(content, at, o.item));
      if (!wholeAtLeast(o.count, 1)) out.push(`${at}: bad count ${o.count}`);
      break;
    case 'trade':
      out.push(...itemProblems(content, at, o.item));
      if (!wholeAtLeast(o.count, 1)) out.push(`${at}: bad count ${o.count}`);
      if (o.side && o.side !== 'buy' && o.side !== 'sell') out.push(`${at}: bad side ${o.side}`);
      out.push(...positive(o.price, at, 'price'));
      break;
    case 'accompany':
      if (!(o.minutes > 0)) out.push(`${at}: accompany needs minutes`);
      out.push(...positive(o.range, at, 'range'));
      break;
    case 'choice':
      for (const opt of o.options)
        if (opt.path !== undefined && !SEGMENT.test(opt.path))
          out.push(`${at}: option ${opt.id} has a bad path ${opt.path}`);
      break;
    default:
      break;
  }
  return out;
}

function stageProblems(q: QuestDef, st: QuestStage, at: string): string[] {
  if (st.failTo === undefined) return [];
  if (st.failTo === st.id) return [`${at}: failTo points at its own stage`];
  if (!q.stages.some((s) => s.id === st.failTo)) return [`${at}: unknown failTo ${st.failTo}`];
  return [];
}

/**
 * Problems in the quest-model fields of one quest (kind, outcomes, chain and node, default
 * steps, objective kinds, failure branches). Effects inside them go through `effects`.
 */
export function questModelProblems(
  q: QuestDef,
  content: ContentMap,
  effects: (list: Effect[] | undefined, where: string) => string[],
): string[] {
  const at = `quest ${q.id}`;
  const out: string[] = [];
  if (!(QUEST_KINDS as readonly string[]).includes(q.kind))
    out.push(`${at}: unknown kind ${q.kind}`);
  for (const st of q.stages) {
    out.push(...stageProblems(q, st, `${at} stage ${st.id}`));
    out.push(...effects(st.onFail, `${at} stage ${st.id} onFail`));
    st.objectives.forEach((o, i) => {
      out.push(...objectiveProblems(o, `${at} stage ${st.id} objective ${i}`, content));
    });
  }
  if (q.byOther) {
    out.push(...cond(q.byOther.when, `${at} byOther`));
    out.push(...effects(q.byOther.effects, `${at} byOther`));
  }
  if (q.expiry) {
    if (q.expiry.week === undefined && !q.expiry.when) out.push(`${at}: expiry needs week or when`);
    if (!wholeAtLeast(q.expiry.week, 1)) out.push(`${at}: bad expiry week ${q.expiry.week}`);
    out.push(...cond(q.expiry.when, `${at} expiry`));
    out.push(...effects(q.expiry.effects, `${at} expiry`));
  }
  if (q.failure) {
    out.push(...cond(q.failure.when, `${at} failure`));
    out.push(...effects(q.failure.effects, `${at} failure`));
  }
  if (q.chain !== undefined) {
    const chain = content.quests.find((c) => c.id === q.chain);
    if (!chain) out.push(`${at}: unknown chain ${q.chain}`);
    else if (chain.kind !== 'dispute') out.push(`${at}: chain ${q.chain} is not a dispute`);
    if (q.kind !== 'node') out.push(`${at}: only a node names a chain`);
  }
  if (q.kind === 'node' && q.chain === undefined) out.push(`${at}: a node names its chain`);
  const act = content.acts.find((a) => a.id === q.act);
  if (act && !act.clock && (q.weekWindow || q.expiry?.week !== undefined || q.defaults?.length))
    out.push(
      `${at}: act ${q.act} counts no weeks (no clock) for weekWindow, expiry.week or defaults`,
    );
  const steps = new Set<string>();
  for (const s of q.defaults ?? []) {
    if (steps.has(s.id)) out.push(`${at} default ${s.id}: duplicate id`);
    steps.add(s.id);
    if (!wholeAtLeast(s.week, 1)) out.push(`${at} default ${s.id}: bad week ${s.week}`);
    out.push(...cond(s.unless, `${at} default ${s.id} unless`));
    out.push(...effects(s.effects, `${at} default ${s.id}`));
  }
  if (q.defaults?.length && q.kind !== 'dispute')
    out.push(`${at}: only a dispute chain has default steps`);
  return out;
}
