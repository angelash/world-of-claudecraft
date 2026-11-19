// Scenes that request themselves (PK-M1-34; catalog_cutscenes.md 5, the 触发 rows a scene
// carries instead of a quest stage): `SceneDef.triggers` lists a condition and, optionally,
// the place the player must stand in. Act 1 needs this because several cutscenes hang on
// walking into a room (the nest shaft, the shaft top, the culvert) or on the hour the tide
// reaches a stage, with no quest stage to hang them on.
//
// The rule is deliberately thin: nothing is remembered between ticks. A trigger fires while
// its condition holds, the player is at its place and the scene's act is the world's act, and
// the scene itself must turn the condition false (every act-1 trigger reads a flag the scene
// writes). A scene that does not is a content defect, not something this module papers over:
// `tools/content/validators/reach.ts` and tests/act1_cutscenes.test.ts hold the data to it.
// Checked only while nothing plays and nothing is queued, so a trigger never cuts into a
// scene; the ones that came true meanwhile fire on the first tick after it ends.

import type { SystemContext } from '../../core/system';
import { conditionHolds } from '../quests/effects';
import { atPlace } from '../quests/objectives';
import { playerEntity } from '../world';
import { requestScene } from './runner';
import type { SceneDef } from './types';

/**
 * The scene whose first open trigger holds now, in content order (deterministic: no draw, and
 * the first match wins), or null. Exported for the content validator and the tests.
 */
export function triggeredScene(ctx: SystemContext): SceneDef | null {
  const act = ctx.flag('act');
  const player = playerEntity(ctx.world);
  for (const scene of ctx.content.scenes ?? []) {
    if (!scene.triggers?.length) continue;
    // a scene that names an act plays only in it (the act's own flag, not the clock)
    if (scene.act && scene.act !== act) continue;
    for (const t of scene.triggers) {
      if (t.mapId && !atPlace(ctx, player, t.mapId, t.location)) continue;
      if (!conditionHolds(ctx, t.when)) continue;
      return scene;
    }
  }
  return null;
}

/** Request the scene a trigger asks for, while nothing plays. Called once per tick. */
export function runTriggers(ctx: SystemContext): void {
  const slice = ctx.world.slices.scenes;
  if (slice.current || slice.queue.length > 0) return;
  const scene = triggeredScene(ctx);
  if (scene) requestScene(ctx, scene.id);
}
