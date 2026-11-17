// L3 batch diary (npc_society_ai.md 7.3, ai_architecture.md 4.5): once a game day per
// map, the offstage residents' tracks go to the npc.batch_diary role in one request.
// The rule diary (top three telling track items with templates) is the fallback.

import { systemSource } from '../../core';
import type { AiContextV1 } from '../../core/ai_port';
import type { AnyCommand } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { commandText, joinText, type KeyText, type TextParam, tr } from '../../core/text';
import { calendarAt } from '../../core/time';
import { MOODS } from '../dialogue/lines/types';
import { mapById } from '../world';
import { moodOf } from './brain/mood';
import { DIARY_BATCH, DIARY_CAP, DIARY_DEADLINE } from './constants';
import { addMemory, timeLabel } from './memory';
import { cardOf, personaById } from './personas';
import { locationOfRef } from './places';
import {
  DIARY_KINDS,
  type DiaryEntryData,
  type DiaryKind,
  type NpcState,
  type TrackItem,
} from './types';

export const DIARY_KIND_NAMES: Record<DiaryKind, KeyText> = {
  trade: tr('sys.npc.diary.kind.trade'),
  quarrel: tr('sys.npc.diary.kind.quarrel'),
  gossip: tr('sys.npc.diary.kind.gossip'),
  help: tr('sys.npc.diary.kind.help'),
  pray: tr('sys.npc.diary.kind.pray'),
  work_issue: tr('sys.npc.diary.kind.work_issue'),
  meet: tr('sys.npc.diary.kind.meet'),
  injury: tr('sys.npc.diary.kind.injury'),
  leave: tr('sys.npc.diary.kind.leave'),
  work: tr('sys.npc.diary.kind.work'),
  chat: tr('sys.npc.diary.kind.chat'),
};

/** Telling events first (rule pick order). */
const SALIENCE: DiaryKind[] = [
  'injury',
  'quarrel',
  'help',
  'gossip',
  'meet',
  'leave',
  'work_issue',
  'trade',
  'pray',
  'chat',
  'work',
];

/** Rule diary sentences (their templates take {loc} and {with}). */
const RULE_TEXT: Record<DiaryKind, KeyText> = {
  trade: tr('sys.npc.diary.rule.trade'),
  quarrel: tr('sys.npc.diary.rule.quarrel'),
  gossip: tr('sys.npc.diary.rule.gossip'),
  help: tr('sys.npc.diary.rule.help'),
  pray: tr('sys.npc.diary.rule.pray'),
  work_issue: tr('sys.npc.diary.rule.work_issue'),
  meet: tr('sys.npc.diary.rule.meet'),
  injury: tr('sys.npc.diary.rule.injury'),
  leave: tr('sys.npc.diary.rule.leave'),
  work: tr('sys.npc.diary.rule.work'),
  chat: tr('sys.npc.diary.rule.chat'),
};

/** The map a person's track references are relative to (their card's home map). */
function homeMapOf(ctx: SystemContext, st: NpcState): string {
  return cardOf(ctx.world.slices.npc, ctx.content, st.id)?.map ?? st.mapId;
}

/**
 * How telling a track item is (builtin_ai.md 5.4): the kind's weight (leaving 6, an
 * injury 5, a quarrel 5, asking for help 4, meeting someone 3, a trade 3, passing news 3,
 * trouble at work 3, prayer 2, work 1, small talk 1), plus 4 when it involved the player,
 * 2 with someone the person feels strongly about (a relation dimension at 50 or more), and
 * 1 for the first of its kind this week.
 */
export const DIARY_WEIGHT: Record<DiaryKind, number> = {
  leave: 6,
  injury: 5,
  quarrel: 5,
  help: 4,
  meet: 3,
  trade: 3,
  gossip: 3,
  work_issue: 3,
  pray: 2,
  work: 1,
  chat: 1,
};

