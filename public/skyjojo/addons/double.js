// Add-on « Double » : une carte ×2 visible double la valeur des autres cartes de sa colonne.

export default {
  id: 'double',
  name: 'Double',
  description:
    'Ajoute des cartes « ×2 » (valeur 0). Une fois visible, une carte ×2 double la valeur des autres cartes de sa colonne, négatives comprises. Deux ×2 dans la même colonne : ×4.',

  modifyDeck(deck, ctx) {
    const count = ctx.options.count ?? 3;
    for (let i = 0; i < count; i++) deck.push({ kind: 'double', value: 0 });
    return deck;
  },

  scoreCard(card, ctx) {
    if (card.kind === 'double') return undefined;
    const doubles = ctx.column.filter((slot) => slot && slot.up && slot.card && slot.card.kind === 'double').length;
    return doubles ? ctx.value * 2 ** doubles : undefined;
  },

  ui: {
    faces: {
      double: { label: '×2', emoji: '✨', bg: '#fb923c', bg2: '#9a3412', fg: '#ffffff' },
    },
  },
};
