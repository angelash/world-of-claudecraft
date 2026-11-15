// Scene playback: start and queue scenes, enter nodes (effects, lines, branches),
// wait for the player, apply choices, free text and evidence, and finish. Model lines
// arrive as `scenes.resolve` commands tagged with the run revision; anything for an
// older node is dropped, and written fallback lines always cover the gap.

import type { AiContextV1, AnyCommand, CommandResult } from '../../core';
import { ok, reject } from '../../core';
import type { SystemContext } from '../../core/system';
import { goddessContext } from '../goddess/planning';
import { goddessDef } from '../goddess/state';
import { applyEffects, conditionHolds, teleportPlayer } from '../quests/effects';
import { knowledgeFor, sanitizeText } from '../quests/lore';
import { defaultKind, fillSlots, speakerName } from '../quests/speakers';
import { presentable, presentEvidence } from './court';
import { assembleEpilogue, recordHeading, recordSpeaker } from './epilogue';
import type { SceneChoice, SceneDef, SceneLine, SceneNode, SceneRun, ShownLine } from './types';

const SRC = { type: 'system', system: 'scenes' } as const;
const MAX_HOPS = 400;
const DEFAULT_INPUT_MAX = 80;
export const AI_DEADLINE = 200;

export const COURT_END = 'end';
export const EVIDENCE_PREFIX = 'evidence:';

export function sceneDef(content: { scenes: SceneDef[] }, id: string): SceneDef | undefined {
  return content.scenes.find((s) => s.id === id);
}

export function nodeOf(scene: SceneDef, id: string): SceneNode | undefined {
  return scene.nodes.find((n) => n.id === id);
}

function current(ctx: SystemContext): { run: SceneRun; scene: SceneDef; node: SceneNode } | null {
  const run = ctx.world.slices.scenes.current;
  if (!run) return null;
  const scene = sceneDef(ctx.content, run.sceneId);
  const node = scene ? nodeOf(scene, run.nodeId) : undefined;
  return scene && node ? { run, scene, node } : null;
}

/** Emit one line as a dialogue.line and keep it on the run for the view. */
export function say(
  ctx: SystemContext,
  run: SceneRun | null,
  line: SceneLine,
  aiText = false,
): ShownLine {
  const flags = ctx.world.meta.flags;
  const raw = fillSlots(line.text, flags);
  const text = aiText ? sanitizeText(raw, ctx.world, ctx.content) : raw;
  const shown: ShownLine = {
    speakerId: line.speaker,
    speakerName: speakerName(flags, ctx.content, line.speaker, line.name),
    text,
    kind: line.kind ?? defaultKind(ctx.content, line.speaker),
  };
  ctx.emit('dialogue.line', {
    speakerId: shown.speakerId,
    speakerName: shown.speakerName,
    text: shown.text,
    listenerId: ctx.world.slices.world.playerId,
    kind: shown.kind,
  });
  run?.shown.push(shown);
  return shown;
}

function visibleLines(ctx: SystemContext, lines: SceneLine[] | undefined): SceneLine[] {
  return (lines ?? []).filter((l) => conditionHolds(ctx, l.when));
}

/** Choices the player may pick at this node right now. */
export function visibleChoices(ctx: SystemContext, run: SceneRun, node: SceneNode): SceneChoice[] {
  return (node.choices ?? []).filter(
    (c) => conditionHolds(ctx, c.when) && !(c.once && run.picked.includes(c.id)),
  );
}

/** Request a scene: start it now, or queue it behind the running one. */
export function requestScene(ctx: SystemContext, sceneId: string): boolean {
  const slice = ctx.world.slices.scenes;
  if (!sceneDef(ctx.content, sceneId)) return false;
  if (slice.current) {
    if (slice.current.sceneId !== sceneId && !slice.queue.includes(sceneId))
      slice.queue.push(sceneId);
    return true;
  }
  startScene(ctx, sceneId);
  return true;
}

