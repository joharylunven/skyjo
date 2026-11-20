// Décors malgaches dessinés au canvas, en unités du plateau (100 × 160). Chaque sprite est posé
// sur le sol en (x, y) et dessiné vers le haut ; t = temps en secondes pour les animations.

const TAU = Math.PI * 2;

function shadow(c, x, y, rx, ry = rx * 0.32) {
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fill();
}

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

// ---------------------------------------------------------------------------- arbres

export function baobab(c, x, y, s) {
  shadow(c, x, y, 8 * s);
  const h = 27 * s;
  const top = y - h;
  // branches courtes et tordues tout en haut, comme sur l'Allée des Baobabs
  c.strokeStyle = '#8f6a4a';
  c.lineCap = 'round';
  for (const [dx, dy, w] of [
    [-7, -5, 1.4],
    [-3.5, -7, 1.2],
    [0.5, -8, 1.3],
    [4, -6.5, 1.2],
    [7.5, -4, 1.4],
  ]) {
    c.lineWidth = w * s;
    c.beginPath();
    c.moveTo(x + dx * 0.25 * s, top + 1 * s);
    c.quadraticCurveTo(x + dx * 0.7 * s, top + dy * 0.4 * s, x + dx * s, top + dy * s);
    c.stroke();
    ellipse(c, x + dx * s, top + dy * s - 0.6 * s, 2.6 * s, 1.5 * s, '#5f8a3b');
    ellipse(c, x + dx * s + 0.8 * s, top + dy * s - 1.1 * s, 1.6 * s, 1 * s, '#79a64a');
  }
  // tronc en bouteille
  c.fillStyle = '#b48a62';
  c.beginPath();
  c.moveTo(x - 4.6 * s, y);
  c.bezierCurveTo(x - 6.4 * s, y - 10 * s, x - 3 * s, y - 20 * s, x - 2.6 * s, top + 1 * s);
  c.lineTo(x + 2.6 * s, top + 1 * s);
  c.bezierCurveTo(x + 3 * s, y - 20 * s, x + 6.4 * s, y - 10 * s, x + 4.6 * s, y);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(90,60,35,0.35)';
  c.lineWidth = 0.5 * s;
  for (const dx of [-2.4, -0.6, 1.4, 3]) line(c, [[x + dx * s, y - 1 * s], [x + dx * 0.7 * s, top + 4 * s]], 'rgba(90,60,35,0.3)', 0.45 * s);
  // lumière
  c.fillStyle = 'rgba(255,230,190,0.18)';
  c.beginPath();
  c.moveTo(x - 3.6 * s, y - 1 * s);
  c.bezierCurveTo(x - 5 * s, y - 10 * s, x - 2.6 * s, y - 19 * s, x - 2 * s, top + 2 * s);
  c.lineTo(x - 0.8 * s, top + 2 * s);
  c.bezierCurveTo(x - 1.6 * s, y - 14 * s, x - 2.4 * s, y - 6 * s, x - 1.6 * s, y - 1 * s);
  c.fill();
}

export function ravenala(c, x, y, s, t) {
  shadow(c, x, y, 5 * s);
  const top = y - 9 * s;
  line(c, [[x, y], [x, top]], '#8b8173', 1.6 * s);
  const sway = Math.sin(t * 0.9 + x) * 0.05;
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (i - 5) * 0.2 + sway;
    const len = (12 - Math.abs(i - 5) * 0.9) * s;
    const ex = x + Math.cos(a) * len;
    const ey = top + Math.sin(a) * len;
    line(c, [[x, top], [ex, ey]], '#6d8f45', 0.35 * s);
    c.save();
    c.translate((x + ex) / 2 + Math.cos(a) * len * 0.18, (top + ey) / 2 + Math.sin(a) * len * 0.18);
    c.rotate(a);
    ellipse(c, 0, 0, len * 0.42, 1.1 * s, i % 2 ? '#5d9a3e' : '#4f8a35');
    c.restore();
  }
}

