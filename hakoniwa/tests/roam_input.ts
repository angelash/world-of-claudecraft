// Playing a roam node through the real input path (onboarding_interaction.md 5.3), for the
// input-harness tests: walk to the wanted touch point with the keyboard (WASD) or the left
// stick, then press the interact key (E, or A on the pad); a standing choice is taken by
// walking into its place and waiting, the hidden timed choice by waiting where one stands.
// No command is queued here: movement and the interact key go through the input hub.

import { roamPoints, type SceneView, sceneView } from '../src/systems/scenes';
import { mapById, nearestWalkable } from '../src/systems/world';
import type { InputHarness } from './input_harness';

const KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' } as const;

function player(h: InputHarness) {
  const w = h.engine.world.slices.world;
  return w.entities[w.playerId];
}

/** Still on the same node of the same run. */
function sameNode(h: InputHarness, sv: SceneView): boolean {
  const run = h.engine.world.slices.scenes.current;
  return !!run && run.runId === sv.runId && run.revision === sv.revision;
}

/** Where to walk for a choice: a floor tile by its touch point (or its place's middle). */
function goal(h: InputHarness, sv: SceneView, choiceId: string) {
  const point = roamPoints(h.engine.world, h.engine.content).find((p) => p.id === choiceId);
  const choice = sv.choices.find((c) => c.id === choiceId);
  if (!point || !choice) return null;
  if (choice.stand) return { x: point.x, y: point.y, stand: true };
  const p = player(h);
  const map = p ? mapById(h.engine.content, p.mapId) : undefined;
  const floor = map ? nearestWalkable(map, point.x, point.y) : null;
  return { x: floor?.x ?? point.x, y: floor?.y ?? point.y, stand: false };
}

function inReach(h: InputHarness, choiceId: string): boolean {
  return !!roamPoints(h.engine.world, h.engine.content).find((p) => p.id === choiceId)?.inReach;
}

/** Wait (frames) until the node changes; the node's timer takes it. */
function waitOut(h: InputHarness, sv: SceneView, frame: () => void): void {
  for (let i = 0; i < 20 * 150 && sameNode(h, sv); i++) frame();
}

/** Walk with held keys until `done` (or close to the goal), one key frame at a time. */
function walkKeys(h: InputHarness, x: number, y: number, done: () => boolean): void {
  const held = new Set<string>();
  const hold = (want: Set<string>) => {
    for (const k of held) if (!want.has(k)) h.hub.key({ code: k }, 'up');
    for (const k of want) if (!held.has(k)) h.hub.key({ code: k }, 'down');
    held.clear();
    for (const k of want) held.add(k);
  };
  for (let i = 0; i < 600 && !done(); i++) {
    const p = player(h);
    if (!p) break;
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.hypot(dx, dy) < 0.3) break;
    const want = new Set<string>();
    if (dx > 0.2) want.add(KEYS.right);
    if (dx < -0.2) want.add(KEYS.left);
    if (dy > 0.2) want.add(KEYS.down);
    if (dy < -0.2) want.add(KEYS.up);
    hold(want);
    h.keyFrame();
  }
  hold(new Set());
  h.keyFrame();
}

/** Walk with the left stick until `done` (or close to the goal). */
function walkPad(h: InputHarness, x: number, y: number, done: () => boolean): void {
  for (let i = 0; i < 600 && !done(); i++) {
    const p = player(h);
    if (!p) break;
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.3) break;
    h.pad.axes[0] = dx / d;
    h.pad.axes[1] = dy / d;
    h.frame();
  }
  h.pad.axes[0] = 0;
  h.pad.axes[1] = 0;
  h.frame();
}

/**
 * Take `choiceId` on the open roam node with the keyboard: walk there with WASD and press E.
 * Returns true when a touch point was used (a scenes.choose went out through the input path).
 */
export function roamByKeys(h: InputHarness, sv: SceneView, choiceId: string): boolean {
  const choice = sv.choices.find((c) => c.id === choiceId);
  if (!choice) return false;
  if (choice.hidden && !choice.stand) {
    waitOut(h, sv, h.keyFrame);
    return false;
  }
  const g = goal(h, sv, choiceId);
  if (!g) return false;
  // a timer may take the node while walking (the phone rings): then there is nothing to press
  walkKeys(h, g.x, g.y, () => !sameNode(h, sv) || (!g.stand && inReach(h, choiceId)));
  if (!sameNode(h, sv)) return false;
  if (g.stand) {
    waitOut(h, sv, h.keyFrame);
    return false;
  }
  h.press({ code: 'KeyE' });
  return sceneView(h.engine.world, h.engine.content)?.nodeId !== sv.nodeId;
}

/** The same with the left stick and the A button. */
export function roamByPad(h: InputHarness, sv: SceneView, choiceId: string): boolean {
  const choice = sv.choices.find((c) => c.id === choiceId);
  if (!choice) return false;
  if (choice.hidden && !choice.stand) {
    waitOut(h, sv, h.frame);
    return false;
  }
  const g = goal(h, sv, choiceId);
  if (!g) return false;
  walkPad(h, g.x, g.y, () => !sameNode(h, sv) || (!g.stand && inReach(h, choiceId)));
  if (!sameNode(h, sv)) return false;
  if (g.stand) {
    waitOut(h, sv, h.frame);
    return false;
  }
  h.tap('a');
  return sceneView(h.engine.world, h.engine.content)?.nodeId !== sv.nodeId;
}
