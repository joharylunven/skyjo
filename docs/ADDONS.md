# API des add-ons

Un add-on est un module ES placé dans `addons/<id>.js` qui exporte **par défaut** un objet.
Tous les champs sont facultatifs sauf `id`. Le moteur (`engine/`) ne connaît aucun add-on à l'avance :
l'application les enregistre au démarrage (`registerAddon`) et l'état de jeu ne stocke que leurs identifiants.

```js
export default {
  id: 'mon-addon',            // obligatoire : a-z, 0-9, tiret ; identique au nom du fichier
  name: 'Mon add-on',         // affiché dans le lobby
  description: '…',           // affichée dans le lobby

  // --- Hooks du moteur (logique pure, pas de DOM) ---
  modifyDeck(deck, ctx) {},   // renvoie le paquet (tableau de { kind, value }) avant mélange
  onSetup(state, ctx) {},     // après la distribution de chaque manche
  onDraw(state, ctx) {},      // après une prise : ctx.card, ctx.source ('deck' | 'discard'), ctx.player
  onReveal(state, ctx) {},    // après un retournement : ctx.player, ctx.index, ctx.card
  onSwap(state, ctx) {},      // après un échange : ctx.player, ctx.index, ctx.card, ctx.old, ctx.source
  scoreCard(card, ctx) {},    // renvoie un nombre pour remplacer la valeur, ou undefined
  matchKey(card, ctx) {},     // clé de comparaison pour le retrait des colonnes (undefined = défaut)
  onRoundEnd(state, ctx) {},  // ctx.result = { raw, scores, doubled, finisher } ; modifiable
  viewState(store, ctx) {},   // partie publique de ctx.store envoyée aux joueurs

  // --- Actions personnalisées ---
  actions: {
    nomAction: {
      phases: ['play'],       // phases autorisées (défaut : ['play'])
      steps: ['draw'],        // étapes du tour autorisées : 'draw' | 'decide' | 'flip' (défaut : toutes)
      requireTurn: true,      // faut-il que ce soit le tour du joueur (défaut : true)
      endsTurn: false,        // le moteur termine-t-il le tour après apply (défaut : false)
      validate(state, action, ctx) { return null },  // renvoie un message d'erreur pour refuser
      apply(state, action, ctx) {},                  // modifie state (déjà copié)
    },
  },

  // --- Indications pour l'interface (aucune incidence sur les règles) ---
  ui: {
    faces: { monType: { label: '?', emoji: '🎲', bg: '#888', bg2: '#333', fg: '#fff' } },
    actions: [ /* boutons, voir plus bas */ ],
    formatLog(entry, name, label) { return null },   // texte de l'historique pour vos entrées
  },
};
```

## Règles du jeu pour les add-ons

- **Déterminisme** : n'utilisez jamais `Math.random()` ni `Date.now()`. Prenez `ctx.rng.next()`
  (flottant entre 0 et 1) ou `ctx.rng.int(n)`. Ainsi, à seed égale, la partie se rejoue à l'identique.
- **État** : les hooks reçoivent l'état *déjà copié* par `applyAction` ; modifiez-le directement.
  Gardez vos données dans `ctx.store` (= `state.addonState[id]`), qui doit rester sérialisable en JSON.
- **Informations secrètes** : `ctx.store` n'est jamais envoyé tel quel. Seul ce que renvoie
  `viewState()` part sur le réseau. Les événements (`ctx.emit`) et l'historique (`ctx.log`) sont
  envoyés à **tous** les joueurs : n'y mettez que des informations publiques.
- **Exécution** : seul l'hôte exécute le moteur. L'invité charge le même module uniquement pour
  l'affichage (`ui`) et pour calculer le score visible (`scoreCard`).

## Le contexte `ctx`

| Champ | Description |
|---|---|
| `ctx.addon` | id de l'add-on |
| `ctx.options` | options de `config/addons.json` → `options[id]` |
| `ctx.store` | état privé persistant de l'add-on |
| `ctx.player` | index du joueur concerné (actions, onDraw, onReveal, onSwap) |
| `ctx.rng` | générateur déterministe (`next()`, `int(n)`) |
| `ctx.emit(event)` | événement transmis à l'interface (animations) ; `type` préfixé par l'id |
| `ctx.log(entry)` | entrée d'historique, ex. `{ t: 'mon-addon:truc', p: ctx.player }` |
| `ctx.flip(player, index)` | retourne une carte cachée (déclenche `onReveal`) |
| `ctx.checkColumns(player)` | applique le retrait des colonnes identiques |

Pour `scoreCard(card, ctx)` : `ctx.state`, `ctx.player`, `ctx.index`, `ctx.col`, `ctx.column`
(les 3 emplacements de la colonne, `null` si retirés) et `ctx.value` (valeur après les add-ons
précédents). Attention : ce hook tourne aussi sur la **vue filtrée** de l'invité, où les cartes cachées
n'ont pas de champ `card`.

## Actions personnalisées

Une action se déclenche avec le type `"<id>:<nom>"`, par exemple `{ type: 'spy:play', target: 1, index: 4 }`.
Le moteur vérifie la phase, le tour et l'étape, appelle `validate` puis `apply`, et termine le tour
si `endsTurn` vaut `true`. Toute exception est convertie en erreur renvoyée au joueur.

### Bouton dans l'interface

```js
ui: {
  actions: [{
    id: 'play',
    label: 'Jouer l’Espion',
    when: (view) => view.turn === view.me && view.step === 'decide',      // afficher le bouton ?
    picks: [                                                              // cartes à toucher, dans l'ordre
      { prompt: 'Touchez une carte cachée', filter: ({ slot, owner, index, view, picks }) => slot && !slot.up },
    ],
    build: (picks) => ({ type: 'spy:play', target: picks[0].owner, index: picks[0].index }),
  }],
}
```

`picks` peut être vide : le bouton envoie alors directement `build([])`.

## Activer un add-on

1. Créez `addons/mon-addon.js`.
2. Ajoutez `"mon-addon"` dans `available` de `config/addons.json` (et dans `enabled` pour qu'il
   soit coché par défaut). Ajoutez ses options éventuelles dans `options`.
3. Ajoutez le fichier dans la liste `PRECACHE` de `sw.js` pour le mode hors-ligne.
4. Écrivez un test dans `tests/` (voir `tests/addons.test.js`).

Dans le lobby, l'hôte coche les add-ons de la partie ; l'invité reçoit la liste et charge les mêmes modules.

## Les exemples fournis

- **joker** : cartes valant 0 ; un Joker visible peut une fois par tour, avant de piocher, échanger
  sa place avec n'importe quelle autre carte de sa grille (action `joker:move`, sans fin de tour).
- **double** : cartes ×2 valant 0 ; visibles, elles doublent les autres cartes de leur colonne (`scoreCard`).
- **spy** : piochée dans la pioche, la carte peut être jouée pour retourner une carte cachée
  au choix, chez soi ou chez l'adversaire (action `spy:play`, fin de tour).
