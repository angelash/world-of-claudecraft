// CG storyboards (docs/40_design/cg_and_video.md section 4): a film is a list of shots, a
// shot a run of segments the local video model renders three seconds at a time. A segment
// starts from the frame the previous one ended on (the chain), and a designed keyframe on a
// segment boundary pulls the segment's end there (the anchor), so a long chain cannot drift
// further than the anchor spacing allows. Pure: loading, checking and planning the render
// order; the runner (./run.ts) does the work.

/** Frames of one segment at 24 fps (the model's 17k+5 grid; 73 frames is about 3 s). */
export const SEGMENT_FRAMES = 73;
export const FPS = 24;
/** Consecutive segments without an anchor before the chain must land on a keyframe. */
export const MAX_FREE_SEGMENTS = 3;

export interface KeyframeSpec {
  /** what the frame shows (subject, staging, light); the style text is added by the runner */
  prompt: string;
  /** reference images: `art_chr_<id>_ref` sheets, `style:<pack>` style boards */
  refs?: string[];
  /** edit another keyframe (`<shot>@<boundary>`) instead of drawing from text alone */
  edit?: string;
  /** an existing image under assets/ to use as is (a still that already passed review) */
  image?: string;
}

export interface Caption {
  /** segment index inside the shot the caption starts in */
  seg: number;
  text: string;
  /** seconds on screen (default 3) */
  seconds?: number;
}

export interface Shot {
  id: string;
  /** the style pack (assets/prompts/templates.json styles) the keyframes are drawn in */
  style: string;
  segments: number;
  /** true: a cut, the shot opens on its own keyframe 0; false: it continues the last frame */
  cut: boolean;
  /** designed frames by segment boundary (0 to segments) */
  keyframes: Record<string, KeyframeSpec>;
  /** one motion prompt per segment: what moves, how the camera moves */
  motion: string[];
  captions?: Caption[];
  /** music (an audio id under assets/processed/audio) that starts on this shot */
  music?: { id: string; fadeIn?: number; gain?: number };
  /** ambience bed that starts on this shot (null stops it) */
  ambience?: string | null;
}

/** An in-game CG is a run of the film's shots (cg_and_video.md section 3). */
export interface CgCut {
  id: string;
  shots: string[];
}

export interface Storyboard {
  id: string;
  title: string;
  seed: number;
  /** video size (the model renders on a 32 px grid) */
  size: [number, number];
  /** keyframe drawing size, scaled down to `size` for conditioning */
  keyframeSize: [number, number];
  shots: Shot[];
  cgs?: CgCut[];
  /** review cuts of the film (the graded trials, cg_and_video.md 7): scored and captioned */
  reels?: CgCut[];
}

export interface FrameRef {
  kind: 'keyframe' | 'segment';
  /** keyframe: `<shot>@<boundary>`; segment: `<shot>#<index>` (its last frame) */
  key: string;
}

export interface SegmentPlan {
  key: string;
  shot: string;
  index: number;
  first: FrameRef;
  /** the keyframe the segment must end on, when its end boundary has one */
  last: string | null;
  motion: string;
  seed: number;
}

export const keyframeKey = (shot: string, boundary: number): string => `${shot}@${boundary}`;
export const segmentKey = (shot: string, index: number): string => `${shot}#${index}`;

/** FNV-1a, so a segment keeps its seed when shots are added before it. */
export function stableSeed(base: number, text: string): number {
  let h = 0x811c9dc5 ^ base;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 2147483647;
}

/** Every keyframe in drawing order: a keyframe that edits another comes after it. */
export function keyframeOrder(board: Storyboard): string[] {
  const all = new Map<string, KeyframeSpec>();
  for (const s of board.shots)
    for (const [b, k] of Object.entries(s.keyframes)) all.set(keyframeKey(s.id, Number(b)), k);
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (key: string, stack: string[]): void => {
    if (seen.has(key)) return;
    if (stack.includes(key)) throw new Error(`keyframe edit cycle: ${[...stack, key].join(' > ')}`);
    const k = all.get(key);
    if (!k) return;
    if (k.edit) visit(k.edit, [...stack, key]);
    seen.add(key);
    out.push(key);
  };
  for (const key of all.keys()) visit(key, []);
  return out;
}

/** The render order of every segment, with where its first frame comes from. */
export function segmentPlan(board: Storyboard): SegmentPlan[] {
  const out: SegmentPlan[] = [];
  let prev: string | null = null;
  for (const shot of board.shots) {
    for (let i = 0; i < shot.segments; i++) {
      const key = segmentKey(shot.id, i);
      let first: FrameRef;
      if (i === 0 && shot.cut) first = { kind: 'keyframe', key: keyframeKey(shot.id, 0) };
      else if (prev) first = { kind: 'segment', key: prev };
      else throw new Error(`${key} has nothing to start from`);
      const end = shot.keyframes[String(i + 1)] ? keyframeKey(shot.id, i + 1) : null;
      out.push({
        key,
        shot: shot.id,
        index: i,
        first,
        last: end,
        motion: shot.motion[i] ?? '',
        seed: stableSeed(board.seed, key),
      });
      prev = key;
    }
  }
  return out;
}

