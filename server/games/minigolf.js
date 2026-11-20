// Minigolf malgache côté serveur : le moteur de public/minigolf/engine.js simule chaque coup.

import { createGame, applyAction, viewFor, PARCOURS } from '../../public/minigolf/engine.js';
import { holeById, COURSE_NAME } from '../../public/minigolf/courses.js';

export default {
  id: 'minigolf',
  name: 'Minigolf',
  description: `${COURSE_NAME} : baobabs, tsingy, rizières et makis.`,
  emoji: '⛳',
  color: '#6fd36f',
  path: '/minigolf/',
  options: [
    {
      key: 'parcours',
      label: 'Parcours',
      type: 'select',
      default: 'tour',
      choices: Object.entries(PARCOURS).map(([value, p]) => ({ value, label: p.label })),
    },
  ],

  cleanOptions: (options = {}) => ({ parcours: PARCOURS[options.parcours] ? options.parcours : 'tour' }),
  create: ({ players, options, seed }) => createGame({ players, parcours: options.parcours, seed }),
  act: (state, action, playerId) => applyAction(state, action, playerId),
  view: (state, playerId) => viewFor(state, playerId),

  status(state) {
    if (state.phase === 'over') {
      const scores = Object.fromEntries(state.players.map((p) => [p.id, p.scores.reduce((a, b) => a + b, 0)]));
      const par = state.holes.reduce((a, id) => a + holeById(id).par, 0);
      return { over: true, awaiting: [], label: `${state.holes.length} trous · par ${par}`, result: { winners: state.winners, scores } };
    }
    const h = holeById(state.holes[state.hole]);
    return { over: false, awaiting: [state.players[state.turn].id], label: `Trou ${state.hole + 1}/${state.holes.length} · ${h.name}` };
  },
};
