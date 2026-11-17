// Player-facing scene query: the scene now playing, its current lines, and what the
// player can do (choices, free text, evidence, or just continue). Conditions are read with
// the narrative resolver (flags, the calendar terms of the world's tick, ai_enabled), the
// same one the runner uses, so a choice gated on `night` or `season` shows exactly when the
// runner would accept it.

import type { ContentMap } from '../../core/contracts';
import { type TextParam, tr } from '../../core/text';
import type { World } from '../../core/world';
import { evaluate } from '../quests/conditions';
import { worldResolver } from '../quests/effects';
import { presentable } from './court';
import { COURT_END, EVIDENCE_PREFIX, nodeOf, openChoices, restartOpen, sceneDef } from './runner';
import type { ScenePresentation, SceneWait, ShownLine, StageDirective } from './types';

export interface SceneViewChoice {
  id: string;
  label: TextParam;
  hint?: string;
  confirm?: boolean;
  /** not listed among the numbered choices (keyed or timed) */
  hidden?: boolean;
  /** the dialogue-context input action that picks it (a key prompt) */
  key?: string;
  /** seconds after which the runner picks it */
  timeout?: number;
}

export interface SceneView {
  /** the run (a restarted scene is a new run of the same scene) */
  runId: number;
  /** the run's revision, for commands that must match the node they answer (ui_done) */
  revision: number;
  sceneId: string;
  title: string;
  nodeId: string;
  waiting: SceneWait;
  lines: ShownLine[];
  choices: SceneViewChoice[];
  input: { prompt: string; maxLength: number } | null;
  court: { goddess: string; presented: string[]; limit: number } | null;
  /** scenes waiting to play after this one */
  queued: string[];
  /** client presentation (ux_and_onboarding.md 8.1); theater when the scene names none */
  presentation: ScenePresentation;
  /** the full-screen still of an illustration scene */
  illustration: string | null;
  /** the skip summary card text (content), '' when the scene has none */
  summary: string;
  /** the act the scene belongs to ('' when it names none) */
  act: string;
  /** the current node's stage directives (catalog_cutscenes.md 13.5) */
  stage: StageDirective[];
  /** the current node is an anchor (skipping stops here) */
  anchor: boolean;
  /** the interface a `ui` effect opened (waiting 'ui'), else null */
  ui: string | null;
  /** the flag the open interface's result goes to ('' when none) */
  uiStoreAs: string;
  /** the segment the run is in ('' before any marker) */
  segment: string;
  /** the skip summary of the current segment, else the scene's ('' when neither) */
  segmentSummary: string;
  /** "re-choose the opening" is on offer now */
  restartable: boolean;
}

export function sceneView(
  world: World,
  content: ContentMap,
  aiEnabled = world.ai.mode !== 'off',
): SceneView | null {
  const run = world.slices.scenes.current;
  if (!run) return null;
  const scene = sceneDef(content, run.sceneId);
  const node = scene ? nodeOf(scene, run.nodeId) : undefined;
  if (!scene || !node) return null;
  const resolve = worldResolver(world, aiEnabled);
  let choices: SceneView['choices'] = [];
  if (run.waiting === 'choice') {
    choices = openChoices(node, run.picked, (expr) => evaluate(expr, resolve)).map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint,
      confirm: c.confirm,
      ...(c.hidden ? { hidden: true } : {}),
      ...(c.key ? { key: c.key } : {}),
      ...(c.timeout !== undefined ? { timeout: c.timeout } : {}),
    }));
  } else if (run.waiting === 'court' && node.court) {
    const spec = node.court;
    const full = !!spec.limit && run.presented.length >= spec.limit;
    choices = [
      ...(full
        ? []
        : presentable(world, content, spec.goddess).map((e) => ({
            id: `${EVIDENCE_PREFIX}${e.id}`,
            label: tr('sys.scenes.court.present', { name: e.name }),
          }))),
      { id: COURT_END, label: tr('sys.scenes.court.end') },
    ];
  }
  return {
    runId: run.runId,
    revision: run.revision,
    sceneId: scene.id,
    title: scene.title,
    nodeId: node.id,
    waiting: run.waiting,
    lines: run.shown.map((l) => ({ ...l })),
    choices,
    input:
      run.waiting === 'input' && node.input
        ? { prompt: node.input.prompt, maxLength: node.input.maxLength ?? 80 }
        : null,
    court: node.court
      ? { goddess: node.court.goddess, presented: [...run.presented], limit: node.court.limit ?? 0 }
      : null,
    queued: [...world.slices.scenes.queue],
    presentation: scene.presentation ?? 'theater',
    illustration: scene.illustration ?? null,
    summary: scene.summary ?? '',
    act: scene.act ?? '',
    stage: (node.stage ?? []).map((d) => ({ ...d })),
    anchor: !!node.anchor,
    ui: run.waiting === 'ui' ? (run.ui?.ui ?? null) : null,
    uiStoreAs: run.waiting === 'ui' ? (run.ui?.storeAs ?? '') : '',
    segment: run.segment ?? '',
    segmentSummary:
      scene.segments?.find((s) => s.id === run.segment)?.summary ?? scene.summary ?? '',
    restartable: restartOpen(content, run),
  };
}

/** The last assembled epilogue (for a credits view). */
export function epilogueView(
  world: World,
): { subject: string; year: number; text: TextParam; layer: string }[] {
  return world.slices.scenes.epilogue.map((e) => ({ ...e }));
}

/** Scenes seen to the end. */
export function scenesSeen(world: World): string[] {
  return [...world.slices.scenes.seen];
}
