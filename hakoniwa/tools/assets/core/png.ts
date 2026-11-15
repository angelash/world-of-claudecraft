// Minimal PNG codec on node:zlib (art_pipeline.md 13): decodes 8-bit grayscale, RGB, RGBA,
// gray-alpha and palette images (palette also at 1, 2 and 4 bits, with tRNS), keeps the text
// chunks (the generator's implicit AIGC label lives there), and encodes 8-bit RGBA with
// optional UTF-8 text chunks. No interlace support: Adam7 images are rejected with a clear
// error so the user re-exports them. Encoding is deterministic for a given zlib build.

import { deflateSync, inflateSync } from 'node:zlib';
import type { Img } from './image';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface DecodedPng extends Img {
  /** tEXt, zTXt and iTXt chunks by keyword (later chunks win). */
  text: Record<string, string>;
  /** Source color type and bit depth, for the processing record. */
  colorType: number;
  bitDepth: number;
}

function readU32(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}

function latin1(b: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(b[i]!);
  return s;
}

function utf8(b: Uint8Array, start: number, end: number): string {
  return Buffer.from(b.subarray(start, end)).toString('utf8');
}

function parseText(type: string, d: Uint8Array): [string, string] | null {
  const nul = d.indexOf(0);
  if (nul < 0) return null;
  const key = latin1(d, 0, nul);
  if (type === 'tEXt') return [key, latin1(d, nul + 1, d.length)];
  if (type === 'zTXt') {
    const body = inflateSync(d.subarray(nul + 2));
    return [key, latin1(body, 0, body.length)];
  }
  // iTXt: keyword, compression flag, method, language tag, translated keyword, text
  const flag = d[nul + 1];
  let p = nul + 3;
  const lang = d.indexOf(0, p);
  if (lang < 0) return null;
  const trans = d.indexOf(0, lang + 1);
  if (trans < 0) return null;
  p = trans + 1;
  const raw = flag === 1 ? inflateSync(d.subarray(p)) : d.subarray(p);
  return [key, utf8(raw, 0, raw.length)];
}

/** Only the text chunks of a PNG (cheap: no pixel decoding), for the implicit AIGC label. */
export function readPngText(bytes: Uint8Array): Record<string, string> {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('not a PNG file');
  const text: Record<string, string> = {};
  let o = 8;
  while (o + 8 <= bytes.length) {
    const len = readU32(bytes, o);
    const type = latin1(bytes, o + 4, o + 8);
    const d = bytes.subarray(o + 8, o + 8 + len);
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const kv = parseText(type, d);
      if (kv) text[kv[0]] = kv[1];
    }
    if (type === 'IEND') break;
    o += 12 + len;
  }
  return text;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decode a PNG file. Throws on unsupported formats and on corrupt chunks. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('not a PNG file');
  let o = 8;
  let w = 0;
  let h = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let plte: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  const text: Record<string, string> = {};
  while (o + 8 <= bytes.length) {
    const len = readU32(bytes, o);
    const type = latin1(bytes, o + 4, o + 8);
    const dataStart = o + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > bytes.length) throw new Error(`truncated PNG chunk ${type}`);
    const crc = readU32(bytes, dataEnd);
    if (crc32(bytes, o + 4, dataEnd) !== crc) throw new Error(`bad CRC in PNG chunk ${type}`);
    const d = bytes.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      w = readU32(d, 0);
      h = readU32(d, 4);
      bitDepth = d[8]!;
      colorType = d[9]!;
      interlace = d[12]!;
    } else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const kv = parseText(type, d);
      if (kv) text[kv[0]] = kv[1];
    } else if (type === 'IEND') break;
    o = dataEnd + 4;
  }
  if (w <= 0 || h <= 0) throw new Error('PNG without IHDR');
  if (interlace !== 0)
    throw new Error('interlaced PNG is not supported; re-export without interlace');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels === undefined) throw new Error(`unsupported PNG color type ${colorType}`);
  if (colorType === 3) {
    if (![1, 2, 4, 8].includes(bitDepth))
      throw new Error(`unsupported palette bit depth ${bitDepth}`);
    if (!plte) throw new Error('palette PNG without PLTE');
  } else if (bitDepth !== 8) {
    throw new Error(`unsupported bit depth ${bitDepth}; only 8-bit RGB, RGBA and palette PNGs`);
  }
  const raw = inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c))));
  const bitsPerPixel = channels * bitDepth;
  const stride = Math.ceil((w * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  if (raw.length < h * (stride + 1)) throw new Error('PNG image data is too short');
  const lines = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x]!;
      const a = x >= bpp ? lines[dst + x - bpp]! : 0;
      const b = y > 0 ? lines[dst - stride + x]! : 0;
      const c = x >= bpp && y > 0 ? lines[dst - stride + x - bpp]! : 0;
      let out: number;
      switch (filter) {
        case 0:
          out = v;
          break;
        case 1:
          out = v + a;
          break;
        case 2:
          out = v + b;
          break;
        case 3:
          out = v + ((a + b) >> 1);
          break;
        case 4:
          out = v + paeth(a, b, c);
          break;
        default:
          throw new Error(`bad PNG filter type ${filter}`);
      }
      lines[dst + x] = out & 0xff;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      if (colorType === 3) {
        const bit = x * bitDepth;
        const byte = lines[row + (bit >> 3)]!;
        const shift = 8 - bitDepth - (bit & 7);
        const idx = (byte >> shift) & ((1 << bitDepth) - 1);
        const pl = plte!;
        data[p] = pl[idx * 3] ?? 0;
        data[p + 1] = pl[idx * 3 + 1] ?? 0;
        data[p + 2] = pl[idx * 3 + 2] ?? 0;
        data[p + 3] = trns && idx < trns.length ? trns[idx]! : 255;
      } else {
        const s = row + x * channels;
        if (colorType === 0 || colorType === 4) {
          const g = lines[s]!;
          data[p] = g;
          data[p + 1] = g;
          data[p + 2] = g;
          data[p + 3] = colorType === 4 ? lines[s + 1]! : 255;
          if (colorType === 0 && trns && trns.length >= 2 && readU16(trns, 0) === g)
            data[p + 3] = 0;
        } else {
          data[p] = lines[s]!;
          data[p + 1] = lines[s + 1]!;
          data[p + 2] = lines[s + 2]!;
          data[p + 3] = colorType === 6 ? lines[s + 3]! : 255;
          if (
            colorType === 2 &&
            trns &&
            trns.length >= 6 &&
            readU16(trns, 0) === data[p] &&
            readU16(trns, 2) === data[p + 1] &&
            readU16(trns, 4) === data[p + 2]
          ) {
            data[p + 3] = 0;
          }
        }
      }
    }
  }
  return { w, h, data, text, colorType, bitDepth };
}

