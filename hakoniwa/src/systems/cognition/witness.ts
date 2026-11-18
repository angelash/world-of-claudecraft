// Witnessing (reputation_and_cognition.md 3.7): awake named NPCs within sight of a deed
// get eyewitness evidence, run the belief machine, remember it, hold the eyewitness
// version of the new rumor, and may say their reaction out loud. Residents (L4) seed
// the crowd share instead.

import type { SystemContext } from '../../core/system';
import { clipText, type TextParam, tr } from '../../core/text';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import { react } from '../npc/brain/reactions';
import { addMemory } from '../npc/memory';
import { personaById } from '../npc/personas';
import { locationAt } from '../npc/places';
import { bumpHeat } from '../npc/ports';
import { distance, entitiesNear, getEntity, mapById, sedimentAt } from '../world';
import { type EvidenceInput, type ObserveOutcome, observe } from './belief';
import { speakReaction } from './comedy';
import {
  apparentOfTier,
  clarityAt,
  isAccepted,
  subjectName,
  subjectOfEntity,
  VIEW_RADIUS,
} from './params';
import { addHolding, seedRumor, witnessVersion } from './rumor';
import { featPhrase } from './rumor_text';
import type { ExplanationId } from './types';

export interface FeatInput {
  /** stable event key: tick, actor and kind */
  key: string;
  actorId: string;
  kind: string;
  tier: number;
  mapId: string;
  x: number;
  y: number;
  targetId?: string;
  note?: TextParam;
}

const MAX_SPOKEN = 2;
const DEDUPE_TICKS = 10;

/** Raise the ledger variable church_suspicion (0..100), owned by social settlement. */
export function raiseChurchSuspicion(ctx: SystemContext, amount: number): void {
  const cur = Number(ctx.flag('church_suspicion') ?? 0) || 0;
  ctx.setFlag('church_suspicion', Math.max(0, Math.min(100, cur + amount)));
}

/** True when a feat on this target was already processed a moment ago. */
export function recentlyProcessed(ctx: SystemContext, targetId: string | undefined): boolean {
  if (!targetId) return false;
  const t = ctx.world.slices.cognition.recentFeats[targetId];
  return t !== undefined && ctx.tick - t <= DEDUPE_TICKS;
}

function reactionRank(o: ObserveOutcome): number {
  if (o.to !== o.from && isAccepted(o.to)) return 3;
  if (o.refuted.length > 0 || o.to === 'wavering') return 2;
  if (o.adopted.length > 0) return 1;
  return 0;
}

