# Protocole réseau (version 1)

Modèle : **l'hôte est l'autorité**. Il exécute le moteur, valide chaque action et envoie à chaque
joueur sa vue filtrée (`engine/view.js`). L'invité n'envoie que des intentions (`action`).

Tous les messages sont des objets JSON avec un champ `t`.

| Sens | Message | Contenu |
|---|---|---|
| invité → hôte | `hello` | `{ v: 1, name, clientId }` — `clientId` est persistant (localStorage) et permet de retrouver sa place après une coupure |
| hôte → invité | `welcome` | `{ v: 1, you: "p1", code }` |
| hôte → invité | `lobby` | `{ lobby: { players: [{ id, name, connected }], addons: [ids], endThreshold, started } }` |
| hôte → invité | `state` | `{ view, events }` — `view` = `viewFor(state, "p1")`, `events` = événements publics du dernier coup (animations) |
| invité → hôte | `action` | `{ action: { type: "drawDeck" } }`, `{ action: { type: "swap", index: 5 } }`, `{ action: { type: "spy:play", target: 0, index: 3 } }` |
| invité → hôte | `leave` | `{}` — départ volontaire |
| hôte → invité | `error` | `{ code, message }` — action refusée, salle complète (`room_full`), version différente (`version`) |
| hôte → invité | `bye` | `{ reason }` — l'hôte a quitté |
| transport | `__hb` | battement de cœur interne au transport, jamais transmis aux sessions |

## Actions de base

| `type` | Champs | Quand |
|---|---|---|
| `reveal` | `index` | phase `setup`, 2 fois par joueur |
| `drawDeck` | — | votre tour, étape `draw` |
| `takeDiscard` | — | votre tour, étape `draw` |
| `swap` | `index` | étape `decide` |
| `discardDrawn` | — | étape `decide`, carte venant de la pioche |
| `flip` | `index` | étape `flip` |
| `nextRound` | — | phase `roundOver` |
| `<addon>:<nom>` | libres | voir `docs/ADDONS.md` |

Les index de grille vont de 0 à 11, ligne par ligne (`index = ligne × 4 + colonne`).

## Ce qui ne transite jamais

La pioche (seul `deckCount` est envoyé), les cartes cachées (y compris les vôtres : `{ up: false }`),
la seed et l'état du générateur aléatoire, l'état privé des add-ons (sauf `viewState`).

## Reconnexion

- **Invité** : à la perte de connexion (fermeture ou 15 s sans battement de cœur), il réessaie
  toutes les 3 s avec le même `clientId` ; l'hôte lui rend sa place et lui renvoie l'état.
- **Hôte** : l'état complet est sauvegardé dans `localStorage` après chaque coup. Au rechargement,
  la salle est rouverte avec le même code (le serveur PeerJS peut garder l'ancien identifiant
  quelques secondes : l'hôte réessaie jusqu'à 20 fois).
