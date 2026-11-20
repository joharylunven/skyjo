# Jojo Arcade

Salle de jeux **à deux, à distance**, auto-hébergée sur un homelab. Jeux : **Skyjojo** (le jeu
des 12 cartes) et la **Bataille navale**. Chacun l'installe sur son iPhone comme une appli, choisit son jeu dans le
menu, et les scores, victoires et historiques sont conservés sur le serveur.

## Comment ça marche

```
iPhone A ──┐                       ┌── Node (server/) : arbitre des parties, profils, scores
           ├─ HTTPS + WebSocket ───┤      data/db.json : profils, parties, historique
iPhone B ──┘  (Tailscale Funnel)   └── public/ : accueil + un dossier par jeu (public/<jeu>/)
```

- **Le serveur est l'arbitre** : il fait tourner le moteur du jeu, valide chaque coup et n'envoie à
  chaque joueur que ce qu'il a le droit de voir. Personne n'a besoin de garder l'appli ouverte :
  on peut jouer chacun son tour, quand on veut ; la partie reprend là où elle en était.
- **Profils** : prénom, avatar et code PIN. La création d'un profil demande le code d'invitation
  (`INVITE_CODE`), donc personne d'autre ne peut s'inscrire même si l'adresse est publique.
- **Accueil** : parties en cours (« À toi ! »), choix du jeu et des options, bilan face à face par
  jeu, historique des parties.

## Skyjojo

163 cartes : -2 ×5, -1 ×10, 0 ×15, 1 à 12 ×10, plus **-4** ×1, **13** ×10 et **Étoile ★** ×2.
Grille de 4 × 3 cartes cachées, on en retourne 2, la plus grande somme commence. À son tour :
piocher (puis échanger, ou défausser et retourner une carte) ou prendre la défausse (puis échanger).
Trois cartes identiques visibles dans une colonne disparaissent. Quand un joueur a tout retourné,
l'autre joue un dernier tour ; s'il n'a pas le score strictement le plus bas, son score positif est
doublé. Partie terminée au seuil choisi (100 par défaut) : le plus petit total gagne.

- **13** : poser ou retourner un 13 dans sa grille permet de regarder en secret une de ses cartes
  cachées (pastille visible pour soi seul).
- **Étoile ★** : complète n'importe quelle colonne ; 20 points si elle reste en jeu.
- Options au lancement : seuil de fin, cartes spéciales (Étoile, 13, et trois variantes : Joker,
  Double, Espion). Cartes et couleurs : `public/skyjojo/config/` ; règles spéciales :
  `public/skyjojo/addons/` (voir [docs/ADDONS.md](docs/ADDONS.md)).

## Bataille navale

Chacun place sa flotte en secret (bouton « Mélanger » pour un placement au hasard ; toucher un navire
pour le choisir, une case pour le déplacer, le navire à nouveau pour le pivoter). Les navires ne se
touchent pas, même en diagonale. On tire ensuite à tour de rôle : toucher une case pour viser, la
toucher encore (ou « Feu ! ») pour tirer. Dans l'eau, touché, coulé ; l'eau autour d'un navire coulé
est grisée. Le premier qui coule toute la flotte adverse gagne.

- Options : grille **10 × 10** (porte-avions 5, croiseur 4, contre-torpilleur 3, sous-marin 3,
  torpilleur 2) ou **8 × 8** rapide (sans porte-avions) ; « chacun son tour » ou « touché : on
  rejoue ».
- Le serveur ne révèle jamais un navire adverse avant qu'il soit coulé (toute la flotte apparaît en
  fin de partie). Moteur : `public/bataille/engine.js`, module serveur : `server/games/bataille.js`.

## Développer en local

```bash
npm install
```

```bash
npm run dev
```

Puis http://localhost:8080 (code d'invitation : `dev`). Pour jouer contre soi-même sur un seul
ordinateur, ouvrez un second onglet sur http://127.0.0.1:8080 : c'est une autre origine, donc une
autre session.

```bash
npm test
```

Les tests couvrent le moteur, les cartes spéciales, le serveur (profils, PIN, parties complètes via
WebSocket, vues filtrées, statistiques, redémarrage) et la PWA.

## Déployer sur le homelab

Sur le serveur (Docker et Tailscale installés) :

```bash
git clone https://github.com/joharylunven/skyjo.git ~/jojo-arcade
```

```bash
cd ~/jojo-arcade && cp .env.example .env && nano .env
```

```bash
docker compose up -d --build
```

Le service écoute sur `127.0.0.1:8090` (pas exposé sur le réseau local). Pour le publier en HTTPS :

```bash
sudo tailscale funnel --bg 8090
```

La première fois, Tailscale affiche un lien pour autoriser Funnel sur le tailnet. L'adresse publique
est `https://<nom-de-la-machine>.<tailnet>.ts.net/` (`tailscale funnel status` l'affiche).

Mettre à jour :

```bash
cd ~/jojo-arcade && git pull && docker compose up -d --build
```

Les données sont dans `~/jojo-arcade/data/db.json` (à sauvegarder avec le reste du homelab).

## Installer sur iPhone

1. Ouvrir l'adresse dans **Safari**.
2. Bouton **Partager** → **Sur l'écran d'accueil** → Ajouter.
3. Ouvrir l'appli depuis l'icône, puis créer son profil (prénom, avatar, PIN, code d'invitation).
   L'appli installée a son propre stockage : on se connecte une fois dedans.

## Ajouter un jeu

Un module serveur `server/games/<id>.js` (création, coups, vue par joueur, statut) et une interface
`public/<id>/`. Le menu, les profils, la connexion temps réel, l'historique et les statistiques sont
fournis par la salle. Guide : [docs/NOUVEAU-JEU.md](docs/NOUVEAU-JEU.md).
