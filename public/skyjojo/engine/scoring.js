import { activeAddons } from './addons.js';
import { columnIndices, columnOf } from './grid.js';

/**
 * Valeur d'une carte de la grille, après passage dans les hooks `scoreCard` des add-ons.
 * Fonctionne sur l'état complet comme sur une vue filtrée (les cartes cachées n'ont pas de `card`).
 */
export function cardScore(stateLike, player, index) {
  const { cols, rows } = stateLike.rules;
  const grid = stateLike.players[player].grid;
  const slot = grid[index];
  if (!slot || !slot.card) return 0;
  let value = Number(slot.card.value) || 0;
  const col = columnOf(index, cols);
  const column = columnIndices(col, cols, rows).map((i) => grid[i]);
  for (const addon of activeAddons(stateLike)) {
    if (!addon.scoreCard) continue;
    const r = addon.scoreCard(slot.card, { state: stateLike, player, index, col, column, value });
    if (typeof r === 'number' && Number.isFinite(r)) value = r;
  }
  return value;
}

/** Score d'un joueur. `visibleOnly` : ne compte que les cartes retournées (affichage en cours de manche). */
export function scorePlayer(stateLike, player, { visibleOnly = false } = {}) {
  const grid = stateLike.players[player].grid;
  let total = 0;
  grid.forEach((slot, index) => {
    if (!slot || !slot.card) return;
    if (visibleOnly && !slot.up) return;
    total += cardScore(stateLike, player, index);
  });
  return total;
}