export function palm(c, x, y, s, t) {
  shadow(c, x + 3 * s, y, 6 * s);
  const lean = 5 * s;
  const tx = x + lean;
  const ty = y - 20 * s;
  c.strokeStyle = '#a07c52';
  c.lineWidth = 1.7 * s;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x - 1 * s, y - 12 * s, tx, ty);
  c.stroke();
  for (let i = 0; i < 4; i++) line(c, [[x - 0.4 * s + i * 0.6 * s, y - (3 + i * 4) * s], [x + 0.8 * s + i * 0.9 * s, y - (3.6 + i * 4) * s]], '#7d5d3a', 0.3 * s);
  const sway = Math.sin(t * 1.1 + x * 0.3) * 0.08;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.55 + sway;
    const len = 10 * s;
    const ex = tx + Math.cos(a) * len;
    const ey = ty + Math.sin(a) * len * 0.6 + 4 * s;
    c.strokeStyle = '#3f8f3a';
    c.lineWidth = 1.1 * s;
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - 2 * s, ex, ey);
    c.stroke();
  }
  ellipse(c, tx - 0.8 * s, ty + 0.8 * s, 0.9 * s, 0.9 * s, '#6b4a2a');
  ellipse(c, tx + 0.9 * s, ty + 1 * s, 0.9 * s, 0.9 * s, '#7a5530');
}

export function jungle(c, x, y, s) {
  shadow(c, x, y, 9 * s);
  line(c, [[x, y], [x - 1 * s, y - 14 * s]], '#4a3523', 2.2 * s);
  for (const [dx, dy, r, col] of [
    [-6, -14, 6, '#1f5a2c'],
    [5, -15, 6.5, '#235f30'],
    [0, -20, 7, '#2b6d37'],
    [-3, -24, 5, '#348042'],
    [4, -23, 4.5, '#3b8a48'],
  ])
    ellipse(c, x + dx * s, y + dy * s, r * s, r * 0.8 * s, col);
}

export function fern(c, x, y, s, t) {
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.45 + Math.sin(t * 1.3 + i + x) * 0.04;
    const len = 6 * s;
    c.strokeStyle = i % 2 ? '#3f8a3f' : '#4d9c47';
    c.lineWidth = 1 * s;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.6);
    c.stroke();
  }
}

export function grass(c, x, y, s, t) {
  for (let i = 0; i < 7; i++) {
    const dx = (i - 3) * 0.8 * s;
    const sw = Math.sin(t * 1.5 + i + x) * 0.6 * s;
    line(c, [[x + dx, y], [x + dx * 1.4 + sw, y - (2.5 + (i % 3)) * s]], i % 2 ? '#a4a24a' : '#8f9a3e', 0.35 * s);
  }
}

export function tsingy(c, x, y, s) {
  shadow(c, x, y, 7 * s);
  for (const [dx, h, w] of [
    [-4.5, 9, 3],
    [-1.5, 14, 3.4],
    [2, 11, 3],
    [4.8, 7, 2.6],
    [0.5, 6, 4],
  ]) {
    const bx = x + dx * s;
    c.fillStyle = '#8f8d87';
    c.beginPath();
    c.moveTo(bx - w * s, y);
    c.lineTo(bx - w * 0.3 * s, y - h * 0.55 * s);
    c.lineTo(bx - w * 0.15 * s, y - h * s);
    c.lineTo(bx + w * 0.25 * s, y - h * 0.6 * s);
    c.lineTo(bx + w * s, y);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath();
    c.moveTo(bx - w * s, y);
    c.lineTo(bx - w * 0.3 * s, y - h * 0.55 * s);
    c.lineTo(bx - w * 0.15 * s, y - h * s);
    c.lineTo(bx - w * 0.2 * s, y);
    c.fill();
  }
}

