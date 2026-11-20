// Solveur glouton pour vérifier que chaque trou se joue : distance « à pied » vers le trou
// (parcours en largeur sur une grille qui contourne murs et eau), puis on essaie beaucoup de coups.
import { simulate, inPoly, tauFor } from '../public/minigolf/engine.js';

export function distanceField(hole) {
  const W = 100, H = 160;
  const blocked = (x, y) =>
    !inPoly(hole.shape, x, y) ||
    (hole.blocks ?? []).some((b) => inPoly(b.poly, x, y)) ||
    (hole.bumpers ?? []).some((u) => Math.hypot(x - u.x, y - u.y) < u.r + 1) ||
    ((hole.zones ?? []).some((z) => z.type === 'water' && inPoly(z.poly, x, y)) && !(hole.zones ?? []).some((z) => z.type === 'bridge' && inPoly(z.poly, x, y)));
  const dist = new Float64Array(W * H).fill(Infinity);
  const [hx, hy] = hole.hole.map(Math.round);
  const q = [[hx, hy]];
  dist[hy * W + hx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist[ny * W + nx] !== Infinity || blocked(nx + 0.5, ny + 0.5)) continue;
      dist[ny * W + nx] = dist[y * W + x] + 1;
      q.push([nx, ny]);
    }
  }
  return (x, y) => dist[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))];
}

/** Joue le trou de façon gloutonne ; renvoie le nombre de coups (ou Infinity). */
export function solve(hole, { maxShots = 6, angles = 144, powers = [0.12, 0.2, 0.28, 0.36, 0.45, 0.55, 0.65, 0.8, 1] } = {}) {
  const field = distanceField(hole);
  let ball = { x: hole.tee[0], y: hole.tee[1] };
  for (let n = 1; n <= maxShots; n++) {
    let best = null;
    for (let i = 0; i < angles; i++) {
      const a = (i / angles) * Math.PI * 2;
      for (const p of powers) {
        const r = simulate(hole, ball, a, p, tauFor(n - 1));
        if (r.result === 'hole') return n;
        if (r.result === 'water') continue;
        const d = field(r.end.x, r.end.y);
        if (!best || d < best.d) best = { d, end: r.end };
      }
    }
    if (!best) return Infinity;
    ball = best.end;
  }
  return Infinity;
}
