// Add-on « Étoile » (activé par défaut) : joker de colonne qui coûte 20 points s'il reste en jeu.

export default {
  id: 'etoile',
  name: 'Étoile ★',
  description:
    'Ajoute des Étoiles. Une Étoile visible remplace n’importe quel nombre pour compléter une colonne. Si elle est encore dans votre grille à la fin de la manche, elle coûte 20 points.',

  modifyDeck(deck, ctx) {
    const count = ctx.options.count ?? 2;
    for (let i = 0; i < count; i++) deck.push({ kind: 'star', value: ctx.options.value ?? 20 });
    return deck;
  },

  matchKey(card) {
    return card.kind === 'star' ? '*' : undefined;
  },

  ui: {
    faces: {
      star: { label: '★', name: 'Étoile', bg: '#ffd84d', fg: '#1a1a1a' },
    },
  },
};