export function startScene(ctx: SystemContext, sceneId: string): void {
  const slice = ctx.world.slices.scenes;
  const scene = sceneDef(ctx.content, sceneId);
  if (!scene) return;
  const run: SceneRun = {
    runId: slice.nextRunId++,
    sceneId,
    nodeId: scene.start,
    waiting: 'advance',
    shown: [],
    revision: 0,
    picked: [],
    spoken: false,
    presented: [],
    startedTick: ctx.tick,
  };
  slice.current = run;
  if (scene.mapId) teleportPlayer(ctx, scene.mapId, scene.location);
  ctx.emit('scene.started', { sceneId, title: scene.title });
  enterNode(ctx, run, scene, scene.start, 0);
}

function finishScene(ctx: SystemContext, run: SceneRun, scene: SceneDef): void {
  const slice = ctx.world.slices.scenes;
  if (slice.current?.runId !== run.runId) return;
  slice.current = null;
  if (!slice.seen.includes(scene.id)) slice.seen.push(scene.id);
  ctx.setFlag(`scene.${scene.id}.seen`, true);
  applyEffects(ctx, scene.onEnd);
  ctx.emit('scene.ended', { sceneId: scene.id });
  if (slice.current) return;
  if (scene.then && sceneDef(ctx.content, scene.then)) {
    startScene(ctx, scene.then);
    return;
  }
  const next = slice.queue.shift();
  if (next) startScene(ctx, next);
}

function aiContextFor(
  ctx: SystemContext,
  agentId: string,
  situation: string,
  extra: Record<string, unknown>,
): AiContextV1 {
  const def = goddessDef(ctx.content, agentId);
  const s = ctx.world.slices.goddess?.goddesses[agentId];
  if (def && s) return goddessContext(ctx, def, s, situation, extra);
  const name = speakerName(ctx.world.meta.flags, ctx.content, agentId);
  return {
    v: 1,
    persona: name || agentId,
    situation,
    knowledge: knowledgeFor(ctx.world, ctx.content, 'K1', agentId),
    commands: {
      'scenes.resolve':
        '数据 {runId, revision, lines:[{speaker, text}], choiceId?}：说出这一段的台词；有分类任务时给出 choiceId。',
    },
    speakAs: name || agentId,
    extra,
  };
}

function resolveCommand(run: SceneRun, lines: SceneLine[], choiceId?: string): AnyCommand {
  return {
    kind: 'scenes.resolve',
    data: {
      runId: run.runId,
      revision: run.revision,
      lines: lines.map((l) => ({ speaker: l.speaker, text: l.text, name: l.name, kind: l.kind })),
      choiceId,
      written: true,
    },
    source: SRC,
  };
}

function requestImprov(ctx: SystemContext, run: SceneRun, node: SceneNode): void {
  const imp = node.improv;
  if (!imp) return;
  const fallback = visibleLines(ctx, imp.fallback);
  // Always file the request (also without a model) so a replay takes the same path:
  // with the AI off the written lines arrive as the fallback on the next tick.
  ctx.ai.request({
    agentId: imp.agentId,
    role: imp.role,
    purpose: imp.purpose,
    revision: run.revision,
    context: aiContextFor(ctx, imp.agentId, imp.situation, {
      runId: run.runId,
      revision: run.revision,
      writtenLines: fallback.map((l) => l.text),
    }),
    allowed: ['scenes.resolve'],
    fallback: [resolveCommand(run, fallback)],
    deadlineTicks: AI_DEADLINE,
    priority: 5,
  });
}