export function hut(c, x, y, s) {
  shadow(c, x, y, 7 * s);
  c.fillStyle = '#b47b4c';
  c.fillRect(x - 5 * s, y - 6 * s, 10 * s, 6 * s);
  c.fillStyle = '#5a3a22';
  c.fillRect(x - 1.2 * s, y - 3.8 * s, 2.4 * s, 3.8 * s);
  c.fillStyle = '#d6b066';
  c.beginPath();
  c.moveTo(x - 6.5 * s, y - 5.5 * s);
  c.lineTo(x, y - 12 * s);
  c.lineTo(x + 6.5 * s, y - 5.5 * s);
  c.closePath();
  c.fill();
  for (let i = -2; i <= 2; i++) line(c, [[x + i * 1.2 * s, y - 6 * s], [x + i * 0.4 * s, y - 11 * s]], 'rgba(120,85,30,0.45)', 0.3 * s);
}

// ---------------------------------------------------------------------------- animaux

/** Maki catta (queue annelée) ; variantes : sifaka blanc, maki noir. */
export function lemur(c, x, y, s, t, o = {}) {
  const hop = Math.max(0, Math.sin(t * 1.2 + x * 0.7)) ** 12 * 3 * s;
  y -= hop;
  shadow(c, x, y + hop, 3 * s);
  const fur = o.white ? '#efece4' : o.black ? '#3b3632' : '#a5a29b';
  const ringA = o.white ? '#efece4' : o.black ? '#2a2623' : '#1f1d1c';
  const ringB = o.white ? '#dcd8ce' : o.black ? '#4a443f' : '#f2f0ea';
  // queue
  const sway = Math.sin(t * 1.8 + x) * 0.7;
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    const px = x + 2 * s + Math.sin(u * Math.PI * 1.3 + sway * u) * 3.2 * s * u;
    const py = y - 1 * s - u * 13 * s;
    ellipse(c, px, py, 0.95 * s, 0.75 * s, i % 2 ? ringA : ringB);
  }
  // corps
  ellipse(c, x, y - 3.2 * s, 2.3 * s, 3.1 * s, fur);
  ellipse(c, x - 0.3 * s, y - 2.8 * s, 1.3 * s, 2.1 * s, o.black ? '#5a524b' : '#e6e3dc');
  // tête
  const hy = y - 7 * s;
  const tilt = Math.sin(t * 0.7 + x * 2) * 0.15;
  c.save();
  c.translate(x, hy);
  c.rotate(tilt);
  ellipse(c, -1.2 * s, -1.2 * s, 0.6 * s, 0.8 * s, fur);
  ellipse(c, 1.2 * s, -1.2 * s, 0.6 * s, 0.8 * s, fur);
  ellipse(c, 0, 0, 1.7 * s, 1.5 * s, o.white ? '#2b2724' : '#f1efe9');
  if (!o.white) {
    ellipse(c, -0.65 * s, -0.1 * s, 0.6 * s, 0.55 * s, '#262321');
    ellipse(c, 0.65 * s, -0.1 * s, 0.6 * s, 0.55 * s, '#262321');
  }
  const blink = Math.sin(t * 0.9 + x) > 0.97 ? 0.08 : 1;
  ellipse(c, -0.65 * s, -0.1 * s, 0.33 * s, 0.33 * s * blink, '#f2b62f');
  ellipse(c, 0.65 * s, -0.1 * s, 0.33 * s, 0.33 * s * blink, '#f2b62f');
  ellipse(c, 0, 0.9 * s, 0.6 * s, 0.4 * s, '#1c1a19');
  c.restore();
}

