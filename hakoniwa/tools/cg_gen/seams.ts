// The seam check of a joined film (cg_and_video.md section 5, acceptance): a join is fine when
// the picture changes across it about as much as it changes between the frames around it.
// Pure: frame differences in, one ratio per join out; the runner decodes the video.

/** Frames on each side of a join that set its local motion. */
export const SEAM_RADIUS = 6;
/** A join whose step is more than this many times the local motion stands out... */
export const SEAM_LIMIT = 3;
/**
 * ...when the step itself is large enough to see: mean absolute difference on a 0 to 255 gray
 * scale (the pops the join ease fixed measured 5 to 32; a still shot's grain is under 2).
 */
export const SEAM_MIN_STEP = 3;
/** Local motion below this is treated as this (a still shot would make any step look huge). */
const MOTION_FLOOR = 0.3;

export interface SeamReading {
  /** frame of the joined run where the next segment's first shown frame lands */
  frame: number;
  /** mean absolute difference from the frame before */
  step: number;
  /** median difference of the frames around it */
  local: number;
  ratio: number;
}

/**
 * `diffs[f]` is the mean absolute difference between frame f and frame f - 1 (diffs[0] unused);
 * `joins` are the frames where a continuing segment starts.
 */
export function seamReadings(
  diffs: readonly number[],
  joins: readonly number[],
  radius = SEAM_RADIUS,
): SeamReading[] {
  return joins
    .filter((f) => f > 0 && f < diffs.length)
    .map((frame) => {
      const around: number[] = [];
      for (let k = frame - radius; k <= frame + radius; k++)
        if (k !== frame && k > 0 && k < diffs.length) around.push(diffs[k]);
      around.sort((a, b) => a - b);
      const local = around.length ? around[Math.floor(around.length / 2)] : 0;
      const step = diffs[frame];
      return { frame, step, local, ratio: step / Math.max(local, MOTION_FLOOR) };
    });
}

/** Mean absolute differences of consecutive frames of a raw gray video (`size` bytes a frame). */
export function frameDiffs(raw: Uint8Array, size: number): number[] {
  const frames = Math.floor(raw.length / size);
  const out = [0];
  for (let f = 1; f < frames; f++) {
    let s = 0;
    const a = f * size;
    const b = (f - 1) * size;
    for (let i = 0; i < size; i++) s += Math.abs(raw[a + i] - raw[b + i]);
    out.push(s / size);
  }
  return out;
}

/** A join a viewer would notice. */
export function seamVisible(s: SeamReading): boolean {
  return s.ratio > SEAM_LIMIT && s.step > SEAM_MIN_STEP;
}
