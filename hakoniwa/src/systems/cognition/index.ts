// Cognition system (phase 45): witnessing, belief profiles and the "mortals do not
// believe" state machine, rumors with distortion and fact checks, reputation, appraisal
// (D-029) and pressure perception. All rules; the model only words the results.
// See docs/40_design/systems/reputation_and_cognition.md.

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { pickLine } from '../dialogue/templates';
import { addMemory } from '../npc/memory';
import { npcEntityId, personaById } from '../npc/personas';
import { distance, entitiesNear, getEntity } from '../world';
import { appraise } from './appraise';
import { observe, regressBeliefs, updatePublicStances } from './belief';
import { comedyGate } from './comedy';
import {
  addHolding,
  coolRumors,
  crowdTell,
  publishFact,
  seedRumor,
  tryTell,
  witnessVersion,
} from './rumor';
import { type AppraisalResult, EVIDENCE_KINDS, type EvidenceKind } from './types';
import { raiseChurchSuspicion, witnessDeath, witnessFeat } from './witness';

export * from './appraise';
export { beliefOf, observe } from './belief';
export * from './params';
export * from './pressure';
export * from './queries';
export { tellPlayer } from './rumor';
export { rumorText } from './rumor_text';
export * from './types';

const APPRAISE_RANGE = 8;
const APPRAISAL_LOG = 20;

const DEFAULT_WEIGHT: Record<EvidenceKind, number> = {
  seen: 5,
  seen_close: 5,
  repeat: 4,
  repeat_close: 0,
  physical: 3,
  multi: 3,
  benefit: 3,
  authority: 3,
  rumor: 1,
  inferred: 1,
  written: 1.5,
  appraisal: -2,
};

/** Onlookers of a failed appraisal of the player count it as counter-evidence (8.2). */
function onPlayerAppraised(ctx: SystemContext, result: AppraisalResult): void {
  const observer = getEntity(ctx.world, result.observerId);
  const target = getEntity(ctx.world, result.targetId);
  if (!observer || !target) return;
  const npcs = ctx.world.slices.npc.npcs;
  const onlookers = entitiesNear(ctx.world, target.mapId, target.x, target.y, 6, (e) => {
    if (e.kind !== 'npc' || !e.ref) return false;
    const st = npcs[e.ref];
    return !!st && !st.resident && !st.gone && st.activity !== 'sleep';
  });
  const key = `appraise:${ctx.tick}:${result.observerId}`;
  const rumor = seedRumor(ctx, {
    anchor: key,
    topic: 'appraise',
    subject: 'player',
    mapId: target.mapId,
    place: '公会柜台前',
    apparent: 0,
    count: 1,
    details: ['水晶一点光都没有'],
    famous: [],
    tier: 0,
  });
  for (const e of onlookers) {
    const id = e.ref as string;
    observe(ctx, id, 'player', {
      key,
      ind: key,
      apparent: 0,
      kinds: [{ kind: 'appraisal', weight: DEFAULT_WEIGHT.appraisal }],
      direct: false,
      what: '鉴定读不出这个人',
    });
    addHolding(ctx.world.slices.cognition, id, {
      rumor: rumor.id,
      v: witnessVersion(rumor, 'misreport'),
      cred: 1,
      from: 'seen',
      origin: id,
      hops: 0,
      tick: ctx.tick,
      believed: true,
      told: 0,
    });
    addMemory(ctx, id, {
      text: '看见鉴定水晶对那个新来的毫无反应',
      src: 'seen',
      about: 'player',
      imp: 0.45,
    });
  }
  const appraiserId = observer.ref;
  const p = appraiserId ? personaById(ctx.content, appraiserId) : undefined;
  if (!p || !appraiserId) return;
  const clergy = p.class === 'clergy';
  if (clergy) raiseChurchSuspicion(ctx, 5);
  if (target.mapId !== ctx.world.slices.npc.playerMap) return;
  const failures = ctx.world.slices.cognition.appraisals.filter(
    (a) => a.targetId === result.targetId && a.kind === 'no_record',
  ).length;
  const lineKey = clergy
    ? 'appraise.clergy'
    : failures >= 2
      ? 'appraise.crystal.again'
      : 'appraise.crystal';
  const gate = comedyGate(ctx, target.mapId, clergy ? 'light' : 'crystal');
  if (gate === 'none') return;
  const text = pickLine(
    ctx.content,
    lineKey,
    { player: p.voice.address },
    ctx.rng('cognition.lines'),
    p,
  );
  if (text)
    ctx.emit('dialogue.line', {
      speakerId: npcEntityId(appraiserId),
      speakerName: p.name,
      text,
      listenerId: target.id,
      kind: gate === 'full' ? 'say' : 'narrate',
    });
}

