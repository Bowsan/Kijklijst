// Genereert de PWA-iconen (geen externe afhankelijkheden, pure Node PNG-encoder).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'web', 'public');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function png(size, draw) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y);
      const i = (y * size + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    }
  }
  // filter byte 0 per scanline
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [15, 17, 21];
const COUCH = [255, 92, 124];
const CUSHION = [255, 138, 160];

function draw(size) {
  return (x, y) => {
    const u = x / size, v = y / size;
    // afgeronde achtergrond
    const r = 0.18;
    const inCorner =
      (u < r && v < r && (u - r) ** 2 + (v - r) ** 2 > r * r) ||
      (u > 1 - r && v < r && (u - (1 - r)) ** 2 + (v - r) ** 2 > r * r) ||
      (u < r && v > 1 - r && (u - r) ** 2 + (v - (1 - r)) ** 2 > r * r) ||
      (u > 1 - r && v > 1 - r && (u - (1 - r)) ** 2 + (v - (1 - r)) ** 2 > r * r);
    if (inCorner) return [0, 0, 0, 0];

    // bank: rugleuning + zitting + armleuningen
    const back = u > 0.18 && u < 0.82 && v > 0.34 && v < 0.56;
    const seat = u > 0.16 && u < 0.84 && v > 0.52 && v < 0.66;
    const armL = u > 0.14 && u < 0.24 && v > 0.40 && v < 0.70;
    const armR = u > 0.76 && u < 0.86 && v > 0.40 && v < 0.70;
    const legs = (Math.abs(u - 0.24) < 0.02 || Math.abs(u - 0.76) < 0.02) && v > 0.70 && v < 0.76;

    if (back) return [...CUSHION, 255];
    if (seat || armL || armR) return [...COUCH, 255];
    if (legs) return [...COUCH, 255];
    return [...BG, 255];
  };
}

for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), png(size, draw(size)));
  console.log(`icon-${size}.png`);
}
// favicon
writeFileSync(join(outDir, 'favicon.png'), png(64, draw(64)));
console.log('favicon.png');
