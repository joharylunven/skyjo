// Pétanque à Quiberon : moteur pur, partagé par le serveur (arbitre) et la page.
// Boules en chocolat contre boules en caramel, cochonnet = un bonbon au caramel beurre salé.
//
// Tête-à-tête, 3 boules chacun, partie en 13 points. Une mène : le joueur qui commence lance le
// cochonnet puis sa première boule ; ensuite joue toujours celui qui n'a pas le point (tant qu'il
// a des boules). Le gagnant de la mène marque une boule par boule mieux placée que la meilleure
// adverse, et relance le cochonnet. Le sable de Quiberon n'est jamais tout à fait plat : chaque
// lancer dévie un tout petit peu (tiré au sort par le serveur, identique pour les deux joueurs).

import { TERRAINS, terrainById, COCHONNET_ZONE } from './terrains.js';

export const W = 100;
export const H = 160;
export const BOULE_R = 1.9;
export const COCHONNET_R = 1.05;
export const BOULES = 3;
export const SAMPLE_HZ = 30;

const DT = 1 / 240;
const FRICTION = { sand: 72, wet: 44, paves: 30, deck: 34, algues: 160, galets: 125 };
const MASS = { boule: 1, cochonnet: 0.3 };
const REST_BALLS = 0.82;
const REST_WALL = 0.35;
const MAX_ROLL = 12;

export const MODES = ['pointer', 'tirer'];
export const OPTIONS = {
  target: [13, 7],
  terrain: ['tournee', ...TERRAINS.map((t) => t.id)],
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

function closestOnSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0));
  return [ax + t * dx, ay + t * dy];
}

export const inBounds = (t, x, y) => x >= t.bounds.x0 && x <= t.bounds.x1 && y >= t.bounds.y0 && y <= t.bounds.y1;

function groundAt(t, x, y) {
  for (const z of t.zones ?? []) if (inPoly(z.poly, x, y)) return z.type;
  return t.ground;
}

const round = (v) => Math.round(v * 100) / 100;

/** Distance que parcourt un lancer de puissance p (0..1). */
export const throwDistance = (p) => 12 + p * 128;

/** Dérive pseudo-aléatoire du terrain pour le lancer n° k (reproductible). */
export function terrainDrift(seed, k) {
  let s = (seedInt(seed) ^ Math.imul(k + 1, 2654435761)) >>> 0;
  const r = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
  // somme de 3 uniformes : à peu près gaussien, borné
  const g = () => (r() + r() + r() - 1.5) / 0.5;
  return { angle: g(), dist: g() };
}