/** Enter a node: effects, lines, branches, then decide what to wait for. */
export function enterNode(
  ctx: SystemContext,
  run: SceneRun,
  scene: SceneDef,
  nodeId: string,
  hops: number,
): void {
  if (hops > MAX_HOPS) {
    finishScene(ctx, run, scene);
    return;
  }
  const node = nodeOf(scene, nodeId);
  if (!node) {
    finishScene(ctx, run, scene);
    return;
  }
  run.nodeId = node.id;
  run.revision++;
  run.spoken = false;
  run.presented = [];
  run.shown = [];
  applyEffects(ctx, node.effects);
  if (ctx.world.slices.scenes.current?.runId !== run.runId) return;
  const lines = visibleLines(ctx, node.lines);
  for (const l of lines) say(ctx, run, l);
  for (const b of node.branch ?? []) {
    if (conditionHolds(ctx, b.when)) {
      enterNode(ctx, run, scene, b.to, hops + 1);
      return;
    }
  }
  let shownSomething = lines.length > 0;
  if (node.improv) {
    requestImprov(ctx, run, node);
    shownSomething = true;
  }
  if (node.epilogue) {
    showEpilogue(ctx, run);
    shownSomething = true;
  }
  if (node.court) {
    run.waiting = 'court';
    return;
  }
  if (node.input) {
    run.waiting = 'input';
    return;
  }
  if (visibleChoices(ctx, run, node).length > 0) {
    run.waiting = 'choice';
    return;
  }
  if (shownSomething) {
    run.waiting = 'advance';
    return;
  }
  if (node.next && !node.end) enterNode(ctx, run, scene, node.next, hops + 1);
  else finishScene(ctx, run, scene);
}

function showEpilogue(ctx: SystemContext, run: SceneRun): void {
  const ending = String(ctx.flag('ending') ?? '');
  const lines = assembleEpilogue(ctx.world.meta.flags, ctx.content.epilogue, ending);
  ctx.world.slices.scenes.epilogue = lines.map((l) => ({
    subject: l.subject,
    year: l.year,
    text: l.text,
    layer: l.layer,
  }));
  lines.forEach((l, i) => {
    const who = recordSpeaker(ctx.content, ending, i === lines.length - 1);
    say(ctx, run, {
      speaker: who.id,
      name: who.name,
      kind: who.kind,
      text: `${recordHeading(l, ending)}${l.text}`,
    });
  });
  ctx.setFlag('ep_shown', ending);
}

function moveOn(
  ctx: SystemContext,
  run: SceneRun,
  scene: SceneDef,
  to: string | undefined,
  node: SceneNode,
): void {
  if (to === undefined || to === '') enterNode(ctx, run, scene, node.id, 0);
  else enterNode(ctx, run, scene, to, 0);
}

// ---------------------------------------------------------------------------
// Commands

export function cmdStart(ctx: SystemContext, sceneId: string): CommandResult {
  if (!sceneDef(ctx.content, sceneId)) return reject('no_scene', '没有这段场景');
  requestScene(ctx, sceneId);
  return ok();
}

export function cmdAdvance(ctx: SystemContext): CommandResult {
  const cur = current(ctx);
  if (!cur) return reject('no_scene', '现在没有在播放的场景');
  const { run, scene, node } = cur;
  if (run.waiting !== 'advance') return reject('waiting', '需要先作出选择');
  if (node.improv && !run.spoken) {
    for (const l of visibleLines(ctx, node.improv.fallback)) say(ctx, null, l);
    run.spoken = true;
  }
  if (node.next && !node.end) enterNode(ctx, run, scene, node.next, 0);
  else finishScene(ctx, run, scene);
  return ok();
}

export function applyChoice(
  ctx: SystemContext,
  run: SceneRun,
  scene: SceneDef,
  node: SceneNode,
  choice: SceneChoice,
): void {
  if (choice.once && !run.picked.includes(choice.id)) run.picked.push(choice.id);
  ctx.emit('scene.choice', {
    sceneId: scene.id,
    nodeId: node.id,
    choiceId: choice.id,
    label: choice.label,
  });
  applyEffects(ctx, choice.effects);
  if (ctx.world.slices.scenes.current?.runId !== run.runId) return;
  moveOn(ctx, run, scene, choice.to, node);
}

export function cmdChoose(ctx: SystemContext, choiceId: string): CommandResult {
  const cur = current(ctx);
  if (!cur) return reject('no_scene', '现在没有在播放的场景');
  const { run, scene, node } = cur;
  if (run.waiting === 'court' && node.court) return chooseInCourt(ctx, run, scene, node, choiceId);
  if (run.waiting !== 'choice') return reject('no_choice', '这里不需要选择');
  const choice = visibleChoices(ctx, run, node).find((c) => c.id === choiceId);
  if (!choice) return reject('no_option', '没有这个选项');
  applyChoice(ctx, run, scene, node, choice);
  return ok(choice.label);
}

