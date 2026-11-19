import type { FrameInput } from './anchor';
import type { ImportSpec } from './template_specs';

/** Static variants share no motion; animated rows keep their relative vertical movement. */
export function baselineGroups(
  frames: readonly FrameInput[],
  spec: Pick<ImportSpec, 'anims'>,
): FrameInput[][] {
  if (spec.anims.length === 0) return frames.map((frame) => [frame]);
  const rows = new Map<number, FrameInput[]>();
  for (const frame of frames) rows.set(frame.row, [...(rows.get(frame.row) ?? []), frame]);
  return [...rows.values()];
}
