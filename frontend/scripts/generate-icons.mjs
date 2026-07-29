/**
 * Generates the PWA icon set into frontend/public/icons.
 *
 * Hand-rolled PNG encoding (zlib is in Node's standard library) keeps the build
 * free of an image dependency for six small files that change roughly never.
 * Re-run with:  node scripts/generate-icons.mjs
 *
 * The mark is a deliberate PLACEHOLDER — a violet tile carrying a "V". The
 * institutional VIG logo must not be redrawn or recoloured to match the product
 * palette (Brand Guidelines §1), so when the real artwork arrives it replaces
 * these files rather than being approximated here.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const VIOLET = [0x5b, 0x2c, 0xcb];
const WHITE = [0xff, 0xff, 0xff];

// --- Minimal PNG encoder ----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** `pixels` is RGBA, row-major, width*height*4 bytes. */
function encodePng(width, height, pixels) {
  const stride = width * 4;
  // Filter byte 0 (None) in front of every scanline.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing ----------------------------------------------------------------

function canvas(size) {
  return { size, data: Buffer.alloc(size * size * 4) };
}

function setPixel(c, x, y, [r, g, b], alpha = 255) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (y * c.size + x) * 4;
  const a = alpha / 255;
  // Source-over onto whatever is already there.
  c.data[i] = Math.round(r * a + c.data[i] * (1 - a));
  c.data[i + 1] = Math.round(g * a + c.data[i + 1] * (1 - a));
  c.data[i + 2] = Math.round(b * a + c.data[i + 2] * (1 - a));
  c.data[i + 3] = Math.max(c.data[i + 3], alpha);
}

/** Rounded rectangle covering the whole canvas; radius 0 gives a full bleed. */
function fillRounded(c, colour, radius) {
  const { size } = c;
  const SS = 3; // 3×3 supersampling for a clean edge at 192 px
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const dx = Math.max(radius - px, px - (size - radius), 0);
          const dy = Math.max(radius - py, py - (size - radius), 0);
          if (dx * dx + dy * dy <= radius * radius) hits += 1;
        }
      }
      if (hits) setPixel(c, x, y, colour, Math.round((hits / (SS * SS)) * 255));
    }
  }
}

/** Scanline-fills a polygon given as [[x,y], …] in canvas units. */
function fillPolygon(c, points, colour) {
  const ys = points.map((p) => p[1]);
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(c.size - 1, Math.ceil(Math.max(...ys)));
  const SS = 3;

  for (let y = top; y <= bottom; y += 1) {
    for (let x = 0; x < c.size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          if (pointInPolygon(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, points)) hits += 1;
        }
      }
      if (hits) setPixel(c, x, y, colour, Math.round((hits / (SS * SS)) * 255));
    }
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * @param size      icon edge in px
 * @param maskable  true leaves the 20% safe-area padding Android needs before
 *                  it crops the icon to the launcher's mask shape
 */
function drawMark(size, maskable) {
  const c = canvas(size);
  // A maskable icon must bleed to the edge; a normal one gets the rounded tile.
  fillRounded(c, VIOLET, maskable ? 0 : size * 0.22);

  // "V", inset far enough to survive a circular mask crop.
  const scale = maskable ? 0.5 : 0.62;
  const w = size * scale;
  const h = size * scale * 0.92;
  const cx = size / 2;
  const top = (size - h) / 2;
  const stroke = w * 0.26;

  fillPolygon(
    c,
    [
      [cx - w / 2, top],
      [cx - w / 2 + stroke, top],
      [cx, top + h - stroke * 0.85],
      [cx + w / 2 - stroke, top],
      [cx + w / 2, top],
      [cx, top + h],
    ],
    WHITE,
  );

  return encodePng(size, size, c.data);
}

// --- Emit -------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
  ['favicon-32.png', 32, false],
];

for (const [name, size, maskable] of targets) {
  writeFileSync(join(OUT_DIR, name), drawMark(size, maskable));
  console.log(`wrote icons/${name} (${size}×${size})`);
}