export function diaryScore(ctx: SystemContext, st: NpcState, t: TrackItem, day: number): number {
  let s = DIARY_WEIGHT[t.kind];
  const slice = ctx.world.slices.npc;
  const otherId = t.withId ?? (t.with ? namedIdOf(ctx, t.with) : undefined);
  if (otherId === 'player') s += 4;
  else if (otherId) {
    const r = slice.minds[st.id]?.rel[otherId];
    if (
      r &&
      Math.max(Math.abs(r.like), Math.abs(r.trust - 50) * 2, r.awe, Math.abs(r.interest)) >= 50
    )
      s += 2;
  }
  if (!st.diary.some((d) => d.kind === t.kind && day - d.day < 7)) s += 1;
  return s;
}

/** The persona id a track's "with" names (tracks keep display names). */
function namedIdOf(ctx: SystemContext, name: TrackItem['with']): string | undefined {
  if (name === undefined) return undefined;
  for (const p of ctx.content.npcs ?? []) if (p.name === name) return p.id;
  return undefined;
}

/** Rule diary: the three most telling distinct items of the day, with the day's mood. */
export function ruleDiary(ctx: SystemContext, st: NpcState, day?: number): DiaryEntryData[] {
  const today = day ?? calendarAt(ctx.tick).dayIndex;
  const ranked = st.track
    .map((t, i) => ({ t, i, s: diaryScore(ctx, st, t, today) }))
    .sort(
      (a, b) => b.s - a.s || SALIENCE.indexOf(a.t.kind) - SALIENCE.indexOf(b.t.kind) || a.i - b.i,
    );
  const out: DiaryEntryData[] = [];
  const used = new Set<DiaryKind>();
  const mood = moodOf(st, ctx.tick);
  for (const { t: item } of ranked) {
    if (out.length >= 3) break;
    if (used.has(item.kind)) continue;
    used.add(item.kind);
    const loc =
      locationOfRef(ctx.content, homeMapOf(ctx, st), item.loc)?.name ??
      tr('sys.npc.diary.somewhere');
    const other =
      item.withId === 'player'
        ? tr('sys.npc.diary.player')
        : (item.with ?? tr('sys.npc.diary.someone'));
    out.push({
      npcId: st.id,
      kind: item.kind,
      text: tr(RULE_TEXT[item.kind].key, { loc, with: other }),
      mood,
    });
  }
  // the day ends with its mood (builtin_ai.md 5.4)
  const last = out.at(-1);
  if (last)
    last.text = tr('sys.npc.diary.closing', {
      text: last.text,
      mood: tr(`sys.npc.diary.mood.${mood}`),
    });
  return out;
}

function trackLine(ctx: SystemContext, st: NpcState, t: TrackItem): KeyText {
  const loc = locationOfRef(ctx.content, homeMapOf(ctx, st), t.loc)?.name ?? t.loc;
  return tr('sys.npc.diary.track', {
    hh: String(t.hour).padStart(2, '0'),
    loc,
    kind: tr(DIARY_KIND_NAMES[t.kind].key),
    with: t.with ? tr('sys.npc.diary.track_with', { name: t.with }) : '',
  });
}

