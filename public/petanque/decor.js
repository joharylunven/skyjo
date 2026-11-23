// Décors de Quiberon au canvas (unités du plateau 100 × 160) : goélands chapardeurs, parasols,
// baigneur en marinière qui prend des coups de soleil, cerf-volant, drapeau breton, voiliers,
// chalutier, phare de Port Maria, stands de caramels et de crêpes…

import { crab } from '../minigolf/decor.js';

const TAU = Math.PI * 2;

function ellipse(c, x, y, rx, ry, color, rot = 0) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU);
  c.fill();
}
function line(c, pts, color, width) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
const shadow = (c, x, y, rx, ry = rx * 0.35) => ellipse(c, x, y, rx, ry, 'rgba(0,0,0,0.2)');

export function parasol(c, x, y, s, t, o = {}) {
  shadow(c, x + 3 * s, y, 7 * s, 3 * s);
  line(c, [[x, y], [x, y - 12 * s]], '#ddd', 0.5 * s);
  const tilt = Math.sin(t * 0.8 + x) * 0.06;
  c.save();
  c.translate(x, y - 12 * s);
  c.rotate(tilt);
  const col = o.color ?? '#2a6fd6';
  for (let i = 0; i < 8; i++) {
    c.fillStyle = i % 2 ? '#fbfaf5' : col;
    c.beginPath();
    c.moveTo(0, -1 * s);
    c.arc(0, 0, 7 * s, Math.PI + (i * Math.PI) / 8, Math.PI + ((i + 1) * Math.PI) / 8);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** Baigneur en marinière sur sa serviette : il respire, et il rougit (coup de soleil). */
export function sunbather(c, x, y, s, t) {
  c.fillStyle = '#f2b84b';
  c.fillRect(x - 6 * s, y - 3 * s, 12 * s, 6 * s);
  c.fillStyle = '#e1262d';
  for (let i = 0; i < 4; i++) c.fillRect(x - 6 * s + i * 3 * s, y - 3 * s, 1.5 * s, 6 * s);
  const breathe = 1 + Math.sin(t * 1.4) * 0.06;
  // jambes, corps en marinière, tête
  line(c, [[x + 1 * s, y + 0.4 * s], [x + 5.4 * s, y + 0.8 * s]], '#f1c9a5', 1 * s);
  line(c, [[x + 1 * s, y - 0.6 * s], [x + 5.4 * s, y - 1 * s]], '#f1c9a5', 1 * s);
  ellipse(c, x - 1 * s, y, 3 * s, 1.9 * s * breathe, '#fbfaf5');
  c.strokeStyle = '#2a4d9c';
  c.lineWidth = 0.45 * s;
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.moveTo(x - 1 * s + i * 1.1 * s, y - 1.7 * s * breathe);
    c.lineTo(x - 1 * s + i * 1.1 * s, y + 1.7 * s * breathe);
    c.stroke();
  }
  const red = (Math.sin(t * 0.3) + 1) / 2;
  ellipse(c, x - 5 * s, y, 1.4 * s, 1.4 * s, `rgb(${240},${200 - red * 90},${170 - red * 100})`);
  c.fillStyle = '#1b1b1b';
  c.fillRect(x - 5.9 * s, y - 0.9 * s, 0.7 * s, 1.8 * s); // lunettes de soleil
}

/** Goéland : il marche, picore, et s'envole de temps en temps en faisant un tour. */
export function gull(c, x, y, s, t) {
  const cycle = (t * 0.12 + x * 0.37) % 1; // 0..1
  const flying = cycle > 0.78;
  let gx = x + Math.sin(t * 0.4 + x) * 4 * s;
  let gy = y;
  let z = 0;
  if (flying) {
    const u = (cycle - 0.78) / 0.22;
    z = Math.sin(u * Math.PI) * 18 * s;
    gx += Math.sin(u * TAU) * 10 * s;
  }
  shadow(c, gx, gy, 2.4 * s);
  gy -= z;
  const dir = Math.cos(t * 0.4 + x) > 0 ? 1 : -1;
  if (flying) {
    const flap = Math.sin(t * 14) * 3 * s;
    line(c, [[gx - 5 * s, gy - 4 * s - flap], [gx, gy - 3 * s], [gx + 5 * s, gy - 4 * s - flap]], '#c9cdd3', 1 * s);
    ellipse(c, gx, gy - 3 * s, 1.8 * s, 1 * s, '#fbfaf5');
    return;
  }
  const peck = Math.max(0, Math.sin(t * 2 + x)) ** 6;
  line(c, [[gx - 0.5 * s, gy], [gx - 0.5 * s, gy - 2 * s]], '#e8a33a', 0.3 * s);
  line(c, [[gx + 0.6 * s, gy], [gx + 0.6 * s, gy - 2 * s]], '#e8a33a', 0.3 * s);
  ellipse(c, gx, gy - 3.4 * s, 2.8 * s, 1.6 * s, '#fbfaf5');
  ellipse(c, gx - dir * 0.6 * s, gy - 3.8 * s, 2 * s, 1 * s, '#aeb4bc');
  const hx = gx + dir * 2.6 * s;
  const hy = gy - 5 * s + peck * 3 * s;
  ellipse(c, hx, hy, 1.1 * s, 1 * s, '#fbfaf5');
  ellipse(c, hx + dir * 0.3 * s, hy - 0.2 * s, 0.2 * s, 0.2 * s, '#1b1b1b');
  line(c, [[hx + dir * 0.9 * s, hy + 0.2 * s], [hx + dir * 2.2 * s, hy + 0.5 * s]], '#f2c230', 0.5 * s);
  ellipse(c, hx + dir * 1.9 * s, hy + 0.6 * s, 0.2 * s, 0.2 * s, '#e1262d');
}

export function kite(c, x, y, s, t) {
  const kx = x + Math.sin(t * 0.7) * 4 * s;
  const ky = y + Math.sin(t * 1.1) * 3 * s;
  line(c, [[kx, ky + 4 * s], [x - 10 * s, y + 60 * s]], 'rgba(255,255,255,0.5)', 0.2 * s);
  c.save();
  c.translate(kx, ky);
  c.rotate(Math.sin(t * 0.9) * 0.25);
  for (const [col, pts] of [
    ['#e1262d', [[0, -5], [3.5, 0], [0, 0]]],
    ['#f2b84b', [[0, -5], [-3.5, 0], [0, 0]]],
    ['#2a6fd6', [[0, 5], [3.5, 0], [0, 0]]],
    ['#0e8a3e', [[0, 5], [-3.5, 0], [0, 0]]],
  ]) {
    c.fillStyle = col;
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(px * s, py * s) : c.moveTo(px * s, py * s)));
    c.fill();
  }
  c.restore();
  const tail = [];
  for (let i = 0; i < 8; i++) tail.push([kx + Math.sin(t * 3 + i * 0.8) * 1.5 * s, ky + 5 * s + i * 1.6 * s]);
  line(c, tail, '#fbfaf5', 0.3 * s);
}

