// Vue filtrée d'un état : c'est la seule chose envoyée sur le réseau.
// Les cartes cachées (y compris les siennes), le contenu de la pioche, la seed et l'état du RNG
// ne sont jamais inclus.

import { activeAddons } from './addons.js';

function hideSlot(slot) {
  if (slot === null) return null;
  return slot.up ? { up: true, card: { ...slot.card } } : { up: false };
}

export function viewFor(state, playerId) {
  const addonState = {};
  for (const addon of activeAddons(state)) {
    if (addon.viewState) addonState[addon.id] = addon.viewState(state.addonState[addon.id] ?? {}, { state, playerId });
  }
  return {
    v: state.v,
    me: state.players.findIndex((p) => p.id === playerId),
    round: state.round,
    phase: state.phase,
    turn: state.turn,
    step: state.step,
    turnCount: state.turnCount,
    rules: { ...state.rules },
    addons: [...state.addons],
    addonState,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      total: p.total,
      rounds: p.rounds.map((r) => ({ ...r })),
      grid: p.grid.map(hideSlot),
    })),
    deckCount: state.deck.length,
    discardTop: state.discard.length ? { ...state.discard.at(-1) } : null,
    discardCount: state.discard.length,
    drawn: state.drawn ? { from: state.drawn.from, card: { ...state.drawn.card } } : null,
    finisher: state.finisher,
    lastTurns: state.lastTurns,
    lastRound: state.lastRound ? structuredClone(state.lastRound) : null,
    winners: state.winners ? [...state.winners] : null,
    log: state.log.slice(-15).map((e) => ({ ...e })),
  };
}