export function witnessFeat(ctx: SystemContext, d: FeatInput): void {
  const subject = subjectOfEntity(ctx.world, d.actorId);
  if (!subject) return;
  if (d.targetId) {
    if (recentlyProcessed(ctx, d.targetId)) return;
    ctx.world.slices.cognition.recentFeats[d.targetId] = ctx.tick;
  }
  const npcSlice = ctx.world.slices.npc;
  const F = apparentOfTier(d.tier);
  const spot = { x: d.x, y: d.y };
  const watchers = entitiesNear(ctx.world, d.mapId, d.x, d.y, VIEW_RADIUS, (e) => {
    if (e.kind !== 'npc' || !e.ref || e.id === d.actorId || e.ref === subject) return false;
    const st = npcSlice.npcs[e.ref];
    return !!st && !st.gone && st.activity !== 'sleep';
  });
  if (watchers.length === 0) return;
  const named = watchers.filter((e) => !npcSlice.npcs[e.ref as string]?.resident);
  const residents = watchers.filter((e) => npcSlice.npcs[e.ref as string]?.resident);
  const loc = locationAt(ctx.content, d.mapId, d.x, d.y);
  const map = mapById(ctx.content, d.mapId);
  const place: TextParam = loc?.name ?? map?.name ?? tr('sys.cognition.place.wild');
  const famous = named
    .map((e) => e.ref as string)
    .filter((id) => (personaById(ctx.content, id)?.fame ?? 0) >= 0.5 && id !== subject);
  const details: TextParam[] = [tr('sys.cognition.detail.alone')];
  if (d.note) details.push(clipText(d.note, 12));
  const rumor = seedRumor(ctx, {
    anchor: d.key,
    topic: d.kind,
    subject,
    mapId: d.mapId,
    place,
    apparent: F,
    count: d.kind === 'kill' ? 1 + Math.max(0, d.tier) * 2 : 1,
    details,
    famous,
    tier: d.tier,
  });
  // situational bonuses for the explanation draw (3.4)
  const bonus: Partial<Record<ExplanationId, number>> = {};
  // the sediment where the deed happened: a location's hot spot over the map level (PK-M1-51)
  if (
    (map ? sedimentAt(map, d.x, d.y) : 0) >= 2 ||
    loc?.kind === 'gate' ||
    loc?.kind === 'graveyard'
  )
    bonus.sorcery = 2;
  if (d.kind === 'build' || d.kind === 'destroy') bonus.gadget = 1.5;
  const visible = d.mapId === npcSlice.playerMap;
  const who = subjectName(ctx.content, subject);
  const what = tr('sys.cognition.witness.saw', { who, feat: featPhrase(ctx.content, d.kind) });
  const reactions: { id: string; o: ObserveOutcome; rank: number }[] = [];
  for (const e of named) {
    const id = e.ref as string;
    const clarity = clarityAt(distance(e, spot));
    const kinds: EvidenceInput[] = [
      { kind: clarity >= 1 ? 'seen_close' : 'seen', weight: 5 * clarity },
    ];
    const b = ctx.world.slices.cognition.beliefs[id]?.[subject];
    const seen = (b?.evidence ?? []).filter(
      (x) => (x.kind === 'seen' || x.kind === 'seen_close') && x.src !== d.key,
    );
    // the same kind of deed again is reproducible (3.1 可复现)
    if (seen.some((x) => x.feat === d.kind)) kinds.push({ kind: 'repeat', weight: 4 });
    // done again up close (3.4 当众复现, 亲眼看见空手): the same kind of deed seen before, or
    // any deed of another event (seen at least a game hour before, not a blow of the same
    // fight); the close repeat refutes tricks, gadgets and a hidden master and carries no
    // weight of its own
    const again =
      seen.some((x) => x.feat === d.kind) ||
      seen.some((x) => ctx.tick - x.tick >= TICKS_PER_GAME_HOUR);
    if (clarity >= 1 && again) kinds.push({ kind: 'repeat_close', weight: 0 });
    if (d.targetId && d.targetId === e.id && (d.kind === 'rescue' || d.kind === 'heal'))
      kinds.push({ kind: 'benefit', weight: 3 });
    const o = observe(ctx, id, subject, {
      key: d.key,
      ind: `ev:${d.key}`,
      apparent: F,
      feat: d.kind,
      kinds,
      direct: true,
      bonus,
      what,
    });
    addMemory(ctx, id, {
      text: tr('sys.cognition.witness.memory', { what, place }),
      // the {memory} fill slot of later lines to the player (builtin_ai.md 5.3)
      short: subject === 'player' ? tr('sys.npc.memory.short.feat_seen') : undefined,
      src: 'seen',
      about: subject,
      imp: Math.min(1, 0.4 + 0.1 * d.tier),
    });
    if (subject === 'player') bumpHeat(ctx, id, 0.3);
    const expl = o ? (o.credited || isAccepted(o.to) ? 'real' : o.belief.explanation) : null;
    addHolding(ctx.world.slices.cognition, id, {
      rumor: rumor.id,
      v: witnessVersion(rumor, expl),
      cred: 1,
      from: 'seen',
      origin: id,
      hops: 0,
      tick: ctx.tick,
      believed: true,
      told: 0,
    });
    const p = personaById(ctx.content, id);
    if (o && subject === 'player' && p?.class === 'clergy' && o.adopted.includes('sorcery'))
      raiseChurchSuspicion(ctx, 5);
    if (o) reactions.push({ id, o, rank: reactionRank(o) });
  }
  // the most telling reactions are said out loud first (state changes before 'again'); the
  // NPC reaction table (builtin_ai.md 5.6) sets every onlooker's behaviour and may say its
  // own line, else the cognition-driven line of the state change is said (5.7)
  let spoken = 0;
  for (const r of reactions.sort((a, b) => b.rank - a.rank)) {
    const may = visible && spoken < MAX_SPOKEN;
    if (subject === 'player') {
      const res = react(
        ctx,
        r.id,
        {
          kind: 'feat_seen',
          subject,
          over: r.o.over,
          explanation: r.o.belief.explanation,
          state: r.o.to,
          changed: r.o.to !== r.o.from,
        },
        may,
      );
      if (res === 'spoken') {
        spoken++;
        continue;
      }
    }
    if (!may) continue;
    const addr = personaById(ctx.content, r.id)?.voice.address ?? tr('sys.cognition.address.you');
    if (
      speakReaction(ctx, r.id, r.o, d.mapId, { player: subject === 'player' ? addr : who, place })
    )
      spoken++;
  }
  if (residents.length > 0) {
    let crowd = ctx.world.slices.cognition.crowd[d.mapId];
    if (!crowd) {
      crowd = {};
      ctx.world.slices.cognition.crowd[d.mapId] = crowd;
    }
    crowd[rumor.id] = {
      share: Math.min(1, 0.08 * residents.length),
      v: witnessVersion(rumor, 'luck'),
    };
  }
}

/** Notable deaths without a feat event become feats (elite and boss kills by a person). */
export function witnessDeath(
  ctx: SystemContext,
  d: { id: string; killerId?: string; mapId: string; x: number; y: number },
): void {
  if (!d.killerId || recentlyProcessed(ctx, d.id)) return;
  const victim = getEntity(ctx.world, d.id);
  if (!victim) return;
  const elite = victim.tags.includes('elite');
  const boss = victim.tags.includes('boss');
  if (!elite && !boss) return;
  const tierTag = victim.tags.find((t) => t.startsWith('tier:'));
  const base = tierTag ? Number(tierTag.slice(5)) || 0 : 0;
  witnessFeat(ctx, {
    key: `${ctx.tick}:${d.killerId}:${boss ? 'boss_kill' : 'elite_kill'}`,
    actorId: d.killerId,
    kind: boss ? 'boss_kill' : 'elite_kill',
    tier: base + (boss ? 2 : 1),
    mapId: d.mapId,
    x: d.x,
    y: d.y,
    targetId: d.id,
  });
}
