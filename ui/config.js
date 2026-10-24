// Chargement de la configuration et des add-ons (chemins relatifs : compatible /nom-du-repo/).

import { registerAddon } from '../engine/index.js';

const url = (path) => new URL(`../${path}`, import.meta.url);

async function json(path) {
  const res = await fetch(url(path), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Impossible de charger ${path} (${res.status})`);
  return res.json();
}

export async function loadConfig() {
  const [game, cards, addons, network] = await Promise.all([
    json('config/game.json'),
    json('config/cards.json'),
    json('config/addons.json'),
    json('config/network.json'),
  ]);
  const modules = {};
  await Promise.all(
    addons.available.map(async (id) => {
      try {
        const mod = await import(url(`addons/${id}.js`));
        modules[id] = registerAddon(mod.default);
      } catch (e) {
        console.error(`Add-on ${id} non chargé`, e);
      }
    }),
  );
  addons.available = addons.available.filter((id) => modules[id]);
  addons.enabled = (addons.enabled ?? []).filter((id) => modules[id]);
  return { game, cards, addons, network, modules };
}
