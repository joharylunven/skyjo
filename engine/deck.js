// Construction du paquet à partir d'une spécification [{ kind, value, count }].

/** Répartition par défaut : -2 ×5, -1 ×10, 0 ×15, puis 1 à 12 ×10 (150 cartes). */
export const DEFAULT_DECK = [
  { value: -2, count: 5 },
  { value: -1, count: 10 },
  { value: 0, count: 15 },
  ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, count: 10 })),
];

/** Normalise une spécification (ex. la section `deck` de config/cards.json). */
export function normalizeDeckSpec(spec = DEFAULT_DECK) {
  return spec.map(({ kind = 'number', value = 0, count = 1 }) => ({
    kind: String(kind),
    value: Number(value),
    count: Math.max(0, Math.floor(Number(count))),
  }));
}

/** Liste des cartes (sans identifiant ; les ids sont attribués après les add-ons). */
export function buildDeck(spec) {
  const deck = [];
  for (const { kind, value, count } of spec) {
    for (let i = 0; i < count; i++) deck.push({ kind, value });
  }
  return deck;
}