/** One segment placed on a joined run of shots. */
export interface PlacedSegment {
  key: string;
  shot: string;
  index: number;
  /** frame of the joined run its first shown frame lands on */
  start: number;
  /** frames it contributes */
  frames: number;
  /** a continuing segment drops its first frame (the last one the run already showed) */
  drops: boolean;
}

/**
 * The one rule for joining: within a run of shots every segment after the first drops its
 * first frame unless it opens a cut. Durations, captions and the join all read this.
 */
export function placeSegments(board: Storyboard, shotIds?: readonly string[]): PlacedSegment[] {
  const out: PlacedSegment[] = [];
  let at = 0;
  for (const shot of board.shots) {
    if (shotIds && !shotIds.includes(shot.id)) continue;
    for (let i = 0; i < shot.segments; i++) {
      const drops = out.length > 0 && !(i === 0 && shot.cut);
      const frames = drops ? SEGMENT_FRAMES - 1 : SEGMENT_FRAMES;
      out.push({ key: segmentKey(shot.id, i), shot: shot.id, index: i, start: at, frames, drops });
      at += frames;
    }
  }
  return out;
}

/** Seconds a run of shots lasts once joined. */
export function shotSeconds(board: Storyboard, shotIds?: readonly string[]): number {
  return placeSegments(board, shotIds).reduce((n, p) => n + p.frames, 0) / FPS;
}

/** Keyframes the given shots need drawn: their own and every keyframe they edit, transitively. */
export function keyframesNeeded(board: Storyboard, shotIds: ReadonlySet<string>): Set<string> {
  const spec = new Map<string, KeyframeSpec>();
  for (const s of board.shots)
    for (const [b, k] of Object.entries(s.keyframes)) spec.set(keyframeKey(s.id, Number(b)), k);
  const out = new Set<string>();
  const add = (key: string): void => {
    if (out.has(key) || !spec.has(key)) return;
    out.add(key);
    const base = spec.get(key)?.edit;
    if (base) add(base);
  };
  for (const key of spec.keys()) if (shotIds.has(key.split('@')[0])) add(key);
  return out;
}

/**
 * What redoing `keys` makes stale: those keyframes and every keyframe editing them
 * (transitively); those segments, and every segment starting from a stale keyframe or a stale
 * segment or ending on a stale keyframe, in render order across the whole film.
 */
export function staleClosure(
  board: Storyboard,
  keys: Iterable<string>,
): { keyframes: Set<string>; segments: Set<string> } {
  const keyframes = new Set<string>();
  const segments = new Set<string>();
  for (const k of keys) (k.includes('@') ? keyframes : segments).add(k);
  const edits: [string, string][] = [];
  for (const s of board.shots)
    for (const [b, k] of Object.entries(s.keyframes))
      if (k.edit) edits.push([keyframeKey(s.id, Number(b)), k.edit]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [key, base] of edits)
      if (keyframes.has(base) && !keyframes.has(key)) {
        keyframes.add(key);
        grew = true;
      }
  }
  for (const p of segmentPlan(board)) {
    const from = p.first.kind === 'keyframe' ? keyframes : segments;
    if (from.has(p.first.key) || (p.last !== null && keyframes.has(p.last))) segments.add(p.key);
  }
  return { keyframes, segments };
}

/** Where a storyboard reference lives under the project root (`audio:` names an audio id). */
export function refFile(root: string, ref: string): string {
  if (ref.startsWith('style:'))
    return `${root}/assets/art/backgrounds/cg/art_style_${ref.slice(6)}.png`;
  if (ref.startsWith('image:')) return `${root}/assets/${ref.slice(6)}`;
  return `${root}/assets/art/characters/ref/${ref}.png`;
}

/** A style that adds no style text: dark voids and open sky, where a pack's scenery leaks in. */
export const NO_STYLE = 'void';

const FORBIDDEN = /[\u2013\u2014\u2015\u2600-\u27bf]|\p{Extended_Pictographic}/u;
const BOUNDARY = /^(0|[1-9]\d*)$/;

export interface BoardLookups {
  /** a reference (`art_chr_*_ref`, `style:<pack>`, `image:<path>`, `audio:<id>`) resolves */
  refExists?: (ref: string) => boolean;
  /** a style pack is known (NO_STYLE is always allowed) */
  styleExists?: (style: string) => boolean;
}

