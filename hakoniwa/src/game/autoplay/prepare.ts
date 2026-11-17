// Story bosses the main line is about to bring in with a scripted wave (the autoplayer's
// look ahead, D-071): a wave boss appears only when its stage starts, which is too late to
// level for it (the tide's colossus arrives six game hours after the trial ends). The
// autoplayer readies itself for these while it still works on the beat before: the later
// stages of the active main quests and the main quests they unlock next. Pure.

import type { ContentMap } from '../../core/contracts';
import type { QuestDef, QuestProgress, QuestStage } from '../../systems/quests/types';

/** Named kill targets of a stage that one of its entry waves brings in. */
function waveBossesOf(content: ContentMap, stage: QuestStage): string[] {
  const inWaves = new Set<string>();
  for (const e of stage.onEnter ?? []) {
    if (e.type !== 'wave') continue;
    const wave = content.waves.find((w) => w.id === e.wave);
    for (const g of wave?.groups ?? []) inWaves.add(g.monster);
  }
  const out: string[] = [];
  for (const o of stage.objectives) {
    if (o.type === 'kill' && !o.optional && o.ref && inWaves.has(o.ref)) out.push(o.ref);
  }
  return out;
}

/** Whether a trigger condition names the completion of one of these quests. */
function unlockedBy(trigger: string | undefined, quests: readonly string[]): boolean {
  if (!trigger) return false;
  return quests.some((id) => new RegExp(`(^|[^\\w.])quest\\.${id}([^\\w.]|$)`).test(trigger));
}

/**
 * Wave bosses of the coming beats, sorted: the stages after the current one of each
 * active main quest, and every stage of the main quests not yet started whose trigger
 * names an active main quest.
 */
export function upcomingWaveBosses(
  content: ContentMap,
  progress: Readonly<Record<string, QuestProgress | undefined>>,
  order: readonly string[],
): string[] {
  const defs = new Map<string, QuestDef>(content.quests.map((q) => [q.id, q]));
  const active = order.filter(
    (id) => progress[id]?.status === 'active' && defs.get(id)?.kind === 'main',
  );
  const out = new Set<string>();
  for (const id of active) {
    const def = defs.get(id);
    const stage = progress[id]?.stage ?? 0;
    for (const st of def?.stages.slice(stage + 1) ?? []) {
      for (const ref of waveBossesOf(content, st)) out.add(ref);
    }
  }
  for (const def of content.quests) {
    if (def.kind !== 'main' || progress[def.id] || !unlockedBy(def.trigger, active)) continue;
    for (const st of def.stages) for (const ref of waveBossesOf(content, st)) out.add(ref);
  }
  return [...out].sort();
}
