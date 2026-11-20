// Minigolf malgache : moteur pur, partagé par le serveur (arbitre) et la page (aperçu, dessin).
// Le serveur simule chaque coup et envoie la trajectoire ; la page ne fait que la rejouer, donc les
// petites différences de calcul entre navigateurs ne comptent pas.
//
// On joue chacun son tour sur le même trou (les balles ne se gênent pas). Un joueur qui a mis sa
// balle dans le trou attend l'autre. Au bout de MAX_STROKES coups sans réussir, la balle est
// ramassée et compte MAX_STROKES + 1. Eau : un coup de pénalité et retour à la position d'avant.
// Le plus petit total gagne.

import { HOLES, holeById } from './courses.js';

export const W = 100;
export const H = 160;
export const BALL_R = 1.5;
export const HOLE_R = 2.4;
export const MAX_SPEED = 118;
export const MAX_STROKES = 6;
export const SAMPLE_HZ = 30;

const DT = 1 / 240;
const FRICTION = 36;
// sable et boue : freinage fort, et d'autant plus fort que la balle va vite (elle s'enfonce)
const SAND_FRICTION = 260;
const SAND_DRAG = 4.5;
const RESTITUTION = 0.72;
const CAPTURE_SPEED = 62;
const MAX_TIME = 25;

export const PARCOURS = {
  tour: { label: 'Grand tour · 8 trous', count: HOLES.length },
  balade: { label: 'Balade · 4 trous au hasard', count: 4 },
  express: { label: 'Express · 2 trous au hasard', count: 2 },
};

// ---------------------------------------------------------------------------- géométrie

export function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function edges(poly) {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
}

/** Position et vitesse d'un obstacle mobile au temps tau. */
export function moverAt(m, tau) {
  const a = m.freq * tau + m.phase;
  return { x: m.x0 + m.amp * Math.sin(a), y: m.y, vx: m.amp * m.freq * Math.cos(a), vy: 0 };
}

const cache = new Map();
function compiled(hole) {
  if (!cache.has(hole.id)) {
    const segs = [...edges(hole.shape), ...(hole.blocks ?? []).flatMap((b) => edges(b.poly))];
    cache.set(hole.id, { segs, zones: hole.zones ?? [], bumpers: hole.bumpers ?? [], movers: hole.movers ?? [], tunnels: hole.tunnels ?? [] });
  }
  return cache.get(hole.id);
}

/** Rebond sur un point de contact (cx, cy) avec un obstacle de vitesse (ovx, ovy). */
function bounce(b, cx, cy, ovx = 0, ovy = 0) {
  let nx = b.x - cx;
  let ny = b.y - cy;
  let d = Math.hypot(nx, ny);
  if (d >= BALL_R) return false;
  if (d < 1e-9) {
    nx = 0;
    ny = -1;
    d = 1;
  }
  nx /= d;
  ny /= d;
  b.x = cx + nx * BALL_R;
  b.y = cy + ny * BALL_R;
  const rvx = b.vx - ovx;
  const rvy = b.vy - ovy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx = rvx - (1 + RESTITUTION) * vn * nx + ovx;
    b.vy = rvy - (1 + RESTITUTION) * vn * ny + ovy;
  }
  return true;
}

function closestOnSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [ax + t * dx, ay + t * dy];
}

const round = (v) => Math.round(v * 100) / 100;

/**
 * Simule un coup. angle en radians (0 = vers la droite, -π/2 = vers le haut), power dans ]0, 1].
 * tau0 : horloge des obstacles mobiles au début du coup.
 * Renvoie { path: [[x, y]…] (30 images/s), end: {x, y}, result: 'stop' | 'hole' | 'water' }.
 */
