// Byte encoding of save files (release_engineering.md 5.3): snapshots are gzip JSON and
// segments gzip JSON Lines. Gzip uses the platform's CompressionStream (browsers, the
// desktop renderer and Node 18+); where it is missing the bytes are plain UTF-8. Decoding
// looks at the gzip magic number, so a reader never needs to know which writer it was.

export interface SaveCodec {
  readonly id: 'gzip' | 'utf8';
  encode(text: string): Promise<Uint8Array>;
  decode(bytes: Uint8Array): Promise<string>;
}

interface StreamCtor {
  new (format: 'gzip'): { readable: ReadableStream<Uint8Array>; writable: WritableStream };
}

function streamCtor(name: 'CompressionStream' | 'DecompressionStream'): StreamCtor | null {
  const ctor = (globalThis as Record<string, unknown>)[name];
  return typeof ctor === 'function' ? (ctor as StreamCtor) : null;
}

async function pipe(ctor: StreamCtor, bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new ctor('gzip');
  const writer = stream.writable.getWriter();
  const done = (async () => {
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      chunks.push(r.value);
      size += r.value.length;
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  })();
  // Write and close in parallel with the reader so back pressure never stalls.
  const wrote = writer.write(bytes).then(() => writer.close());
  const [out] = await Promise.all([done, wrote]);
  return out;
}

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export const utf8Codec: SaveCodec = {
  id: 'utf8',
  async encode(text) {
    return new TextEncoder().encode(text);
  },
  async decode(bytes) {
    return decodeSaveBytes(bytes);
  },
};

export const gzipCodec: SaveCodec = {
  id: 'gzip',
  async encode(text) {
    const ctor = streamCtor('CompressionStream');
    if (!ctor) throw new Error('CompressionStream is not available');
    return pipe(ctor, new TextEncoder().encode(text));
  },
  async decode(bytes) {
    return decodeSaveBytes(bytes);
  },
};

/** Gzip where the platform has it, otherwise plain UTF-8. */
export function defaultCodec(): SaveCodec {
  return streamCtor('CompressionStream') ? gzipCodec : utf8Codec;
}

/** Text of a save file in either encoding. Throws on a corrupt gzip stream. */
export async function decodeSaveBytes(bytes: Uint8Array): Promise<string> {
  if (!isGzip(bytes)) return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const ctor = streamCtor('DecompressionStream');
  if (!ctor) throw new Error('DecompressionStream is not available');
  return new TextDecoder('utf-8', { fatal: true }).decode(await pipe(ctor, bytes));
}

/**
 * The first `maxBytes` bytes of a save file's text, decoding no more of a gzip stream
 * than needed (enough to read a snapshot's version, tick and flags).
 */
export async function decodeSavePrefix(bytes: Uint8Array, maxBytes: number): Promise<string> {
  const text = new TextDecoder('utf-8');
  if (!isGzip(bytes)) return text.decode(bytes.subarray(0, maxBytes));
  const ctor = streamCtor('DecompressionStream');
  if (!ctor) throw new Error('DecompressionStream is not available');
  const stream = new ctor('gzip');
  const writer = stream.writable.getWriter();
  const wrote = writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const r = await reader.read();
    if (r.done) break;
    chunks.push(r.value);
    size += r.value.length;
  }
  await reader.cancel().catch(() => undefined);
  await wrote;
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return text.decode(out.subarray(0, maxBytes));
}
