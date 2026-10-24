// Add-on « Coup d'œil » (activé par défaut) : une carte 13 posée ou retournée face visible dans
// sa grille permet de regarder secrètement une de ses cartes cachées. L'information n'est envoyée
// qu'au joueur concerné (viewState filtre par joueur).

const isTrigger = (card, options) => card.kind === 'number' && card.value === (options.value ?? 13);

function grant(state, ctx, p) {
  if (state.players[p].grid.some((slot) => slot && !slot.up)) ctx.store.pending[p] += 1;
}

function init(state, store) {
  store.pending ??= state.players.map(() => 0);
  store.known ??= state.players.map(() => []);
}

export default {
  id: 'coup-oeil',
  name: 'Carte 13 : coup d’œil',
  description:
    'Les cartes 13 valent 13 points, mais quand vous en posez ou en retournez une dans votre grille, vous regardez secrètement une de vos cartes cachées.',

  onSetup(state, ctx) {
    ctx.store.pending = state.players.map(() => 0);
    ctx.store.known = state.players.map(() => []);
  },

  onSwap(state, ctx) {
    init(state, ctx.store);
    if (isTrigger(ctx.card, ctx.options)) grant(state, ctx, ctx.player);
  },

  onReveal(state, ctx) {
    init(state, ctx.store);
    if (isTrigger(ctx.card, ctx.options)) grant(state, ctx, ctx.player);
  },

  actions: {
    look: {
      phases: ['setup', 'play'],
      requireTurn: false,
      validate(state, action, ctx) {
        init(state, ctx.store);
        if (!(ctx.store.pending[ctx.player] > 0)) return 'Aucun coup d’œil disponible.';
        const slot = state.players[ctx.player].grid[action.index];
        if (!Number.isInteger(action.index) || !slot || slot.up) return 'Choisissez une de vos cartes cachées.';
        return null;
      },
      apply(state, action, ctx) {
        ctx.store.pending[ctx.player] -= 1;
        const card = state.players[ctx.player].grid[action.index].card;
        ctx.store.known[ctx.player].push({ index: action.index, id: card.id });
        ctx.log({ t: 'coup-oeil:look', p: ctx.player });
      },
    },
  },

  /** Chacun ne reçoit que ses propres coups d'œil, et seulement pour les cartes encore cachées. */
  viewState(store, { state, playerId }) {
    const p = state.players.findIndex((pl) => pl.id === playerId);
    if (p < 0) return { pending: 0, known: [] };
    const grid = state.players[p].grid;
    const known = (store.known?.[p] ?? [])
      .filter((k) => grid[k.index] && !grid[k.index].up && grid[k.index].card.id === k.id)
      .map((k) => ({ index: k.index, card: { ...grid[k.index].card } }));
    return { pending: store.pending?.[p] ?? 0, known };
  },

  ui: {
    actions: [
      {
        id: 'look',
        auto: true,
        label: 'Coup d’œil',
        when: (view) => ['setup', 'play'].includes(view.phase) && view.addonState['coup-oeil']?.pending > 0,
        picks: [
          {
            prompt: 'Coup d’œil : touchez une de vos cartes cachées',
            filter: ({ slot, owner, index, view }) =>
              owner === view.me && slot && !slot.up && !view.addonState['coup-oeil'].known.some((k) => k.index === index),
          },
        ],
        build: ([pick]) => ({ type: 'coup-oeil:look', index: pick.index }),
      },
    ],
    decorate: ({ view, owner, index }) => {
      if (owner !== view.me) return null;
      const k = view.addonState['coup-oeil']?.known.find((x) => x.index === index);
      return k ? { badge: k.card } : null;
    },
    formatLog: (entry, name) => (entry.t === 'coup-oeil:look' ? `${name(entry.p)} jette un coup d’œil à une de ses cartes` : null),
  },
};
