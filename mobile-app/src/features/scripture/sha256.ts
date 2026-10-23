/**
 * SHA-256 (FIPS 180-4) in plain JavaScript, for confirming which Bible text is installed on a device that has no Web Crypto (React Native's Hermes does not
 * reliably provide `crypto.subtle`, and no hashing library is installed). It is the SAME hash the backend computes with Node's crypto over the same bytes, so
 * both sides can agree on the text's fingerprint (see dataset-identity.ts). The converter (backend/scripts/convert-kjv.mjs) refuses to write the Bible data
 * unless this implementation and Node's crypto produce the identical fingerprint for it, so a mistake here cannot silently produce a wrong "confirmed".
 *
 * Text is hashed as UTF-8, exactly like `Hash.update(string)` in Node (a lone surrogate becomes U+FFFD, as there). Incremental: `update` may be called
 * with any number of strings, then `digestHex` ONCE. Pure, synchronous and free of platform APIs, so the same file runs on Android, iOS, web and Node.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class Sha256 {
  private readonly h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private readonly w = new Uint32Array(64);
  private readonly block = new Uint8Array(64);
  private scratch = new Uint8Array(0);
  private filled = 0;
  private total = 0;

  /** Adds `text`, encoded as UTF-8. */
  update(text: string): this {
    const length = text.length;
    if (this.scratch.length < length * 3) this.scratch = new Uint8Array(length * 3);
    const out = this.scratch;
    let n = 0;
    for (let i = 0; i < length; i += 1) {
      const c = text.charCodeAt(i);
      if (c < 0x80) {
        out[n++] = c;
      } else if (c < 0x800) {
        out[n++] = 0xc0 | (c >> 6);
        out[n++] = 0x80 | (c & 0x3f);
      } else if (c >= 0xd800 && c <= 0xdfff) {
        const next = i + 1 < length ? text.charCodeAt(i + 1) : 0;
        if (c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
          const point = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
          out[n++] = 0xf0 | (point >> 18);
          out[n++] = 0x80 | ((point >> 12) & 0x3f);
          out[n++] = 0x80 | ((point >> 6) & 0x3f);
          out[n++] = 0x80 | (point & 0x3f);
          i += 1;
        } else {
          out[n++] = 0xef; // a lone surrogate is U+FFFD, as in Node
          out[n++] = 0xbf;
          out[n++] = 0xbd;
        }
      } else {
        out[n++] = 0xe0 | (c >> 12);
        out[n++] = 0x80 | ((c >> 6) & 0x3f);
        out[n++] = 0x80 | (c & 0x3f);
      }
    }
    this.write(out, n);
    return this;
  }

  /** The digest as 64 lowercase hex characters. Call once, after the last `update`. */
  digestHex(): string {
    const bits = this.total * 8; // below 2^53 for any text this app handles
    const padding = (this.filled < 56 ? 56 : 120) - this.filled;
    const tail = new Uint8Array(padding + 8);
    tail[0] = 0x80;
    const high = Math.floor(bits / 0x100000000);
    const low = bits >>> 0;
    for (let i = 0; i < 4; i += 1) {
      tail[padding + i] = (high >>> (24 - 8 * i)) & 0xff;
      tail[padding + 4 + i] = (low >>> (24 - 8 * i)) & 0xff;
    }
    this.write(tail, tail.length);
    let hex = '';
    for (let i = 0; i < 8; i += 1) hex += this.h[i].toString(16).padStart(8, '0');
    return hex;
  }

  private write(data: Uint8Array, length: number): void {
    this.total += length;
    let position = 0;
    if (this.filled > 0) {
      const take = Math.min(64 - this.filled, length);
      this.block.set(data.subarray(0, take), this.filled);
      this.filled += take;
      position = take;
      if (this.filled < 64) return;
      this.compress(this.block, 0);
      this.filled = 0;
    }
    while (position + 64 <= length) {
      this.compress(data, position);
      position += 64;
    }
    if (position < length) {
      this.block.set(data.subarray(position, length), 0);
      this.filled = length - position;
    }
  }

  private compress(data: Uint8Array, offset: number): void {
    const w = this.w;
    const h = this.h;
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      w[i] = (data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3];
    }
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i += 1) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choose = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + choose + K[i] + w[i]) | 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }
}

/** SHA-256 of one string, as hex. */
export const sha256Hex = (text: string): string => new Sha256().update(text).digestHex();
