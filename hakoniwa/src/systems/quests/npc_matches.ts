// A quest may be offered by one named person or by any real resident of a catalog
// template. Generated residents keep the owning template in their stable content ref.
// Never match an arbitrary prefix: the template must be registered and the numeric
// suffix must have the exact shape the NPC spawner emits.

import type { ContentMap } from '../../core/contracts';

export function matchesQuestNpc(
  content: Pick<ContentMap, 'npcResidents'>,
  expected: string,
  actual: string,
): boolean {
  if (expected === actual) return true;
  if (!content.npcResidents?.some((t) => t.id === expected)) return false;
  const prefix = `res_${expected}_`;
  return actual.startsWith(prefix) && /^\d+$/.test(actual.slice(prefix.length));
}
