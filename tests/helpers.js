import { createGame, applyAction } from '../engine/index.js';

export const PLAYERS = [
  { id: 'p0', name: 'Alice' },
  { id: 'p1', name: 'Bob' },
];

export function newGame(opts = {}) {
  return createGame({ players: PLAYERS, seed: 'test-seed', ...opts });
}

/** Applique une action et échoue si elle est refusée. */
export function act(state, action, playerId) {
  const res = applyAction(state, action, playerId);
  if (res.error) throw new Error(`${action.type} refusée : ${res.error.code} ${res.error.message}`);
  return res.state;
}

/** Remplace la grille d'un joueur. `values` : 12 nombres (ou objets carte), null = emplacement vide. */
export function setGrid(state, p, values, up = false) {
  state.players[p].grid = values.map((v, i) => {
    if (v === null) return null;
    const card = typeof v === 'object' ? v : { kind: 'number', value: v };
    return { card: { id: 1000 + p * 100 + i, ...card }, up: Array.isArray(up) ? up[i] : up };
  });
}

/** Passe la phase de départ et met le joueur `p` en tour, prêt à piocher. */
export function toPlay(state, p = 0) {
  Object.assign(state, { phase: 'play', turn: p, step: 'draw', turnCount: 1 });
  return state;
}