function seedInt(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------------- simulation

/**
 * Lance une boule (ou le cochonnet) depuis le cercle.
 * balls : [{ id, kind: 'boule' | 'cochonnet', x, y }] déjà au sol.
 * Renvoie { ids, frames, balls (positions finales, morts exclus), dead: [ids], landing, hits }.
 * frames : [z, x0, y0, x1, y1, …] (null pour une boule morte), 30 images/s.
 */
export function simulateThrow(terrain, balls, thrown, { angle, power, mode, drift = { angle: 0, dist: 0 } }) {
  const t = terrain;
  const [cx, cy] = t.circle;
  const dev = mode === 'tirer' ? 0.016 : 0.01;
  const a = angle + drift.angle * dev;
  const D = throwDistance(power) * (1 + drift.dist * 0.022);
  const flightFrac = mode === 'tirer' ? 0.95 : mode === 'cochonnet' ? 0.6 : 0.55;
  const landing = { x: cx + Math.cos(a) * D * flightFrac, y: cy + Math.sin(a) * D * flightFrac };
  const r = thrown.kind === 'cochonnet' ? COCHONNET_R : BOULE_R;
  const all = [...balls.map((b) => ({ ...b, r: b.kind === 'cochonnet' ? COCHONNET_R : BOULE_R, vx: 0, vy: 0, alive: true })), { ...thrown, x: landing.x, y: landing.y, r, vx: 0, vy: 0, alive: true }];
  const ids = all.map((b) => b.id);
  const me = all.at(-1);
  const frames = [];
  const snap = (z, override) => {
    const f = [round(z)];
    for (const b of all) {
      if (b === me && override) f.push(round(override[0]), round(override[1]));
      else if (b.alive) f.push(round(b.x), round(b.y));
      else f.push(null, null);
    }
    frames.push(f);
  };

  // vol : la boule est en l'air, elle ne touche rien
  const flightTime = mode === 'tirer' ? 0.28 + 0.3 * power : 0.45 + 0.55 * power;
  const height = mode === 'tirer' ? 4 + 4 * power : 8 + 16 * power;
  const nFlight = Math.max(2, Math.round(flightTime * SAMPLE_HZ));
  for (let i = 0; i < nFlight; i++) {
    const u = i / nFlight;
    snap(4 * height * u * (1 - u), [cx + (landing.x - cx) * u, cy + (landing.y - cy) * u]);
  }

  // atterrissage
  const hits = [];
  const dead = [];
  const kill = (b, why) => {
    if (!b.alive) return;
    b.alive = false;
    dead.push({ id: b.id, why });
  };
  if (!inBounds(t, me.x, me.y)) kill(me, 'out');
  else if (groundAt(t, me.x, me.y) === 'flaque') kill(me, 'flaque');
  else {
    const ground = groundAt(t, me.x, me.y);
    const rollDist = mode === 'tirer' ? 0 : D * (1 - flightFrac);
    const speed = mode === 'tirer' ? 70 + 30 * power : Math.sqrt(2 * FRICTION[ground] * rollDist);
    me.vx = Math.cos(a) * speed;
    me.vy = Math.sin(a) * speed;
  }

  // atterrissage pile sur une boule : c'est un choc direct (le carreau, quand c'est bien fait)
  if (me.alive && (me.vx || me.vy)) {
    const sp = Math.hypot(me.vx, me.vy);
    const ux = me.vx / sp;
    const uy = me.vy / sp;
    for (const q of all) {
      if (q === me || !q.alive || Math.hypot(q.x - me.x, q.y - me.y) >= q.r + me.r) continue;
      // on recule la boule lancée sur sa trajectoire jusqu'au contact, puis choc dans l'axe du lancer
      const along = (q.x - me.x) * ux + (q.y - me.y) * uy;
      const side = Math.hypot(q.x - me.x - along * ux, q.y - me.y - along * uy);
      const back = Math.sqrt(Math.max(0, (q.r + me.r) ** 2 - side ** 2)) - along;
      me.x -= ux * back;
      me.y -= uy * back;
    }
  }

  // roulement de toutes les boules
  const every = Math.round(1 / DT / SAMPLE_HZ);
  let calm = 0;
  for (let step = 1; step <= MAX_ROLL / DT; step++) {
    for (const b of all) {
      if (!b.alive) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp === 0) continue;
      const g = groundAt(t, b.x, b.y);
      if (g === 'flaque') {
        kill(b, 'flaque');
        continue;
      }
      const dec = FRICTION[g] * DT;
      if (dec >= sp) {
        b.vx = 0;
        b.vy = 0;
      } else {
        b.vx -= (b.vx / sp) * dec;
        b.vy -= (b.vy / sp) * dec;
      }
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      if (!inBounds(t, b.x, b.y)) kill(b, 'out');
    }
    // chocs entre boules
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      if (!p.alive) continue;
      for (let j = i + 1; j < all.length; j++) {
        const q = all[j];
        if (!q.alive) continue;
        let nx = q.x - p.x;
        let ny = q.y - p.y;
        const d = Math.hypot(nx, ny);
        const min = p.r + q.r;
        if (d >= min) continue;
        if (d < 1e-9) {
          nx = 0;
          ny = -1;
        } else {
          nx /= d;
          ny /= d;
        }
        const mp = MASS[p.kind];
        const mq = MASS[q.kind];
        const overlap = min - Math.max(d, 1e-9);
        p.x -= nx * overlap * (mq / (mp + mq));
        p.y -= ny * overlap * (mq / (mp + mq));
        q.x += nx * overlap * (mp / (mp + mq));
        q.y += ny * overlap * (mp / (mp + mq));
        const vrel = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
        if (vrel < 0) {
          const j0 = (-(1 + REST_BALLS) * vrel) / (1 / mp + 1 / mq);
          p.vx -= (j0 / mp) * nx;
          p.vy -= (j0 / mp) * ny;
          q.vx += (j0 / mq) * nx;
          q.vy += (j0 / mq) * ny;
          if (p === me || q === me) hits.push(p === me ? q.id : p.id);
        }
      }
    }
    // obstacles
    for (const b of all) {
      if (!b.alive) continue;
      for (const o of t.obstacles ?? []) {
        if (o.poly) {
          const inside = inPoly(o.poly, b.x, b.y);
          let best = null;
          for (let i = 0; i < o.poly.length; i++) {
            const [qx, qy] = closestOnSeg(b.x, b.y, o.poly[i], o.poly[(i + 1) % o.poly.length]);
            const d = Math.hypot(b.x - qx, b.y - qy);
            if (!best || d < best.d) best = { d, qx, qy };
          }
          if (inside || best.d < b.r) bounceOn(b, best.qx, best.qy, inside);
        } else {
          const dx = b.x - o.x;
          const dy = b.y - o.y;
          const d = Math.hypot(dx, dy) || 1e-9;
          if (d < o.r + b.r) bounceOn(b, o.x + (dx / d) * o.r, o.y + (dy / d) * o.r, false);
        }
      }
    }
    if (step % every === 0) snap(0);
    const moving = all.some((b) => b.alive && Math.hypot(b.vx, b.vy) > 0.6);
    calm = moving ? 0 : calm + 1;
    if (calm > 10) break;
  }
  snap(0);
  return {
    ids,
    frames,
    landing: { x: round(landing.x), y: round(landing.y) },
    balls: all.filter((b) => b.alive).map((b) => ({ id: b.id, kind: b.kind, owner: b.owner, x: round(b.x), y: round(b.y) })),
    dead,
    hits: [...new Set(hits)],
  };
}