function chooseInCourt(
  ctx: SystemContext,
  run: SceneRun,
  scene: SceneDef,
  node: SceneNode,
  choiceId: string,
): CommandResult {
  const spec = node.court;
  if (!spec) return reject('no_court', '这里不是审庭');
  if (choiceId === COURT_END) {
    enterNode(ctx, run, scene, spec.to, 0);
    return ok();
  }
  if (!choiceId.startsWith(EVIDENCE_PREFIX)) return reject('no_option', '没有这个选项');
  if (spec.limit && run.presented.length >= spec.limit)
    return reject('limit', '这一轮能出示的证据已经用完');
  const evId = choiceId.slice(EVIDENCE_PREFIX.length);
  const ev = presentable(ctx.world, ctx.content, spec.goddess).find((e) => e.id === evId);
  if (!ev) return reject('no_evidence', '你手里没有这件证据，或已经出示过了');
  run.presented.push(ev.id);
  run.shown = [];
  say(ctx, run, { speaker: 'player', text: `（出示证据：${ev.name}）${ev.presentText}` });
  const res = presentEvidence(ctx, spec.goddess, ev);
  const def = ctx.content.courtDefenses.find((d) => d.goddess === spec.goddess);
  if (def) {
    if (!res.hit) say(ctx, run, { speaker: spec.goddess, text: def.deflect });
    for (const l of res.newlyBroken) say(ctx, run, { speaker: spec.goddess, text: def.broken[l] });
    if (res.hit && res.newlyBroken.length === 0 && !res.mitigated) {
      say(ctx, run, {
        speaker: 'narrator',
        text: '证据落在证物台上。她的防线晃了一下，还没有塌。',
      });
    }
    if (res.mitigated)
      say(ctx, run, {
        speaker: 'narrator',
        text: '她沉默了很久。这件证据没有击穿什么，却打开了一扇可以坦白的门。',
      });
  }
  ctx.emit('scene.choice', { sceneId: scene.id, nodeId: node.id, choiceId, label: ev.name });
  run.revision++;
  return ok(ev.name);
}

export function cmdInput(ctx: SystemContext, text: string): CommandResult {
  const cur = current(ctx);
  if (!cur) return reject('no_scene', '现在没有在播放的场景');
  const { run, scene, node } = cur;
  const spec = node.input;
  if (run.waiting !== 'input' || !spec) return reject('no_input', '这里不需要输入');
  const max = spec.maxLength ?? DEFAULT_INPUT_MAX;
  const clean = Array.from(String(text ?? ''))
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, max);
  const value = clean || spec.empty || '';
  if (spec.storeAs) ctx.setFlag(spec.storeAs, value);
  const playerMap = ctx.world.slices.world.entities[ctx.world.slices.world.playerId]?.mapId ?? '';
  if (clean) ctx.emit('player.said', { text: clean, mapId: playerMap, toId: spec.agentId });
  const reply = visibleLines(ctx, spec.reply);
  const classifyNode = spec.classify ? nodeOf(scene, spec.classify.node) : undefined;
  if (spec.agentId && clean) {
    run.waiting = 'resolve';
    run.revision++;
    run.resolveDeadline = ctx.tick + AI_DEADLINE + 2;
    const choices = classifyNode
      ? visibleChoices(ctx, run, classifyNode).filter((c) => spec.classify?.choices.includes(c.id))
      : [];
    ctx.ai.request({
      agentId: spec.agentId,
      role: spec.role ?? 'goddess.dialogue',
      purpose: spec.classify ? 'classify_answer' : 'reply',
      revision: run.revision,
      context: aiContextFor(ctx, spec.agentId, spec.prompt, {
        runId: run.runId,
        revision: run.revision,
        playerText: clean,
        writtenReply: reply.map((l) => l.text),
        classifyInto: choices.map((c) => ({ id: c.id, label: c.label })),
      }),
      allowed: ['scenes.resolve'],
      fallback: [resolveCommand(run, reply, spec.classify?.fallback)],
      deadlineTicks: AI_DEADLINE,
      priority: 6,
    });
    return ok();
  }
  for (const l of reply) say(ctx, run, l);
  if (spec.classify && classifyNode) {
    const choice = (classifyNode.choices ?? []).find((c) => c.id === spec.classify?.fallback);
    if (choice) {
      applyChoice(ctx, run, scene, classifyNode, choice);
      return ok();
    }
  }
  enterNode(ctx, run, scene, spec.to, 0);
  return ok();
}

