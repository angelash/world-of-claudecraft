// Sequence keys (序钥, thousand_doors.md 5.1): the steps of a `seq` key must be met in their
// order. The doors system keeps the number of steps done in the counter
// `seq:<door>:<path>` and moves it here (the judge in ./keys.ts only reads it). A count
// step does not count before its turn (countEvent skips it), so it can only be earned in
// order; any other step met before its turn voids the sequence for good (counter -1):
// holding the crystal after the pact is not the abyss door's act 3 key.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { evalKey, seqCounter, walkKeys } from './keys';
import type { DoorDef, KeyCond } from './types';

export const SEQ_BROKEN = -1;

function hasSeq(door: DoorDef): boolean {
  let found = false;
  walkKeys(door.keys, '', (k) => {
    if (k.type === 'seq') found = true;
  });
  return found;
}

const SEQ_CONTENT = new WeakMap<ContentMap, boolean>();

/** Does any door of the content carry a sequence key (cached per content object)? */
export function hasSequences(content: ContentMap): boolean {
  let v = SEQ_CONTENT.get(content);
  if (v === undefined) {
    v = (content.doors ?? []).some(hasSeq);
    SEQ_CONTENT.set(content, v);
  }
  return v;
}

function onlyCounts(k: KeyCond): boolean {
  if (k.type === 'count') return true;
  if (k.type === 'all' || k.type === 'any' || k.type === 'seq' || k.type === 'alt')
    return k.of.length > 0 && k.of.every(onlyCounts);
  return false;
}

/** Move every sequence of every door still closed to the player. */
export function advanceSequences(world: World, content: ContentMap): void {
  if (!hasSequences(content)) return;
  const slice = world.slices.doors;
  for (const door of content.doors ?? []) {
    const st = slice.doors[door.id]?.state;
    if (st === 'opened' || st === 'locked' || st === 'closed' || !hasSeq(door)) continue;
    walkKeys(door.keys, '', (k, path) => {
      if (k.type !== 'seq') return;
      const key = seqCounter(door.id, path);
      let step = slice.counters[key] ?? 0;
      if (step < 0 || step >= k.of.length) return;
      while (step < k.of.length) {
        const cur = k.of[step];
        if (cur && evalKey(world, door, cur, `${path}.${step}`, content).met) {
          step++;
          continue;
        }
        for (let j = step + 1; j < k.of.length; j++) {
          const later = k.of[j];
          if (!later || onlyCounts(later)) continue;
          if (evalKey(world, door, later, `${path}.${j}`, content).met) {
            step = SEQ_BROKEN;
            break;
          }
        }
        break;
      }
      if (step !== (slice.counters[key] ?? 0)) slice.counters[key] = step;
    });
  }
}