function bounceOn(b, qx, qy, inside) {
  let nx = b.x - qx;
  let ny = b.y - qy;
  let d = Math.hypot(nx, ny);
  if (d < 1e-9) {
    nx = 0;
    ny = 1;
    d = 1;
  }
  nx /= d;
  ny /= d;
  if (inside) {
    nx = -nx;
    ny = -ny;
  }
  b.x = qx + nx * b.r;
  b.y = qy + ny * b.r;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + REST_WALL) * vn * nx;
    b.vy -= (1 + REST_WALL) * vn * ny;
  }
}

// ---------------------------------------------------------------------------- règles

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Qui tient le point, et combien de boules il marquerait si la mène s'arrêtait là. */
export function pointInfo(state) {
  const c = state.balls.find((b) => b.kind === 'cochonnet');
  if (!c) return { holder: null, points: 0, best: [null, null] };
  const best = [0, 1].map((p) => {
    const ds = state.balls.filter((b) => b.owner === p).map((b) => dist(b, c) - BOULE_R - COCHONNET_R);
    return ds.length ? Math.min(...ds) : null;
  });
  if (best[0] === null && best[1] === null) return { holder: null, points: 0, best };
  let holder;
  if (best[1] === null || (best[0] !== null && best[0] < best[1])) holder = 0;
  else if (best[0] === null || best[1] < best[0]) holder = 1;
  else return { holder: null, points: 0, best }; // égalité parfaite
  const other = best[1 - holder];
  const points = state.balls.filter((b) => b.owner === holder && (other === null || dist(b, c) - BOULE_R - COCHONNET_R < other)).length;
  return { holder, points, best };
}

const terrainFor = (s) => terrainById(s.terrains[(s.mene - 1) % s.terrains.length]);

export function createGame({ players, target = 13, terrain = 'tournee', seed = 0 }) {
  const order = terrain === 'tournee' ? TERRAINS.map((t) => t.id) : [terrainById(terrain).id];
  // la tournée commence sur un terrain tiré au sort
  const shift = terrain === 'tournee' ? seedInt(seed) % order.length : 0;
  const first = seedInt(`${seed}:start`) % 2;
  return {
    game: 'petanque',
    seed: String(seed),
    target: OPTIONS.target.includes(target) ? target : 13,
    terrains: [...order.slice(shift), ...order.slice(0, shift)],
    mene: 1,
    phase: 'cochonnet',
    starter: first,
    thrower: first,
    throws: 0,
    left: [BOULES, BOULES],
    balls: [],
    scores: [0, 0],
    history: [],
    lastThrow: null,
    lastMene: null,
    winners: null,
    players: players.map((p) => ({ id: p.id, name: p.name })),
  };
}

const fail = (code, message) => ({ error: { code, message } });

function finishMene(s, events, reason) {
  const info = pointInfo(s);
  let winner = info.holder;
  let points = info.points;
  if (reason === 'cochonnet') {
    // cochonnet mort : celui qui a encore des boules les marque ; sinon mène nulle
    const [a, b] = s.left;
    if (a > 0 && b === 0) [winner, points] = [0, a];
    else if (b > 0 && a === 0) [winner, points] = [1, b];
    else [winner, points] = [null, 0];
  }
  if (winner !== null) s.scores[winner] += points;
  s.lastMene = { mene: s.mene, terrain: terrainFor(s).id, winner, points, reason, balls: s.balls, scores: [...s.scores] };
  s.history.push({ mene: s.mene, winner, points });
  events.push({ type: 'meneDone', mene: s.mene, winner, points, reason, scores: [...s.scores] });
  if (s.scores.some((x) => x >= s.target)) {
    s.phase = 'over';
    s.thrower = null;
    s.winners = [s.players[s.scores[0] > s.scores[1] ? 0 : 1].id];
    events.push({ type: 'over', winners: s.winners, fanny: s.scores.includes(0) });
    return;
  }
  // nouvelle mène : le gagnant relance le cochonnet (mène nulle : le même joueur recommence)
  s.mene += 1;
  if (winner !== null) s.starter = winner;
  s.thrower = s.starter;
  s.phase = 'cochonnet';
  s.left = [BOULES, BOULES];
  s.balls = [];
  events.push({ type: 'newMene', mene: s.mene, starter: s.starter, terrain: terrainFor(s).id });
}

