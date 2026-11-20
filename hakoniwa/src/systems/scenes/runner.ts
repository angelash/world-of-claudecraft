// Scene playback: start and queue scenes, enter nodes (effects, lines, branches),
// wait for the player, apply choices, free text and evidence, and finish. Model lines
// arrive as `scenes.resolve` commands tagged with the run revision; anything for an
// older node is dropped, and written fallback lines always cover the gap.

import type { AiContextV1, AnyCommand, CommandResult } from '../../core';
import { ok, reject } from '../../core';
import { contentRef, contentText } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { joinText, rawText, type TextParam, tr } from '../../core/text';
import { TICK_HZ } from '../../core/time';
import { goddessContext } from '../goddess/planning';
import { goddessDef } from '../goddess/state';
import { countItem, removeItem } from '../inventory';
import type { Effect } from '../quests/effect_types';
import { applyEffects, conditionHolds } from '../quests/effects';
import { knowledgeFor, sanitizeTextParam } from '../quests/lore';
import { resetQuests } from '../quests/progress';
import { defaultKind, fillText, speakerName } from '../quests/speakers';
import {
  DEFAULT_PLAYER_APPEARANCE,
  haltEntity,
  playerEntity,
  setAppearance,
  setEntityName,
} from '../world';
import { ruleAnswer } from './answer_port';
import { presentable, presentEvidence } from './court';
import { assembleEpilogue, recordHeading, recordSpeaker } from './epilogue';
import { briefKept, extractValues } from './improv';
import { placePlayerForScene } from './placement';
import { roamPickable, standingChoice } from './roam';
import { presentAtTrial, type TrialDef, trialOffers } from './trial';
import type {
  RoundEnd,
  SceneChoice,
  SceneDef,
  SceneLine,
  SceneNode,
  SceneRun,
  SceneTurns,
  SceneUiWait,
  ShownLine,
} from './types';
import { applyUiResult } from './ui_results';

const SRC = { type: 'system', system: 'scenes' } as const;
const MAX_HOPS = 400;
const DEFAULT_INPUT_MAX = 80;
export const AI_DEADLINE = 200;

export const COURT_END = 'end';
export const EVIDENCE_PREFIX = 'evidence:';
/** A trial piece offered beside a present node's choices (PK-M1-55). */
export const PIECE_PREFIX = 'piece:';

/** The trial table of a present node, or undefined. */
export function trialOf(content: { trials?: TrialDef[] }, node: SceneNode): TrialDef | undefined {
  return node.present ? content.trials?.find((x) => x.id === node.present?.trial) : undefined;
}

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

/** A line to show: written content (a SceneLine) or one the system composes as text keys. */
export type ShowLine = Omit<SceneLine, 'text' | 'name'> & { text: TextParam; name?: TextParam };