function readU16(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out, 4, 8 + data.length), 8 + data.length);
  return out;
}

/** Encode 8-bit RGBA. `text` entries become iTXt chunks (UTF-8, uncompressed). */
export function encodePng(img: Img, text: Record<string, string> = {}): Uint8Array {
  const { w, h, data } = img;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < h; y++) {
    cur.set(data.subarray(y * stride, (y + 1) * stride));
    // Adaptive filter choice (minimum sum of absolute signed bytes): deterministic.
    let best = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let f = 0; f < 5; f++) {
      const out = cand[f]!;
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? cur[x - 4]! : 0;
        const b = y > 0 ? prev[x]! : 0;
        const c = x >= 4 && y > 0 ? prev[x - 4]! : 0;
        const v = cur[x]!;
        const pred =
          f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const r = (v - pred) & 0xff;
        out[x] = r;
        score += r < 128 ? r : 256 - r;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    raw.set(cand[best]!, y * (stride + 1) + 1);
    prev.set(cur);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [Buffer.from(SIGNATURE), chunk('IHDR', ihdr)];
  for (const key of Object.keys(text).sort()) {
    const body = Buffer.concat([
      Buffer.from(key, 'latin1'),
      Buffer.from([0, 0, 0, 0, 0]),
      Buffer.from(text[key] ?? '', 'utf8'),
    ]);
    parts.push(chunk('iTXt', body));
  }
  parts.push(chunk('IDAT', deflateSync(raw, { level: 9 })));
  parts.push(chunk('IEND', new Uint8Array(0)));
  return new Uint8Array(Buffer.concat(parts));
}

/**
 * Encode a palette PNG (8-bit indices). Used by tests to produce the palette inputs the
 * decoder must accept; the pipeline itself writes RGBA.
 */
export function encodePalettePng(
  w: number,
  h: number,
  indices: Uint8Array,
  palette: [number, number, number, number][],
): Uint8Array {
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) raw.set(indices.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = Buffer.alloc(palette.length * 3);
  const trns = Buffer.alloc(palette.length);
  palette.forEach(([r, g, b, a], i) => {
    plte[i * 3] = r;
    plte[i * 3 + 1] = g;
    plte[i * 3 + 2] = b;
    trns[i] = a;
  });
  return new Uint8Array(
    Buffer.concat([
      Buffer.from(SIGNATURE),
      chunk('IHDR', ihdr),
      chunk('PLTE', plte),
      chunk('tRNS', trns),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', new Uint8Array(0)),
    ]),
  );
}
