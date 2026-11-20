// CG runner (cg_and_video.md section 5): draws a storyboard's keyframes, renders its segments
// as a chain (each segment starts from the last frame the previous one decoded, and lands on
// a keyframe where the storyboard anchors it), then joins, scores and captions the film and
// cuts the in-game CGs out of it. Resumable: finished work is recorded in the board's state
// file under .local/cg_gen/<board>/ and skipped on the next run; a redo first drops the redone
// work and everything that depends on it from that file, so an interrupted redo resumes too.
//
//   npm run cg -- <command> assets/cg/storyboards/<board>.json [flags]
//   commands: keyframes | render | sheet | assemble | adopt <cg> | all
//   flags: --only <cg or reel>[,...]   only the shots of these cuts (and the keyframes they edit)
//          --redo <key>[,...]          redraw a keyframe `<shot>@<n>` or re-render a segment `<shot>#<n>`
//          --reroll <key>[,...]        the same with a new seed (another take)
//          --until <segment key>       stop after this segment
//          --pixel  --no-music  --no-captions   finishing options of the review cuts

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ffmpegPath } from '../assets/ffmpeg';
import { keyframeGraph, runGraph, segmentGraph, stageImage } from './comfy';
import {
  FPS,
  type FrameRef,
  keyframeOrder,
  keyframesNeeded,
  NO_STYLE,
  type PlacedSegment,
  placeSegments,
  refFile,
  SEGMENT_FRAMES,
  type SegmentPlan,
  type Shot,
  type Storyboard,
  segmentPlan,
  shotSeconds,
  stableSeed,
  staleClosure,
  storyboardProblems,
} from './storyboard';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FFMPEG = ffmpegPath() ?? 'ffmpeg';

interface State {
  keyframes: Record<string, { file: string; seconds: number; seed: number }>;
  segments: Record<string, { video: string; last: string; seconds: number; seed: number }>;
  /** takes asked for with --reroll, by key (the seed moves with each) */
  takes?: Record<string, number>;
}

interface Templates {
  styles: Record<string, { en?: string }>;
  templates: { bg_cg: { en: string } };
}

const templates = (): Templates =>
  JSON.parse(readFileSync(join(ROOT, 'assets/prompts/templates.json'), 'utf8')) as Templates;

function audioPath(id: string): string | null {
  for (const sub of ['music', 'ambience', 'sfx'])
    for (const ext of ['ogg', 'wav']) {
      const p = join(ROOT, `assets/processed/audio/${sub}/${id}.${ext}`);
      if (existsSync(p)) return p;
    }
  return null;
}

function loadBoard(path: string): Storyboard {
  const board = JSON.parse(readFileSync(path, 'utf8')) as Storyboard;
  const styles = templates().styles;
  const problems = storyboardProblems(board, {
    refExists: (r) =>
      r.startsWith('audio:') ? audioPath(r.slice(6)) !== null : existsSync(refFile(ROOT, r)),
    styleExists: (s) => s in styles,
  });
  if (problems.length) throw new Error(`storyboard problems:\n  ${problems.join('\n  ')}`);
  return board;
}

function workDir(board: Storyboard): string {
  return join(ROOT, '.local/cg_gen', board.id);
}

