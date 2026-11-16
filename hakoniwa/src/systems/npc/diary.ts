// L3 batch diary (npc_society_ai.md 7.3, ai_architecture.md 4.5): once a game day per
// map, the offstage residents' tracks go to the npc.batch_diary role in one request.
// The rule diary (top three telling track items with templates) is the fallback.

import { systemSource } from '../../core';
import type { AiContextV1 } from '../../core/ai_port';
import type { AnyCommand } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { commandText, joinText, type KeyText, type TextParam, tr } from '../../core/text';
import { mapById } from '../world';
import { DIARY_BATCH, DIARY_CAP, DIARY_DEADLINE } from './constants';
import { addMemory, timeLabel } from './memory';
import { personaById } from './personas';
import { locationById } from './places';
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

/** Rule diary: up to three distinct telling items per resident. */
export function ruleDiary(ctx: SystemContext, st: NpcState): DiaryEntryData[] {
  const out: DiaryEntryData[] = [];
  const used = new Set<DiaryKind>();
  for (const kind of SALIENCE) {
    if (out.length >= 3) break;
    const item = st.track.find((t) => t.kind === kind);
    if (!item || used.has(kind)) continue;
    used.add(kind);
    const loc =
      locationById(ctx.content, st.mapId, item.loc)?.name ?? tr('sys.npc.diary.somewhere');
    out.push({
      npcId: st.id,
      kind,
      text: tr(RULE_TEXT[kind].key, { loc, with: item.with ?? tr('sys.npc.diary.someone') }),
    });
  }
  return out;
}

function trackLine(ctx: SystemContext, st: NpcState, t: TrackItem): KeyText {
  const loc = locationById(ctx.content, st.mapId, t.loc)?.name ?? t.loc;
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
      const fallbackEntries = batch.flatMap((st) => ruleDiary(ctx, st));
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
    st.diary.push({ day, kind: e.kind, text });
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