/** Everything wrong with a storyboard. Empty means the runner can render it. */
export function storyboardProblems(board: Storyboard, look: BoardLookups = {}): string[] {
  const refExists = look.refExists ?? (() => true);
  const styleExists = look.styleExists ?? (() => true);
  const out: string[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const s of board.shots)
    for (const b of Object.keys(s.keyframes)) keys.add(keyframeKey(s.id, Number(b)));
  if (board.size.some((n) => n % 32 !== 0)) out.push(`size ${board.size} is off the 32 px grid`);
  if (board.keyframeSize.some((n) => n % 16 !== 0))
    out.push(`keyframeSize ${board.keyframeSize} is off the 16 px grid`);
  let free = 0;
  board.shots.forEach((s, n) => {
    const at = `shot ${s.id}`;
    if (ids.has(s.id)) out.push(`${at}: duplicate id`);
    ids.add(s.id);
    if (!/^s\d{2}[a-z]?_[a-z0-9_]+$/.test(s.id)) out.push(`${at}: id is not s<nn>_<slug>`);
    if (!Number.isInteger(s.segments) || s.segments < 1) out.push(`${at}: segments must be >= 1`);
    if (s.motion.length !== s.segments)
      out.push(`${at}: ${s.motion.length} motion prompts for ${s.segments} segments`);
    if (n === 0 && !s.cut) out.push(`${at}: the first shot must be a cut`);
    if (s.cut && !s.keyframes['0']) out.push(`${at}: a cut needs keyframe 0`);
    if (!s.cut && s.keyframes['0']) out.push(`${at}: a continuing shot cannot have keyframe 0`);
    if (s.style !== NO_STYLE && !styleExists(s.style)) out.push(`${at}: unknown style ${s.style}`);
    // the chain runs on across a continuing shot, so the count of free segments does too
    if (s.cut) free = 0;
    for (let i = 0; i < s.segments; i++) {
      free = s.keyframes[String(i + 1)] ? 0 : free + 1;
      if (free > MAX_FREE_SEGMENTS)
        out.push(`${at}: more than ${MAX_FREE_SEGMENTS} segments in a row without an anchor`);
    }
    for (const [b, k] of Object.entries(s.keyframes)) {
      const where = `${at} keyframe ${b}`;
      if (!BOUNDARY.test(b) || Number(b) > s.segments) out.push(`${where}: off the shot`);
      if (!k.prompt.trim() && !k.image) out.push(`${where}: no prompt`);
      if (k.image && k.edit) out.push(`${where}: an image keyframe cannot also edit`);
      if (k.edit && !keys.has(k.edit)) out.push(`${where}: edits unknown keyframe ${k.edit}`);
      for (const r of k.refs ?? [])
        if (!refExists(r)) out.push(`${where}: reference ${r} is missing`);
      if (k.image && !refExists(`image:${k.image}`))
        out.push(`${where}: image ${k.image} is missing`);
    }
    for (const c of s.captions ?? []) {
      if (!Number.isInteger(c.seg) || c.seg < 0 || c.seg >= s.segments)
        out.push(`${at}: caption outside the shot`);
      if (FORBIDDEN.test(c.text)) out.push(`${at}: caption has a forbidden character`);
    }
    if (s.music && !refExists(`audio:${s.music.id}`))
      out.push(`${at}: music ${s.music.id} is missing`);
    if (s.ambience && !refExists(`audio:${s.ambience}`))
      out.push(`${at}: ambience ${s.ambience} is missing`);
    for (const text of [...s.motion, ...Object.values(s.keyframes).map((k) => k.prompt)])
      if (FORBIDDEN.test(text)) out.push(`${at}: prompt has a forbidden character`);
  });
  try {
    keyframeOrder(board);
  } catch (e) {
    out.push((e as Error).message);
  }
  const shotIndex = new Map(board.shots.map((s, i) => [s.id, i]));
  const cuts = [
    ...(board.cgs ?? []).map((c) => ({ c, re: /^cg_[a-z0-9_]+$/, what: 'cg_<slug>' })),
    ...(board.reels ?? []).map((c) => ({ c, re: /^reel_[a-z0-9_]+$/, what: 'reel_<slug>' })),
  ];
  const cutIds = new Set<string>();
  for (const { c: cg, re, what } of cuts) {
    if (!re.test(cg.id)) out.push(`cg ${cg.id}: id is not ${what}`);
    if (cutIds.has(cg.id)) out.push(`cg ${cg.id}: duplicate id`);
    cutIds.add(cg.id);
    if (cg.shots.length === 0) {
      out.push(`cg ${cg.id}: no shots`);
      continue;
    }
    const idx = cg.shots.map((id) => shotIndex.get(id));
    if (idx.some((i) => i === undefined)) out.push(`cg ${cg.id}: unknown shot`);
    else if (idx.some((i, k) => k > 0 && i !== (idx[k - 1] as number) + 1))
      out.push(`cg ${cg.id}: shots are not consecutive`);
    else if (!board.shots[idx[0] as number].cut) out.push(`cg ${cg.id}: does not open on a cut`);
  }
  return out;
}