export function chameleon(c, x, y, s, t) {
  // brindille
  line(c, [[x - 6 * s, y - 2 * s], [x + 7 * s, y - 3.5 * s]], '#6b4a2a', 0.8 * s);
  const hue = 95 + Math.sin(t * 0.4 + x) * 55; // du vert au turquoise, puis vers l'orange
  const body = `hsl(${hue} 60% 45%)`;
  const light = `hsl(${hue + 15} 70% 62%)`;
  const by = y - 4.6 * s;
  // queue enroulée
  c.strokeStyle = body;
  c.lineWidth = 0.9 * s;
  c.beginPath();
  c.arc(x - 5 * s, by + 1.5 * s, 1.4 * s, 0, Math.PI * 1.7);
  c.stroke();
  ellipse(c, x, by, 4.2 * s, 2.2 * s, body);
  ellipse(c, x - 0.5 * s, by + 0.6 * s, 3.2 * s, 0.7 * s, light);
  // crête et tête casquée
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(x + 2.8 * s, by - 1.6 * s);
  c.lineTo(x + 6.4 * s, by);
  c.lineTo(x + 3 * s, by + 1.4 * s);
  c.fill();
  // œil tourelle qui roule
  ellipse(c, x + 4 * s, by - 0.2 * s, 1 * s, 1 * s, light);
  const a = t * 1.7 + x;
  ellipse(c, x + 4 * s + Math.cos(a) * 0.4 * s, by - 0.2 * s + Math.sin(a * 1.3) * 0.4 * s, 0.35 * s, 0.35 * s, '#1b1b1b');
  // pattes
  line(c, [[x - 1.8 * s, by + 1.5 * s], [x - 2.4 * s, y - 2.6 * s]], body, 0.6 * s);
  line(c, [[x + 1.8 * s, by + 1.5 * s], [x + 2.2 * s, y - 3.1 * s]], body, 0.6 * s);
  // langue, de temps en temps
  const tongue = Math.max(0, Math.sin(t * 0.6 + x * 3)) ** 30;
  if (tongue > 0.05) line(c, [[x + 6 * s, by + 0.2 * s], [x + 6 * s + tongue * 7 * s, by - tongue * 1.5 * s]], '#e06a8a', 0.35 * s);
}

export function zebu(c, x, y, s, t) {
  shadow(c, x, y, 6 * s);
  const graze = (Math.sin(t * 0.6 + x) + 1) / 2;
  const coat = '#e3d8c6';
  for (const dx of [-3.4, -2, 2.4, 3.6]) line(c, [[x + dx * s, y - 3 * s], [x + dx * s, y]], '#bfb29e', 0.8 * s);
  ellipse(c, x, y - 4.6 * s, 5 * s, 2.6 * s, coat);
  ellipse(c, x - 1.8 * s, y - 7 * s, 1.9 * s, 1.4 * s, '#d6c9b4'); // bosse
  // queue
  line(c, [[x + 4.8 * s, y - 5 * s], [x + 5.6 * s + Math.sin(t * 2.5 + x) * 0.6 * s, y - 2 * s]], '#bfb29e', 0.35 * s);
  // tête qui broute
  const hx = x - 6 * s;
  const hy = y - 5.4 * s + graze * 3 * s;
  line(c, [[x - 4 * s, y - 5.6 * s], [hx, hy]], coat, 1.6 * s);
  ellipse(c, hx - 0.6 * s, hy + 0.4 * s, 1.5 * s, 1.1 * s, coat);
  // cornes en lyre
  c.strokeStyle = '#4b3b2a';
  c.lineWidth = 0.45 * s;
  c.beginPath();
  c.moveTo(hx - 0.2 * s, hy - 0.6 * s);
  c.quadraticCurveTo(hx - 2 * s, hy - 2.4 * s, hx - 1 * s, hy - 3.6 * s);
  c.moveTo(hx + 0.4 * s, hy - 0.6 * s);
  c.quadraticCurveTo(hx + 1.8 * s, hy - 2.4 * s, hx + 1.2 * s, hy - 3.6 * s);
  c.stroke();
  ellipse(c, hx - 1 * s, hy + 0.1 * s, 0.25 * s, 0.25 * s, '#1c1a19');
}

export function flamingo(c, x, y, s, t) {
  shadow(c, x, y, 2.5 * s);
  line(c, [[x, y], [x, y - 7 * s]], '#e07a8c', 0.35 * s);
  line(c, [[x, y - 4 * s], [x + 1.2 * s, y - 5.4 * s], [x + 0.3 * s, y - 6.6 * s]], '#e07a8c', 0.3 * s);
  ellipse(c, x + 0.6 * s, y - 8 * s, 2.4 * s, 1.5 * s, '#f39ab0', -0.2);
  const bob = Math.sin(t * 0.8 + x) * 0.6 * s;
  c.strokeStyle = '#f39ab0';
  c.lineWidth = 0.6 * s;
  c.beginPath();
  c.moveTo(x - 1.2 * s, y - 8.4 * s);
  c.bezierCurveTo(x - 3.6 * s, y - 10 * s, x - 0.6 * s, y - 12 * s, x - 2 * s, y - 14 * s + bob);
  c.stroke();
  ellipse(c, x - 2.2 * s, y - 14.2 * s + bob, 0.8 * s, 0.6 * s, '#f39ab0');
  line(c, [[x - 2.8 * s, y - 14 * s + bob], [x - 3.6 * s, y - 13.2 * s + bob]], '#2b2b2b', 0.4 * s);
}