/** Emit one line as a dialogue.line and keep it on the run for the view. */
export function say(
  ctx: SystemContext,
  run: SceneRun | null,
  line: ShowLine,
  aiText = false,
): ShownLine {
  const flags = ctx.world.meta.flags;
  const filled = fillText(line.text, flags);
  const clean = aiText ? sanitizeTextParam(filled, ctx.world, ctx.content) : filled;
  // the model's words are kept as raw text in their language (D-087)
  const text = aiText && typeof clean === 'string' ? rawText(clean) : clean;
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

/**
 * The node's choices whose condition holds and that are not used up (`once`), with any
 * condition test: the runner's (conditionHolds) and the view's (worldResolver) agree.
 */
export function openChoices(
  node: SceneNode,
  picked: readonly string[],
  holds: (expr: string | undefined) => boolean,
): SceneChoice[] {
  return (node.choices ?? []).filter((c) => holds(c.when) && !(c.once && picked.includes(c.id)));
}

/** Choices the player may pick at this node right now (hidden ones included). */
export function visibleChoices(ctx: SystemContext, run: SceneRun, node: SceneNode): SceneChoice[] {
  return openChoices(node, run.picked, (expr) => conditionHolds(ctx, expr));
}

/** The first `ui` effect of a list whose condition holds now (decided before the list applies). */
function activeUi(ctx: SystemContext, effects: readonly Effect[] | undefined) {
  for (const e of effects ?? []) {
    if (e.type === 'ui' && conditionHolds(ctx, e.when)) return e;
  }
  return null;
}

/** Wait for the interface of a `ui` effect; `scenes.ui_done` goes on (cmdUiDone). */
function waitForUi(ctx: SystemContext, run: SceneRun, scene: SceneDef, wait: SceneUiWait): void {
  run.waiting = 'ui';
  run.ui = wait;
  run.timed = undefined;
  run.revision++;
  ctx.emit('scene.ui', { sceneId: scene.id, nodeId: run.nodeId, ui: wait.ui });
}

/**
 * How a multi-turn round ends after the player's `turn`-th turn (prologue 1: soft 6, hard 10):
 * at the hard cap the runner ends it; a reply that closes the round ends it as `closed` before
 * the soft cap and `soft` from then on; otherwise the round goes on (null).
 */
export function roundEnd(turns: SceneTurns, turn: number, done: boolean): RoundEnd | null {
  if (turn >= turns.hard) return 'hard';
  if (!done) return null;
  return turn >= turns.soft ? 'soft' : 'closed';
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
  placePlayerForScene(ctx, scene);
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
  if (def && s) {
    // a goddess answers a scene through scenes.resolve (her own context lists her powers)
    const g = goddessContext(ctx, def, s, situation, extra);
    return { ...g, commands: { ...g.commands, 'scenes.resolve': tr('sys.scenes.prompt.resolve') } };
  }
  const name = speakerName(ctx.world.meta.flags, ctx.content, agentId);
  return {
    v: 1,
    persona: name || agentId,
    situation,
    knowledge: knowledgeFor(ctx.world, ctx.content, 'K1', agentId),
    commands: {
      'scenes.resolve': tr('sys.scenes.prompt.resolve'),
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
      // the written reply is a whole answer: it closes a multi-turn round
      done: true,
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
      // the brief the answer is checked against (catalog 2.4): the model must see it too
      ...(imp.meaningKeys?.length || imp.forbidden?.length || imp.check
        ? {
            brief: {
              meaningKeys: imp.meaningKeys ?? [],
              forbidden: imp.forbidden ?? [],
              ...(imp.check ? { check: imp.check } : {}),
            },
          }
        : {}),
    }),
    allowed: ['scenes.resolve'],
    fallback: [resolveCommand(run, fallback)],
    deadlineTicks: AI_DEADLINE,
    priority: 5,
  });
}

/** The written anchors of a node's input, each once per run (catalog 2.4; PK-M1-34). */
function sayAnchors(ctx: SystemContext, run: SceneRun, node: SceneNode): void {
  const anchors = visibleLines(ctx, node.input?.anchor);
  if (anchors.length === 0) return;
  run.anchored ??= [];
  if (run.anchored.includes(node.id)) return;
  run.anchored.push(node.id);
  for (const l of anchors) say(ctx, run, l);
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
  run.timed = undefined;
  run.turn = 0;
  run.ui = undefined;
  if (node.segment) {
    run.segment = node.segment;
    if (scene.restart?.until === node.segment) run.restartClosed = true;
    ctx.emit('scene.segment', { sceneId: scene.id, segment: node.segment });
  }
  const ui = activeUi(ctx, node.effects);
  applyEffects(ctx, node.effects);
  if (ctx.world.slices.scenes.current?.runId !== run.runId) return;
  const lines = visibleLines(ctx, node.lines);
  for (const l of lines) say(ctx, run, l);
  // the interface opens after the node's lines; its branches and next decide once it closes
  if (ui) {
    waitForUi(ctx, run, scene, { ui: ui.ui, storeAs: ui.storeAs });
    return;
  }
  settleNode(ctx, run, scene, node, hops, lines.length > 0);
}

/**
 * After a node's effects and lines: take a matching branch, or decide what the run waits for
 * (court, input, choice, advance), or pass on to next when nothing shows.
 */