export function simulate(hole, from, angle, power, tau0 = 0) {
  const c = compiled(hole);
  const b = { x: from.x, y: from.y, vx: Math.cos(angle) * power * MAX_SPEED, vy: Math.sin(angle) * power * MAX_SPEED };
  const [hx, hy] = hole.hole;
  const path = [[round(b.x), round(b.y)]];
  const every = Math.round(1 / DT / SAMPLE_HZ);
  let slow = 0;
  let cooldown = 0;
  const finish = (result, x = b.x, y = b.y) => {
    path.push([round(x), round(y)]);
    return { path, end: result === 'water' ? { x: from.x, y: from.y } : { x: round(x), y: round(y) }, result, splash: result === 'water' ? { x: round(x), y: round(y) } : null };
  };

  for (let step = 1; step <= MAX_TIME / DT; step++) {
    const t = step * DT;
    // terrain sous la balle
    let fr = FRICTION;
    let ax = 0;
    let ay = 0;
    let water = false;
    let bridge = false;
    for (const z of c.zones) {
      if (!inPoly(z.poly, b.x, b.y)) continue;
      if (z.type === 'sand') fr = SAND_FRICTION + SAND_DRAG * Math.hypot(b.vx, b.vy);
      else if (z.type === 'slope') {
        ax += z.ax;
        ay += z.ay;
      } else if (z.type === 'water') water = true;
      else if (z.type === 'bridge') bridge = true;
    }
    if (water && !bridge) return finish('water');

    let speed = Math.hypot(b.vx, b.vy);
    const dh = Math.hypot(hx - b.x, hy - b.y);
    if (dh < HOLE_R && speed < CAPTURE_SPEED) return finish('hole', hx, hy);
    // le bord du trou attire une balle lente
    if (dh < HOLE_R * 2.4 && speed < 32 && dh > 1e-6) {
      ax += ((hx - b.x) / dh) * 55;
      ay += ((hy - b.y) / dh) * 55;
    }

    b.vx += ax * DT;
    b.vy += ay * DT;
    speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      const dec = fr * DT;
      if (dec >= speed) {
        b.vx = 0;
        b.vy = 0;
      } else {
        b.vx -= (b.vx / speed) * dec;
        b.vy -= (b.vy / speed) * dec;
      }
    }
    b.x += b.vx * DT;
    b.y += b.vy * DT;

    for (const s of c.segs) {
      const [cx, cy] = closestOnSeg(b.x, b.y, s[0], s[1]);
      bounce(b, cx, cy);
    }
    for (const u of c.bumpers) {
      const dx = b.x - u.x;
      const dy = b.y - u.y;
      const d = Math.hypot(dx, dy) || 1e-9;
      if (d < u.r + BALL_R) bounce(b, u.x + (dx / d) * (u.r + 0.0001), u.y + (dy / d) * (u.r + 0.0001));
    }
    for (const m of c.movers) {
      const p = moverAt(m, tau0 + t);
      const hw = m.w / 2;
      const hh = m.h / 2;
      const inside = Math.abs(b.x - p.x) < hw && Math.abs(b.y - p.y) < hh;
      let cx = Math.max(p.x - hw, Math.min(b.x, p.x + hw));
      let cy = Math.max(p.y - hh, Math.min(b.y, p.y + hh));
      if (inside) {
        // centre de la balle dans la charrette : on la sort par le côté le plus proche
        const sides = [
          [b.x - (p.x - hw), -1, 0],
          [p.x + hw - b.x, 1, 0],
          [b.y - (p.y - hh), 0, -1],
          [p.y + hh - b.y, 0, 1],
        ].sort((u, v) => u[0] - v[0]);
        const [, nx, ny] = sides[0];
        cx = nx ? p.x + nx * hw : b.x;
        cy = ny ? p.y + ny * hh : b.y;
        b.x = cx + nx * 0.001;
        b.y = cy + ny * 0.001;
      }
      bounce(b, cx, cy, p.vx, p.vy);
    }
    cooldown -= DT;
    if (cooldown <= 0) {
      for (const tn of c.tunnels) {
        if (Math.hypot(b.x - tn.a[0], b.y - tn.a[1]) < tn.r) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const k = 0.85;
          b.x = tn.b[0] + (b.vx / sp) * (tn.r + BALL_R + 0.5);
          b.y = tn.b[1] + (b.vy / sp) * (tn.r + BALL_R + 0.5);
          b.vx *= k;
          b.vy *= k;
          cooldown = 0.6;
          path.push(null); // saut : la balle ressort de l'autre côté du tronc creux
          path.push([round(b.x), round(b.y)]);
        }
      }
    }

    if (step % every === 0) path.push([round(b.x), round(b.y)]);
    if (Math.hypot(b.vx, b.vy) < 1.2) slow++;
    else slow = 0;
    if (slow > 36) return finish('stop');
  }
  return finish('stop');
}

