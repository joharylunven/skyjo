// Robot de minigolf. Il ne triche pas : il essaie des coups avec le même simulateur que l'arbitre,
// choisit celui qui reste bon même s'il le joue un peu de travers (comme un humain), puis le joue
// avec une petite imprécision. Résultat : il tente les coups sûrs, vise le trou quand c'est
// jouable, évite l'eau, et rate parfois.

import { simulate, inPoly, tauFor, W, H } from '../public/minigolf/engine.js';
import { holeById } from '../public/minigolf/courses.js';

export const LEVELS = {
  // écart-type d'exécution : angle (radians), puissance relative et puissance absolue (un humain
  // dose mal les tout petits coups aussi)
  bon: { angle: 0.07, power: 0.11, abs: 0.006 },
  champion: { angle: 0.028, power: 0.045, abs: 0.003 },
};

const fields = new Map();

/** Distance « à pied » vers le trou en contournant murs, obstacles et eau (grille de 1 unité). */
export function distanceField(hole) {
  if (fields.has(hole.id)) return fields.get(hole.id);
  const water = (x, y) => (hole.zones ?? []).some((z) => z.type === 'water' && inPoly(z.poly, x, y)) && !(hole.zones ?? []).some((z) => z.type === 'bridge' && inPoly(z.poly, x, y));
  const blocked = (x, y) =>
    !inPoly(hole.shape, x, y) || (hole.blocks ?? []).some((b) => inPoly(b.poly, x, y)) || (hole.bumpers ?? []).some((u) => Math.hypot(x - u.x, y - u.y) < u.r + 1) || water(x, y);
  const dist = new Float64Array(W * H).fill(Infinity);
  const [hx, hy] = hole.hole.map(Math.round);
  const q = [[hx, hy]];
  dist[hy * W + hx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy, c] of [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [1, -1, 1.414],
      [-1, 1, 1.414],
      [-1, -1, 1.414],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || blocked(nx + 0.5, ny + 0.5)) continue;
      const nd = dist[y * W + x] + c;
      if (nd < dist[ny * W + nx] - 1e-9) {
        dist[ny * W + nx] = nd;
        q.push([nx, ny]);
      }
    }
  }
  const f = (x, y) => {
    const v = dist[Math.min(H - 1, Math.max(0, Math.floor(y))) * W + Math.min(W - 1, Math.max(0, Math.floor(x)))];
    return v === Infinity ? Math.hypot(x - hole.hole[0], y - hole.hole[1]) * 1.6 + 30 : v;
  };
  fields.set(hole.id, f);
  return f;
}

/** Nombre de coups qu'il faudra probablement encore depuis une distance « à pied » d. */
const remaining = (d) => (d < 4 ? 1.02 : d < 10 ? 1.12 : d < 22 ? 1.35 : d < 45 ? 1.65 : 1.9 + d / 120);

/** Valeur d'un résultat de simulation : coups joués + coups restants estimés. */
function score(r, field, startValue) {
  if (r.result === 'hole') return 1;
  if (r.result === 'water') return 2 + startValue;
  return 1 + remaining(field(r.end.x, r.end.y));
}

/** Tirage gaussien borné à ±2,2 écarts-types (pas de coup complètement raté). */
function gaussian(rand) {
  const g = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  return Math.max(-2.2, Math.min(2.2, g));
}

/**
 * Choisit un coup pour la balle `from` sur le trou `holeId`.
 * rand : générateur [0, 1[ (Math.random en jeu, déterministe dans les tests).
 */
export function chooseShot({ holeId, from, shots, level = 'bon', rand = Math.random }) {
  const hole = holeById(holeId);
  const field = distanceField(hole);
  const noise = LEVELS[level] ?? LEVELS.bon;
  const tau0 = tauFor(shots);
  const startValue = remaining(field(from.x, from.y));

  const evalShot = (angle, power) => score(simulate(hole, from, angle, power, tau0), field, startValue);
  const jitter = (c, ka, kp) => evalShot(c.angle + ka * noise.angle, Math.min(1, Math.max(0.02, c.power * (1 + kp * noise.power) + kp * noise.abs)));
  const byValue = (x, y) => x.value - y.value;

  // 1. balayage large : 240 directions × 16 puissances, plus le tir droit vers le trou
  const candidates = [];
  const powers = [0.05, 0.08, 0.11, 0.14, 0.17, 0.2, 0.25, 0.3, 0.36, 0.43, 0.5, 0.58, 0.67, 0.77, 0.88, 1];
  const direct = Math.atan2(hole.hole[1] - from.y, hole.hole[0] - from.x);
  const angles = Array.from({ length: 240 }, (_, i) => (i / 240) * Math.PI * 2);
  angles.push(direct, direct - 0.01, direct + 0.01);
  for (const angle of angles) for (const power of powers) candidates.push({ angle, power, value: evalShot(angle, power) });
  candidates.sort(byValue);

  // 2. tous les coups presque aussi bons que le meilleur, toutes forces confondues (au plus 160,
  //    pris à intervalles réguliers) : premier test de robustesse rapide
  const near = candidates.filter((c) => c.value <= candidates[0].value + 0.35);
  const step = Math.max(1, near.length / 160);
  const pool = [];
  for (let i = 0; i < near.length && pool.length < 160; i += step) pool.push(near[Math.floor(i)]);
  const quick = [
    [0, 0],
    [1.5, 0],
    [-1.5, 0],
    [0, 1.5],
    [0, -1.5],
  ];
  for (const c of pool) c.robust = quick.reduce((t, [ka, kp]) => t + jitter(c, ka, kp), 0) / quick.length;
  pool.sort((x, y) => x.robust - y.robust);

  // 3. affinage des 12 meilleurs, puis test de robustesse complet
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
    [1.2, 1.2],
    [-1.2, -1.2],
    [1.2, -1.2],
    [-1.2, 1.2],
  ];
  let best = null;
  for (const c0 of pool.slice(0, 12)) {
    for (const [da, dp] of [
      [0, 0],
      [-0.01, 0],
      [0.01, 0],
      [0, -0.03],
      [0, 0.03],
    ]) {
      const c = { angle: c0.angle + da, power: Math.min(1, Math.max(0.04, c0.power + dp)) };
      const value = offsets.reduce((t, [ka, kp]) => t + jitter(c, ka, kp), 0) / offsets.length + c.power * 0.01;
      if (!best || value < best.value) best = { ...c, value };
    }
  }

  // 4. on joue, avec la main qui tremble un peu
  const angle = best.angle + gaussian(rand) * noise.angle;
  const g = gaussian(rand);
  const power = Math.min(1, Math.max(0.02, best.power * (1 + g * noise.power) + g * noise.abs));
  return { type: 'shot', angle: Math.round(angle * 1e4) / 1e4, power: Math.round(power * 1e3) / 1e3, expected: Math.round(best.value * 100) / 100 };
}
