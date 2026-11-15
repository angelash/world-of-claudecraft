// Ogg Vorbis container reading (audio_direction.md 9.1 and 9.3): page walk with CRC check,
// the identification header (sample rate, channels, nominal bitrate), the comment header
// (vendor, LOOPSTART and LOOPLENGTH, the generator's implicit label) and the length from the
// last granule position. No audio decoding: PCM comes from the decoder adapter (ffmpeg).
// `buildOggSkeleton` writes a structurally valid stream with stub audio packets; tests use it
// for header checks without committing real audio.

const OGG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++)
    crc = ((crc << 8) ^ OGG_CRC[((crc >>> 24) ^ bytes[i]!) & 0xff]!) >>> 0;
  return crc >>> 0;
}

export interface OggInfo {
  sampleRate: number;
  channels: number;
  bitrateNominal: number;
  vendor: string;
  /** Vorbis comments by upper-case key. */
  comments: Record<string, string[]>;
  /** Samples per channel (last granule position of the Vorbis stream). */
  totalSamples: number;
  durationSec: number;
  pages: number;
  crcErrors: number;
}

function u32(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

function granule(b: Uint8Array, o: number): number {
  const lo = u32(b, o);
  const hi = u32(b, o + 4);
  if (hi === 0xffffffff && lo === 0xffffffff) return -1;
  return hi * 0x100000000 + lo;
}

/** Parse an Ogg Vorbis file's headers and length. Throws on a stream that is not Vorbis. */
export function parseOgg(bytes: Uint8Array): OggInfo {
  let o = 0;
  let pages = 0;
  let crcErrors = 0;
  let serial: number | null = null;
  let lastGranule = 0;
  const packets: Uint8Array[] = [];
  let partial: number[] = [];
  while (o + 27 <= bytes.length) {
    if (
      bytes[o] !== 0x4f ||
      bytes[o + 1] !== 0x67 ||
      bytes[o + 2] !== 0x67 ||
      bytes[o + 3] !== 0x53
    ) {
      throw new Error(`no Ogg page at byte ${o}`);
    }
    const nseg = bytes[o + 26]!;
    const table = bytes.subarray(o + 27, o + 27 + nseg);
    let len = 0;
    for (const s of table) len += s;
    const end = o + 27 + nseg + len;
    if (end > bytes.length) throw new Error('truncated Ogg page');
    const page = new Uint8Array(bytes.subarray(o, end));
    const stored = u32(page, 22);
    page[22] = page[23] = page[24] = page[25] = 0;
    if (oggCrc(page) !== stored) crcErrors++;
    const pageSerial = u32(bytes, o + 14);
    const flags = bytes[o + 5]!;
    if (serial === null && flags & 0x02) serial = pageSerial;
    if (pageSerial === serial) {
      pages++;
      const g = granule(bytes, o + 6);
      if (g >= 0) lastGranule = g;
      let p = o + 27 + nseg;
      for (const s of table) {
        if (packets.length < 3) for (let k = 0; k < s; k++) partial.push(bytes[p + k]!);
        p += s;
        if (s < 255) {
          if (packets.length < 3) packets.push(Uint8Array.from(partial));
          partial = [];
        }
      }
    }
    o = end;
  }
  const id = packets[0];
  if (!id || id[0] !== 1 || String.fromCharCode(...id.subarray(1, 7)) !== 'vorbis') {
    throw new Error('not an Ogg Vorbis stream (no Vorbis identification header)');
  }
  const channels = id[11]!;
  const sampleRate = u32(id, 12);
  const bitrateNominal = u32(id, 20) | 0;
  const comments: Record<string, string[]> = {};
  let vendor = '';
  const c = packets[1];
  if (c && c[0] === 3 && String.fromCharCode(...c.subarray(1, 7)) === 'vorbis') {
    let p = 7;
    const vlen = u32(c, p);
    p += 4;
    vendor = Buffer.from(c.subarray(p, p + vlen)).toString('utf8');
    p += vlen;
    const n = u32(c, p);
    p += 4;
    for (let i = 0; i < n && p + 4 <= c.length; i++) {
      const len = u32(c, p);
      p += 4;
      const s = Buffer.from(c.subarray(p, p + len)).toString('utf8');
      p += len;
      const eq = s.indexOf('=');
      if (eq <= 0) continue;
      const key = s.slice(0, eq).toUpperCase();
      const list = comments[key] ?? [];
      list.push(s.slice(eq + 1));
      comments[key] = list;
    }
  }
  return {
    sampleRate,
    channels,
    bitrateNominal,
    vendor,
    comments,
    totalSamples: lastGranule,
    durationSec: sampleRate > 0 ? lastGranule / sampleRate : 0,
    pages,
    crcErrors,
  };
}

function le32(v: number): number[] {
  return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
}

function page(
  flags: number,
  granulePos: number,
  serial: number,
  seq: number,
  packets: Uint8Array[],
): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const body = packets.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + body);
  out.set([0x4f, 0x67, 0x67, 0x53, 0, flags], 0);
  const lo = granulePos % 0x100000000;
  const hi = Math.floor(granulePos / 0x100000000);
  out.set([...le32(lo), ...le32(hi), ...le32(serial), ...le32(seq), 0, 0, 0, 0, lacing.length], 6);
  out.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const p of packets) {
    out.set(p, o);
    o += p.length;
  }
  out.set(le32(oggCrc(out)), 22);
  return out;
}

function vorbisPacket(type: number, body: number[]): Uint8Array {
  return Uint8Array.from([type, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73, ...body]);
}

/**
 * A structurally valid Ogg Vorbis file (headers, CRCs, granule positions) whose audio packets
 * are stubs. Enough for every header check; not decodable.
 */
export function buildOggSkeleton(opts: {
  sampleRate: number;
  channels: number;
  totalSamples: number;
  comments?: Record<string, string>;
  vendor?: string;
  serial?: number;
}): Uint8Array {
  const serial = opts.serial ?? 0x484b;
  const id = vorbisPacket(1, [
    ...le32(0),
    opts.channels,
    ...le32(opts.sampleRate),
    ...le32(0),
    ...le32(160000),
    ...le32(0),
    0xb8,
    1,
  ]);
  const vendor = Buffer.from(opts.vendor ?? 'hakoniwa test skeleton', 'utf8');
  const entries = Object.entries(opts.comments ?? {}).map(([k, v]) =>
    Buffer.from(`${k}=${v}`, 'utf8'),
  );
  const comment = vorbisPacket(3, [
    ...le32(vendor.length),
    ...vendor,
    ...le32(entries.length),
    ...entries.flatMap((e) => [...le32(e.length), ...e]),
    1,
  ]);
  const setup = vorbisPacket(5, [0, 0, 0, 0]);
  const pages = [
    page(0x02, 0, serial, 0, [id]),
    page(0x00, 0, serial, 1, [comment, setup]),
    page(0x00, Math.floor(opts.totalSamples / 2), serial, 2, [new Uint8Array(64)]),
    page(0x04, opts.totalSamples, serial, 3, [new Uint8Array(64)]),
  ];
  const total = pages.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of pages) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