/** Gwenn-ha-du, le drapeau breton, qui claque au vent. */
export function flag(c, x, y, s, t) {
  shadow(c, x, y, 2 * s);
  line(c, [[x, y], [x, y - 18 * s]], '#d9d4c7', 0.5 * s);
  const fw = 9 * s;
  const fh = 6 * s;
  const top = y - 18 * s;
  const strips = 12;
  for (let i = 0; i < strips; i++) {
    const u = i / strips;
    const wave = Math.sin(t * 5 - u * 6) * 0.7 * s * u;
    const x0 = x + u * fw;
    for (let k = 0; k < 9; k++) {
      c.fillStyle = k % 2 ? '#fbfaf5' : '#1b1b1b';
      c.fillRect(x0, top + wave + (k * fh) / 9, fw / strips + 0.05, fh / 9 + 0.02);
    }
    if (u < 0.4) {
      c.fillStyle = '#fbfaf5';
      c.fillRect(x0, top + wave, fw / strips + 0.05, (fh * 5) / 9);
      if (i % 2 === 0) ellipse(c, x0 + 0.3 * s, top + wave + 1.4 * s + (i % 4) * 0.4 * s, 0.25 * s, 0.4 * s, '#1b1b1b');
    }
  }
}

export function stand(c, x, y, s, t, o = {}) {
  shadow(c, x, y, 8 * s);
  c.fillStyle = '#a8763f';
  c.fillRect(x - 6 * s, y - 6 * s, 12 * s, 6 * s);
  // vendeur
  ellipse(c, x + Math.sin(t * 0.8) * 2 * s, y - 8 * s, 1.4 * s, 1.4 * s, '#f1c9a5');
  // auvent rayé
  for (let i = 0; i < 6; i++) {
    c.fillStyle = i % 2 ? '#fbfaf5' : '#2a4d9c';
    c.fillRect(x - 7 * s + i * (14 / 6) * s, y - 12 * s, (14 / 6) * s + 0.05, 3 * s);
  }
  c.fillStyle = '#fbfaf5';
  c.font = `bold ${2.6 * s}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.fillText(o.label ?? 'Caramels', x, y - 2.2 * s);
}

export function boat(c, x, y, s, t, o = {}) {
  const bx = x + Math.sin(t * 0.15 + x) * 6 * s;
  const by = y + Math.sin(t * 1.3 + x) * 0.4 * s;
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(bx - 6 * s, by + 0.8 * s, 12 * s, 0.4 * s);
  c.fillStyle = '#fbfaf5';
  c.beginPath();
  c.moveTo(bx - 6 * s, by - 1 * s);
  c.lineTo(bx + 6 * s, by - 1 * s);
  c.lineTo(bx + 4 * s, by + 1 * s);
  c.lineTo(bx - 4.5 * s, by + 1 * s);
  c.fill();
  line(c, [[bx, by - 1 * s], [bx, by - 13 * s]], '#7a6a55', 0.35 * s);
  c.fillStyle = o.sail ?? '#fbfaf5';
  c.beginPath();
  c.moveTo(bx + 0.4 * s, by - 12.5 * s);
  c.lineTo(bx + 0.4 * s, by - 2 * s);
  c.lineTo(bx + 6 * s + Math.sin(t * 2 + x) * 0.4 * s, by - 2 * s);
  c.fill();
  c.fillStyle = '#e9e4d8';
  c.beginPath();
  c.moveTo(bx - 0.4 * s, by - 11 * s);
  c.lineTo(bx - 0.4 * s, by - 2 * s);
  c.lineTo(bx - 4.4 * s, by - 2 * s);
  c.fill();
}

export function trawler(c, x, y, s, t) {
  const by = y + Math.sin(t * 1.1 + x) * 0.5 * s;
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.fillRect(x - 8 * s, by + 1.4 * s, 16 * s, 0.4 * s);
  c.fillStyle = '#2a4d9c';
  c.beginPath();
  c.moveTo(x - 8 * s, by - 1.5 * s);
  c.lineTo(x + 8 * s, by - 2.5 * s);
  c.lineTo(x + 6 * s, by + 1.5 * s);
  c.lineTo(x - 6.5 * s, by + 1.5 * s);
  c.fill();
  c.fillStyle = '#e1262d';
  c.fillRect(x - 7.5 * s, by - 0.2 * s, 14.5 * s, 0.6 * s);
  c.fillStyle = '#fbfaf5';
  c.fillRect(x - 1 * s, by - 6 * s, 5 * s, 4.5 * s);
  c.fillStyle = '#7fb7e6';
  c.fillRect(x - 0.3 * s, by - 5.2 * s, 1.4 * s, 1.2 * s);
  c.fillRect(x + 1.8 * s, by - 5.2 * s, 1.4 * s, 1.2 * s);
  line(c, [[x - 4 * s, by - 1.5 * s], [x - 4 * s, by - 11 * s], [x + 6 * s, by - 2.4 * s]], '#6b5a44', 0.3 * s);
  // goéland qui suit le bateau
  gull(c, x + 4 * s, by - 8 * s, 0.5 * s, t + 2);
}

/** Phare de Port Maria, avec son faisceau qui tourne. */
export function lighthouse(c, x, y, s, t) {
  shadow(c, x, y, 5 * s);
  const a = t * 1.2;
  const g = c.createRadialGradient(x, y - 22 * s, 0, x, y - 22 * s, 30 * s);
  g.addColorStop(0, 'rgba(255,240,170,0.45)');
  g.addColorStop(1, 'rgba(255,240,170,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x, y - 22 * s);
  c.arc(x, y - 22 * s, 30 * s, a - 0.18, a + 0.18);
  c.fill();
  c.fillStyle = '#fbfaf5';
  c.beginPath();
  c.moveTo(x - 3 * s, y);
  c.lineTo(x - 2 * s, y - 20 * s);
  c.lineTo(x + 2 * s, y - 20 * s);
  c.lineTo(x + 3 * s, y);
  c.fill();
  c.fillStyle = '#e1262d';
  c.fillRect(x - 2.6 * s, y - 8 * s, 5.2 * s, 2.4 * s);
  c.fillRect(x - 2.2 * s, y - 16 * s, 4.4 * s, 2.2 * s);
  c.fillStyle = '#f2e7a0';
  c.fillRect(x - 1.6 * s, y - 23.5 * s, 3.2 * s, 3.4 * s);
  c.fillStyle = '#e1262d';
  c.beginPath();
  c.moveTo(x - 2.4 * s, y - 23.5 * s);
  c.lineTo(x, y - 26 * s);
  c.lineTo(x + 2.4 * s, y - 23.5 * s);
  c.fill();
}

export function lobsterpots(c, x, y, s) {
  for (const [dx, dy] of [
    [-3, 0],
    [3, 0],
    [0, -4.5],
  ]) {
    c.fillStyle = '#6b4a2a';
    c.fillRect(x + (dx - 2.6) * s, y + (dy - 4) * s, 5.2 * s, 4 * s);
    c.strokeStyle = 'rgba(230,220,190,0.6)';
    c.lineWidth = 0.25 * s;
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(x + (dx - 2.6 + i * 1.3) * s, y + (dy - 4) * s);
      c.lineTo(x + (dx - 2.6 + i * 1.3) * s, y + dy * s);
      c.stroke();
    }
  }
}

/** Petit château sur la Côte Sauvage. */
export function castle(c, x, y, s) {
  shadow(c, x, y, 9 * s);
  c.fillStyle = '#8f8a80';
  c.fillRect(x - 7 * s, y - 8 * s, 14 * s, 8 * s);
  for (const dx of [-7, 4.5]) {
    c.fillRect(x + dx * s, y - 13 * s, 2.5 * s, 13 * s);
    c.fillStyle = '#6d4a3a';
    c.beginPath();
    c.moveTo(x + (dx - 0.4) * s, y - 13 * s);
    c.lineTo(x + (dx + 1.25) * s, y - 16 * s);
    c.lineTo(x + (dx + 2.9) * s, y - 13 * s);
    c.fill();
    c.fillStyle = '#8f8a80';
  }
  c.fillStyle = '#3b3530';
  c.fillRect(x - 1 * s, y - 4 * s, 2 * s, 4 * s);
}

export { crab };
export const SPRITES = { parasol, sunbather, gull, kite, flag, stand, boat, trawler, lighthouse, lobsterpots, castle, crab };
