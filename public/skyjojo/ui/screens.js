// Règles du jeu.

import { h } from './dom.js';

export function rulesDialog({ cfg, onClose }) {
  const t = cfg.game.rules.endThreshold;
  return h(
    'div.overlay',
    { onClick: (e) => e.target === e.currentTarget && onClose() },
    h(
      'div.sheet',
      {},
      h('h2', {}, `Règles de ${cfg.game.name}`),
      h(
        'ul.rules',
        {},
        h('li', {}, 'Chaque joueur a 12 cartes face cachée (4 colonnes × 3 lignes) et en retourne 2. La plus grande somme commence.'),
        h('li', {}, 'Cartes de -4 à 13. Une carte 13 posée ou retournée dans votre grille vous laisse regarder en secret une de vos cartes cachées.'),
        h('li', {}, 'L’Étoile ★ remplace n’importe quel nombre pour compléter une colonne, mais coûte 20 points si elle reste dans votre grille.'),
        h('li', {}, 'À votre tour : piochez une carte ou prenez celle de la défausse.'),
        h('li', {}, 'Carte de la pioche : échangez-la avec une de vos cartes, ou défaussez-la et retournez une carte cachée.'),
        h('li', {}, 'Carte de la défausse : vous devez l’échanger avec une de vos cartes.'),
        h('li', {}, '3 cartes identiques visibles dans une colonne ? La colonne est éliminée.'),
        h('li', {}, 'Dès qu’un joueur a tout retourné, l’autre joue un dernier tour. Si celui qui a fini n’a pas le score strictement le plus bas, son score (positif) est doublé.'),
        h('li', {}, `La partie s’arrête quand un joueur atteint ${t} points (réglable). Le plus petit total gagne.`),
      ),
      h('button.primary', { onClick: onClose }, 'Compris'),
    ),
  );
}
