// Robot de pétanque (« Mamie Soizic »). Comme au minigolf, il ne triche pas : il essaie des
// lancers avec le même simulateur que l'arbitre, sans connaître la petite dérive du sable, et
// garde celui qui reste bon quand le sable dévie un peu. Il pointe très bien et tire quand
// l'adversaire tient le point de près.

import { simulateThrow, pointInfo, terrainFor, throwDistance, BOULES } from '../public/petanque/engine.js';

export const LEVELS = { bon: { angle: 0.006, power: 0.012 } };

const powerFor = (d) => Math.min(1, Math.max(0.02, (d - 12) / 128));
const gaussian = (rand) => Math.max(-2.2, Math.min(2.2, Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())));
const DRIFTS = [
  { angle: 0, dist: 0 },
  { angle: 1, dist: 0 },
  { angle: -1, dist: 0 },
  { angle: 0, dist: 1 },
  { angle: 0, dist: -1 },
];

/** Valeur d'une situation pour le joueur me (plus c'est grand, mieux c'est). */
function value(balls, left, me) {
  const info = pointInfo({ balls });
  if (!balls.some((b) => b.kind === 'cochonnet')) {
    // cochonnet mort : celui qui a encore des boules les marque
    if (left[me] > 0 && left[1 - me] === 0) return left[me];
    if (left[1 - me] > 0 && left[me] === 0) return -left[1 - me];
    return 0;
  }
  if (info.holder === null) return left[me] - left[1 - me] > 0 ? 0.2 : -0.2;
  const [a, b] = [info.best[me], info.best[1 - me]];
  const margin = a !== null && b !== null ? Math.min(4, Math.abs(b - a)) / 4 : 1;
  if (info.holder === me) {
    // l'adversaire va répondre avec ses boules restantes : un point serré vaut moins
    const threat = left[1 - me] > 0 ? 0.5 * (1 - margin) + 0.25 : 0;
    return info.points + margin * 0.5 - threat;
  }
  return -info.points - margin * 0.5 + (left[me] > 0 ? 0.3 : 0);
}

export function chooseThrow({ state, level = 'bon', rand = Math.random }) {
  const me = state.thrower;
  const t = terrainFor(state);
  const [cx, cy] = t.circle;
  const noise = LEVELS[level] ?? LEVELS.bon;
  const play = (c) => {
    const angle = c.angle + gaussian(rand) * noise.angle;
    const power = Math.min(1, Math.max(0.02, c.power * (1 + gaussian(rand) * noise.power)));
    return { type: 'throw', mode: c.mode, angle: Math.round(angle * 1e4) / 1e4, power: Math.round(power * 1e3) / 1e3 };
  };

  if (state.phase === 'cochonnet') {
    const ty = 52 + rand() * 30;
    const tx = (t.bounds.x0 + t.bounds.x1) / 2 + (rand() - 0.5) * 16;
    return play({ mode: 'cochonnet', angle: Math.atan2(ty - cy, tx - cx), power: powerFor(Math.hypot(tx - cx, ty - cy)) });
  }

  const c = state.balls.find((b) => b.kind === 'cochonnet');
  const left = [...state.left];
  left[me] -= 1;
  const id = `${me}-${BOULES - state.left[me]}`;
  const candidates = [];
  // pointer : viser un point d'arrivée autour du cochonnet (devant, c'est mieux que derrière)
  for (const dx of [-3, -1.5, 0, 1.5, 3])
    for (const dy of [-3, -1.5, 0, 1.5, 3, 4.5]) {
      const tx = c.x + dx;
      const ty = c.y + dy;
      const angle = Math.atan2(ty - cy, tx - cx);
      const power = powerFor(Math.hypot(tx - cx, ty - cy));
      for (const da of [-0.012, 0, 0.012]) candidates.push({ mode: 'pointer', angle: angle + da, power });
    }
  // tirer : sur les boules adverses proches du cochonnet
  for (const b of state.balls.filter((x) => x.owner === 1 - me && Math.hypot(x.x - c.x, x.y - c.y) < 16)) {
    const d = Math.hypot(b.x - cx, b.y - cy);
    const angle = Math.atan2(b.y - cy, b.x - cx);
    for (const dp of [-0.012, 0, 0.012]) for (const da of [-0.004, 0, 0.004]) candidates.push({ mode: 'tirer', angle: angle + da, power: powerFor(d / 0.95) + dp });
  }

  let best = null;
  for (const cand of candidates) {
    let total = 0;
    for (const drift of DRIFTS) {
      const sim = simulateThrow(t, state.balls, { id, kind: 'boule', owner: me }, { ...cand, drift });
      total += value(sim.balls, left, me);
    }
    const v = total / DRIFTS.length;
    if (!best || v > best.v) best = { ...cand, v };
  }
  return { ...play(best), expected: Math.round(best.v * 100) / 100 };
}

export { throwDistance };
