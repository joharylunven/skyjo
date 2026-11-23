// Dessin d'un terrain de pétanque à Quiberon : sol (sable, pavés, pontons), mer, obstacles,
// boules en chocolat et en caramel, cochonnet bonbon, visée et décors animés.

import { W, H, BOULE_R, COCHONNET_R, throwDistance, inPoly } from './engine.js';
import { COCHONNET_ZONE } from './terrains.js';
import { SPRITES } from './decor.js';

export { COCHONNET_ZONE };
const TAU = Math.PI * 2;
const GROUND = {
  sand: '#ead7a4',
  wet: '#cdb886',
  paves: '#9a958c',
  deck: '#b98a55',
  algues: '#7d8f4a',
  galets: '#b7ada0',
  flaque: '#5a9fc4',
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function polyPath(c, poly) {
  c.beginPath();
  poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

/** Texture d'un sol dans la zone courante (déjà découpée). */
function texture(c, kind, box, rand) {
  const [x0, y0, x1, y1] = box;
  c.fillStyle = GROUND[kind] ?? GROUND.sand;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (kind === 'paves') {
    for (let y = y0; y < y1; y += 4) {
      const off = (Math.floor(y / 4) % 2) * 2.5;
      for (let x = x0 - 5 + off; x < x1; x += 5) {
        c.fillStyle = `rgba(${110 + rand() * 40},${105 + rand() * 35},${95 + rand() * 30},0.55)`;
        c.beginPath();
        c.roundRect(x + 0.3, y + 0.3, 4.4, 3.4, 0.8);
        c.fill();
      }
    }
  } else if (kind === 'deck') {
    for (let x = x0; x < x1; x += 4.5) {
      c.fillStyle = `rgba(${90 + rand() * 40},${55 + rand() * 25},20,0.25)`;
      c.fillRect(x, y0, 4.2, y1 - y0);
      c.fillStyle = 'rgba(60,35,10,0.45)';
      c.fillRect(x + 4.2, y0, 0.3, y1 - y0);
      for (let y = y0 + rand() * 20; y < y1; y += 22 + rand() * 20) {
        c.fillStyle = 'rgba(40,25,10,0.5)';
        c.beginPath();
        c.arc(x + 1, y, 0.25, 0, TAU);
        c.arc(x + 3.2, y, 0.25, 0, TAU);
        c.fill();
      }
    }
  } else if (kind === 'galets') {
    for (let i = 0; i < 160; i++) {
      c.fillStyle = `hsl(30 ${8 + rand() * 10}% ${48 + rand() * 30}%)`;
      c.beginPath();
      c.ellipse(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), 0.8 + rand() * 1, 0.6 + rand() * 0.7, rand() * 3, 0, TAU);
      c.fill();
    }
  } else if (kind === 'algues') {
    for (let i = 0; i < 70; i++) {
      const x = x0 + rand() * (x1 - x0);
      const y = y0 + rand() * (y1 - y0);
      c.strokeStyle = rand() > 0.5 ? '#4f6a2a' : '#6b8a3a';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 2, y - 1.5, x + 3.5 + rand() * 2, y + rand() * 2 - 1);
      c.stroke();
    }
  } else {
    // sable : grains et quelques traces de pas
    for (let i = 0; i < 360; i++) {
      c.fillStyle = rand() > 0.5 ? 'rgba(160,125,70,0.25)' : 'rgba(255,255,255,0.35)';
      c.fillRect(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), 0.35, 0.35);
    }
    for (let i = 0; i < 6; i++) {
      let x = x0 + rand() * (x1 - x0);
      let y = y0 + rand() * (y1 - y0);
      for (let k = 0; k < 4; k++) {
        c.fillStyle = 'rgba(150,120,70,0.25)';
        c.beginPath();
        c.ellipse(x + (k % 2) * 1.6, y, 0.6, 1.1, 0, 0, TAU);
        c.fill();
        y -= 3;
        x += 0.4;
      }
    }
  }
}