export const system: GameSystem = {
  id: 'cognition',
  order: 45,

  init(ctx) {
    ctx.world.slices.cognition = {
      beliefs: {},
      rumors: {},
      holdings: {},
      crowd: {},
      appraisals: [],
      comedy: {},
      comedyStreak: {},
      recentFeats: {},
    };
  },

  on: {
    'feat.performed'(ctx, e) {
      witnessFeat(ctx, { key: `${e.tick}:${e.data.actorId}:${e.data.kind}`, ...e.data });
    },
    'entity.died'(ctx, e) {
      witnessDeath(ctx, e.data);
    },
    'npc.conversed'(ctx, e) {
      const { a, b, mapId, locationKind, visible } = e.data;
      const npcs = ctx.world.slices.npc.npcs;
      const ra = !!npcs[a]?.resident;
      const rb = !!npcs[b]?.resident;
      if (ra && rb) return;
      if (ra || rb) {
        const named = ra ? b : a;
        crowdTell(ctx, mapId, named, true);
        crowdTell(ctx, mapId, named, false);
        return;
      }
      tryTell(ctx, a, b, mapId, locationKind, visible);
      tryTell(ctx, b, a, mapId, locationKind, visible);
    },
    'world.day'(ctx) {
      const slice = ctx.world.slices.cognition;
      coolRumors(slice);
      regressBeliefs(ctx);
      updatePublicStances(ctx);
      for (const [id, t] of Object.entries(slice.recentFeats))
        if (ctx.tick - t > 100) delete slice.recentFeats[id];
    },
  },

  commands: {
    'cognition.appraise'(ctx, d, src) {
      const ws = ctx.world.slices.world;
      if (src.type === 'player' && d.observerId !== ws.playerId)
        return reject('not_allowed', '只能以自己的身份去鉴定');
      const o = getEntity(ctx.world, d.observerId);
      const t = getEntity(ctx.world, d.targetId);
      if (!o || !t?.alive || t.hidden) return reject('no_target', '找不到鉴定对象');
      if (o.id === t.id) return reject('self', '鉴定不了自己');
      if (o.mapId !== t.mapId || distance(o, t) > APPRAISE_RANGE)
        return reject('too_far', '离得太远，看不清');
      const devices = ['crystal', 'guild', 'academy', 'skill', 'sense'];
      if (d.device && !devices.includes(d.device)) return reject('bad_device', '没有这种鉴定方式');
      const result = appraise(ctx.world, ctx.content, d.observerId, d.targetId, d.device);
      if (!result) return reject('no_target', '找不到鉴定对象');
      const log = ctx.world.slices.cognition.appraisals;
      log.push(result);
      if (log.length > APPRAISAL_LOG) log.splice(0, log.length - APPRAISAL_LOG);
      ctx.emit('cognition.appraised', result);
      if (t.kind === 'player' && o.kind === 'npc') onPlayerAppraised(ctx, result);
      return ok(result.display);
    },
    'cognition.evidence'(ctx, d, src) {
      if (src.type === 'player') return reject('not_allowed', '玩家不能直接改变别人的看法');
      if (!personaById(ctx.content, d.observerId)) return reject('no_npc', '没有这个人');
      if (!EVIDENCE_KINDS.includes(d.kind)) return reject('bad_kind', '不认识这种证据');
      const weight = typeof d.weight === 'number' ? d.weight : DEFAULT_WEIGHT[d.kind];
      const o = observe(ctx, d.observerId, d.subjectId, {
        key: `script:${ctx.tick}:${d.kind}`,
        ind: `script:${ctx.tick}:${d.kind}`,
        apparent: 0,
        kinds: [{ kind: d.kind, weight }],
        direct: d.kind === 'benefit' || d.kind === 'seen' || d.kind === 'seen_close',
        what: d.note ?? '有了新的证据',
      });
      return o ? ok() : reject('no_belief', '这个人现在顾不上这件事');
    },
    'cognition.publish'(ctx, d, src) {
      if (src.type === 'player') return reject('not_allowed', '玩家不能直接发布告示');
      const n = publishFact(ctx, d.mapId, d.subjectId);
      return ok(`${n} 个说法被告示压了下去`);
    },
  },
};
