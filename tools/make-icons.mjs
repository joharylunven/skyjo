// Génère les icônes PNG de la PWA sans aucune dépendance : node tools/make-icons.mjs
// Dessin : tapis vert sombre + trois cartes en éventail (mêmes couleurs que config/cards.json).

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Distance signée à un rectangle arrondi centré (cx, cy), demi-tailles (bx, by), rayon r, angle a. */
function sdRoundRect(x, y, cx, cy, bx, by, r, a) {
  const c = Math.cos(-a);
  const s = Math.sin(-a);
  const px = Math.abs((x - cx) * c - (y - cy) * s) - bx + r;
  const py = Math.abs((x - cx) * s + (y - cy) * c) - by + r;
  return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - r;
}

const BG1 = hex('#1a1d23');
const BG2 = hex('#111318');
const CARDS = [
  { color: hex('#5b8cff'), angle: -0.3, dx: -0.2 },
  { color: hex('#f87171'), angle: 0.3, dx: 0.2 },
  { color: hex('#f3e04f'), angle: 0, dx: 0 },
];

/** Couleur d'un point (coordonnées normalisées 0..1). `scale` réduit les cartes (zone sûre maskable). */
function shade(u, v, { rounded, scale }) {
  if (rounded && sdRoundRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.22, 0) > 0) return null;
  let col = mix(BG1, BG2, Math.hypot(u - 0.5, v - 0.35) * 1.3);
  for (const card of CARDS) {
    const cx = 0.5 + card.dx * scale;
    const cy = 0.53 + Math.abs(card.dx) * 0.25 * scale;
    const bx = 0.17 * scale;
    const by = 0.24 * scale;
    const d = sdRoundRect(u, v, cx, cy, bx, by, 0.035 * scale, card.angle);
    if (d > 0.02 * scale && d < 0.05 * scale) col = mix(col, [0, 0, 0], 0.25 * (1 - (d - 0.02 * scale) / (0.03 * scale)));
    if (d <= 0) col = card.color;
  }
  return col;
}

function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, opts);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const i = (y * size + x) * 4;
      buf[i] = a ? r / a : 0;
      buf[i + 1] = a ? g / a : 0;
      buf[i + 2] = a ? b / a : 0;
      buf[i + 3] = (a / (SS * SS)) * 255;
    }
  }
  return png(size, buf);
}

const out = new URL('../icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), render(192, { rounded: true, scale: 1 }));
writeFileSync(new URL('icon-512.png', out), render(512, { rounded: true, scale: 1 }));
writeFileSync(new URL('icon-maskable-512.png', out), render(512, { rounded: false, scale: 0.78 }));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { rounded: false, scale: 0.9 }));
console.log('Icônes générées dans icons/');
