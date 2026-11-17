// Combat barks of the cutscene interlude tables (catalog_cutscenes.md 5 "战斗插演": short lines
// said without pausing the fight, hung on boss and wave data). A scene lists them in
// `SceneDef.barks`; the scenes system listens to the combat system's wave and boss events
// (it never calls into combat) and says the matching lines as loose dialogue lines. A bark
// fires once per world unless it says `repeat`; the ones said are kept in the slice so a
// loaded save does not repeat them.

import type { SystemContext } from '../../core/system';
import { conditionHolds } from '../quests/effects';
import { say } from './runner';
import type { BarkTrigger, SceneBark, SceneDef } from './types';

interface IndexedBark {
  sceneId: string;
  bark: SceneBark;
}

// Barks by trigger and reference, built once per scene table.
const index = new WeakMap<readonly SceneDef[], Map<string, IndexedBark[]>>();

function barkKey(on: BarkTrigger, ref: string): string {
  return `${on}|${ref}`;
}

function barksFor(scenes: readonly SceneDef[], on: BarkTrigger, ref: string): IndexedBark[] {
  let byKey = index.get(scenes);
  if (!byKey) {
    byKey = new Map();
    for (const s of scenes) {
      for (const bark of s.barks ?? []) {
        const k = barkKey(bark.on, bark.ref);
        const list = byKey.get(k) ?? [];
        list.push({ sceneId: s.id, bark });
        byKey.set(k, list);
      }
    }
    index.set(scenes, byKey);
  }
  return byKey.get(barkKey(on, ref)) ?? [];
}

/**
 * A combat event arrived: say every bark it triggers whose condition holds. `phase` is the
 * boss phase reached (boss_phase only). Returns the barks said, as `<sceneId>/<barkId>`.
 */
export function barkOn(ctx: SystemContext, on: BarkTrigger, ref: string, phase?: number): string[] {
  const slice = ctx.world.slices.scenes;
  slice.barked ??= [];
  const said: string[] = [];
  for (const { sceneId, bark } of barksFor(ctx.content.scenes ?? [], on, ref)) {
    if (on === 'boss_phase' && bark.phase !== undefined && bark.phase !== phase) continue;
    const id = `${sceneId}/${bark.id}`;
    if (!bark.repeat && slice.barked.includes(id)) continue;
    if (!conditionHolds(ctx, bark.when)) continue;
    for (const line of bark.lines) if (conditionHolds(ctx, line.when)) say(ctx, null, line);
    if (!bark.repeat) slice.barked.push(id);
    said.push(id);
  }
  return said;
}
