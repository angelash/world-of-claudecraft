// The title reads cached slot metadata only. It never loads a world or advances its clock.

import type { SlotId, SlotMeta, SlotProblem } from '../hud/save_slots';

export function latestTitleSlot(
  list: Partial<Record<SlotId, SlotMeta>>,
  problems: Partial<Record<SlotId, SlotProblem>>,
): { slot: SlotId; meta: SlotMeta | null; problem: SlotProblem | null } | null {
  const rows = Object.values(list)
    .filter((m): m is SlotMeta => !!m)
    .sort(
      (a, b) =>
        b.savedAt.localeCompare(a.savedAt) || b.tick - a.tick || a.slot.localeCompare(b.slot),
    );
  const meta = rows[0];
  if (meta) return { slot: meta.slot, meta, problem: problems[meta.slot] ?? null };
  const slot = (Object.keys(problems) as SlotId[]).sort()[0];
  return slot ? { slot, meta: null, problem: problems[slot] ?? null } : null;
}
