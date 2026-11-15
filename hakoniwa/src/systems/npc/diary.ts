// L3 batch diary (npc_society_ai.md 7.3, ai_architecture.md 4.5): once a game day per
// map, the offstage residents' tracks go to the npc.batch_diary role in one request.
// The rule diary (top three telling track items with templates) is the fallback.

import { systemSource } from '../../core';
import type { AiContextV1 } from '../../core/ai_port';
import type { AnyCommand } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
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

export const DIARY_KIND_NAMES: Record<DiaryKind, string> = {
  trade: '交易',
  quarrel: '争吵',
  gossip: '传话',
  help: '求助',
  pray: '祈祷',
  work_issue: '工作异常',
  meet: '结识',
  injury: '受伤',
  leave: '离开',
  work: '劳作',
  chat: '闲谈',
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

const RULE_TEXT: Record<DiaryKind, string> = {
  trade: '去{loc}买了点东西。',
  quarrel: '在{loc}和{with}拌了嘴，心里不痛快。',
  gossip: '在{loc}听了些新鲜事。',
  help: '在{loc}帮了人一把。',
  pray: '去{loc}祷告了。',
  work_issue: '干活时出了点岔子。',
  meet: '在{loc}认识了{with}。',
  injury: '受了点伤。',
  leave: '出了一趟远门。',
  work: '在{loc}干了一天活。',
  chat: '在{loc}和{with}聊了几句。',
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
    const loc = locationById(ctx.content, st.mapId, item.loc)?.name ?? '镇上';
    out.push({
      npcId: st.id,
      kind,
      text: RULE_TEXT[kind].replace('{loc}', loc).replace('{with}', item.with ?? '人'),
    });
  }
  return out;
}

function trackLine(ctx: SystemContext, st: NpcState, t: TrackItem): string {
  const loc = locationById(ctx.content, st.mapId, t.loc)?.name ?? t.loc;
  return `${String(t.hour).padStart(2, '0')}时 ${loc} ${DIARY_KIND_NAMES[t.kind]}${t.with ? `（${t.with}）` : ''}`;
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
          who: p ? `${p.job}，${p.traits.slice(0, 3).join('、')}` : '',
          voice: p?.voice.rules.slice(0, 2) ?? [],
          track: st.track.map((t) => trackLine(ctx, st, t)),
        };
      });
      const context: AiContextV1 = {
        v: 1,
        persona: `${mapName}的居民日记执笔人：只从各人的当日轨迹里挑事，不发明人物、地点和事件；说法只是此人的说法，不改变结果。`,
        situation: `${mapName}，${timeLabel(ctx.tick)}之前的这一天。为名册里的每个人挑至多 3 件值得记的事，各写一句 40 字以内、符合本人口吻的说法。`,
        commands: {
          'npc.diary_batch': `提交日记。数据：{ mapId: "${key}", day: ${day}, revision: ${rev}, entries: [{ npcId, kind, text }] }。kind 只能取此人轨迹里出现过的种类（${DIARY_KINDS.join('、')}）；每人至多 3 条。`,
        },
        extra: { roster, kinds: DIARY_KIND_NAMES },
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

/** Validate and store a diary batch; returns a Chinese reason on rejection. */
export function applyDiary(
  ctx: SystemContext,
  mapKey: string,
  day: number,
  revision: number,
  entries: DiaryEntryData[],
  source: string,
): string | null {
  const slice = ctx.world.slices.npc;
  const round = slice.diary[mapKey];
  if (!round) return '这个地方没有待写的日记';
  if (round.rev !== revision || round.day !== day || round.done) return '日记请求已经过时';
  if (!Array.isArray(entries)) return '日记条目格式不对';
  const perNpc: Record<string, number> = {};
  let count = 0;
  for (const e of entries) {
    if (!e || typeof e.text !== 'string' || typeof e.npcId !== 'string') continue;
    if (!round.roster.includes(e.npcId)) continue;
    if (!DIARY_KINDS.includes(e.kind) || !round.tracks[e.npcId]?.includes(e.kind)) continue;
    const text = e.text.trim().slice(0, 40);
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
