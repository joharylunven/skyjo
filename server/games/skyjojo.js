// Skyjojo côté serveur : le moteur pur de public/skyjojo/engine tourne ici, le serveur est l'arbitre.

import { readFileSync } from 'node:fs';
import { createGame, applyAction, viewFor, registerAddon, getAddon } from '../../public/skyjojo/engine/index.js';

const root = new URL('../../public/skyjojo/', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

let cfg = null;

export default {
  id: 'skyjojo',
  name: 'Skyjojo',
  description: 'Le jeu des 12 cartes : la plus petite somme gagne.',
  emoji: '🃏',
  color: '#f3e04f',
  path: '/skyjojo/',
  options: [],

  async init() {
    const game = readJson('config/game.json');
    const cards = readJson('config/cards.json');
    const addons = readJson('config/addons.json');
    for (const id of addons.available) {
      if (!getAddon(id)) registerAddon((await import(new URL(`addons/${id}.js`, root))).default);
    }
    cfg = { game, cards, addons };
    this.options = [
      {
        key: 'endThreshold',
        label: 'Fin de partie',
        type: 'select',
        default: game.rules.endThreshold,
        choices: game.endThresholdChoices.map((v) => ({ value: v, label: `${v} points` })),
      },
      {
        key: 'addons',
        label: 'Cartes spéciales',
        type: 'multi',
        default: addons.enabled,
        choices: addons.available.map((id) => ({ value: id, label: getAddon(id).name, description: getAddon(id).description })),
      },
    ];
  },

  /** Normalise les options reçues du client. */
  cleanOptions(options = {}) {
    const threshold = Number(options.endThreshold);
    const choices = cfg.game.endThresholdChoices;
    return {
      endThreshold: choices.includes(threshold) ? threshold : cfg.game.rules.endThreshold,
      addons: Array.isArray(options.addons) ? cfg.addons.available.filter((id) => options.addons.includes(id)) : [...cfg.addons.enabled],
    };
  },

  create({ players, options, seed }) {
    return createGame({
      players,
      rules: { ...cfg.game.rules, endThreshold: options.endThreshold },
      deck: cfg.cards.deck,
      addons: options.addons,
      addonOptions: cfg.addons.options,
      seed,
    });
  },

  act: (state, action, playerId) => applyAction(state, action, playerId),
  view: (state, playerId) => viewFor(state, playerId),

  /** Qui doit agir, où en est la partie, et le résultat final. */
  status(state) {
    const ids = state.players.map((p) => p.id);
    const reveals = state.rules.setupReveals;
    switch (state.phase) {
      case 'setup':
        return {
          over: false,
          awaiting: state.players.filter((p) => p.grid.filter((x) => x && x.up).length < reveals).map((p) => p.id),
          label: `Manche ${state.round} · départ`,
        };
      case 'play':
        return { over: false, awaiting: [ids[state.turn]], label: `Manche ${state.round}${state.finisher !== null ? ' · dernier tour' : ''}` };
      case 'roundOver':
        return { over: false, awaiting: ids, label: `Fin de la manche ${state.round}` };
      default:
        return {
          over: true,
          awaiting: [],
          label: `Terminée en ${state.round} manche${state.round > 1 ? 's' : ''}`,
          result: { winners: [...state.winners], scores: Object.fromEntries(state.players.map((p) => [p.id, p.total])) },
        };
    }
  },
};