function settleNode(
  ctx: SystemContext,
  run: SceneRun,
  scene: SceneDef,
  node: SceneNode,
  hops: number,
  shown: boolean,
): void {
  for (const b of node.branch ?? []) {
    if (conditionHolds(ctx, b.when)) {
      enterNode(ctx, run, scene, b.to, hops + 1);
      return;
    }
  }
  let shownSomething = shown;
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
  const choices = visibleChoices(ctx, run, node);
  const trial = trialOf(ctx.content, node);
  const pieces = trial ? trialOffers(ctx, trial) : [];
  if (choices.length > 0 || pieces.length > 0) {
    // a roam node's choices are touch points: the player walks about (roam.ts)
    run.waiting = node.roam ? 'roam' : 'choice';
    // a timed choice: the shortest timeout among the choices on offer (13.6)
    let timed: SceneChoice | null = null;
    for (const c of choices) {
      if (c.timeout !== undefined && c.timeout >= 0 && (!timed || c.timeout < (timed.timeout ?? 0)))
        timed = c;
    }
    if (timed)
      run.timed = {
        choice: timed.id,
        at: ctx.tick + Math.max(1, Math.round((timed.timeout ?? 0) * TICK_HZ)),
      };
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
      text: joinText('none', [recordHeading(l, ending), l.text]),
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
  if (!sceneDef(ctx.content, sceneId))
    return reject('no_scene', tr('sys.scenes.reject.no_scene.missing'));
  requestScene(ctx, sceneId);
  return ok();
}

export function cmdAdvance(ctx: SystemContext): CommandResult {
  const cur = current(ctx);
  if (!cur) return reject('no_scene', tr('sys.scenes.reject.no_scene.idle'));
  const { run, scene, node } = cur;
  if (run.waiting !== 'advance') return reject('waiting', tr('sys.scenes.reject.waiting'));
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
  /**
   * The choice was sorted out of a free answer, not picked by the player (PK-M1-34): no
   * scene.choice, so the backlog does not read the player's own words back as a written
   * option (the request PK-M1-27 left behind, item 6).
   */
  classified = false,
): void {
  if (choice.once && !run.picked.includes(choice.id)) run.picked.push(choice.id);
  run.timed = undefined;
  if (!classified)
    ctx.emit('scene.choice', {
      sceneId: scene.id,
      nodeId: node.id,
      choiceId: choice.id,
      label: choice.label,
    });
  const ui = activeUi(ctx, choice.effects);
  applyEffects(ctx, choice.effects);
  if (ctx.world.slices.scenes.current?.runId !== run.runId) return;
  if (ui) {
    waitForUi(ctx, run, scene, { ui: ui.ui, storeAs: ui.storeAs, to: choice.to ?? '' });
    return;
  }
  moveOn(ctx, run, scene, choice.to, node);
}

/**
 * A classified answer with `settle` (catalog_cutscenes.md 13.6, the second destination
 * semantics the prologue asked for): only the sorted choice's EFFECTS apply, then the run goes
 * on to the input's own destination. Without this the runner replays the written reaction and
 * the written follow-up of a choice the player never picked (PK-M1-27's deviation note 2, which
 * had to add a settling node per round). Returns false when the run ended inside the effects.
 */
function settleClassified(
  ctx: SystemContext,
  run: SceneRun,
  choice: SceneChoice,
  node: SceneNode,
): boolean {
  if (choice.once && !run.picked.includes(choice.id)) run.picked.push(choice.id);
  ctx.emit('scene.classified', { nodeId: node.id, choiceId: choice.id });
  applyEffects(ctx, choice.effects);
  return ctx.world.slices.scenes.current?.runId === run.runId;
}

export function cmdChoose(ctx: SystemContext, choiceId: string): CommandResult {
  const cur = current(ctx);
  if (!cur) return reject('no_scene', tr('sys.scenes.reject.no_scene.idle'));
  const { run, scene, node } = cur;
  if (run.waiting === 'court' && node.court) return chooseInCourt(ctx, run, scene, node, choiceId);
  if (run.waiting === 'roam') return chooseInRoam(ctx, run, scene, node, choiceId);
  if (run.waiting !== 'choice') return reject('no_choice', tr('sys.scenes.reject.no_choice'));
  if (choiceId.startsWith(PIECE_PREFIX) && node.present)
    return presentInTrial(ctx, run, scene, node, choiceId.slice(PIECE_PREFIX.length));
  const choice = visibleChoices(ctx, run, node).find((c) => c.id === choiceId);
  if (!choice) return reject('no_option', tr('sys.scenes.reject.no_option'));
  applyChoice(ctx, run, scene, node, choice);
  return ok(choice.label);
}

/**
 * Pick a touch point of a roam node (onboarding_interaction.md 5.2): only within reach of its
 * location (or anywhere, for an action without one); standing choices are never picked by hand.
 */
function chooseInRoam(
  ctx: SystemContext,
  run: SceneRun,
  scene: SceneDef,
  node: SceneNode,
  choiceId: string,
): CommandResult {
  const choice = visibleChoices(ctx, run, node).find((c) => c.id === choiceId);
  if (!choice) return reject('no_option', tr('sys.scenes.reject.no_option'));
  const p = playerEntity(ctx.world);
  const at = p ? { mapId: p.mapId, x: p.x, y: p.y } : undefined;
  if (!roamPickable(ctx.content, node, choice, at))
    return reject('out_of_reach', tr('sys.scenes.reject.out_of_reach'));
  // the walk ends where the point was used: no click-to-move goes on under the panel
  if (p) haltEntity(ctx, p.id);
  applyChoice(ctx, run, scene, node, choice);
  return ok(choice.label);
}

/**
 * Present a held piece at an act-1 trial (PK-M1-55): the shared core judges it, the trial
 * writes its points or its rebuttal; the run stays on the node (the next piece, a witness, or
 * "说完了"). The piece is said by the player as the presentation line.
 */
function presentInTrial(
  ctx: SystemContext,
  run: SceneRun,
  scene: SceneDef,
  node: SceneNode,
  pieceId: string,
): CommandResult {
  const trial = trialOf(ctx.content, node);
  const piece = trial?.pieces.find((p) => p.id === pieceId);
  if (!trial || !piece) return reject('no_evidence', tr('sys.scenes.reject.no_evidence'));
  const item = ctx.content.items?.find((i) => i.id === piece.item);
  // the item as a content key in the line (rendered in the reader's language); its plain name
  // for the choice event the backlog prints, as the court does with an evidence name
  const name = item ? contentText('items', item) : piece.item;
  const label = item?.name ?? piece.item;
  const res = presentAtTrial(ctx, trial, pieceId);
  if (res.outcome === 'missing') return reject('no_evidence', tr('sys.scenes.reject.no_evidence'));
  if (res.outcome === 'repeat') return reject('no_option', tr('sys.scenes.reject.no_option'));
  // a piece's or a rebuttal's effects may end or switch the scene: nothing more to say then
  if (ctx.world.slices.scenes.current?.runId !== run.runId) return ok(label);
  run.shown = [];
  // a landed piece with its own written reaction plays it (the node's lines, then back to the
  // presentation node through its next)
  if (res.outcome === 'hit' && piece.to) {
    ctx.emit('scene.choice', {
      sceneId: scene.id,
      nodeId: node.id,
      choiceId: `${PIECE_PREFIX}${pieceId}`,
      label,
    });
    enterNode(ctx, run, scene, piece.to, 0);
    return ok(label);
  }
  say(ctx, run, { speaker: 'player', text: tr('sys.scenes.trial.present_line', { name }) });
  if (res.rebuttal) {
    const i = trial.rebuttals.indexOf(res.rebuttal);
    // the rebuttal is content text: its content key (the extractor's c.trials.<id>.rebuttals...)
    say(ctx, run, {
      speaker: res.rebuttal.speaker,
      text: contentRef('trials', trial.id, `rebuttals.${i}.text`),
    });
  } else if (res.outcome === 'hit')
    say(ctx, run, { speaker: 'narrator', text: tr('sys.scenes.trial.landed') });
  ctx.emit('scene.choice', {
    sceneId: scene.id,
    nodeId: node.id,
    choiceId: `${PIECE_PREFIX}${pieceId}`,
    label,
  });
  // the run stays waiting on this node: its choices and the remaining pieces are offered again
  // (the view reads them live), without replaying the node's own lines or effects
  run.revision++;
  return ok(label);
}

function chooseInCourt(
  ctx: SystemContext,
  run: SceneRun,
  scene: SceneDef,
  node: SceneNode,
  choiceId: string,
): CommandResult {
  const spec = node.court;
  if (!spec) return reject('no_court', tr('sys.scenes.reject.no_court'));
  if (choiceId === COURT_END) {
    enterNode(ctx, run, scene, spec.to, 0);
    return ok();
  }
  if (!choiceId.startsWith(EVIDENCE_PREFIX))
    return reject('no_option', tr('sys.scenes.reject.no_option'));
  if (spec.limit && run.presented.length >= spec.limit)
    return reject('limit', tr('sys.scenes.reject.limit'));
  const evId = choiceId.slice(EVIDENCE_PREFIX.length);
  const ev = presentable(ctx.world, ctx.content, spec.goddess).find((e) => e.id === evId);
  if (!ev) return reject('no_evidence', tr('sys.scenes.reject.no_evidence'));
  run.presented.push(ev.id);
  run.shown = [];
  say(ctx, run, {
    speaker: 'player',
    text: tr('sys.scenes.court.present_line', { name: ev.name, text: ev.presentText }),
  });
  const res = presentEvidence(ctx, spec.goddess, ev);
  const def = ctx.content.courtDefenses.find((d) => d.goddess === spec.goddess);
  if (def) {
    if (!res.hit) say(ctx, run, { speaker: spec.goddess, text: def.deflect });
    for (const l of res.newlyBroken) say(ctx, run, { speaker: spec.goddess, text: def.broken[l] });
    if (res.hit && res.newlyBroken.length === 0 && !res.mitigated) {
      say(ctx, run, {
        speaker: 'narrator',
        text: tr('sys.scenes.court.shaken'),
      });
    }
    if (res.mitigated)
      say(ctx, run, {
        speaker: 'narrator',
        text: tr('sys.scenes.court.opened'),
      });
  }
  ctx.emit('scene.choice', { sceneId: scene.id, nodeId: node.id, choiceId, label: ev.name });
  run.revision++;
  return ok(ev.name);
}

export function cmdInput(ctx: SystemContext, text: string): CommandResult {
  const cur = current(ctx);
  if (!cur) return reject('no_scene', tr('sys.scenes.reject.no_scene.idle'));
  const { run, scene, node } = cur;
  const spec = node.input;
  if (run.waiting !== 'input' || !spec) return reject('no_input', tr('sys.scenes.reject.no_input'));
  const max = spec.maxLength ?? DEFAULT_INPUT_MAX;
  const clean = Array.from(String(text ?? ''))
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, max);
  const turns = spec.turns;
  const midRound = !!turns && (run.turn ?? 0) > 0;
  // within a multi-turn round only words count: an empty line does not end it
  if (midRound && !clean) return reject('no_input', tr('sys.scenes.reject.empty_turn'));
  const value = clean || spec.empty || '';
  // the answer kept is the opening one; later turns of the round are conversation
  if (spec.storeAs && !midRound) ctx.setFlag(spec.storeAs, value);
  const playerMap = ctx.world.slices.world.entities[ctx.world.slices.world.playerId]?.mapId ?? '';
  if (clean) ctx.emit('player.said', { text: clean, mapId: playerMap, toId: spec.agentId });
  const reply = visibleLines(ctx, spec.reply);
  const classifyNode = spec.classify ? nodeOf(scene, spec.classify.node) : undefined;
  const open = classifyNode
    ? visibleChoices(ctx, run, classifyNode).filter((c) => spec.classify?.choices.includes(c.id))
    : [];
  // the rule classifier sorts the answer when no model does (and is the model's fallback);
  // without a rule pick the input's written fallback stands (builtin_ai 6.7, PK-M1-19)
  const fallbackChoice =
    ruleAnswer(ctx, {
      sceneId: scene.id,
      nodeId: node.id,
      text: clean,
      choices: open.map((c) => c.id),
    }) ?? spec.classify?.fallback;
  // An input with no answerer still gets a model sort when it classifies (the request
  // PK-M1-27 left behind, item 2): the judgement scene's free reply fell to its fallback on
  // every model run. `classify.by` names who sorts (default the narrator), as scene.improv.
  const sorter = spec.agentId || (spec.classify ? (spec.classify.by ?? 'narrator') : '');
  if (sorter && clean) {
    run.waiting = 'resolve';
    run.revision++;
    run.resolveDeadline = ctx.tick + AI_DEADLINE + 2;
    const turn = (run.turn ?? 0) + 1;
    run.turn = turn;
    const choices = open;
    ctx.ai.request({
      agentId: sorter,
      role: spec.agentId ? (spec.role ?? 'goddess.dialogue') : 'scene.improv',
      purpose: spec.classify ? 'classify_answer' : 'reply',
      revision: run.revision,
      context: aiContextFor(ctx, sorter, spec.prompt, {
        runId: run.runId,
        revision: run.revision,
        playerText: clean,
        writtenReply: reply.map((l) => l.text),
        classifyInto: choices.map((c) => ({ id: c.id, label: c.label })),
        // the improvisation brief of the answer (catalog 2.4): purpose, situation, the meaning
        // keys a reply must carry and the words it may not say
        ...(spec.improv ? { brief: spec.improv } : {}),
        ...(spec.extract?.length ? { extractInto: spec.extract } : {}),
        // a multi-turn round: which turn this is, and whether to wrap up (soft cap reached)
        ...(turns
          ? { turn, softCap: turns.soft, hardCap: turns.hard, wrapUp: turn >= turns.soft }
          : {}),
      }),
      allowed: ['scenes.resolve'],
      fallback: [resolveCommand(run, reply, fallbackChoice)],
      deadlineTicks: AI_DEADLINE,
      priority: 6,
    });
    return ok();
  }
  for (const l of reply) say(ctx, run, l);
  sayAnchors(ctx, run, node);
  // no model answer to wait for: the written reply closes a multi-turn round at once
  if (turns?.storeAs) ctx.setFlag(turns.storeAs, 'closed');
  if (spec.classify && classifyNode) {
    // only a choice still open: a spent `once` choice is not taken again (the model path does
    // the same through visibleChoices), else a used-up fallback loops the node forever
    const choice = open.find((c) => c.id === fallbackChoice);
    if (choice) {
      if (!spec.classify.settle) {
        applyChoice(ctx, run, scene, classifyNode, choice, true);
        return ok();
      }
      if (!settleClassified(ctx, run, choice, classifyNode)) return ok();
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
  /** the answerer closes a multi-turn round with this reply (written replies always do) */
  done?: boolean;
  /**
   * Values the answerer read out of the conversation (SceneInput.extract, prologue 4.1.2: the
   * courtyard object, the past life): only the keys the node lists and the values it allows are
   * written, so a model cannot write any flag it likes.
   */
  values?: Record<string, string>;
}

/** Model (or fallback) lines for an improv node or a free-text reply. */
export function cmdResolve(ctx: SystemContext, d: ResolveData, fromModel: boolean): CommandResult {
  const cur = current(ctx);
  if (!cur || cur.run.runId !== d.runId || cur.run.revision !== d.revision) {
    return reject('stale', tr('sys.scenes.reject.stale'));
  }
  const { run, scene, node } = cur;
  const allowedSpeakers = new Set<string>([
    node.improv?.agentId ?? '',
    node.input?.agentId ?? '',
    ...(node.improv?.fallback ?? []).map((l) => l.speaker),
    ...(node.input?.reply ?? []).map((l) => l.speaker),
  ]);
  // The meaning keys and the forbidden list of the brief (catalog 2.4: "执行者校验不过即换回
  // 原句"): a model answer that misses a meaning key or says a word of the forbidden list is
  // dropped and the written lines stand. A written reply is never checked.
  // What a model sends is never "written": only a kernel source (the written fallback, the
  // timeout guard) may claim it. A model claiming `written` would skip the leak filter, the AI
  // mark and the brief, and speak under any display name (the field is the kernel's own).
  const brief = node.input?.improv ?? node.improv;
  const writtenLines = () =>
    visibleLines(ctx, node.input?.reply ?? node.improv?.fallback).map((l) => ({
      speaker: l.speaker,
      text: l.text,
      name: l.name,
      kind: l.kind,
    }));
  let lines = d.lines ?? [];
  let written = !fromModel && !!d.written;
  let refused = false;
  // An input with no answerer only asks a model to SORT the answer (cmdInput, `classify.by`):
  // the model's choice counts, its words do not; the written reply is what the player reads.
  const sortOnly = fromModel && !!node.input && !node.input.agentId && !!node.input.classify;
  if (sortOnly) {
    lines = writtenLines();
    written = true;
  } else if (fromModel && !briefKept(brief, lines)) {
    lines = writtenLines();
    written = true;
    refused = true;
    ctx.emit('scene.improv_refused', { sceneId: scene.id, nodeId: node.id });
  }
  for (const l of lines.slice(0, 6)) {
    const speaker = allowedSpeakers.has(l.speaker)
      ? l.speaker
      : (node.improv?.agentId ?? node.input?.agentId ?? 'narrator');
    const text = String(l.text ?? '').slice(0, 300);
    if (!text) continue;
    say(
      ctx,
      run,
      { speaker, text, name: written ? l.name : undefined, kind: written ? l.kind : undefined },
      fromModel && !written,
    );
  }
  // The written anchors of the answer (catalog 2.4): the executor says them itself after the
  // answer, once per run of the scene (not again on a later turn or a loop back to the node).
  sayAnchors(ctx, run, node);
  // What the answerer read out of the conversation, filtered to the node's own keys and values;
  // a refused answer extracts nothing (its reading is not trusted either)
  if (fromModel && !refused && !sortOnly)
    for (const [key, value] of extractValues(node.input?.extract, d.values))
      ctx.setFlag(key, value);
  run.spoken = true;
  if (run.waiting !== 'resolve') return ok();
  const spec = node.input;
  if (spec?.turns) {
    const end = roundEnd(spec.turns, run.turn ?? 1, !!d.done);
    if (!end) {
      // the round goes on: the input opens again for the player's next turn
      run.waiting = 'input';
      run.revision++;
      run.resolveDeadline = undefined;
      return ok();
    }
    if (spec.turns.storeAs) ctx.setFlag(spec.turns.storeAs, end);
  }
  if (spec?.classify) {
    const cnode = nodeOf(scene, spec.classify.node);
    const pick =
      d.choiceId && spec.classify.choices.includes(d.choiceId)
        ? d.choiceId
        : spec.classify.fallback;
    // an open choice only: the pick, else the fallback while it is still open; with neither,
    // the reply stands and the input goes on to its own destination
    const openNow = cnode ? visibleChoices(ctx, run, cnode) : [];
    const choice =
      openNow.find((c) => c.id === pick) ?? openNow.find((c) => c.id === spec.classify?.fallback);
    if (cnode && choice) {
      if (!spec.classify.settle) {
        applyChoice(ctx, run, scene, cnode, choice, true);
        return ok();
      }
      if (!settleClassified(ctx, run, choice, cnode)) return ok();
    }
  }
  enterNode(ctx, run, scene, spec?.to ?? node.next ?? node.id, 0);
  return ok();
}

/** Evidence the player could present now (for the view). */
export function courtOptions(
  ctx: SystemContext,
  goddess: string,
): { id: string; label: TextParam }[] {
  return presentable(ctx.world, ctx.content, goddess).map((e) => ({
    id: `${EVIDENCE_PREFIX}${e.id}`,
    label: tr('sys.scenes.court.present', { name: e.name }),
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
      done: true,
    },
    false,
  );
}

/** A timed choice ran out (13.6 `SceneChoice.timeout`): the runner picks it. Tick-based. */
export function choiceTimeouts(ctx: SystemContext): void {
  const cur = current(ctx);
  const timed = cur?.run.timed;
  if (!cur || !timed || timed.at > ctx.tick) return;
  if (cur.run.waiting !== 'choice' && cur.run.waiting !== 'roam') return;
  cur.run.timed = undefined;
  const open = visibleChoices(ctx, cur.run, cur.node);
  // a roam node's timer takes the standing choice the player stands in first (roam.ts)
  const p = playerEntity(ctx.world);
  const standing =
    cur.run.waiting === 'roam'
      ? standingChoice(ctx.content, cur.node, open, p && { mapId: p.mapId, x: p.x, y: p.y })
      : null;
  const choice = standing ?? open.find((c) => c.id === timed.choice);
  if (!choice) {
    // the timed choice closed meanwhile: the shortest timer still open runs from now
    rearmTimer(ctx, cur.run, open);
    return;
  }
  if (cur.run.waiting === 'roam' && p) haltEntity(ctx, p.id);
  applyChoice(ctx, cur.run, cur.scene, cur.node, choice);
}

/** Start the shortest open timed choice from now (the node's own timer, 13.6). */
function rearmTimer(ctx: SystemContext, run: SceneRun, open: readonly SceneChoice[]): void {
  let timed: SceneChoice | null = null;
  for (const c of open)
    if (c.timeout !== undefined && c.timeout >= 0 && (!timed || c.timeout < (timed.timeout ?? 0)))
      timed = c;
  if (timed)
    run.timed = {
      choice: timed.id,
      at: ctx.tick + Math.max(1, Math.round((timed.timeout ?? 0) * TICK_HZ)),
    };
}

export interface UiDoneData {
  runId: number;
  revision: number;
  ui: string;
  /** what the interface hands back (the spirit mirror's appearance); optional */
  result?: unknown;
}

/** The client closed the interface of a `ui` effect: apply its result and go on. */
export function cmdUiDone(ctx: SystemContext, d: UiDoneData): CommandResult {
  const cur = current(ctx);
  if (!cur) return reject('no_scene', tr('sys.scenes.reject.no_scene.idle'));
  const { run, scene, node } = cur;
  const wait = run.ui;
  if (run.waiting !== 'ui' || !wait || wait.ui !== d.ui)
    return reject('no_ui', tr('sys.scenes.reject.no_ui'));
  if (run.runId !== d.runId || run.revision !== d.revision)
    return reject('stale', tr('sys.scenes.reject.stale'));
  if (!applyUiResult(ctx, wait.ui, wait.storeAs, d.result))
    return reject('bad_result', tr('sys.scenes.reject.bad_result'));
  run.ui = undefined;
  ctx.emit('scene.ui_closed', { sceneId: scene.id, nodeId: node.id, ui: wait.ui });
  if (ctx.world.slices.scenes.current?.runId !== run.runId) return ok();
  // the node's lines were read before the interface opened: go on to its destination (its
  // branches, then its own choices or input if it has any, else next)
  if (wait.to !== undefined) moveOn(ctx, run, scene, wait.to, node);
  else settleNode(ctx, run, scene, node, 0, false);
  return ok();
}

/** The player flags a restart with `resetPlayer` forgets (the spirit mirror's and the name's). */
const RESET_PLAYER_FLAGS = ['player.name', 'p_appearance'] as const;

/** Whether the playing scene offers "re-choose the opening" right now. */
export function restartOpen(content: { scenes: SceneDef[] }, run: SceneRun | null): boolean {
  if (!run || run.restartClosed) return false;
  const restart = sceneDef(content, run.sceneId)?.restart;
  return !!restart && !!sceneDef(content, restart.scene);
}

/** A flag key matches a clear list: exact names, or prefixes ending in `*`. */
export function flagMatches(key: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => (p.endsWith('*') ? key.startsWith(p.slice(0, -1)) : key === p));
}

/**
 * Re-choose the opening (catalog_cutscenes.md 4.1.1 rule 5): drop the run, clear the listed
 * flags (they read as never written again), take the listed items back, forget the scenes
 * whose seen flag was cleared, and play the restart scene from its start.
 */
export function cmdRestart(ctx: SystemContext): CommandResult {
  const slice = ctx.world.slices.scenes;
  const run = slice.current;
  if (!run) return reject('no_scene', tr('sys.scenes.reject.no_scene.idle'));
  const scene = sceneDef(ctx.content, run.sceneId);
  const restart = scene?.restart;
  if (!scene || !restart || !restartOpen(ctx.content, run))
    return reject('no_restart', tr('sys.scenes.reject.no_restart'));
  const flags = ctx.world.meta.flags;
  const cleared = Object.keys(flags)
    .filter((k) => flagMatches(k, restart.clear))
    .sort();
  // A reset, not a write: the flags go back to unwritten (registry defaults), so no
  // flag.changed fires; scene.restarted lists them for whoever keeps derived state.
  for (const k of cleared) delete flags[k];
  const playerId = ctx.world.slices.world.playerId;
  for (const item of restart.take ?? []) {
    const n = countItem(ctx.world, playerId, item);
    if (n > 0) removeItem(ctx, playerId, item, n, 'restart');
  }
  slice.seen = slice.seen.filter((id) => !cleared.includes(`scene.${id}.seen`));
  // The quests whose flag was cleared go back to unstarted (the request PK-M1-27 left behind,
  // item 7): the prologue's quests only ever moved forward, so after re-choosing the opening
  // the log still showed the stages of the run that was dropped.
  const questIds = cleared
    .filter((k) => k.startsWith('quest.') && !k.slice(6).includes('.'))
    .map((k) => k.slice(6));
  if (questIds.length > 0) {
    // the quests' own sub-keys go with them (stage, path, choice), whatever the clear list said
    for (const k of Object.keys(flags))
      if (questIds.some((id) => k.startsWith(`quest.${id}.`))) delete flags[k];
    resetQuests(ctx, questIds);
  }
  // the opening asks the name and the look again: the player goes back to unnamed and default
  if (restart.resetPlayer) {
    // a reset like the clear above: the flags go back to unwritten, with no flag.changed
    for (const k of RESET_PLAYER_FLAGS) delete flags[k];
    setEntityName(ctx, playerId, '?');
    setAppearance(ctx, playerId, {
      base: DEFAULT_PLAYER_APPEARANCE.base,
      colors: [...DEFAULT_PLAYER_APPEARANCE.colors],
    });
  }
  // scenes other systems queued stay queued: they play after the opening as they would have
  slice.current = null;
  ctx.emit('scene.restarted', { sceneId: scene.id, to: restart.scene, cleared });
  startScene(ctx, restart.scene);
  return ok();
}
