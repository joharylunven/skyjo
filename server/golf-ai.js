// Robot de minigolf. Il ne triche pas : il essaie des coups avec le même simulateur que l'arbitre,
// choisit celui qui reste bon même s'il le joue un peu de travers (comme un humain), puis le joue
// avec une petite imprécision. Résultat : il tente les coups sûrs, vise le trou quand c'est
// jouable, évite l'eau, et rate parfois.

import { simulate, inPoly, tauFor, W, H } from '../public/minigolf/engine.js';
import { holeById } from '../public/minigolf/courses.js';

export const LEVELS = {
  // écart-type d'exécution : angle (radians) et puissance (relative)
  bon: { angle: 0.05, power: 0.08 },
  champion: { angle: 0.028, power: 0.045 },
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

function gaussian(rand) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
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

  // 1. balayage large : 240 directions × 14 puissances
  const candidates = [];
  const powers = [0.08, 0.12, 0.16, 0.2, 0.25, 0.3, 0.36, 0.43, 0.5, 0.58, 0.67, 0.77, 0.88, 1];
  for (let i = 0; i < 240; i++) {
    const angle = (i / 240) * Math.PI * 2;
    for (const power of powers) candidates.push({ angle, power, value: score(simulate(hole, from, angle, power, tau0), field, startValue) });
  }
  candidates.sort((a, b) => a.value - b.value);

  // 2. affinage autour des meilleurs coups
  const refined = [];
  for (const c of candidates.slice(0, 18)) {
    for (const da of [-0.012, -0.006, 0, 0.006, 0.012])
      for (const dp of [-0.03, 0, 0.03]) {
        const angle = c.angle + da;
        const power = Math.min(1, Math.max(0.05, c.power + dp));
        refined.push({ angle, power, value: score(simulate(hole, from, angle, power, tau0), field, startValue) });
      }
  }
  refined.sort((a, b) => a.value - b.value);

  // 3. robustesse : on garde le coup qui marche encore joué un peu de travers
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1.4, 0.7],
    [-1.4, -0.7],
    [0.7, -1.4],
    [-0.7, 1.4],
  ];
  let best = null;
  for (const c of refined.slice(0, 30)) {
    let total = 0;
    for (const [ka, kp] of offsets) {
      const angle = c.angle + ka * noise.angle;
      const power = Math.min(1, Math.max(0.05, c.power * (1 + kp * noise.power)));
      total += score(simulate(hole, from, angle, power, tau0), field, startValue);
    }
    const value = total / offsets.length;
    if (!best || value < best.value) best = { ...c, value };
  }

  // 4. on joue, avec la main qui tremble un peu
  const angle = best.angle + gaussian(rand) * noise.angle;
  const power = Math.min(1, Math.max(0.05, best.power * (1 + gaussian(rand) * noise.power)));
  return { type: 'shot', angle: Math.round(angle * 1e4) / 1e4, power: Math.round(power * 1e3) / 1e3, expected: Math.round(best.value * 100) / 100 };
}
