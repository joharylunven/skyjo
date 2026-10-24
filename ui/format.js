// Textes de l'historique et des consignes.

import { cardLabel } from './cards.js';

export function formatLog(entry, view, modules) {
  const name = (p) => view.players[p]?.name ?? '?';
  const label = (card) => cardLabel(card);
  switch (entry.t) {
    case 'round':
      return `Manche ${entry.round} : distribution, ${label(entry.card)} sur la défausse`;
    case 'reveal':
      return `${name(entry.p)} retourne un ${label(entry.card)}`;
    case 'start':
      return `${name(entry.p)} commence (plus grande somme)`;
    case 'draw':
      return entry.from === 'deck' ? `${name(entry.p)} pioche un ${label(entry.card)}` : `${name(entry.p)} prend le ${label(entry.card)} de la défausse`;
    case 'swap':
      return `${name(entry.p)} place le ${label(entry.card)} et défausse un ${label(entry.old)}`;
    case 'discard':
      return `${name(entry.p)} défausse le ${label(entry.card)}`;
    case 'flip':
      return `${name(entry.p)} retourne un ${label(entry.card)}`;
    case 'column':
      return `${name(entry.p)} élimine une colonne de ${label(entry.card)} !`;
    case 'finish':
      return `${name(entry.p)} a tout retourné : dernier tour !`;
    case 'reshuffle':
      return 'La défausse est remélangée dans la pioche';
    case 'roundEnd':
      return `Fin de la manche : ${entry.scores.map((s, i) => `${name(i)} ${s > 0 ? '+' : ''}${s}`).join(', ')}`;
    default:
      for (const m of Object.values(modules)) {
        const txt = m.ui?.formatLog?.(entry, name, label);
        if (txt) return txt;
      }
      return entry.t;
  }
}
