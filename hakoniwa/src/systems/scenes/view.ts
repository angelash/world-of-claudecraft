// Player-facing scene query: the scene now playing, its current lines, and what the
// player can do (choices, free text, evidence, or just continue).

import type { ContentMap } from '../../core/contracts';
import { type TextParam, tr } from '../../core/text';
import type { World } from '../../core/world';
import { evaluate, flagResolver } from '../quests/conditions';
import { presentable } from './court';
import { COURT_END, EVIDENCE_PREFIX, nodeOf, sceneDef } from './runner';
import type { ScenePresentation, SceneWait, ShownLine, StageDirective } from './types';

export interface SceneView {
  sceneId: string;
  title: string;
  nodeId: string;
  waiting: SceneWait;
  lines: ShownLine[];
  choices: { id: string; label: TextParam; hint?: string; confirm?: boolean }[];
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
  const resolve = flagResolver(world.meta.flags, { ai_enabled: aiEnabled });
  let choices: SceneView['choices'] = [];
  if (run.waiting === 'choice') {
    choices = (node.choices ?? [])
      .filter((c) => evaluate(c.when, resolve) && !(c.once && run.picked.includes(c.id)))
      .map((c) => ({ id: c.id, label: c.label, hint: c.hint, confirm: c.confirm }));
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
