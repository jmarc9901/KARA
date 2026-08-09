/**
 * Generates the KARA app icon (1024×1024 PNG) with zero dependencies —
 * pure Node zlib + a hand-rolled PNG encoder with CRC32.
 *
 * Design: dark rounded square with a blue ring and center dot (◈ vibe).
 *
 * Usage: node scripts/gen-icon.js            → writes build/icon.png
 *        npm run icons                        → also runs `tauri icon`
 */

import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 1024;

// ---------------------------------------------------------------------------
// PNG encoder
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
const px = Buffer.alloc(SIZE * SIZE * 4);
const setPx = (x, y, r, g, b) => {
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = 255;
};

const RADIUS = 180;
const CENTER = SIZE / 2;

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    // Rounded-corner mask (transparent outside the rounded square).
    const cx = Math.min(Math.max(x, RADIUS), SIZE - RADIUS);
    const cy = Math.min(Math.max(y, RADIUS), SIZE - RADIUS);
    const dx = x - cx;
    const dy = y - cy;
    const corner = (x < RADIUS || x > SIZE - RADIUS) && (y < RADIUS || y > SIZE - RADIUS);
    if (corner && dx * dx + dy * dy > RADIUS * RADIUS) continue; // transparent

    // Vertical gradient background (#0f1218 → #171c26).
    const t = y / SIZE;
    setPx(x, y, Math.round(15 + 8 * t), Math.round(18 + 10 * t), Math.round(24 + 14 * t));
  }
}

// Accent ring (#6c8bff) around the center + filled core.
const R_OUTER = 330;
const R_INNER = 284;
const R_CORE = 120;
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const d = Math.hypot(x - CENTER, y - CENTER);
    if ((d >= R_INNER && d <= R_OUTER) || d <= R_CORE) setPx(x, y, 108, 139, 255);
  }
}

const outDir = path.join(ROOT, 'build');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'icon.png');
fs.writeFileSync(out, encodePng(SIZE, px));
console.log(`ok: ${out} (${SIZE}x${SIZE})`);
