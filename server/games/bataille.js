// Sushi maritime (bataille navale aux sushis) côté serveur : le moteur pur de public/bataille/engine.js, le serveur arbitre.

import { createGame, applyAction, viewFor, SIZES, RULES } from '../../public/bataille/engine.js';

export default {
  id: 'bataille',
  name: 'Sushi maritime',
  description: 'Dressez vos makis en secret, dévorez le plateau d’en face.',
  emoji: '🍣',
  color: '#e5483b',
  path: '/bataille/',
  options: [
    {
      key: 'size',
      label: 'Plateau',
      type: 'select',
      default: 10,
      choices: [
        { value: 10, label: '10 × 10 · 5 pièces (grand repas)' },
        { value: 8, label: '8 × 8 · 4 pièces (apéro rapide)' },
      ],
    },
    {
      key: 'rule',
      label: 'Après une bouchée réussie',
      type: 'select',
      default: 'alternate',
      choices: [
        { value: 'alternate', label: 'Chacun son tour' },
        { value: 'again', label: 'Miam : on reprend une bouchée' },
      ],
    },
  ],

  cleanOptions(options = {}) {
    const size = Number(options.size);
    return { size: SIZES.includes(size) ? size : 10, rule: RULES.includes(options.rule) ? options.rule : 'alternate' };
  },

  create: ({ players, options, seed }) => createGame({ players, size: options.size, rule: options.rule, seed }),
  act: (state, action, playerId) => applyAction(state, action, playerId),
  view: (state, playerId) => viewFor(state, playerId),

  status(state) {
    const ids = state.players.map((p) => p.id);
    if (state.phase === 'placement') return { over: false, awaiting: state.players.filter((p) => !p.ships).map((p) => p.id), label: 'On dresse les plateaux' };
    if (state.phase === 'battle') {
      const shots = state.players.reduce((n, p) => n + p.shots.length, 0);
      return { over: false, awaiting: [ids[state.turn]], label: `Repas en cours · ${shots} coup${shots > 1 ? 's' : ''} de baguettes` };
    }
    const sunk = (p) => p.shots.filter((t) => t.r === 'sunk').length;
    return {
      over: true,
      awaiting: [],
      label: `Plateau dévoré en ${state.players[state.winner].shots.length} coups de baguettes`,
      result: { winners: [ids[state.winner]], scores: Object.fromEntries(state.players.map((p) => [p.id, sunk(p)])) },
    };
  },
};
