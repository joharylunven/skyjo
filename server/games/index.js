// Registre des jeux. Pour ajouter un jeu : un module serveur ici (voir docs/NOUVEAU-JEU.md) et
// son interface dans public/<id>/.

import skyjojo from './skyjojo.js';
import bataille from './bataille.js';

const MODULES = [skyjojo, bataille];

export async function loadGames() {
  const games = new Map();
  for (const mod of MODULES) {
    await mod.init?.();
    games.set(mod.id, mod);
  }
  return games;
}

/** Description publique d'un jeu pour le menu d'accueil. */
export function describeGame(g) {
  return { id: g.id, name: g.name, description: g.description, emoji: g.emoji, color: g.color, path: g.path, options: g.options };
}
