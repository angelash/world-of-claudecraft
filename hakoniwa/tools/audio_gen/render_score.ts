// Render a loop score to MIDI and WAV: the score-first half of the music pilot.
//
//   node ../node_modules/tsx/dist/cli.mjs tools/audio_gen/render_score.ts [scoreId]
//
// Writes to .local/audio_pilot/<scoreId>/render/ (gitignored):
//   <id>.mid                 one loop, all layers, unhumanized, for a DAW
//   <id>_L<n>.mid            one loop per layer
//   <id>_full_x2.wav         two loops plus a two-bar tail: the cover-pass source
//   <id>_{full,L1,L2,L3}_loop.wav  exact loop bodies cut from the second repeat, so the
//                            head already carries the previous pass's reverb tail
// Loop files share one gain (the full mix normalized to -18 LUFS), so the stems keep
// their ratio and still sum to the mix (audio_direction.md sections 5.2, 11.2 to 11.4).
//
// Renderer: FluidSynth with a General MIDI SoundFont, located through
// HAKONIWA_FLUIDSYNTH and HAKONIWA_SOUNDFONT (defaults: the E:/AI/audio_tools install).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureLoudness } from './ffmpeg';
import { cutLoopFromDoubleRender } from './loops';
import { loopSeconds, type Score, scoreProblems, scoreToMidi } from './score';
import { SCORES } from './scores';
import { frameCount, readWav, writeWav } from './wav';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FLUIDSYNTH =
  process.env.HAKONIWA_FLUIDSYNTH ||
  'E:/AI/audio_tools/fluidsynth/fluidsynth-v2.6.2-win10-x64-cpp11/bin/fluidsynth.exe';
const SOUNDFONT =
  process.env.HAKONIWA_SOUNDFONT || 'E:/AI/audio_tools/soundfonts/GeneralUser-GS.sf2';
const SAMPLE_RATE = 48000;
const HUMANIZE_SEED = 20261117;
const MUSIC_TARGET_LUFS = -18;
/** 20 ms seam crossfade (section 11.2 allows 10 to 50 ms). */
const SEAM_FADE_FRAMES = Math.round(0.02 * SAMPLE_RATE);

export function renderOutDir(scoreId: string): string {
  return join(ROOT, '.local', 'audio_pilot', scoreId, 'render');
}

function fluidsynth(midiPath: string, wavPath: string): void {
  execFileSync(
    FLUIDSYNTH,
    [
      '-ni',
      '-q',
      '-g',
      '0.45',
      '-r',
      String(SAMPLE_RATE),
      '-O',
      's16',
      '-T',
      'wav',
      '-o',
      'synth.reverb.room-size=0.55',
      '-o',
      'synth.reverb.damp=0.35',
      '-o',
      'synth.reverb.width=0.9',
      '-o',
      'synth.reverb.level=0.75',
      '-o',
      'synth.chorus.active=0',
      '-F',
      wavPath,
      SOUNDFONT,
      midiPath,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function layersOf(score: Score): number[] {
  return [...new Set(score.parts.map((p) => p.layer))].sort((a, b) => a - b);
}

export interface RenderResult {
  outDir: string;
  coverSource: string;
  loops: Record<string, string>;
  loopFrames: number;
  gainDb: number;
}

export function renderScore(score: Score): RenderResult {
  const problems = scoreProblems(score);
  if (problems.length > 0)
    throw new Error(`Score ${score.id} is malformed:\n${problems.join('\n')}`);
  const outDir = renderOutDir(score.id);
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, `${score.id}.mid`), scoreToMidi(score));
  const layers = layersOf(score);
  for (const layer of layers) {
    writeFileSync(
      join(outDir, `${score.id}_L${layer}.mid`),
      scoreToMidi(score, { layers: [layer] }),
    );
  }

  const loopFrames = Math.round(loopSeconds(score) * SAMPLE_RATE);
  const targets: Array<[string, number[] | undefined]> = [
    ['full', undefined],
    ...layers.map((l): [string, number[]] => [`L${l}`, [l]]),
  ];
  const raw: Record<string, ReturnType<typeof readWav>> = {};
  for (const [name, selected] of targets) {
    const midiPath = join(outDir, `_render_${name}.mid`);
    const wavPath = join(outDir, `_render_${name}.wav`);
    writeFileSync(
      midiPath,
      scoreToMidi(score, {
        layers: selected,
        repeats: 2,
        tailBars: 2,
        humanizeSeed: HUMANIZE_SEED,
      }),
    );
    fluidsynth(midiPath, wavPath);
    raw[name] = readWav(readFileSync(wavPath));
    if (raw[name].sampleRate !== SAMPLE_RATE)
      throw new Error(`Unexpected rate ${raw[name].sampleRate}`);
    if (frameCount(raw[name]) < 2 * loopFrames)
      throw new Error(`${name} render is shorter than two loops`);
  }

  // One gain for every loop file: the full mix lands on the music target.
  const fullLoopPath = join(outDir, '_full_loop_raw.wav');
  writeFileSync(
    fullLoopPath,
    writeWav(cutLoopFromDoubleRender(raw.full, loopFrames, SEAM_FADE_FRAMES)),
  );
  const gainDb = MUSIC_TARGET_LUFS - measureLoudness(fullLoopPath).integrated;
  const gain = 10 ** (gainDb / 20);

  const loops: Record<string, string> = {};
  for (const [name] of targets) {
    const loop = cutLoopFromDoubleRender(raw[name], loopFrames, SEAM_FADE_FRAMES);
    for (let i = 0; i < loop.samples.length; i++) loop.samples[i] *= gain;
    const path = join(outDir, `${score.id}_${name}_loop.wav`);
    writeFileSync(path, writeWav(loop));
    loops[name] = path;
  }
  const full = raw.full;
  for (let i = 0; i < full.samples.length; i++) full.samples[i] *= gain;
  const coverSource = join(outDir, `${score.id}_full_x2.wav`);
  writeFileSync(coverSource, writeWav(full));
  return { outDir, coverSource, loops, loopFrames, gainDb };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const id = process.argv[2] ?? 'mus_town_borderstone_day';
  const score = SCORES[id];
  if (!score) throw new Error(`Unknown score ${id}; known: ${Object.keys(SCORES).join(', ')}`);
  const result = renderScore(score);
  const reading = measureLoudness(result.loops.full);
  console.log(
    JSON.stringify(
      {
        score: id,
        outDir: result.outDir,
        loopSeconds: result.loopFrames / SAMPLE_RATE,
        gainDb: Number(result.gainDb.toFixed(2)),
        fullLoop: { lufs: reading.integrated, truePeak: reading.truePeak },
        files: result.loops,
        coverSource: result.coverSource,
      },
      null,
      2,
    ),
  );
}
