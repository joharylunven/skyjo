// Registre des add-ons. Le moteur ne fait aucun import dynamique : l'application (ou les tests)
// enregistre les modules, et l'état de jeu ne contient que leurs identifiants.

const registry = new Map();

const HOOKS = ['modifyDeck', 'onSetup', 'onDraw', 'onReveal', 'onSwap', 'scoreCard', 'matchKey', 'onRoundEnd', 'viewState'];

export function registerAddon(addon) {
  if (!addon || typeof addon.id !== 'string' || !/^[a-z0-9-]+$/.test(addon.id)) {
    throw new Error('Un add-on doit avoir un id en minuscules (a-z, 0-9, -)');
  }
  for (const hook of HOOKS) {
    if (addon[hook] !== undefined && typeof addon[hook] !== 'function') {
      throw new Error(`Add-on ${addon.id} : ${hook} doit être une fonction`);
    }
  }
  for (const [name, def] of Object.entries(addon.actions ?? {})) {
    if (typeof def.apply !== 'function') throw new Error(`Add-on ${addon.id} : l'action ${name} n'a pas de apply()`);
  }
  registry.set(addon.id, addon);
  return addon;
}

export function getAddon(id) {
  return registry.get(id);
}

export function listAddons() {
  return [...registry.values()];
}

export function clearAddons() {
  registry.clear();
}

/** Add-ons actifs pour un état (ou une vue) de jeu, dans l'ordre déclaré. */
export function activeAddons(stateLike) {
  return (stateLike.addons ?? []).map((id) => registry.get(id)).filter(Boolean);
}
