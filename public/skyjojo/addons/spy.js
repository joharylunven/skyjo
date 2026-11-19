// Add-on « Espion » : piochée, la carte peut être jouée pour retourner une carte cachée au choix.

export default {
  id: 'spy',
  name: 'Espion',
  description:
    'Ajoute des cartes Espion (valeur 0 si on les garde). Piochée dans la pioche, un Espion peut être joué : il part à la défausse et vous retournez une carte cachée au choix, chez vous ou chez l’adversaire. Votre tour se termine.',

  modifyDeck(deck, ctx) {
    const count = ctx.options.count ?? 4;
    for (let i = 0; i < count; i++) deck.push({ kind: 'spy', value: ctx.options.value ?? 0 });
    return deck;
  },

  actions: {
    play: {
      steps: ['decide'],
      endsTurn: true,
      validate(state, action, ctx) {
        const drawn = state.drawn;
        if (!drawn || drawn.card.kind !== 'spy' || drawn.from !== 'deck') return 'Il faut avoir pioché un Espion dans la pioche.';
        const target = state.players[action.target];
        if (!target) return 'Joueur invalide.';
        const slot = target.grid[action.index];
        if (!Number.isInteger(action.index) || !slot || slot.up) return 'Choisissez une carte cachée.';
        return null;
      },
      apply(state, action, ctx) {
        state.discard.push(state.drawn.card);
        state.drawn = null;
        ctx.emit({ type: 'spy:play', player: ctx.player, target: action.target, index: action.index });
        ctx.flip(action.target, action.index);
        ctx.log({ t: 'spy:play', p: ctx.player, target: action.target, card: state.players[action.target].grid[action.index].card });
      },
    },
  },

  ui: {
    faces: {
      spy: { label: '👁', emoji: '🕵️', bg: '#64748b', bg2: '#0f172a', fg: '#ffffff' },
    },
    actions: [
      {
        id: 'play',
        label: 'Jouer l’Espion',
        when: (view) => view.turn === view.me && view.step === 'decide' && view.drawn?.card.kind === 'spy' && view.drawn.from === 'deck',
        picks: [{ prompt: 'Touchez une carte cachée (à vous ou adverse)', filter: ({ slot }) => slot && !slot.up }],
        build: ([pick]) => ({ type: 'spy:play', target: pick.owner, index: pick.index }),
      },
    ],
    formatLog: (entry, name, label) =>
      entry.t === 'spy:play' ? `${name(entry.p)} joue l’Espion et révèle un ${label(entry.card)} chez ${name(entry.target)}` : null,
  },
};
