// What a goddess says without a model (builtin_ai.md 8.8; catalog_dialogue_lines.md 1.6):
// a line of her own pack ln_<goddess> (the act override first, so an honorific answer reads
// acts.act<n>.react.honorific), drawn with her stream and kept apart from the shared layers;
// a slot with no line in her own pack gives null and the caller falls back to her written
// reply or her wordless sign. The history suppresses repeats (builtin_ai 7.7).

import type { SystemContext } from '../../../core/system';
import type { TextParam } from '../../../core/text';
import { calendarAt } from '../../../core/time';
import { lineText } from '../../dialogue/lines/fill';
import { suppressionDays } from '../../dialogue/lines/grammar';
import { recordLine } from '../../dialogue/lines/history';
import { npcPackId } from '../../dialogue/lines/packs';
import { selectLine } from '../../dialogue/lines/select';
import { conditionHolds } from '../../quests/effects';
import { brainOf } from './state';

/** A line of `slot` from her own pack now (null: her pack has none for this act). */
export function goddessLine(
  ctx: SystemContext,
  goddess: string,
  slot: string,
  vars: Record<string, TextParam | undefined> = {},
): TextParam | null {
  const packs = ctx.content.linePacks ?? [];
  const own = npcPackId(goddess);
  if (!packs.some((p) => p.id === own)) return null;
  const brain = brainOf(ctx.world.slices.goddess, goddess);
  const day = calendarAt(ctx.tick).dayIndex;
  const act = ctx.flag('act');
  const pick = selectLine(
    { linePacks: packs },
    goddess,
    slot,
    { holds: (w) => conditionHolds(ctx, w), dayIndex: day },
    ctx.rng(`goddess.lines.${goddess}`),
    brain.lines,
    { act: typeof act === 'string' ? act : undefined, suppressDays: suppressionDays(slot) },
  );
  if (!pick || pick.packId !== own) return null;
  recordLine(brain.lines, pick.key, day);
  const text = lineText({ zh: pick.entry.zh, key: pick.key }, vars);
  return text === '' ? null : text;
}
