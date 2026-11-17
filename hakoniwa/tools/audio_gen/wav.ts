// Minimal PCM WAV reader and writer for cutting rendered loops at exact sample
// positions (audio_direction.md section 11.2). 16-bit integer and 32-bit float PCM.

export interface PcmAudio {
  sampleRate: number;
  channels: number;
  /** Interleaved samples in -1..1. */
  samples: Float32Array;
}

export function readWav(bytes: Uint8Array): PcmAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a RIFF WAVE file');
  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (format === 0xfffe) format = view.getUint16(body + 24, true);
    } else if (id === 'data') {
      const end = Math.min(bytes.length, body + size);
      if (format === 1 && bits === 16) {
        const count = Math.floor((end - body) / 2);
        const samples = new Float32Array(count);
        for (let i = 0; i < count; i++) samples[i] = view.getInt16(body + i * 2, true) / 32768;
        return { sampleRate, channels, samples };
      }
      if (format === 3 && bits === 32) {
        const count = Math.floor((end - body) / 4);
        const samples = new Float32Array(count);
        for (let i = 0; i < count; i++) samples[i] = view.getFloat32(body + i * 4, true);
        return { sampleRate, channels, samples };
      }
      throw new Error(`Unsupported WAV format ${format} with ${bits} bits`);
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

/** 16-bit PCM WAV bytes. */
export function writeWav(audio: PcmAudio): Uint8Array {
  const dataBytes = audio.samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, audio.channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * audio.channels * 2, true);
  view.setUint16(32, audio.channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < audio.samples.length; i++) {
    const s = Math.max(-1, Math.min(1, audio.samples[i]));
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return out;
}

/** Frames [startFrame, endFrame) of an interleaved buffer. */
export function sliceFrames(audio: PcmAudio, startFrame: number, endFrame: number): PcmAudio {
  const start = Math.max(0, startFrame) * audio.channels;
  const end = Math.min(audio.samples.length, endFrame * audio.channels);
  if (end <= start) throw new Error(`Empty slice ${startFrame}..${endFrame}`);
  return { ...audio, samples: audio.samples.slice(start, end) };
}

export function frameCount(audio: PcmAudio): number {
  return audio.samples.length / audio.channels;
}