export function heron(c, x, y, s, t) {
  shadow(c, x, y, 2.2 * s);
  line(c, [[x - 0.5 * s, y], [x - 0.3 * s, y - 5 * s]], '#3a3a3a', 0.3 * s);
  line(c, [[x + 0.6 * s, y], [x + 0.4 * s, y - 5 * s]], '#3a3a3a', 0.3 * s);
  ellipse(c, x, y - 6.4 * s, 2.4 * s, 1.5 * s, '#f6f5f0', -0.25);
  const peck = Math.max(0, Math.sin(t * 0.9 + x)) ** 8;
  c.strokeStyle = '#f6f5f0';
  c.lineWidth = 0.6 * s;
  c.beginPath();
  c.moveTo(x - 1.5 * s, y - 7 * s);
  c.quadraticCurveTo(x - 3.2 * s, y - 9 * s + peck * 3 * s, x - 2 * s - peck * 2 * s, y - 11 * s + peck * 6 * s);
  c.stroke();
  const hx = x - 2 * s - peck * 2 * s;
  const hy = y - 11 * s + peck * 6 * s;
  ellipse(c, hx, hy, 0.75 * s, 0.6 * s, '#f6f5f0');
  line(c, [[hx - 0.5 * s, hy], [hx - 2.4 * s, hy + 0.5 * s]], '#e8b730', 0.35 * s);
}

export function croco(c, x, y, s, t) {
  const bob = Math.sin(t * 1.2 + x) * 0.3 * s;
  const glide = Math.sin(t * 0.25 + x) * 4 * s;
  const cx = x + glide;
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 0.3 * s;
  c.beginPath();
  c.ellipse(cx, y + 0.6 * s, 5 * s, 1.3 * s, 0, 0, TAU);
  c.stroke();
  ellipse(c, cx, y + bob, 4.4 * s, 0.9 * s, '#3c5a34');
  ellipse(c, cx + 2.2 * s, y - 0.7 * s + bob, 0.7 * s, 0.55 * s, '#4d6e40');
  ellipse(c, cx + 0.8 * s, y - 0.7 * s + bob, 0.7 * s, 0.55 * s, '#4d6e40');
  ellipse(c, cx + 2.3 * s, y - 0.9 * s + bob, 0.28 * s, 0.28 * s, '#f0d34a');
  ellipse(c, cx + 0.9 * s, y - 0.9 * s + bob, 0.28 * s, 0.28 * s, '#f0d34a');
}

export function pirogue(c, x, y, s, t) {
  const px = ((t * 4 + x) % 140) - 20;
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 0.3;
  c.beginPath();
  c.moveTo(px - 9 * s, y + 0.8 * s);
  c.lineTo(px - 16 * s, y + 0.2 * s);
  c.moveTo(px - 9 * s, y + 1.4 * s);
  c.lineTo(px - 15 * s, y + 2.2 * s);
  c.stroke();
  c.fillStyle = '#5b3a1f';
  c.beginPath();
  c.moveTo(px - 8 * s, y - 0.6 * s);
  c.quadraticCurveTo(px, y + 2.6 * s, px + 8 * s, y - 0.6 * s);
  c.quadraticCurveTo(px, y + 0.6 * s, px - 8 * s, y - 0.6 * s);
  c.fill();
  // pêcheur et sa pagaie
  ellipse(c, px - 1 * s, y - 2.4 * s, 1.1 * s, 1.8 * s, '#c0492f');
  ellipse(c, px - 1 * s, y - 4.8 * s, 0.8 * s, 0.8 * s, '#6b452b');
  c.fillStyle = '#e1c27a';
  c.beginPath();
  c.moveTo(px - 2.6 * s, y - 5.1 * s);
  c.lineTo(px - 1 * s, y - 6.6 * s);
  c.lineTo(px + 0.6 * s, y - 5.1 * s);
  c.fill();
  const a = Math.sin(t * 2.2) * 0.5;
  line(c, [[px - 1 * s + Math.cos(a + 2) * 3 * s, y - 4 * s + Math.sin(a + 2) * 2 * s], [px - 1 * s - Math.cos(a + 2) * 4 * s, y + 1.4 * s]], '#3b2614', 0.35 * s);
}

