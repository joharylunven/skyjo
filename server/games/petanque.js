// Pétanque à Quiberon côté serveur : le moteur de public/petanque/engine.js simule chaque lancer.

import { createGame, applyAction, viewFor, OPTIONS, terrainFor } from '../../public/petanque/engine.js';
import { TERRAINS } from '../../public/petanque/terrains.js';

export default {
  id: 'petanque',
  name: 'Pétanque à Quiberon',
  description: 'Boules en chocolat contre boules en caramel, sur la plage et les quais.',
  emoji: '🍬',
  color: '#f2b84b',
  path: '/petanque/',
  options: [
    {
      key: 'target',
      label: 'Partie',
      type: 'select',
      default: 13,
      choices: [
        { value: 13, label: 'En 13 points (classique)' },
        { value: 7, label: 'En 7 points (apéro)' },
      ],
    },
    {
      key: 'terrain',
      label: 'Terrain',
      type: 'select',
      default: 'tournee',
      choices: [{ value: 'tournee', label: 'La tournée : un terrain par mène' }, ...TERRAINS.map((t) => ({ value: t.id, label: t.name }))],
    },
  ],

  cleanOptions: (o = {}) => ({
    target: OPTIONS.target.includes(Number(o.target)) ? Number(o.target) : 13,
    terrain: OPTIONS.terrain.includes(o.terrain) ? o.terrain : 'tournee',
  }),
  create: ({ players, options, seed }) => createGame({ players, target: options.target, terrain: options.terrain, seed }),
  act: (state, action, playerId) => applyAction(state, action, playerId),
  view: (state, playerId) => viewFor(state, playerId),

  status(state) {
    const scores = Object.fromEntries(state.players.map((p, i) => [p.id, state.scores[i]]));
    if (state.phase === 'over') return { over: true, awaiting: [], label: `${state.scores[0]} – ${state.scores[1]} en ${state.history.length} mènes`, result: { winners: state.winners, scores } };
    return { over: false, awaiting: [state.players[state.thrower].id], label: `Mène ${state.mene} · ${state.scores[0]}–${state.scores[1]} · ${terrainFor(state).name}` };
  },
};
