// Add-on « Joker » : cartes valant 0 qui peuvent changer de place librement.

const isJoker = (slot) => slot && slot.up && slot.card && slot.card.kind === 'joker';

export default {
  id: 'joker',
  name: 'Joker',
  description:
    'Ajoute des Jokers valant 0. Un Joker visible dans votre grille peut, une fois par tour et avant de piocher, échanger sa place avec n’importe laquelle de vos cartes.',

  modifyDeck(deck, ctx) {
    const count = ctx.options.count ?? 4;
    for (let i = 0; i < count; i++) deck.push({ kind: 'joker', value: ctx.options.value ?? 0 });
    return deck;
  },

  actions: {
    move: {
      steps: ['draw'],
      validate(state, action, ctx) {
        if (ctx.store.usedTurn === state.turnCount) return 'Le Joker a déjà bougé ce tour-ci.';
        const grid = state.players[ctx.player].grid;
        if (!Number.isInteger(action.from) || !isJoker(grid[action.from])) return 'Choisissez un Joker visible de votre grille.';
        if (!Number.isInteger(action.to) || !grid[action.to] || action.to === action.from) return 'Choisissez une autre de vos cartes.';
        return null;
      },
      apply(state, action, ctx) {
        const grid = state.players[ctx.player].grid;
        [grid[action.from], grid[action.to]] = [grid[action.to], grid[action.from]];
        ctx.store.usedTurn = state.turnCount;
        ctx.emit({ type: 'joker:move', player: ctx.player, from: action.from, to: action.to });
        ctx.log({ t: 'joker:move', p: ctx.player });
        ctx.checkColumns(ctx.player);
      },
    },
  },

  viewState(store) {
    return { usedTurn: store.usedTurn ?? null };
  },

  ui: {
    faces: {
      joker: { label: '★', emoji: '🃏', bg: '#c084fc', bg2: '#6b21a8', fg: '#ffffff' },
    },
    actions: [
      {
        id: 'move',
        label: 'Déplacer un Joker',
        when: (view) =>
          view.turn === view.me &&
          view.step === 'draw' &&
          view.addonState.joker?.usedTurn !== view.turnCount &&
          view.players[view.me].grid.some(isJoker),
        picks: [
          { prompt: 'Touchez le Joker à déplacer', filter: ({ slot, owner, view }) => owner === view.me && isJoker(slot) },
          {
            prompt: 'Touchez la carte avec laquelle l’échanger',
            filter: ({ slot, owner, index, view, picks }) => owner === view.me && slot && index !== picks[0].index,
          },
        ],
        build: ([from, to]) => ({ type: 'joker:move', from: from.index, to: to.index }),
      },
    ],
    formatLog: (entry, name) => (entry.t === 'joker:move' ? `${name(entry.p)} déplace un Joker` : null),
  },
};
