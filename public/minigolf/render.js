// Dessin d'un trou au canvas : fond et green (mis en cache), puis à chaque image l'eau qui
// bouge, les pentes, les charrettes, le drapeau malgache, les décors animés et les balles.

import { W, H, BALL_R, HOLE_R, moverAt } from './engine.js';
import { SPRITES } from './decor.js';

const TAU = Math.PI * 2;

const THEMES = {
  savane: { ground: ['#d39a5c', '#c4824a'], felt: '#4aa356', wall: '#7a4a2a', speck: 'rgba(120,70,30,0.18)' },
  tsingy: { ground: ['#a7a59d', '#8d8b84'], felt: '#4f9d58', wall: '#64615b', speck: 'rgba(60,60,60,0.2)' },
  rizieres: { ground: ['#86bf5c', '#6ea84a'], felt: '#3f9a4c', wall: '#6b4a2b', speck: 'rgba(40,90,30,0.2)' },
  rn7: { ground: ['#c45c33', '#a9482a'], felt: '#4aa55a', wall: '#6b3a22', speck: 'rgba(90,30,10,0.2)' },
  foret: { ground: ['#2a5f34', '#1d4727'], felt: '#4cab52', wall: '#5a3d22', speck: 'rgba(0,30,0,0.25)' },
  riviere: { ground: ['#b08a55', '#957043'], felt: '#47a456', wall: '#6d4a2a', speck: 'rgba(80,50,20,0.2)' },
  plage: { ground: ['#f0dfae', '#e3cc8f'], felt: '#43b26a', wall: '#a8814f', speck: 'rgba(150,120,60,0.2)' },
  couchant: { ground: ['#e08a4a', '#9b4a5e'], felt: '#4aa356', wall: '#6b3a26', speck: 'rgba(80,20,30,0.18)' },
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

export class CourseView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hole = null;
    this.cache = document.createElement('canvas');
  }

  /** Taille en pixels CSS ; le plateau garde ses proportions 100 × 160. */
  resize(cssWidth) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = cssWidth;
    this.k = (cssWidth / W) * dpr;
    this.canvas.width = Math.round(W * this.k);
    this.canvas.height = Math.round(H * this.k);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${(cssWidth * H) / W}px`;
    if (this.hole) this.buildCache();
  }

  setHole(hole) {
    if (this.hole?.id === hole.id) return;
    this.hole = hole;
    this.buildCache();
  }

  /** Coordonnées plateau d'un point de l'écran. */
  toCourse(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  }

  // -------------------------------------------------------------------------- partie fixe

  buildCache() {
    const h = this.hole;
    const th = THEMES[h.theme] ?? THEMES.savane;
    this.theme = th;
    this.cache.width = this.canvas.width;
    this.cache.height = this.canvas.height;
    const c = this.cache.getContext('2d');
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    const rand = rng(h.id.length * 977 + h.par);

    // sol
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.ground[0]);
    g.addColorStop(1, th.ground[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = th.speck;
      c.beginPath();
      c.ellipse(rand() * W, rand() * H, 0.3 + rand() * 0.9, 0.2 + rand() * 0.5, 0, 0, TAU);
      c.fill();
    }
    if (h.theme === 'rizieres') {
      // terrasses de rizières
      for (let y = 4; y < H; y += 9) {
        c.strokeStyle = 'rgba(255,255,255,0.18)';
        c.lineWidth = 0.6;
        c.beginPath();
        for (let x = 0; x <= W; x += 4) c.lineTo(x, y + Math.sin(x * 0.08 + y) * 2);
        c.stroke();
        c.strokeStyle = 'rgba(40,80,20,0.25)';
        c.beginPath();
        for (let x = 0; x <= W; x += 4) c.lineTo(x, y + 1 + Math.sin(x * 0.08 + y) * 2);
        c.stroke();
      }
    }
    if (h.theme === 'plage') {
      c.fillStyle = '#2fb4c4';
      c.beginPath();
      c.moveTo(W, 0);
      c.lineTo(88, 0);
      for (let y = 0; y <= H; y += 8) c.lineTo(90 + Math.sin(y * 0.15) * 2.5, y);
      c.lineTo(W, H);
      c.fill();
    }
    if (h.river) {
      const [y0, y1] = h.river;
      c.fillStyle = '#6f5332';
      c.fillRect(0, y0 - 1.5, W, y1 - y0 + 3);
      c.fillStyle = '#2f80b8';
      c.fillRect(0, y0, W, y1 - y0);
    }

    // bordure (seule la moitié extérieure se voit, le green est peint par-dessus)
    c.lineJoin = 'round';
    polyPath(c, h.shape);
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 5.2;
    c.stroke();
    c.strokeStyle = th.wall;
    c.lineWidth = 3.6;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 3.6;
    c.setLineDash([2, 2]);
    c.stroke();
    c.setLineDash([]);

    // green tondu en bandes
    c.save();
    polyPath(c, h.shape);
    c.clip();
    c.fillStyle = th.felt;
    c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 12) {
      c.fillStyle = 'rgba(255,255,255,0.045)';
      c.fillRect(0, y, W, 6);
    }
    // ombre portée des murs
    polyPath(c, h.shape);
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 2.4;
    c.stroke();

    for (const z of h.zones ?? []) this.drawZoneStatic(c, z, rand);
    c.restore();

    // obstacles fixes
    for (const b of h.blocks ?? []) this.drawBlock(c, b);
    for (const u of h.bumpers ?? []) this.drawBumper(c, u);
    for (const tn of h.tunnels ?? []) {
      for (const [x, y] of [tn.a, tn.b]) {
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.beginPath();
        c.ellipse(x + 0.5, y + 0.8, tn.r + 1.4, tn.r + 1, 0, 0, TAU);
        c.fill();
        c.fillStyle = '#8a5a32';
        c.beginPath();
        c.arc(x, y, tn.r + 1.2, 0, TAU);
        c.fill();
        c.strokeStyle = '#c99a62';
        c.lineWidth = 0.4;
        for (let r = 1.2; r < tn.r + 1; r += 1) {
          c.beginPath();
          c.arc(x, y, r + 0.3, 0, TAU);
          c.stroke();
        }
        c.fillStyle = '#1d140c';
        c.beginPath();
        c.arc(x, y, tn.r * 0.7, 0, TAU);
        c.fill();
      }
    }

    // départ
    const [tx, ty] = h.tee;
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath();
    c.roundRect(tx - 4, ty - 2.6, 8, 5.2, 1.2);
    c.fill();
    // trou
    const [hx, hy] = h.hole;
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath();
    c.arc(hx, hy, HOLE_R + 0.45, 0, TAU);
    c.fill();
    const hg = c.createRadialGradient(hx - 0.5, hy - 0.7, 0.2, hx, hy, HOLE_R);
    hg.addColorStop(0, '#000');
    hg.addColorStop(1, '#1f2a1f');
    c.fillStyle = hg;
    c.beginPath();
    c.arc(hx, hy, HOLE_R, 0, TAU);
    c.fill();
  }

  drawZoneStatic(c, z, rand) {
    if (z.type === 'sand') {
      const mud = z.style === 'mud';
      polyPath(c, z.poly);
      c.fillStyle = mud ? '#7d6040' : '#ead499';
      c.fill();
      c.strokeStyle = mud ? 'rgba(60,40,20,0.4)' : 'rgba(170,140,70,0.45)';
      c.lineWidth = 0.6;
      c.stroke();
      c.save();
      polyPath(c, z.poly);
      c.clip();
      const xs = z.poly.map((p) => p[0]);
      const ys = z.poly.map((p) => p[1]);
      for (let i = 0; i < 70; i++) {
        c.fillStyle = mud ? 'rgba(50,30,15,0.3)' : 'rgba(170,135,70,0.35)';
        c.beginPath();
        c.arc(Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + rand() * (Math.max(...ys) - Math.min(...ys)), 0.25, 0, TAU);
        c.fill();
      }
      c.restore();
    } else if (z.type === 'water') {
      polyPath(c, z.poly);
      c.fillStyle = z.style === 'paddy' ? '#4f9a8c' : z.style === 'pool' ? '#36b8c6' : '#2f80b8';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 0.6;
      c.stroke();
      if (z.style === 'paddy') {
        // pousses de riz
        const xs = z.poly.map((p) => p[0]);
        const ys = z.poly.map((p) => p[1]);
        for (let x = Math.min(...xs) + 2; x < Math.max(...xs) - 1; x += 3.2)
          for (let y = Math.min(...ys) + 2; y < Math.max(...ys) - 1; y += 3.4) {
            c.strokeStyle = '#8fd06a';
            c.lineWidth = 0.3;
            c.beginPath();
            c.moveTo(x, y + 1);
            c.lineTo(x - 0.5, y - 0.6);
            c.moveTo(x, y + 1);
            c.lineTo(x + 0.6, y - 0.4);
            c.stroke();
          }
      }
    } else if (z.type === 'bridge') {
      polyPath(c, z.poly);
      c.fillStyle = '#a8763f';
      c.fill();
      const xs = z.poly.map((p) => p[0]);
      const ys = z.poly.map((p) => p[1]);
      for (let y = Math.min(...ys); y < Math.max(...ys); y += 2.2) {
        c.fillStyle = 'rgba(60,35,15,0.35)';
        c.fillRect(Math.min(...xs), y, Math.max(...xs) - Math.min(...xs), 0.35);
      }
      c.strokeStyle = '#5a3a1c';
      c.lineWidth = 0.8;
      c.stroke();
    } else if (z.type === 'slope') {
      polyPath(c, z.poly);
      c.fillStyle = 'rgba(0,40,0,0.13)';
      c.fill();
    }
  }

  drawBlock(c, b) {
    c.save();
    c.translate(0.6, 1);
    polyPath(c, b.poly);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fill();
    c.restore();
    polyPath(c, b.poly);
    if (b.style === 'tsingy') {
      c.fillStyle = '#9a9891';
      c.fill();
      c.strokeStyle = '#6d6b65';
      c.lineWidth = 0.6;
      c.stroke();
      // arêtes calcaires
      const [cx, cy] = b.poly.reduce(([a, bb], [x, y]) => [a + x / b.poly.length, bb + y / b.poly.length], [0, 0]);
      c.strokeStyle = 'rgba(255,255,255,0.3)';
      c.lineWidth = 0.4;
      for (const [x, y] of b.poly) {
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(x, y);
        c.stroke();
      }
    } else {
      c.fillStyle = '#8a5a32';
      c.fill();
      c.strokeStyle = '#5a3a1c';
      c.lineWidth = 0.5;
      c.stroke();
      c.strokeStyle = 'rgba(255,220,170,0.25)';
      c.lineWidth = 0.3;
      c.stroke();
    }
  }

  drawBumper(c, u) {
    const { x, y, r } = u;
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(x + 0.6, y + 0.9, r + 0.4, r + 0.2, 0, 0, TAU);
    c.fill();
    if (u.style === 'rock') {
      c.fillStyle = '#8d8a84';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.beginPath();
      c.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, TAU);
      c.fill();
      return;
    }
    if (u.style === 'palm') {
      c.fillStyle = '#9c7a52';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        c.save();
        c.translate(x + Math.cos(a) * (r + 2.2), y + Math.sin(a) * (r + 2.2));
        c.rotate(a);
        c.fillStyle = i % 2 ? 'rgba(52,140,60,0.85)' : 'rgba(66,160,72,0.85)';
        c.beginPath();
        c.ellipse(0, 0, 3.6, 1.1, 0, 0, TAU);
        c.fill();
        c.restore();
      }
      return;
    }
    // tronc vu de dessus : baobab (écorce claire) ou arbre de la forêt
    const baobab = u.style === 'baobab';
    c.fillStyle = baobab ? '#b48a62' : '#6b4a2b';
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
    c.strokeStyle = baobab ? 'rgba(90,60,35,0.4)' : 'rgba(30,15,5,0.45)';
    c.lineWidth = 0.35;
    for (let rr = r * 0.25; rr < r; rr += Math.max(0.9, r / 6)) {
      c.beginPath();
      c.arc(x, y, rr, 0, TAU);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,240,210,0.18)';
    c.beginPath();
    c.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, TAU);
    c.fill();
    if (baobab && r > 6) {
      // grosses branches du grand baobab
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.4;
        c.strokeStyle = '#9b7350';
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
        c.lineTo(x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2));
        c.stroke();
        c.fillStyle = 'rgba(95,138,59,0.85)';
        c.beginPath();
        c.ellipse(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3), 2.4, 1.6, a, 0, TAU);
        c.fill();
      }
    }
  }

  // -------------------------------------------------------------------------- chaque image

  /**
   * balls : [{ x, y, color, label, hidden }] ; tau : horloge des charrettes ; aim : { x, y, angle, power }
   * splash : { x, y, age } ; t : secondes.
   */
  draw({ t, tau, balls = [], aim = null, splash = null }) {
    const c = this.ctx;
    const h = this.hole;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.cache, 0, 0);
    c.setTransform(this.k, 0, 0, this.k, 0, 0);

    // reflets sur l'eau
    const waters = (h.zones ?? []).filter((z) => z.type === 'water');
    if (h.river) waters.push({ poly: [[0, h.river[0]], [W, h.river[0]], [W, h.river[1]], [0, h.river[1]]] });
    if (h.theme === 'plage') waters.push({ poly: [[89, 0], [W, 0], [W, H], [89, H]] });
    for (const z of waters) {
      c.save();
      polyPath(c, z.poly);
      c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.28)';
      c.lineWidth = 0.35;
      const ys = z.poly.map((p) => p[1]);
      for (let y = Math.min(...ys) + 2; y < Math.max(...ys); y += 3.5) {
        c.beginPath();
        for (let x = -2; x <= W + 2; x += 2) {
          const yy = y + Math.sin(x * 0.35 + t * 1.6 + y) * 0.5;
          if ((x + y * 3 + Math.floor(t * 4)) % 10 < 4) c.moveTo(x, yy);
          else c.lineTo(x, yy);
        }
        c.stroke();
      }
      c.restore();
    }
    // pentes : chevrons qui glissent dans le sens de la pente
    for (const z of (h.zones ?? []).filter((q) => q.type === 'slope')) {
      c.save();
      polyPath(c, z.poly);
      c.clip();
      const a = Math.atan2(z.ay, z.ax);
      const xs = z.poly.map((p) => p[0]);
      const ys = z.poly.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      c.translate(cx, cy);
      c.rotate(a);
      c.strokeStyle = 'rgba(255,255,255,0.22)';
      c.lineWidth = 0.8;
      const off = (t * 5) % 7;
      for (let u = -60 + off; u < 60; u += 7)
        for (let v = -60; v < 60; v += 9) {
          c.beginPath();
          c.moveTo(u - 1.5, v - 2.2);
          c.lineTo(u + 0.5, v);
          c.lineTo(u - 1.5, v + 2.2);
          c.stroke();
        }
      c.restore();
    }

    // charrettes à zébus
    for (const m of h.movers ?? []) this.drawCart(c, m, moverAt(m, tau), t);

    // drapeau malgache sur le trou
    this.drawFlag(c, h.hole[0], h.hole[1], t);

    // éclaboussure
    if (splash && splash.age < 1.2) {
      const k = splash.age / 1.2;
      c.strokeStyle = `rgba(255,255,255,${1 - k})`;
      c.lineWidth = 0.6;
      for (const r of [1, 2.2]) {
        c.beginPath();
        c.arc(splash.x, splash.y, (1 + k * 6) * r * 0.6, 0, TAU);
        c.stroke();
      }
    }

    // balles
    for (const b of balls) if (!b.hidden) this.drawBall(c, b);

    if (aim) this.drawAim(c, aim);

    // décors, du fond vers le devant
    const decor = [...(h.decor ?? [])].sort((a, b) => a.y - b.y);
    for (const d of decor) SPRITES[d.k]?.(c, d.x, d.y, d.s ?? 1, t, d);
  }

  drawCart(c, m, p, t) {
    const { w, h } = m;
    const dir = Math.sign(p.vx) || 1;
    c.save();
    c.translate(p.x, p.y);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(-w / 2 + 0.8, -h / 2 + 1, w, h);
    // roues
    c.fillStyle = '#3b2a1a';
    for (const dx of [-w / 4, w / 4]) {
      c.fillRect(dx - 1.6, -h / 2 - 1, 3.2, 1.2);
      c.fillRect(dx - 1.6, h / 2 - 0.2, 3.2, 1.2);
    }
    // plateau en planches, chargé de sacs de riz
    c.fillStyle = '#a06a3a';
    c.fillRect(-w / 2, -h / 2, w, h);
    c.fillStyle = 'rgba(60,35,15,0.4)';
    for (let x = -w / 2 + 2; x < w / 2; x += 2.4) c.fillRect(x, -h / 2, 0.3, h);
    c.fillStyle = '#efe3c4';
    c.beginPath();
    c.ellipse(-w / 6, 0, 2.2, 1.6, 0, 0, TAU);
    c.ellipse(w / 8, -0.6, 2, 1.5, 0, 0, TAU);
    c.fill();
    // le zébu qui tire, devant
    c.translate((dir * w) / 2 + dir * 4.6, 0);
    c.strokeStyle = '#6b4a2a';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-dir * 4.6, 0);
    c.lineTo(-dir * 2.2, 0);
    c.stroke();
    const step = Math.sin(t * 6) * 0.3;
    c.fillStyle = '#e3d8c6';
    c.beginPath();
    c.ellipse(0, step * 0.3, 3, 1.8, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#d2c4ac';
    c.beginPath();
    c.ellipse(-dir * 0.8, 0, 1.2, 1.1, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#e3d8c6';
    c.beginPath();
    c.ellipse(dir * 3.2, 0, 1.2, 0.9, 0, 0, TAU);
    c.fill();
    c.strokeStyle = '#4b3b2a';
    c.lineWidth = 0.35;
    c.beginPath();
    c.moveTo(dir * 3.4, -0.6);
    c.quadraticCurveTo(dir * 3.8, -2.2, dir * 2.6, -2.4);
    c.moveTo(dir * 3.4, 0.6);
    c.quadraticCurveTo(dir * 3.8, 2.2, dir * 2.6, 2.4);
    c.stroke();
    c.restore();
  }

  drawFlag(c, x, y, t) {
    c.strokeStyle = '#f4f1e8';
    c.lineWidth = 0.45;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, y - 13);
    c.stroke();
    // blanc côté mât, rouge en haut, vert en bas
    const fw = 7;
    const fh = 4.4;
    const strips = 10;
    for (let i = 0; i < strips; i++) {
      const u = i / strips;
      const x0 = x + u * fw;
      const wave = Math.sin(t * 4 - u * 5) * 0.5 * u;
      const top = y - 13 + wave;
      if (u < 1 / 3) {
        c.fillStyle = '#fbfaf5';
        c.fillRect(x0, top, fw / strips + 0.05, fh);
      } else {
        c.fillStyle = '#e1262d';
        c.fillRect(x0, top, fw / strips + 0.05, fh / 2);
        c.fillStyle = '#0e8a3e';
        c.fillRect(x0, top + fh / 2, fw / strips + 0.05, fh / 2);
      }
    }
  }

  drawBall(c, b) {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(b.x + 0.5, b.y + 0.7, BALL_R, BALL_R * 0.8, 0, 0, TAU);
    c.fill();
    const g = c.createRadialGradient(b.x - 0.5, b.y - 0.5, 0.2, b.x, b.y, BALL_R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, b.color);
    c.fillStyle = g;
    c.beginPath();
    c.arc(b.x, b.y, BALL_R, 0, TAU);
    c.fill();
    c.strokeStyle = b.ring ?? 'rgba(0,0,0,0.35)';
    c.lineWidth = 0.35;
    c.stroke();
    if (b.label) {
      c.font = '3.4px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(b.label, b.x, b.y - 2.6);
    }
  }

  drawAim(c, { x, y, angle, power }) {
    const len = 6 + power * 34;
    const r = Math.round(255);
    const g = Math.round(255 - power * 190);
    c.strokeStyle = `rgba(${r},${g},${g - 20},0.95)`;
    c.lineWidth = 0.7;
    c.setLineDash([1.4, 1.4]);
    c.beginPath();
    c.moveTo(x + Math.cos(angle) * 2.4, y + Math.sin(angle) * 2.4);
    c.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    c.stroke();
    c.setLineDash([]);
    // jauge de puissance autour de la balle
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 1.1;
    c.beginPath();
    c.arc(x, y, 4, -Math.PI / 2, -Math.PI / 2 + TAU);
    c.stroke();
    c.strokeStyle = `rgb(${r},${g},${Math.max(0, g - 40)})`;
    c.beginPath();
    c.arc(x, y, 4, -Math.PI / 2, -Math.PI / 2 + TAU * power);
    c.stroke();
  }
}
