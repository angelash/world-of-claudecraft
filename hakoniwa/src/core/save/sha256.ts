// SHA-256 (FIPS 180-4) over bytes, as lowercase hex. Save files are content addressed by
// this hash (release_engineering.md 5.3). Pure and synchronous so the same code names a
// file in the browser, in the desktop main process and in tests; it hashes the encoded
// (compressed) bytes, a few megabytes at most.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Lowercase hex SHA-256 of the bytes. */
export function sha256Hex(data: Uint8Array): string {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const len = data.length;
  // Message plus 0x80, zero padding and the 64-bit big-endian bit length.
  const blocks = Math.ceil((len + 9) / 64);
  const tail = new Uint8Array(128);
  const fullBlocks = Math.floor(len / 64);
  const rest = len - fullBlocks * 64;
  tail.set(data.subarray(fullBlocks * 64), 0);
  tail[rest] = 0x80;
  const tailLen = (blocks - fullBlocks) * 64;
  const bitsHi = Math.floor(len / 0x20000000);
  const bitsLo = (len * 8) >>> 0;
  tail[tailLen - 8] = bitsHi >>> 24;
  tail[tailLen - 7] = bitsHi >>> 16;
  tail[tailLen - 6] = bitsHi >>> 8;
  tail[tailLen - 5] = bitsHi;
  tail[tailLen - 4] = bitsLo >>> 24;
  tail[tailLen - 3] = bitsLo >>> 16;
  tail[tailLen - 2] = bitsLo >>> 8;
  tail[tailLen - 1] = bitsLo;

  for (let b = 0; b < blocks; b++) {
    const src = b < fullBlocks ? data : tail;
    const off = b < fullBlocks ? b * 64 : (b - fullBlocks) * 64;
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] =
        (((src[j] as number) << 24) |
          ((src[j + 1] as number) << 16) |
          ((src[j + 2] as number) << 8) |
          (src[j + 3] as number)) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15] as number;
      const y = w[i - 2] as number;
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let a = h[0] as number;
    let bb = h[1] as number;
    let c = h[2] as number;
    let d = h[3] as number;
    let e = h[4] as number;
    let f = h[5] as number;
    let g = h[6] as number;
    let hh = h[7] as number;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + (K[i] as number) + (w[i] as number)) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = bb;
      bb = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = ((h[0] as number) + a) >>> 0;
    h[1] = ((h[1] as number) + bb) >>> 0;
    h[2] = ((h[2] as number) + c) >>> 0;
    h[3] = ((h[3] as number) + d) >>> 0;
    h[4] = ((h[4] as number) + e) >>> 0;
    h[5] = ((h[5] as number) + f) >>> 0;
    h[6] = ((h[6] as number) + g) >>> 0;
    h[7] = ((h[7] as number) + hh) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 8; i++) {
    const v = h[i] as number;
    out +=
      (HEX[v >>> 24] as string) +
      (HEX[(v >>> 16) & 0xff] as string) +
      (HEX[(v >>> 8) & 0xff] as string) +
      (HEX[v & 0xff] as string);
  }
  return out;
}

/** Lowercase hex SHA-256 of a string's UTF-8 bytes. */
export function sha256Text(text: string): string {
  return sha256Hex(new TextEncoder().encode(text));
}