/** File the batch diary requests for every map with offstage (L3) named residents. */
export function requestDiaries(ctx: SystemContext, day: number): void {
  const slice = ctx.world.slices.npc;
  const byMap = new Map<string, NpcState[]>();
  for (const id of Object.keys(slice.npcs).sort()) {
    const st = slice.npcs[id] as NpcState;
    if (st.resident || st.gone || st.tier !== 3 || st.track.length === 0) continue;
    const list = byMap.get(st.mapId) ?? [];
    list.push(st);
    byMap.set(st.mapId, list);
  }
  for (const mapId of [...byMap.keys()].sort()) {
    const all = byMap.get(mapId) as NpcState[];
    for (let start = 0; start < all.length; start += DIARY_BATCH) {
      const batch = all.slice(start, start + DIARY_BATCH);
      const key = start === 0 ? mapId : `${mapId}#${start / DIARY_BATCH + 1}`;
      const prev = slice.diary[key];
      const rev = (prev?.rev ?? 0) + 1;
      const tracks: Record<string, DiaryKind[]> = {};
      for (const st of batch) tracks[st.id] = [...new Set(st.track.map((t) => t.kind))];
      slice.diary[key] = { rev, day, roster: batch.map((s) => s.id), tracks, done: false };
      const fallbackEntries = batch.flatMap((st) => ruleDiary(ctx, st, day));
      const fallback: AnyCommand[] = [
        {
          kind: 'npc.diary_batch',
          data: { mapId: key, day, revision: rev, entries: fallbackEntries },
          source: systemSource('npc'),
        },
      ];
      const mapName = mapById(ctx.content, mapId)?.name ?? mapId;
      const roster = batch.map((st) => {
        const p = personaById(ctx.content, st.id);
        return {
          npcId: st.id,
          name: p?.name ?? st.id,
          who: p
            ? tr('sys.npc.prompt.diary_who', {
                job: p.job,
                traits: joinText('list', p.traits.slice(0, 3)),
              })
            : '',
          voice: p?.voice.rules.slice(0, 2) ?? [],
          track: st.track.map((t) => trackLine(ctx, st, t)),
        };
      });
      const context: AiContextV1 = {
        v: 1,
        persona: tr('sys.npc.prompt.diary_persona', { map: mapName }),
        situation: tr('sys.npc.prompt.diary_situation', {
          map: mapName,
          time: timeLabel(ctx.tick),
        }),
        commands: {
          'npc.diary_batch': tr('sys.npc.prompt.diary_command', {
            key,
            day,
            rev,
            kinds: joinText('list', DIARY_KINDS),
          }),
        },
        // fresh copies: the context is world state, the table is module data
        extra: { roster, kinds: JSON.parse(JSON.stringify(DIARY_KIND_NAMES)) },
      };
      ctx.ai.request({
        agentId: `region:${key}`,
        role: 'npc.batch_diary',
        purpose: 'batch_diary',
        revision: rev,
        context,
        allowed: ['npc.diary_batch'],
        fallback,
        deadlineTicks: DIARY_DEADLINE,
        priority: 0,
        // diary text only: a time skip holds it for the model until the skip ends
        backfill: true,
      });
    }
  }
}

/** A diary line: the model's string (trimmed, capped at 40), or a rule diary text key. */
function diaryText(v: TextParam | undefined, fromModel: boolean): TextParam {
  // rule sentences stay under 40 characters (longest place name 10, longest name 8)
  return commandText(v, fromModel, (s) => s.trim().slice(0, 40));
}

/** Validate and store a diary batch; returns a readable reason on rejection. */
export function applyDiary(
  ctx: SystemContext,
  mapKey: string,
  day: number,
  revision: number,
  entries: DiaryEntryData[],
  source: string,
): KeyText | null {
  const slice = ctx.world.slices.npc;
  const round = slice.diary[mapKey];
  if (!round) return tr('sys.npc.diary.reject.no_round');
  if (round.rev !== revision || round.day !== day || round.done)
    return tr('sys.npc.diary.reject.stale');
  if (!Array.isArray(entries)) return tr('sys.npc.diary.reject.bad_entries');
  const perNpc: Record<string, number> = {};
  let count = 0;
  for (const e of entries) {
    if (!e || typeof e.npcId !== 'string') continue;
    const text = diaryText(e.text, source === 'ai');
    if (!round.roster.includes(e.npcId)) continue;
    if (!DIARY_KINDS.includes(e.kind) || !round.tracks[e.npcId]?.includes(e.kind)) continue;
    if (!text) continue;
    const n = (perNpc[e.npcId] ?? 0) + 1;
    if (n > 3) continue;
    perNpc[e.npcId] = n;
    const st = slice.npcs[e.npcId];
    if (!st) continue;
    const mood =
      typeof e.mood === 'string' && (MOODS as readonly string[]).includes(e.mood)
        ? e.mood
        : undefined;
    st.diary.push(mood ? { day, kind: e.kind, text, mood } : { day, kind: e.kind, text });
    if (st.diary.length > DIARY_CAP) st.diary.splice(0, st.diary.length - DIARY_CAP);
    addMemory(ctx, e.npcId, {
      text,
      src: 'self',
      imp: e.kind === 'work' || e.kind === 'chat' ? 0.1 : 0.3,
    });
    count++;
  }
  round.done = true;
  ctx.emit('npc.diary_written', { mapId: mapKey, day, count, source });
  return null;
}