export function crab(c, x, y, s, t) {
  const cx = x + Math.sin(t * 0.8 + x) * 3 * s;
  const snap = Math.sin(t * 4 + x) * 0.3;
  for (const d of [-1, 1]) {
    for (let i = 0; i < 3; i++) line(c, [[cx + d * 1 * s, y - 0.6 * s], [cx + d * (2.4 + i * 0.2) * s, y + (i - 1) * 0.6 * s]], '#c2412f', 0.25 * s);
    ellipse(c, cx + d * 2.4 * s, y - 2 * s, 0.9 * s, 0.6 * s, '#e0503a', d * snap);
  }
  ellipse(c, cx, y - 0.8 * s, 1.8 * s, 1.1 * s, '#e0503a');
  ellipse(c, cx - 0.5 * s, y - 1.9 * s, 0.25 * s, 0.25 * s, '#1b1b1b');
  ellipse(c, cx + 0.5 * s, y - 1.9 * s, 0.25 * s, 0.25 * s, '#1b1b1b');
}

export function turtle(c, x, y, s, t) {
  const tx = x + Math.sin(t * 0.2 + x) * 3 * s;
  const ty = y + Math.cos(t * 0.17 + x) * 6 * s;
  const fl = Math.sin(t * 2) * 0.4;
  for (const [dx, dy] of [
    [-1.6, -1.4],
    [1.6, -1.4],
    [-1.4, 1.6],
    [1.4, 1.6],
  ])
    ellipse(c, tx + dx * s, ty + dy * s, 0.9 * s, 0.5 * s, '#7fae6a', Math.sign(dx) * (0.6 + fl));
  ellipse(c, tx, ty - 2.6 * s, 0.7 * s, 0.8 * s, '#7fae6a');
  ellipse(c, tx, ty, 2 * s, 2.4 * s, '#4e7a3a');
  ellipse(c, tx, ty, 1.2 * s, 1.5 * s, '#5f8d47');
}

/** Papillon comète (Argema mittrei), jaune aux longues queues. */
export function butterfly(c, x, y, s, t) {
  const px = x + Math.sin(t * 0.7 + x) * 9 * s;
  const py = y - 10 * s + Math.sin(t * 1.1 + y) * 5 * s;
  const flap = Math.abs(Math.sin(t * 9 + x));
  c.save();
  c.translate(px, py);
  c.rotate(Math.sin(t * 0.7 + x) * 0.3);
  for (const d of [-1, 1]) {
    ellipse(c, d * 1.3 * s * flap, -0.3 * s, 1.4 * s * flap, 1.1 * s, '#f2d35b');
    ellipse(c, d * 0.9 * s * flap, 1 * s, 0.9 * s * flap, 0.8 * s, '#e9c24a');
    line(c, [[d * 0.9 * s * flap, 1.6 * s], [d * 1.4 * s * flap, 4 * s]], '#e2b445', 0.35 * s);
    ellipse(c, d * 1.2 * s * flap, -0.4 * s, 0.3 * s * flap, 0.3 * s, '#b0472f');
  }
  ellipse(c, 0, 0, 0.3 * s, 1.2 * s, '#6b4a2a');
  c.restore();
}

export const SPRITES = { baobab, ravenala, palm, jungle, fern, grass, tsingy, hut, lemur, chameleon, zebu, flamingo, heron, croco, pirogue, crab, turtle, butterfly };
