# Douze — jeu de cartes à deux, à distance

Jeu de cartes en ligne pour **2 joueurs sur deux téléphones**, inspiré d'un jeu de cartes à grille
bien connu. Site **100 % statique** (HTML/CSS/JS natifs en modules ES, sans build), hébergé sur
GitHub Pages ; les deux navigateurs se parlent directement en **WebRTC via PeerJS**.
Installable comme application (PWA). Nom, cartes, couleurs et règles sont configurables.

**Jouer :** https://joharylunven.github.io/skyjo/

## Règles

- 150 cartes : -2 ×5, -1 ×10, 0 ×15, puis 1 à 12 ×10. Chaque joueur a 12 cartes cachées
  (4 colonnes × 3 lignes) et en retourne 2 ; la plus grande somme commence (égalité : la plus
  forte carte, puis tirage au sort).
- À son tour : piocher ou prendre la défausse. Carte de la pioche : l'échanger contre une de ses
  cartes (l'ancienne part sur la défausse, visible) **ou** la défausser et retourner une carte cachée.
  Carte de la défausse : obligatoirement échangée.
- 3 cartes identiques visibles dans une colonne : la colonne est retirée (vers la défausse).
- Dès qu'un joueur a tout retourné, l'autre joue un dernier tour. Les cartes restantes sont
  révélées (les colonnes ainsi complétées sont retirées aussi, réglable). Si celui qui a fini n'a
  pas le score **strictement** le plus bas, son score de manche est doublé s'il est positif.
- La partie s'arrête quand un joueur atteint le seuil (100 par défaut, choisi dans le lobby) ;
  le plus petit total gagne. Chaque manche recommence par le retournement de 2 cartes.

## Lancer en local

Il faut un petit serveur HTTP (les modules ES ne marchent pas en `file://`) :

```bash
npx serve .
```

ou, sans Node :

```bash
python3 -m http.server 8080
```

Puis ouvrez l'adresse affichée. Astuces de test sur un seul ordinateur :

| URL | Effet |
|---|---|
| `?transport=local` | deux onglets du même navigateur jouent ensemble sans réseau (BroadcastChannel) |
| `?profil=b` | sauvegarde séparée : permet de tester PeerJS avec deux onglets du même navigateur |
| `?debug` | expose l'application dans la console (`__douze.session`) |
| `?nosw` | (sur localhost) n'enregistre pas le service worker |

Tests (Node 18+, aucune dépendance) :

```bash
node --test
```

Ils couvrent la distribution, le retrait de colonne, le scoring avec doublement, la fin de manche
et de partie, les actions illégales, la vue filtrée, les add-ons, les sessions réseau
(avec un transport en mémoire) et la complétude du cache PWA.

## Organisation

```
engine/   logique pure : createGame, applyAction(state, action, playerId), viewFor, RNG à seed
net/      Transport (interface), PeerJS, transport local, sessions hôte/invité, protocole
ui/       écrans, rendu des cartes, plateau, animations
config/   game.json (nom, règles), cards.json (cartes), addons.json, network.json (ICE/TURN)
addons/   joker.js, double.js, spy.js
docs/     ADDONS.md (API des add-ons), PROTOCOL.md (messages réseau)
tests/    tests node --test
tools/    make-icons.mjs (génère les icônes PNG)
```

**Modèle réseau** : l'hôte est l'autorité. L'invité n'envoie que des actions ; l'hôte les valide
avec le moteur et renvoie à chacun sa vue filtrée (ni la pioche, ni les cartes cachées, ni la seed
ne transitent). L'hôte sauvegarde la partie dans le navigateur après chaque coup : s'il recharge
la page, la même salle est rouverte et l'invité se reconnecte tout seul. Détails dans
[docs/PROTOCOL.md](docs/PROTOCOL.md).

## Personnaliser

### Nom du jeu

`config/game.json` → `name`, `shortName`, `tagline`. Mettez aussi à jour `name`/`short_name` de
`manifest.webmanifest` et le `<title>` d'`index.html` (fichiers statiques lus avant le JavaScript).

### Cartes — `config/cards.json`

```json
{
  "deck": [
    { "value": -2, "count": 5, "label": "-2", "emoji": "❄️" },
    { "value": 7, "count": 10, "label": "7", "image": "assets/cartes/7.png", "bg": "#123456" }
  ],
  "palette": [ { "min": 9, "max": 12, "bg": "#f87171", "bg2": "#b91c1c", "fg": "#ffffff" } ],
  "special": { "joker": { "label": "★", "emoji": "🃏", "bg": "#c084fc" } },
  "back": { "pattern": "waves", "primary": "#1e293b", "secondary": "#334155", "accent": "#f59e0b", "label": "12" }
}
```

- `deck` : répartition du paquet (`value`, `count`) et apparence de chaque valeur : `label`
  (texte affiché), `emoji` ou `image` (chemin relatif à la racine du site) facultatifs, et
  couleurs `bg`/`bg2`/`fg` qui remplacent celles de la palette.
- `palette` : couleurs par plage de valeurs (dégradé `bg` → `bg2`, texte `fg`).
- `special` : apparence des cartes ajoutées par les add-ons (par `kind`) ; prioritaire sur celle
  déclarée par l'add-on.
- `back` : dos des cartes, motif SVG généré (`waves`, `dots`, `stripes`, `grid`), couleurs et
  texte central.

Le paquet doit contenir au moins 25 cartes (2 × 12 + 1 défausse).

### Règles — `config/game.json`

`rules` : `cols`, `rows`, `setupReveals`, `endThreshold`, `finisherMultiplier`,
`finalColumnCheck` ; `endThresholdChoices` : seuils proposés dans le lobby.

### Add-ons

Un add-on est un module `addons/<id>.js` qui exporte un objet avec des hooks facultatifs
(`modifyDeck`, `onSetup`, `onDraw`, `onReveal`, `onSwap`, `scoreCard`, `onRoundEnd`…) et des
actions personnalisées validées par le moteur. Exemple minimal — une carte « Bombe » qui vaut 20 :

```js
export default {
  id: 'bombe',
  name: 'Bombe',
  description: 'Ajoute 2 bombes qui valent 20 points.',
  modifyDeck: (deck) => [...deck, { kind: 'bombe', value: 20 }, { kind: 'bombe', value: 20 }],
  ui: { faces: { bombe: { label: '💣', bg: '#111827', fg: '#fff' } } },
};
```

Ajoutez `"bombe"` dans `available` de `config/addons.json` (et dans `enabled` pour le cocher par
défaut) et dans `PRECACHE` de `sw.js`. L'API complète est dans [docs/ADDONS.md](docs/ADDONS.md).

Les 3 exemples fournis sont désactivés par défaut ; l'hôte les coche dans le lobby :

- **Joker** : vaut 0 ; un Joker visible peut, une fois par tour et avant de piocher, échanger sa
  place avec n'importe laquelle de vos cartes.
- **Double** : carte ×2 (valeur 0) ; visible, elle double les autres cartes de sa colonne.
- **Espion** : piochée dans la pioche, elle peut être jouée pour retourner une carte cachée au
  choix (la vôtre ou celle de l'adversaire) ; le tour se termine.

## Réseau : PeerJS, NAT et serveur TURN

PeerJS utilise son serveur public gratuit (`0.peerjs.com`) **uniquement pour la mise en relation** ;
ensuite les données passent en direct entre les deux téléphones (WebRTC). Points de vigilance :

1. **NAT strict / 4G** : beaucoup d'opérateurs mobiles utilisent du CGNAT (NAT symétrique). Une
   connexion directe peut alors échouer, surtout si **les deux** joueurs sont en 4G ou si l'un est
   sur un wifi d'entreprise, d'école ou d'hôtel qui bloque l'UDP. Symptôme : « Connexion directe
   impossible avec l'hôte » après 15 s. Le remède est un **serveur TURN** qui relaie le trafic.
2. **Serveur PeerJS public** : gratuit et sans garantie ; s'il est indisponible, aucune salle ne
   peut être créée. Vous pouvez héberger votre propre `peerjs-server` et le renseigner dans
   `peerjs` (`host`, `port`, `path`, `secure`).
3. **Mise en veille du téléphone** : iOS et Android coupent les connexions d'une page en
   arrière-plan. Le jeu détecte la coupure (battement de cœur, 15 s) et se reconnecte quand la
   page revient au premier plan.
4. **Réouverture de salle** : après un rechargement de l'hôte, le serveur peut garder l'ancien
   identifiant quelques secondes ; l'hôte réessaie automatiquement (jusqu'à 20 × 3 s).

### Configurer un TURN — `config/network.json`

`iceServers` est passé tel quel à `RTCPeerConnection`. Ajoutez votre TURN à côté des STUN :

```json
"iceServers": [
  { "urls": "stun:stun.l.google.com:19302" },
  {
    "urls": ["turn:turn.exemple.com:3478?transport=udp", "turn:turn.exemple.com:3478?transport=tcp", "turns:turn.exemple.com:5349?transport=tcp"],
    "username": "utilisateur",
    "credential": "mot-de-passe"
  }
]
```

Fournisseurs possibles : offre gratuite de Metered (Open Relay), TURN de Cloudflare, Twilio, ou
votre propre `coturn`. **Attention :** sur un site statique, ces identifiants sont publics.
Utilisez un compte dédié avec quota limité (ou des identifiants temporaires). Pour vérifier que le
TURN fonctionne, mettez temporairement `"iceTransportPolicy": "relay"`.

### Ajouter un autre transport (Firebase…)

Écrivez une classe qui étend `Transport` (`net/transport.js` : `create`, `join`, `send`,
`onMessage`, `onConnect`, `onDisconnect`, `close`), ajoutez-la dans `TRANSPORTS` de
`net/index.js`, puis choisissez-la avec `"transport"` dans `config/network.json` (ou
`?transport=…`). Le moteur, les sessions et l'interface ne changent pas.

## Déploiement sur GitHub Pages

Le workflow `.github/workflows/pages.yml` lance les tests puis publie le site à chaque push sur
`main`. **À faire une seule fois** dans le dépôt GitHub :

1. **Settings** → **Pages** (menu de gauche, section *Code and automation*).
2. **Build and deployment** → **Source** : choisir **GitHub Actions** (et non *Deploy from a branch*).
3. Onglet **Actions** : relancer le workflow *Tests et déploiement GitHub Pages* s'il a échoué
   avant l'activation (bouton *Re-run all jobs*), ou pousser un nouveau commit.

Le site est alors servi sous `https://<utilisateur>.github.io/<dépôt>/` ; tous les chemins sont
relatifs, rien à adapter si vous renommez le dépôt.

## Checklist : tester une partie sur deux téléphones

1. Téléphone A (wifi) : ouvrir l'URL, saisir un pseudo, **Créer une salle**.
2. Bouton **Partager le lien** → l'envoyer au téléphone B (SMS, messagerie).
3. Téléphone B **en 4G, wifi coupé** : ouvrir le lien, saisir un pseudo, **Rejoindre**.
   Les deux pastilles du lobby passent au vert.
4. A : cocher éventuellement des add-ons, choisir le seuil, **Lancer la partie**.
5. Chacun retourne 2 cartes ; vérifier que le bon joueur commence (plus grande somme).
6. Jouer quelques tours : piocher / échanger, piocher / défausser / retourner, prendre la défausse.
   Vérifier que chaque coup apparaît chez l'autre en moins d'une seconde (📜 = historique).
7. Compléter une colonne identique et vérifier qu'elle disparaît.
8. **Reconnexion invité** : sur B, recharger la page → retour automatique dans la partie.
9. **Reconnexion hôte** : sur A, recharger la page → bannière « Réouverture… », puis B se
   reconnecte seul (quelques secondes).
10. **Veille** : verrouiller B 30 s puis le rouvrir → bannière de reconnexion, puis reprise.
11. Finir une manche : tableau des scores, doublement éventuel, **Manche suivante**.
12. **Installer** : menu du navigateur → « Ajouter à l'écran d'accueil », relancer depuis l'icône.
13. Si l'étape 3 échoue après 15 s (« Connexion directe impossible ») : refaire avec B en wifi.
    Si ça marche en wifi mais pas en 4G, c'est le NAT de l'opérateur → configurer un TURN.

## Licence et visuels

Code d'exemple libre de réutilisation. Tous les visuels (cartes, dos, icônes) sont générés en
CSS/SVG ou par `tools/make-icons.mjs` ; aucun élément graphique d'un jeu commercial n'est utilisé.