export function applyAction(state, action, playerId) {
  const me = state.players.findIndex((p) => p.id === playerId);
  if (me < 0) return fail('not_player', 'Vous ne jouez pas dans cette partie.');
  if (!action || action.type !== 'throw') return fail('bad_action', 'Action inconnue.');
  if (state.phase === 'over') return fail('wrong_phase', 'La partie est terminée.');
  if (state.thrower !== me) return fail('not_your_turn', 'Ce n’est pas votre tour.');
  const angle = Number(action.angle);
  const power = Number(action.power);
  if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0 || power > 1) return fail('bad_throw', 'Lancer invalide.');
  const s = structuredClone(state);
  const t = terrainFor(s);
  const drift = terrainDrift(s.seed, s.throws);
  s.throws += 1;
  const events = [];

  if (s.phase === 'cochonnet') {
    const sim = simulateThrow(t, [], { id: 'c', kind: 'cochonnet', owner: null }, { angle, power, mode: 'cochonnet', drift });
    const c = sim.balls[0];
    const ok = c && c.y >= COCHONNET_ZONE.y0 && c.y <= COCHONNET_ZONE.y1 && c.x >= t.bounds.x0 + COCHONNET_ZONE.margin && c.x <= t.bounds.x1 - COCHONNET_ZONE.margin;
    s.lastThrow = { player: me, mode: 'cochonnet', mene: s.mene, terrain: t.id, ids: sim.ids, frames: sim.frames, landing: sim.landing, result: ok ? 'cochonnet' : 'cochonnet-faux', hits: [], dead: sim.dead };
    if (ok) {
      s.balls = sim.balls;
      s.phase = 'boules';
    }
    events.push({ type: 'throw', player: me, mode: 'cochonnet', ok });
    return { state: s, events };
  }

  const mode = MODES.includes(action.mode) ? action.mode : 'pointer';
  const id = `${me}-${BOULES - s.left[me]}`;
  const before = pointInfo(s);
  const sim = simulateThrow(t, s.balls, { id, kind: 'boule', owner: me }, { angle, power, mode, drift });
  s.left[me] -= 1;
  s.balls = sim.balls;
  const after = pointInfo(s);
  const cochonnet = s.balls.find((b) => b.kind === 'cochonnet');
  const mine = s.balls.find((b) => b.id === id);
  // petites annonces : biberon, carreau, trou…
  let result = 'boule';
  const struck = sim.hits.filter((h) => h !== 'c').map((h) => state.balls.find((b) => b.id === h)).filter(Boolean);
  const moved = (b) => {
    const now = s.balls.find((x) => x.id === b.id);
    return now ? dist(now, b) : Infinity;
  };
  if (!mine) result = sim.dead.find((d) => d.id === id)?.why === 'flaque' ? 'flaque' : 'out';
  else if (mode === 'tirer' && !sim.hits.length) result = 'trou';
  else if (mode === 'tirer' && struck.some((b) => dist(mine, b) < 4.5 && moved(b) > 6)) result = 'carreau';
  else if (mode === 'tirer' && struck.some((b) => moved(b) > 6)) result = 'tir';
  else if (mode === 'tirer' && struck.length) result = 'casquette';
  else if (cochonnet && dist(mine, cochonnet) < BOULE_R + COCHONNET_R + 0.35) result = 'biberon';
  else if (after.holder === me && before.holder !== me) result = 'point';
  if (!cochonnet) result = 'cochonnet-mort';
  s.lastThrow = { player: me, mode, mene: s.mene, terrain: t.id, ids: sim.ids, frames: sim.frames, landing: sim.landing, result, hits: sim.hits, dead: sim.dead, holder: after.holder };
  events.push({ type: 'throw', player: me, mode, result, holder: after.holder });

  if (!cochonnet) {
    finishMene(s, events, 'cochonnet');
    return { state: s, events };
  }
  // qui joue ? celui qui n'a pas le point, s'il lui reste des boules
  const holder = after.holder;
  // personne n'a le point (boule sortie, égalité) : on continue jusqu'à en placer une
  const notHolder = holder === null ? me : 1 - holder;
  if (s.left[notHolder] > 0) s.thrower = notHolder;
  else if (s.left[1 - notHolder] > 0) s.thrower = 1 - notHolder;
  else finishMene(s, events, 'boules');
  return { state: s, events };
}

/** Rien de caché à la pétanque. */
export function viewFor(state, playerId) {
  return { ...state, me: state.players.findIndex((p) => p.id === playerId), point: pointInfo(state) };
}

export { terrainFor };