export interface ResolveData {
  runId: number;
  revision: number;
  lines: { speaker: string; text: string; name?: string; kind?: SceneLine['kind'] }[];
  choiceId?: string;
  written?: boolean;
}

/** Model (or fallback) lines for an improv node or a free-text reply. */
export function cmdResolve(ctx: SystemContext, d: ResolveData, fromModel: boolean): CommandResult {
  const cur = current(ctx);
  if (!cur || cur.run.runId !== d.runId || cur.run.revision !== d.revision) {
    return reject('stale', '场景已经往前走了，这段台词作废');
  }
  const { run, scene, node } = cur;
  const allowedSpeakers = new Set<string>([
    node.improv?.agentId ?? '',
    node.input?.agentId ?? '',
    ...(node.improv?.fallback ?? []).map((l) => l.speaker),
    ...(node.input?.reply ?? []).map((l) => l.speaker),
  ]);
  for (const l of (d.lines ?? []).slice(0, 6)) {
    const speaker = allowedSpeakers.has(l.speaker)
      ? l.speaker
      : (node.improv?.agentId ?? node.input?.agentId ?? 'narrator');
    const text = String(l.text ?? '').slice(0, 300);
    if (!text) continue;
    say(
      ctx,
      run,
      { speaker, text, name: d.written ? l.name : undefined, kind: d.written ? l.kind : undefined },
      fromModel,
    );
  }
  run.spoken = true;
  if (run.waiting !== 'resolve') return ok();
  const spec = node.input;
  if (spec?.classify) {
    const cnode = nodeOf(scene, spec.classify.node);
    const pick =
      d.choiceId && spec.classify.choices.includes(d.choiceId)
        ? d.choiceId
        : spec.classify.fallback;
    const choice = cnode
      ? (visibleChoices(ctx, run, cnode).find((c) => c.id === pick) ??
        (cnode.choices ?? []).find((c) => c.id === spec.classify?.fallback))
      : undefined;
    if (cnode && choice) {
      applyChoice(ctx, run, scene, cnode, choice);
      return ok();
    }
  }
  enterNode(ctx, run, scene, spec?.to ?? node.next ?? node.id, 0);
  return ok();
}

/** Evidence the player could present now (for the view). */
export function courtOptions(ctx: SystemContext, goddess: string): { id: string; label: string }[] {
  return presentable(ctx.world, ctx.content, goddess).map((e) => ({
    id: `${EVIDENCE_PREFIX}${e.id}`,
    label: `出示：${e.name}`,
  }));
}

/**
 * Liveness guard for free-text replies: when a model answered without a usable
 * scenes.resolve (or nothing arrived), apply the written reply and the fallback
 * classification once the deadline has passed. Purely tick-based, so replays agree.
 */
export function resolveTimeouts(ctx: SystemContext): void {
  const cur = current(ctx);
  if (cur?.run.waiting !== 'resolve') return;
  if ((cur.run.resolveDeadline ?? 0) > ctx.tick) return;
  const spec = cur.node.input;
  const reply = visibleLines(ctx, spec?.reply);
  cmdResolve(
    ctx,
    {
      runId: cur.run.runId,
      revision: cur.run.revision,
      lines: reply.map((l) => ({ speaker: l.speaker, text: l.text, name: l.name, kind: l.kind })),
      choiceId: spec?.classify?.fallback,
      written: true,
    },
    false,
  );
}
