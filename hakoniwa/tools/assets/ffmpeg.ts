// Decoder and encoder adapter for the audio branch (release_engineering.md 9.5): the ffmpeg
// static binary the repository root already ships (ffmpeg-static), or HAKONIWA_FFMPEG, or an
// ffmpeg on PATH. Decodes any input to 48 kHz float PCM and encodes Ogg Vorbis with Vorbis
// comments, bit-exact flags on so the same PCM and ffmpeg build give the same file.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let cached: string | null | undefined;

export function ffmpegPath(): string | null {
  if (cached !== undefined) return cached;
  const candidates: string[] = [];
  if (process.env.HAKONIWA_FFMPEG) candidates.push(process.env.HAKONIWA_FFMPEG);
  try {
    const p = createRequire(import.meta.url)('ffmpeg-static') as unknown;
    if (typeof p === 'string') candidates.push(p);
  } catch {
    // not installed at the repository root
  }
  candidates.push('ffmpeg');
  for (const c of candidates) {
    if (c !== 'ffmpeg' && !existsSync(c)) continue;
    const r = spawnSync(c, ['-hide_banner', '-version'], { encoding: 'utf8' });
    if (r.status === 0) {
      cached = c;
      return c;
    }
  }
  cached = null;
  return null;
}

function probeChannels(bin: string, file: string): number {
  const probe = spawnSync(bin, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Audio:.*?(\d+) Hz, (mono|stereo|(\d+) channels)/.exec(probe.stderr ?? '');
  return m ? (m[2] === 'mono' ? 1 : m[2] === 'stereo' ? 2 : Number(m[3])) : 2;
}

/** Decode a file to planar float PCM at `sampleRate` (channel count kept unless given). */
export function decodeAudio(file: string, sampleRate: number, channels?: number): Float32Array[] {
  const bin = ffmpegPath();
  if (!bin)
    throw new Error(
      'ffmpeg is not available (install the root dependencies or set HAKONIWA_FFMPEG)',
    );
  const ch = channels ?? probeChannels(bin, file);
  const r = spawnSync(
    bin,
    [
      '-v',
      'error',
      '-i',
      file,
      '-f',
      'f32le',
      '-acodec',
      'pcm_f32le',
      '-ac',
      String(ch),
      '-ar',
      String(sampleRate),
      'pipe:1',
    ],
    {
      maxBuffer: 2 ** 31,
    },
  );
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${String(r.stderr)}`);
  const buf = r.stdout as Buffer;
  const frames = Math.floor(buf.length / 4 / ch);
  const out = Array.from({ length: ch }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < ch; c++) out[c]![i] = buf.readFloatLE((i * ch + c) * 4);
  return out;
}

/** Encode planar PCM to Ogg Vorbis at quality `q` with the given Vorbis comments. */
export function encodeOgg(
  pcm: Float32Array[],
  sampleRate: number,
  outFile: string,
  q: number,
  comments: Record<string, string>,
): void {
  const bin = ffmpegPath();
  if (!bin) throw new Error('ffmpeg is not available');
  const ch = pcm.length;
  const n = pcm[0]?.length ?? 0;
  const buf = Buffer.alloc(n * ch * 4);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++)
      buf.writeFloatLE(Math.max(-1, Math.min(1, pcm[c]![i]!)), (i * ch + c) * 4);
  const meta = Object.entries(comments).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]);
  const r = spawnSync(
    bin,
    [
      '-y',
      '-v',
      'error',
      '-f',
      'f32le',
      '-ar',
      String(sampleRate),
      '-ac',
      String(ch),
      '-i',
      'pipe:0',
      '-map_metadata',
      '-1',
      '-c:a',
      'libvorbis',
      '-q:a',
      String(q),
      '-fflags',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      ...meta,
      outFile,
    ],
    { input: buf, maxBuffer: 1 << 26 },
  );
  if (r.status !== 0) throw new Error(`ffmpeg could not encode ${outFile}: ${String(r.stderr)}`);
}
