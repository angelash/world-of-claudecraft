// The generation record of a film (cg_and_video.md section 5, archive): what was sent to the
// models for every keyframe and segment (exact prompt, seed, take, references, anchors), how
// long each took, and the hash of every file it produced, so a take can be traced and redone
// and the binaries (kept outside the repository, U-35) can be matched to it later. Pure: the
// runner hands in the state and readers for prompt texts and file facts.

import { SEAM_MIN_STEP, type SeamReading, seamVisible } from './seams';
import {
  FPS,
  keyframeKey,
  keyframeOrder,
  placeSegments,
  type SegmentPlan,
  type Storyboard,
  segmentPlan,
  shotSeconds,
} from './storyboard';

export interface RunState {
  keyframes: Record<string, { file: string; seconds: number; seed: number }>;
  segments: Record<string, { video: string; last: string; seconds: number; seed: number }>;
  takes?: Record<string, number>;
}

export interface FileFact {
  sha256: string;
  bytes: number;
}

export interface RecordReaders {
  /** the exact prompt sent for a keyframe or segment key (null: an image keyframe, no prompt) */
  prompt(key: string): string | null;
  /** hash and size of a produced file (null: the file is gone) */
  file(path: string): FileFact | null;
  /** a path as the record shows it (relative to the project, forward slashes) */
  show(path: string): string;
}

export interface CutOutput {
  id: string;
  kind: 'film' | 'cg' | 'reel' | 'cg_review';
  path: string;
  shots: string[];
}

export interface GenerationRecord {
  board: string;
  title: string;
  recordedAt: string;
  models: Record<string, unknown>;
  totals: {
    keyframes: number;
    segments: number;
    keyframeSeconds: number;
    segmentSeconds: number;
    filmSeconds: number;
  };
  keyframes: {
    key: string;
    seed: number;
    take: number;
    edit: string | null;
    refs: string[];
    image: string | null;
    prompt: string | null;
    seconds: number;
    file: (FileFact & { path: string }) | null;
  }[];
  segments: {
    key: string;
    seed: number;
    take: number;
    first: string;
    last: string | null;
    prompt: string | null;
    seconds: number;
    video: (FileFact & { path: string }) | null;
    lastFrame: (FileFact & { path: string }) | null;
  }[];
  outputs: {
    id: string;
    kind: CutOutput['kind'];
    seconds: number;
    file: (FileFact & { path: string }) | null;
  }[];
  seams: {
    joins: number;
    limit: number;
    minStep: number;
    worst: SeamReading[];
    visible: number;
  } | null;
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function fact(r: RecordReaders, path: string | undefined): (FileFact & { path: string }) | null {
  if (!path) return null;
  const f = r.file(path);
  return f ? { path: r.show(path), ...f } : null;
}

/** Build the record of everything the state says was made for this board. */
export function generationRecord(
  board: Storyboard,
  state: RunState,
  r: RecordReaders,
  opts: {
    recordedAt: string;
    models: Record<string, unknown>;
    outputs: CutOutput[];
    seams: SeamReading[] | null;
    seamLimit: number;
  },
): GenerationRecord {
  const take = (key: string) => state.takes?.[key] ?? 0;
  const specs = new Map(
    board.shots.flatMap((s) =>
      Object.entries(s.keyframes).map(([b, k]) => [keyframeKey(s.id, Number(b)), k] as const),
    ),
  );
  const keyframes = keyframeOrder(board)
    .filter((key) => state.keyframes[key])
    .map((key) => {
      const k = state.keyframes[key];
      const spec = specs.get(key);
      return {
        key,
        seed: k.seed,
        take: take(key),
        edit: spec?.edit ?? null,
        refs: spec?.refs ?? [],
        image: spec?.image ?? null,
        prompt: spec?.image ? null : r.prompt(key),
        seconds: round(k.seconds),
        file: fact(r, k.file),
      };
    });
  const firstOf = (p: SegmentPlan) =>
    p.first.kind === 'keyframe' ? p.first.key : `${p.first.key} last frame`;
  const segments = segmentPlan(board)
    .filter((p) => state.segments[p.key])
    .map((p) => {
      const s = state.segments[p.key];
      return {
        key: p.key,
        seed: s.seed,
        take: take(p.key),
        first: firstOf(p),
        last: p.last,
        prompt: r.prompt(p.key),
        seconds: round(s.seconds),
        video: fact(r, s.video),
        lastFrame: fact(r, s.last),
      };
    });
  const outputs = opts.outputs.map((o) => ({
    id: o.id,
    kind: o.kind,
    seconds: round(shotSeconds(board, o.shots), 3),
    file: fact(r, o.path),
  }));
  let seams: GenerationRecord['seams'] = null;
  if (opts.seams) {
    const worst = [...opts.seams]
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 5)
      .map((s) => ({
        ...s,
        step: round(s.step, 2),
        local: round(s.local, 2),
        ratio: round(s.ratio, 2),
      }));
    seams = {
      joins: opts.seams.length,
      limit: opts.seamLimit,
      minStep: SEAM_MIN_STEP,
      worst,
      visible: opts.seams.filter(seamVisible).length,
    };
  }
  return {
    board: board.id,
    title: board.title,
    recordedAt: opts.recordedAt,
    models: opts.models,
    totals: {
      keyframes: keyframes.length,
      segments: segments.length,
      keyframeSeconds: round(keyframes.reduce((n, k) => n + k.seconds, 0)),
      segmentSeconds: round(segments.reduce((n, s) => n + s.seconds, 0)),
      filmSeconds: round(placeSegments(board).reduce((n, p) => n + p.frames, 0) / FPS, 3),
    },
    keyframes,
    segments,
    outputs,
    seams,
  };
}