// ---------------------------------------------------------------------------- partie

function seedInt(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function pickHoles(parcours, seed) {
  const n = PARCOURS[parcours]?.count ?? HOLES.length;
  if (n >= HOLES.length) return HOLES.map((h) => h.id);
  let s = seedInt(seed) || 1;
  const rand = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296;
  const idx = HOLES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => HOLES[i].id);
}

const teeOf = (id) => {
  const [x, y] = holeById(id).tee;
  return { x, y };
};

export function createGame({ players, parcours = 'tour', seed = 0, holes }) {
  const list = holes ?? pickHoles(parcours, seed);
  return {
    game: 'minigolf',
    parcours,
    holes: list,
    hole: 0,
    phase: 'play',
    turn: seedInt(seed) % 2,
    starter: seedInt(seed) % 2,
    shots: 0, // nombre total de coups joués : horloge des obstacles mobiles
    winners: null,
    lastShot: null,
    players: players.map((p) => ({ id: p.id, name: p.name, ball: teeOf(list[0]), strokes: 0, done: false, scores: [] })),
  };
}

const fail = (code, message) => ({ error: { code, message } });
export const tauFor = (shots) => (shots * 7.31) % 1000;
export const totalOf = (p) => p.scores.reduce((a, b) => a + b, 0);

export function applyAction(state, action, playerId) {
  const me = state.players.findIndex((p) => p.id === playerId);
  if (me < 0) return fail('not_player', 'Vous ne jouez pas dans cette partie.');
  if (!action || action.type !== 'shot') return fail('bad_action', 'Action inconnue.');
  if (state.phase !== 'play') return fail('wrong_phase', 'La partie est terminée.');
  if (state.turn !== me) return fail('not_your_turn', 'Ce n’est pas votre tour.');
  const angle = Number(action.angle);
  const power = Number(action.power);
  if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0 || power > 1) return fail('bad_shot', 'Coup invalide.');

  const s = structuredClone(state);
  const p = s.players[me];
  const hole = holeById(s.holes[s.hole]);
  const tau0 = tauFor(s.shots);
  const sim = simulate(hole, p.ball, angle, power, tau0);
  s.shots += 1;
  p.strokes += sim.result === 'water' ? 2 : 1;
  p.ball = sim.end;
  let outcome = sim.result;
  if (sim.result === 'hole') {
    p.done = true;
    p.scores[s.hole] = p.strokes;
  } else if (p.strokes >= MAX_STROKES) {
    p.done = true;
    p.scores[s.hole] = MAX_STROKES + 1;
    outcome = sim.result === 'water' ? 'water-max' : 'max';
  }
  s.lastShot = { player: me, hole: s.hole, path: sim.path, splash: sim.splash, tau0, result: outcome, strokes: p.strokes };
  const events = [{ type: 'shot', player: me, hole: s.hole, result: outcome, strokes: p.strokes }];

  const other = s.players[1 - me];
  if (!other.done) s.turn = 1 - me;
  else if (!p.done) s.turn = me;
  else {
    // trou terminé : honneur au meilleur score, sinon on alterne qui commence
    const done = s.hole;
    events.push({ type: 'holeDone', hole: done, scores: s.players.map((x) => x.scores[done]) });
    if (s.hole + 1 >= s.holes.length) {
      s.phase = 'over';
      s.turn = null;
      const totals = s.players.map(totalOf);
      const best = Math.min(...totals);
      s.winners = s.players.filter((_, i) => totals[i] === best).map((x) => x.id);
      events.push({ type: 'over', winners: s.winners });
    } else {
      s.hole += 1;
      const [a, b] = s.players.map((x) => x.scores[done]);
      s.starter = a < b ? 0 : b < a ? 1 : 1 - s.starter;
      s.turn = s.starter;
      for (const x of s.players) Object.assign(x, { ball: teeOf(s.holes[s.hole]), strokes: 0, done: false });
      events.push({ type: 'nextHole', hole: s.hole });
    }
  }
  return { state: s, events };
}

/** Rien de secret au minigolf : chacun voit tout. */
export function viewFor(state, playerId) {
  return { ...state, me: state.players.findIndex((p) => p.id === playerId), pars: state.holes.map((id) => holeById(id).par) };
}
