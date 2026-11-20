# Ajouter un jeu à Jojo Arcade

Chaque jeu = **un module serveur** (les règles, qui arbitrent) + **une page** (l'affichage).
La salle fournit : profils et PIN, menu d'accueil, création des parties, connexion temps réel avec
reconnexion, présence, historique, victoires et statistiques.

## 1. Module serveur — `server/games/<id>.js`

```js
export default {
  id: 'bataille',                 // aussi le dossier public/<id>/
  name: 'Bataille navale',
  description: 'Coulez la flotte adverse.',
  emoji: '🚢',
  color: '#5b8cff',
  path: '/bataille/',
  options: [                      // proposées au lancement (types : select, multi)
    { key: 'taille', label: 'Grille', type: 'select', default: 10, choices: [{ value: 8, label: '8 × 8' }, { value: 10, label: '10 × 10' }] },
  ],
  async init() {},                // chargement éventuel (config…)
  cleanOptions(options) {},       // valide les options reçues du client, renvoie les options propres
  create({ players, options, seed }) {},   // players: [{ id, name }] -> état initial (JSON)
  act(state, action, playerId) {},         // -> { state, events } ou { error: { code, message } }
  view(state, playerId) {},                // ce que ce joueur a le droit de voir
  status(state) {},  // -> { over, awaiting: [ids], label, result?: { winners: [ids], scores: { id: n } } }
};
```

Règles d'or :
- `act` ne modifie jamais l'état reçu (copier d'abord) et doit être déterministe : utilisez `seed`
  pour le hasard, pas `Math.random()`.
- `view` ne doit rien divulguer de secret (navires adverses non touchés, cartes cachées…).
- `status().awaiting` alimente le badge « À toi ! » de l'accueil ; `result` alimente les scores.

Exemple complet (Sushi maritime) : `server/games/bataille.js` + `public/bataille/`.

Puis ajoutez le module dans `MODULES` de `server/games/index.js` et retirez le jeu de la liste
`upcoming` de `public/arcade.json`.

## 2. Page — `public/<id>/index.html`

Reprenez l'en-tête de `public/skyjojo/index.html` (manifest, icône iPhone, `/shared/base.css`).
Côté JavaScript :

```js
import { Live, api, session } from '/shared/api.js';

const matchId = new URLSearchParams(location.search).get('match');
const live = new Live();
live.on((ev) => {
  if (ev.type === 'message' && ev.msg.t === 'match') render(ev.msg.view, ev.msg.summary, ev.msg.events);
  if (ev.type === 'message' && ev.msg.t === 'error') afficherErreur(ev.msg.message);
  if (ev.type === 'message' && ev.msg.t === 'presence') majPresence(ev.msg.online);
});
live.watch(matchId);
// jouer un coup :
live.send({ t: 'action', match: matchId, action: { type: 'tirer', x: 3, y: 5 } });
```

`summary` contient les joueurs, l'adversaire, `yourTurn`, `status` et `options` (pour une revanche :
`api('/api/matches', { method: 'POST', body: { game, opponent, options } })`).

## 3. Cache hors-ligne et tests

- Ajoutez les fichiers de la page dans `PRECACHE` de `public/sw.js` (le test `tests/pwa.test.js`
  vous le rappelle) et incrémentez `VERSION`.
- Écrivez un test du module serveur (voir `tests/server.test.js` : une partie complète jouée par
  WebSocket).