function loadState(board: Storyboard): State {
  const p = join(workDir(board), 'state.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { keyframes: {}, segments: {} };
}

function saveState(board: Storyboard, s: State): void {
  mkdirSync(workDir(board), { recursive: true });
  writeFileSync(join(workDir(board), 'state.json'), `${JSON.stringify(s, null, 2)}\n`);
}

function shotOf(board: Storyboard, id: string): Shot {
  const s = board.shots.find((x) => x.id === id);
  if (!s) throw new Error(`no shot ${id}`);
  return s;
}

const fileKey = (key: string) => key.replace(/[@#]/g, '_');

/** The seed of a key's current take. */
function seedOf(board: Storyboard, state: State, key: string): number {
  const take = state.takes?.[key] ?? 0;
  return (stableSeed(board.seed, key) + take * 1009) % 2147483647;
}

/**
 * Drop redone work and everything depending on it from the state before anything runs, and
 * save that, so the run (or a later one, if this one stops) renders exactly what is stale.
 */
function applyRedo(board: Storyboard, state: State, redo: string[], reroll: string[]): void {
  if (!redo.length && !reroll.length) return;
  const stale = staleClosure(board, [...redo, ...reroll]);
  state.takes ??= {};
  for (const k of reroll) state.takes[k] = (state.takes[k] ?? 0) + 1;
  for (const k of stale.keyframes) delete state.keyframes[k];
  for (const k of stale.segments) delete state.segments[k];
  saveState(board, state);
  console.log(
    `redo: ${stale.keyframes.size} keyframes, ${stale.segments.size} segments marked stale`,
  );
}

/** The bg_cg template with the shot's style pack (assets/prompts/templates.json). */
function keyframePrompt(board: Storyboard, key: string): string {
  const [shotId, b] = key.split('@');
  const shot = shotOf(board, shotId);
  const spec = shot.keyframes[b];
  const lib = templates();
  const style = shot.style === NO_STYLE ? '' : (lib.styles[shot.style]?.en ?? '');
  const subject = spec.edit
    ? `Edit of the first reference image: ${spec.prompt} Keep the same place, characters, palette and pixel art style`
    : spec.prompt;
  return lib.templates.bg_cg.en
    .replace('{subject}', subject.replace(/\.$/, ''))
    .replace('{style}', style)
    .replace('{extra}', '')
    .replace(/(\.\s*)+\./g, '.')
    .trim();
}

async function fitTo(src: string, dest: string, w: number, h: number): Promise<void> {
  await sharp(src).resize(w, h, { fit: 'cover', kernel: 'lanczos3' }).png().toFile(dest);
}

async function drawKeyframes(
  board: Storyboard,
  state: State,
  needed: Set<string> | null,
): Promise<void> {
  const dir = join(workDir(board), 'keyframes');
  mkdirSync(dir, { recursive: true });
  for (const key of keyframeOrder(board)) {
    if (state.keyframes[key]) continue;
    if (needed && !needed.has(key)) continue;
    const [shotId, b] = key.split('@');
    const spec = shotOf(board, shotId).keyframes[b];
    const out = join(dir, `${fileKey(key)}.png`);
    const started = Date.now();
    const seed = seedOf(board, state, key);
    if (spec.image) {
      await fitTo(
        refFile(ROOT, `image:${spec.image}`),
        out,
        board.keyframeSize[0],
        board.keyframeSize[1],
      );
    } else {
      const references: string[] = [];
      if (spec.edit) {
        const base = state.keyframes[spec.edit];
        if (!base) throw new Error(`${key} edits ${spec.edit}, which is not drawn`);
        references.push(stageImage(base.file));
      }
      for (const r of spec.refs ?? []) references.push(stageImage(refFile(ROOT, r)));
      const [w, h] = board.keyframeSize;
      const job = {
        prompt: keyframePrompt(board, key),
        references,
        width: w,
        height: h,
        seed,
        prefix: `hakoniwa_cg/${board.id}/${fileKey(key)}`,
      };
      const raw = join(dir, '_raw', fileKey(key));
      const res = await runGraph(keyframeGraph(job), raw, 20 * 60 * 1000);
      const png = res.files.save?.[0];
      if (!png) throw new Error(`${key}: no image saved`);
      await sharp(png).png().toFile(out);
      writeFileSync(join(raw, 'prompt.txt'), `${job.prompt}\n`);
    }
    state.keyframes[key] = { file: out, seconds: (Date.now() - started) / 1000, seed };
    saveState(board, state);
    console.log(`keyframe ${key} ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
}

function segmentPrompt(p: SegmentPlan): string {
  const ends = p.last ? ' and arrives exactly at the supplied last frame' : '';
  return (
    `Pixel art animation that starts from the supplied first frame${ends}. ${p.motion} ` +
    'Only the motion described happens: doors, objects, people and light not mentioned stay as they are. ' +
    'Keep the same hard-edged pixel art style, limited palette, characters, costumes and composition. ' +
    'Smooth continuous motion, one continuous shot, no cuts, no text, no lettering, no interface.'
  );
}

async function frameFile(board: Storyboard, state: State, ref: FrameRef): Promise<string> {
  if (ref.kind === 'segment') {
    const s = state.segments[ref.key];
    if (!s) throw new Error(`segment ${ref.key} is not rendered`);
    return s.last;
  }
  const k = state.keyframes[ref.key];
  if (!k) throw new Error(`keyframe ${ref.key} is not drawn`);
  const [w, h] = board.size;
  const out = join(workDir(board), 'cond', `${fileKey(ref.key)}_${w}x${h}.png`);
  mkdirSync(dirname(out), { recursive: true });
  await fitTo(k.file, out, w, h);
  return out;
}

async function renderSegments(
  board: Storyboard,
  state: State,
  until: string | null,
  only: Set<string> | null,
): Promise<void> {
  const plan = segmentPlan(board).filter((p) => !only || only.has(p.shot));
  for (const p of plan) {
    if (!state.segments[p.key]) {
      const first = stageImage(await frameFile(board, state, p.first));
      const last = p.last
        ? stageImage(await frameFile(board, state, { kind: 'keyframe', key: p.last }))
        : null;
      const [w, h] = board.size;
      const dir = join(workDir(board), 'segments', fileKey(p.key));
      const seed = seedOf(board, state, p.key);
      const res = await runGraph(
        segmentGraph({
          prompt: segmentPrompt(p),
          first,
          last,
          width: w,
          height: h,
          frames: SEGMENT_FRAMES,
          seed,
          prefix: `hakoniwa_cg/${board.id}/${fileKey(p.key)}`,
        }),
        dir,
        25 * 60 * 1000,
      );
      const video = res.files.save?.[0];
      const tail = res.files.saveTail?.[0];
      if (!video || !tail)
        throw new Error(`${p.key}: missing outputs ${JSON.stringify(res.files)}`);
      writeFileSync(join(dir, 'prompt.txt'), `${segmentPrompt(p)}\n`);
      state.segments[p.key] = { video, last: tail, seconds: res.seconds, seed };
      saveState(board, state);
      console.log(`segment ${p.key} ${res.seconds.toFixed(0)} s${p.last ? ` -> ${p.last}` : ''}`);
    }
    if (until && p.key === until) break;
  }
}

function ff(args: string[], cwd?: string): void {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
}

interface Placed {
  shot: Shot;
  start: number;
  end: number;
}

/** Where every shot of the run sits on its timeline (seconds), from the segment placement. */
function timeline(shots: Shot[], placed: PlacedSegment[]): Placed[] {
  return shots.map((shot) => {
    const own = placed.filter((p) => p.shot === shot.id);
    const start = own[0].start / FPS;
    const end = (own[own.length - 1].start + own[own.length - 1].frames) / FPS;
    return { shot, start, end };
  });
}

function assTime(s: number): string {
  const cs = Math.round(s * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  const frac = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
}

/** A caption as ASS dialogue text: override braces and line breaks are not taken literally. */
const assText = (text: string): string =>
  text.replace(/[{}]/g, '').replace(/\\/g, '').replace(/\r?\n/g, '\\N');

function subtitles(shots: Placed[], placed: PlacedSegment[], file: string): boolean {
  const events: string[] = [];
  for (const p of shots)
    for (const c of p.shot.captions ?? []) {
      const seg = placed.find((x) => x.shot === p.shot.id && x.index === c.seg);
      if (!seg) continue;
      const at = seg.start / FPS + 0.3;
      const end = Math.min(at + (c.seconds ?? 3), p.end + 1.5);
      events.push(`Dialogue: 0,${assTime(at)},${assTime(end)},Cap,,0,0,0,,${assText(c.text)}`);
    }
  if (!events.length) return false;
  const head = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Cap,Microsoft YaHei,52,&H00F4F0E6,&H00F4F0E6,&H00101010,&H80000000,0,0,0,0,100,100,2,0,1,3,1,2,80,80,70,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  writeFileSync(file, `${[...head, ...events].join('\n')}\n`);
  return true;
}

/**
 * Join the segments of a run into one silent master (a continuing segment drops frame 0). A
 * trimmed part is named after the take it came from, so a re-rendered segment never reuses
 * the part of the old take.
 */
function joinSegments(state: State, placed: PlacedSegment[], dir: string, out: string): void {
  mkdirSync(dir, { recursive: true });
  const list: string[] = [];
  for (const p of placed) {
    const seg = state.segments[p.key];
    if (!seg) throw new Error(`segment ${p.key} is not rendered`);
    const take = basename(seg.video).replace(/\.[^.]+$/, '');
    const part = join(dir, `${fileKey(p.key)}__${take}${p.drops ? '_t' : ''}.mp4`);
    if (!existsSync(part))
      ff([
        '-i',
        seg.video,
        '-vf',
        p.drops ? 'trim=start_frame=1,setpts=PTS-STARTPTS' : 'setpts=PTS-STARTPTS',
        '-an',
        '-c:v',
        'libx264',
        '-crf',
        '10',
        '-preset',
        'medium',
        '-pix_fmt',
        'yuv420p',
        '-r',
        String(FPS),
        part,
      ]);
    list.push(`file '${part.replace(/\\/g, '/')}'`);
  }
  const listFile = join(
    dir,
    `list_${placed[0].key}_${placed[placed.length - 1].key}.txt`.replace(/#/g, '_'),
  );
  writeFileSync(listFile, `${list.join('\n')}\n`);
  ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]);
}

/** Music and ambience cues placed on the timeline: each runs until the next of its kind. */
function scoreArgs(placed: Placed[], total: number): { inputs: string[]; filter: string } | null {
  type Cue = { id: string; start: number; fadeIn: number; gain: number; kind: 'm' | 'a' };
  const cues: Cue[] = [];
  for (const p of placed) {
    if (p.shot.music)
      cues.push({
        id: p.shot.music.id,
        start: p.start,
        fadeIn: p.shot.music.fadeIn ?? 2,
        gain: p.shot.music.gain ?? 0.9,
        kind: 'm',
      });
    if (p.shot.ambience !== undefined)
      cues.push({ id: p.shot.ambience ?? '', start: p.start, fadeIn: 1.5, gain: 0.45, kind: 'a' });
  }
  const inputs: string[] = [];
  const parts: string[] = [];
  const labels: string[] = [];
  cues.forEach((c, n) => {
    if (!c.id) return;
    const file = audioPath(c.id);
    if (!file) {
      console.warn(`score: ${c.id} has no processed audio, skipped`);
      return;
    }
    const next = cues.slice(n + 1).find((x) => x.kind === c.kind);
    const end = Math.min(next ? next.start + 1.5 : total, total);
    const dur = Math.max(0.5, end - c.start);
    // input 0 is the video; every cue adds one looped audio input after it
    const input = labels.length + 1;
    inputs.push('-stream_loop', '-1', '-i', file);
    const lab = `c${labels.length}`;
    const ms = Math.round(c.start * 1000);
    parts.push(
      `[${input}:a]atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=${c.fadeIn},` +
        `afade=t=out:st=${Math.max(0, dur - 2).toFixed(3)}:d=2,volume=${c.gain},` +
        `adelay=${ms}|${ms}[${lab}]`,
    );
    labels.push(`[${lab}]`);
  });
  if (!labels.length) return null;
  const filter = `${parts.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0,atrim=0:${total.toFixed(3)}[aout]`;
  return { inputs, filter };
}

interface FinishOptions {
  pixel: boolean;
  music: boolean;
  captions: boolean;
  /** the in-game take: the model's own size, silent, no fades (the CG layer fades it) */
  native?: boolean;
}

/** Render a run of shots into a finished file: pixel pass, captions, score. */
function finish(
  board: Storyboard,
  state: State,
  shots: Shot[],
  out: string,
  opts: FinishOptions,
): number {
  const dir = join(workDir(board), 'joined');
  const ids = shots.map((s) => s.id);
  const placed = placeSegments(board, ids);
  const master = join(dir, `master_${ids[0]}_${ids[ids.length - 1]}.mp4`);
  joinSegments(state, placed, dir, master);
  const lines = timeline(shots, placed);
  const total = lines[lines.length - 1].end;
  const vf: string[] = [];
  if (opts.native) vf.push('null');
  else if (opts.pixel) vf.push('scale=480:270:flags=area', 'scale=1920:1080:flags=neighbor');
  else vf.push('scale=1920:1080:flags=lanczos');
  const assFile = `captions_${ids[0]}_${ids[ids.length - 1]}.ass`;
  if (opts.captions && subtitles(lines, placed, join(dir, assFile)))
    vf.push(`subtitles=${assFile}`);
  if (!opts.native)
    vf.push('fade=t=in:st=0:d=0.6', `fade=t=out:st=${Math.max(0, total - 1).toFixed(3)}:d=1`);
  const score = opts.music ? scoreArgs(lines, total) : null;
  const args = ['-i', master, ...(score?.inputs ?? [])];
  if (score)
    args.push(
      '-filter_complex',
      `[0:v]${vf.join(',')}[vout];${score.filter}`,
      '-map',
      '[vout]',
      '-map',
      '[aout]',
    );
  else args.push('-vf', vf.join(','), '-an');
  args.push('-c:v', 'libx264', '-crf', opts.native ? '14' : '18', '-preset', 'slow');
  args.push('-pix_fmt', 'yuv420p');
  if (score) args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart', resolve(out));
  mkdirSync(dirname(resolve(out)), { recursive: true });
  ff(args, dir);
  return total;
}

async function sheet(board: Storyboard, state: State): Promise<string> {
  // keyframe 0 and every segment's last frame, one row per shot
  const rows: string[][] = board.shots.map((shot) => {
    const row: string[] = [];
    const k0 = state.keyframes[`${shot.id}@0`];
    if (k0) row.push(k0.file);
    for (let i = 0; i < shot.segments; i++) {
      const seg = state.segments[`${shot.id}#${i}`];
      if (seg) row.push(seg.last);
    }
    return row;
  });
  const tw = 256;
  const th = 144;
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const composites: { input: Buffer; left: number; top: number }[] = [];
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++)
      composites.push({
        input: await sharp(rows[y][x]).resize(tw, th).png().toBuffer(),
        left: x * tw,
        top: y * th,
      });
  const out = join(workDir(board), 'sheet.jpg');
  await sharp({
    create: { width: cols * tw, height: rows.length * th, channels: 3, background: '#101418' },
  })
    .composite(composites)
    .jpeg({ quality: 88 })
    .toFile(out);
  return out;
}

function cutShots(board: Storyboard, cutId: string): Shot[] {
  const cut = [...(board.cgs ?? []), ...(board.reels ?? [])].find((c) => c.id === cutId);
  if (!cut) throw new Error(`no cg or reel ${cutId} in ${board.id}`);
  return cut.shots.map((id) => shotOf(board, id));
}

async function main(): Promise<void> {
  const [cmd, file, extra] = process.argv.slice(2);
  const flag = (name: string) => process.argv.includes(`--${name}`);
  const list = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return (i >= 0 ? (process.argv[i + 1] ?? '') : '').split(',').filter(Boolean);
  };
  if (!cmd || !file)
    throw new Error('usage: run.ts <keyframes|render|sheet|assemble|adopt|all> <board.json>');
  const board = loadBoard(file);
  const state = loadState(board);
  applyRedo(board, state, list('redo'), list('reroll'));
  const onlyCuts = list('only');
  const only = onlyCuts.length
    ? new Set(onlyCuts.flatMap((id) => cutShots(board, id).map((s) => s.id)))
    : null;
  const opts = { pixel: flag('pixel'), music: !flag('no-music'), captions: !flag('no-captions') };
  if (cmd === 'keyframes' || cmd === 'all')
    await drawKeyframes(board, state, only ? keyframesNeeded(board, only) : null);
  if (cmd === 'render' || cmd === 'all')
    await renderSegments(board, state, list('until')[0] ?? null, only);
  if (cmd === 'sheet' || cmd === 'all') console.log(`sheet ${await sheet(board, state)}`);
  if (cmd === 'assemble' || cmd === 'all') {
    const outDir = join(ROOT, 'assets/_candidates/video', board.id);
    const done = (s: Shot) =>
      Array.from({ length: s.segments }, (_, i) => state.segments[`${s.id}#${i}`]).every(Boolean);
    if (board.shots.every(done)) {
      const secs = finish(board, state, board.shots, join(outDir, `${board.id}.mp4`), opts);
      console.log(
        `film ${board.id} ${secs.toFixed(1)} s (planned ${shotSeconds(board).toFixed(1)} s)`,
      );
    } else
      console.log(
        `film ${board.id}: ${board.shots.filter(done).length}/${board.shots.length} shots rendered, skipped`,
      );
    for (const cg of board.cgs ?? []) {
      const shots = cutShots(board, cg.id);
      if (!shots.every(done)) continue;
      const dir = join(ROOT, 'assets/_candidates/video', cg.id);
      // the in-game take is silent and uncaptioned: the scene plays its own music and lines
      const secs = finish(board, state, shots, join(dir, `${cg.id}.mp4`), {
        ...opts,
        music: false,
        captions: false,
        native: true,
      });
      finish(board, state, shots, join(dir, `${cg.id}_review.mp4`), opts);
      console.log(`cg ${cg.id} ${secs.toFixed(1)} s`);
    }
    for (const reel of board.reels ?? []) {
      const shots = cutShots(board, reel.id);
      if (!shots.every(done)) continue;
      const secs = finish(board, state, shots, join(outDir, `${reel.id}.mp4`), opts);
      console.log(`reel ${reel.id} ${secs.toFixed(1)} s`);
    }
  }
  if (cmd === 'adopt') {
    if (!extra) throw new Error('adopt needs a cg id');
    const src = join(ROOT, 'assets/_candidates/video', extra, `${extra}.mp4`);
    if (!existsSync(src)) throw new Error(`${src} is not assembled`);
    const dest = join(ROOT, 'assets/cg/media');
    mkdirSync(dest, { recursive: true });
    ff(['-i', src, '-c', 'copy', join(dest, `${extra}.mp4`)]);
    ff(['-i', src, '-frames:v', '1', join(dest, `${extra}.png`)]);
    const indexFile = join(dest, 'index.json');
    const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};
    const shots = cutShots(board, extra);
    index[extra] = {
      video: `cg/media/${extra}.mp4`,
      poster: `cg/media/${extra}.png`,
      seconds: Number(
        shotSeconds(
          board,
          shots.map((s) => s.id),
        ).toFixed(3),
      ),
      board: board.id,
    };
    writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
    console.log(`adopted ${extra}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