export class TerrainView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = null;
    this.cache = document.createElement('canvas');
  }

  resize(cssWidth) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = cssWidth;
    this.k = (cssWidth / W) * dpr;
    this.canvas.width = Math.round(W * this.k);
    this.canvas.height = Math.round(H * this.k);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${(cssWidth * H) / W}px`;
    if (this.terrain) this.buildCache();
  }

  setTerrain(t) {
    if (this.terrain?.id === t.id) return;
    this.terrain = t;
    this.buildCache();
  }

  toCourse(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  }

  /** Les zones de mer, hors du terrain. */
  seaPolys() {
    const t = this.terrain;
    const b = t.bounds;
    const polys = [];
    if (t.sea === 'top') polys.push([[0, 0], [W, 0], [W, 14], [0, 15]]);
    if (t.sea === 'left' || t.sea === 'both') polys.push([[0, 0], [b.x0 - 6, 0], [b.x0 - 6, H], [0, H]]);
    if (t.sea === 'right' || t.sea === 'both') polys.push([[b.x1 + 6, 0], [W, 0], [W, H], [b.x1 + 6, H]]);
    return polys;
  }

  buildCache() {
    const t = this.terrain;
    this.cache.width = this.canvas.width;
    this.cache.height = this.canvas.height;
    const c = this.cache.getContext('2d');
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    const rand = rng(t.id.length * 7919);
    const b = t.bounds;

    // alentours : plage, ou quai pavé
    texture(c, t.ground === 'sand' ? 'sand' : t.ground === 'paves' ? 'paves' : 'sand', [0, 0, W, H], rand);
    if (t.ground !== 'sand') {
      c.fillStyle = 'rgba(0,0,0,0.08)';
      c.fillRect(0, 0, W, H);
    }
    for (const p of this.seaPolys()) {
      polyPath(c, p);
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#2bb3c0');
      g.addColorStop(1, '#1f7fa8');
      c.fillStyle = g;
      c.fill();
    }

    // le terrain
    c.save();
    c.beginPath();
    c.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    c.clip();
    texture(c, t.ground, [b.x0, b.y0, b.x1, b.y1], rand);
    for (const z of t.zones ?? []) {
      c.save();
      polyPath(c, z.poly);
      c.clip();
      const xs = z.poly.map((p) => p[0]);
      const ys = z.poly.map((p) => p[1]);
      texture(c, z.type, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], rand);
      c.restore();
      if (z.type === 'flaque') {
        polyPath(c, z.poly);
        c.strokeStyle = 'rgba(255,255,255,0.6)';
        c.lineWidth = 0.6;
        c.stroke();
      }
    }
    // zone du cochonnet : deux traits discrets
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.setLineDash([1.5, 1.5]);
    c.lineWidth = 0.4;
    for (const y of [COCHONNET_ZONE.y0, COCHONNET_ZONE.y1]) {
      c.beginPath();
      c.moveTo(b.x0, y);
      c.lineTo(b.x1, y);
      c.stroke();
    }
    c.setLineDash([]);
    c.restore();

    // limites : corde et piquets (ou trait de craie)
    c.strokeStyle = t.ground === 'sand' ? '#c79a52' : '#fbfaf5';
    c.lineWidth = t.ground === 'sand' ? 0.6 : 0.5;
    c.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    if (t.ground === 'sand') {
      for (const [x, y] of [
        [b.x0, b.y0],
        [b.x1, b.y0],
        [b.x0, b.y1],
        [b.x1, b.y1],
        [b.x0, (b.y0 + b.y1) / 2],
        [b.x1, (b.y0 + b.y1) / 2],
      ]) {
        c.fillStyle = '#7a5530';
        c.beginPath();
        c.arc(x, y, 0.9, 0, TAU);
        c.fill();
      }
    }
    // cercle de lancer
    const [cx, cy] = t.circle;
    c.strokeStyle = '#e1262d';
    c.lineWidth = 0.7;
    c.beginPath();
    c.arc(cx, cy, 3.6, 0, TAU);
    c.stroke();

    for (const o of t.obstacles ?? []) this.drawObstacle(c, o);
  }

  drawObstacle(c, o) {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    if (o.poly) {
      c.save();
      c.translate(0.6, 0.9);
      polyPath(c, o.poly);
      c.fill();
      c.restore();
      polyPath(c, o.poly);
      if (o.style === 'pot') {
        c.fillStyle = '#6b4a2a';
        c.fill();
        c.save();
        polyPath(c, o.poly);
        c.clip();
        c.strokeStyle = 'rgba(230,220,190,0.7)';
        c.lineWidth = 0.3;
        for (let x = 0; x < W; x += 1.6) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x - 30, H);
          c.stroke();
        }
        c.restore();
      } else if (o.style === 'dinghy') {
        c.fillStyle = '#e1262d';
        c.fill();
        c.strokeStyle = '#fbfaf5';
        c.lineWidth = 0.6;
        c.stroke();
      } else {
        c.fillStyle = '#8d8a84';
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.3)';
        c.lineWidth = 0.4;
        c.stroke();
      }
      return;
    }
    const { x, y, r } = o;
    c.beginPath();
    c.ellipse(x + 0.6, y + 0.9, r + 0.3, r, 0, 0, TAU);
    c.fill();
    if (o.style === 'castle') {
      // château de sable vu d'en haut : tours et créneaux
      c.fillStyle = '#d8bd7f';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        c.fillStyle = '#c9a964';
        c.beginPath();
        c.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.32, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#e1262d';
      c.fillRect(x - 0.1, y - r * 0.9, 0.2, r * 0.8);
      c.beginPath();
      c.moveTo(x + 0.1, y - r * 0.9);
      c.lineTo(x + 1.6, y - r * 0.75);
      c.lineTo(x + 0.1, y - r * 0.6);
      c.fill();
    } else if (o.style === 'bucket') {
      c.fillStyle = '#e1262d';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.fillStyle = '#b81d23';
      c.beginPath();
      c.arc(x, y, r * 0.7, 0, TAU);
      c.fill();
      c.strokeStyle = '#f2b84b';
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(x + r, y + r);
      c.lineTo(x + r + 3, y + r + 3);
      c.stroke();
    } else if (o.style === 'table') {
      c.fillStyle = '#fbfaf5';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.fillStyle = '#e3b06a';
      c.beginPath();
      c.arc(x - 0.6, y, r * 0.45, 0, TAU);
      c.fill(); // une crêpe dans l'assiette
    } else if (o.style === 'bollard') {
      c.fillStyle = '#2b2b2b';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.fillStyle = '#555';
      c.beginPath();
      c.arc(x - 0.5, y - 0.5, r * 0.5, 0, TAU);
      c.fill();
    } else {
      c.fillStyle = '#8d8a84';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
  }

  /**
   * balls : [{ x, y, z, kind, owner, highlight }] ; aim : { angle, power, mode } ; t : secondes.
   * point : { ids: boules qui marquent, holder } ; puffs : [{ x, y, age }]
   */
  draw({ t, balls = [], aim = null, point = null, puffs = [] }) {
    const c = this.ctx;
    const tr = this.terrain;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.cache, 0, 0);
    c.setTransform(this.k, 0, 0, this.k, 0, 0);

    // vagues
    for (const p of this.seaPolys()) {
      c.save();
      polyPath(c, p);
      c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 0.4;
      for (let y = 2; y < H; y += 4) {
        c.beginPath();
        for (let x = 0; x <= W; x += 2) {
          const yy = y + Math.sin(x * 0.3 + t * 1.5 + y) * 0.6;
          if ((x + y * 5 + Math.floor(t * 3)) % 12 < 5) c.moveTo(x, yy);
          else c.lineTo(x, yy);
        }
        c.stroke();
      }
      c.restore();
      // écume sur le bord
      c.save();
      polyPath(c, p);
      c.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 2) * 0.2})`;
      c.lineWidth = 1 + Math.sin(t * 1.3) * 0.4;
      c.stroke();
      c.restore();
    }
    // reflets dans les flaques
    for (const z of (tr.zones ?? []).filter((q) => q.type === 'flaque')) {
      c.save();
      polyPath(c, z.poly);
      c.clip();
      const xs = z.poly.map((p) => p[0]);
      const ys = z.poly.map((p) => p[1]);
      const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const my = (Math.min(...ys) + Math.max(...ys)) / 2;
      c.strokeStyle = 'rgba(255,255,255,0.4)';
      c.lineWidth = 0.3;
      const r = (t * 3) % 8;
      c.beginPath();
      c.arc(mx, my, r, 0, TAU);
      c.stroke();
      c.restore();
    }

    // le point : trait vers la meilleure boule
    const coch = balls.find((b) => b.kind === 'cochonnet' && !b.z);
    if (point && coch) {
      for (const b of balls) {
        if (!point.ids.includes(b.id)) continue;
        c.strokeStyle = 'rgba(255,255,255,0.7)';
        c.setLineDash([0.8, 0.8]);
        c.lineWidth = 0.35;
        c.beginPath();
        c.moveTo(coch.x, coch.y);
        c.lineTo(b.x, b.y);
        c.stroke();
        c.setLineDash([]);
      }
    }

    // nuages de sable à l'atterrissage
    for (const p of puffs) {
      const k = p.age / 0.7;
      if (k > 1) continue;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + p.x;
        c.fillStyle = `rgba(235,215,165,${0.7 * (1 - k)})`;
        c.beginPath();
        c.arc(p.x + Math.cos(a) * (1 + k * 4), p.y + Math.sin(a) * (1 + k * 3), 0.7 * (1 - k * 0.5), 0, TAU);
        c.fill();
      }
    }

    // boules au sol, puis celle en l'air
    const sorted = [...balls].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    for (const b of sorted) this.drawBall(c, b, point);

    if (aim) this.drawAim(c, aim);

    const decor = [...(tr.decor ?? [])].sort((a, b) => a.y - b.y);
    for (const d of decor) SPRITES[d.k]?.(c, d.x, d.y, d.s ?? 1, t, d);
  }

  drawBall(c, b, point) {
    const z = b.z ?? 0;
    const scale = 1 + z / 22;
    const r = (b.kind === 'cochonnet' ? COCHONNET_R : BOULE_R) * scale;
    // ombre au sol, de plus en plus loin et floue quand la boule monte
    c.fillStyle = `rgba(0,0,0,${0.3 - Math.min(0.18, z / 60)})`;
    c.beginPath();
    c.ellipse(b.x + 0.5 + z * 0.25, b.y + 0.7 + z * 0.35, r * 0.95, r * 0.75, 0, 0, TAU);
    c.fill();
    const y = b.y - z;
    if (b.kind === 'cochonnet') {
      // bonbon au caramel beurre salé dans son papier
      c.fillStyle = '#fbfaf5';
      for (const d of [-1, 1]) {
        c.beginPath();
        c.moveTo(b.x + d * r * 0.8, y);
        c.lineTo(b.x + d * r * 2, y - r * 0.8);
        c.lineTo(b.x + d * r * 2, y + r * 0.8);
        c.fill();
      }
      const g = c.createRadialGradient(b.x - r * 0.3, y - r * 0.3, 0.1, b.x, y, r);
      g.addColorStop(0, '#fff7e0');
      g.addColorStop(1, '#d9a14a');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(b.x, y, r * 1.1, r, 0, 0, TAU);
      c.fill();
      c.strokeStyle = '#2a6fd6';
      c.lineWidth = 0.18 * scale;
      c.beginPath();
      c.moveTo(b.x - r * 0.5, y - r * 0.8);
      c.lineTo(b.x - r * 0.5, y + r * 0.8);
      c.moveTo(b.x + r * 0.5, y - r * 0.8);
      c.lineTo(b.x + r * 0.5, y + r * 0.8);
      c.stroke();
      return;
    }
    const choco = b.owner === 0;
    const g = c.createRadialGradient(b.x - r * 0.35, y - r * 0.4, 0.1, b.x, y, r);
    if (choco) {
      g.addColorStop(0, '#9a6a4a');
      g.addColorStop(0.45, '#5a3520');
      g.addColorStop(1, '#2e1a0f');
    } else {
      g.addColorStop(0, '#fff0c4');
      g.addColorStop(0.45, '#e0a145');
      g.addColorStop(1, '#a8661e');
    }
    c.fillStyle = g;
    c.beginPath();
    c.arc(b.x, y, r, 0, TAU);
    c.fill();
    // stries de boule de pétanque
    c.strokeStyle = choco ? 'rgba(255,220,190,0.25)' : 'rgba(120,60,10,0.3)';
    c.lineWidth = 0.15 * scale;
    for (const k of [-0.45, 0.45]) {
      c.beginPath();
      c.ellipse(b.x, y, r * 0.95, r * Math.abs(k), 0, 0, TAU);
      c.stroke();
    }
    if (point?.ids.includes(b.id)) {
      c.strokeStyle = '#fbfaf5';
      c.lineWidth = 0.4;
      c.beginPath();
      c.arc(b.x, y, r + 0.7, 0, TAU);
      c.stroke();
    }
    if (b.label) {
      c.font = '3px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(b.label, b.x, y - r - 1);
    }
  }

  drawAim(c, { angle, power, mode }) {
    const [cx, cy] = this.terrain.circle;
    const D = throwDistance(power);
    const frac = mode === 'tirer' ? 0.95 : mode === 'cochonnet' ? 0.6 : 0.55;
    const lx = cx + Math.cos(angle) * D * frac;
    const ly = cy + Math.sin(angle) * D * frac;
    const ex = cx + Math.cos(angle) * D;
    const ey = cy + Math.sin(angle) * D;
    // arc de vol en pointillés
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.setLineDash([1.2, 1.2]);
    c.lineWidth = 0.5;
    c.beginPath();
    const steps = 16;
    const hgt = mode === 'tirer' ? 3 : 10;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = cx + (lx - cx) * u;
      const y = cy + (ly - cy) * u - 4 * hgt * u * (1 - u);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
    c.setLineDash([]);
    // point de chute
    c.strokeStyle = mode === 'tirer' ? '#e1262d' : '#fbfaf5';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(lx - 1.5, ly - 1.5);
    c.lineTo(lx + 1.5, ly + 1.5);
    c.moveTo(lx + 1.5, ly - 1.5);
    c.lineTo(lx - 1.5, ly + 1.5);
    c.stroke();
    if (mode !== 'tirer') {
      // où elle devrait s'arrêter (sur sable plat)
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.setLineDash([0.6, 0.6]);
      c.beginPath();
      c.moveTo(lx, ly);
      c.lineTo(ex, ey);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.arc(ex, ey, mode === 'cochonnet' ? 1.4 : 2.2, 0, TAU);
      c.stroke();
    }
  }
}

export { inPoly };
