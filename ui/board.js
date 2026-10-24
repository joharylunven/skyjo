// Plateau de jeu : rendu complet à chaque mise à jour, à partir de la vue filtrée.

import { countVisible, scorePlayer } from '../engine/index.js';
import { h } from './dom.js';
import { cardEl, cardLabel } from './cards.js';
import { formatLog } from './format.js';

/** Boutons d'actions d'add-ons disponibles pour cette vue. */
function addonButtons(view, modules) {
  const out = [];
  for (const id of view.addons) {
    for (const def of modules[id]?.ui?.actions ?? []) {
      try {
        if (def.when?.(view) ?? true) out.push(def);
      } catch (e) {
        console.error(e);
      }
    }
  }
  return out;
}

function statusText(view, picking) {
  const me = view.me;
  const meP = view.players[me];
  const turnName = view.players[view.turn]?.name;
  if (picking) return picking.def.picks[picking.picks.length]?.prompt ?? '…';
  if (view.phase === 'setup') {
    const n = countVisible(meP.grid);
    return n < view.rules.setupReveals ? `Retournez ${view.rules.setupReveals} cartes (${n}/${view.rules.setupReveals})` : 'En attente de l’adversaire…';
  }
  if (view.phase !== 'play') return '';
  const last = view.finisher !== null && view.finisher !== view.turn ? 'Dernier tour ! ' : '';
  if (view.turn !== me) {
    if (view.drawn) return `${last}${turnName} a pris un ${cardLabel(view.drawn.card)}…`;
    return `${last}Au tour de ${turnName}…`;
  }
  switch (view.step) {
    case 'draw':
      return `${last}À vous ! Piochez ou prenez la défausse`;
    case 'decide':
      return view.drawn.from === 'deck' ? 'Échangez avec une de vos cartes, ou défaussez' : 'Échangez-la avec une de vos cartes';
    case 'flip':
      return 'Retournez une de vos cartes cachées';
    default:
      return '';
  }
}

function playerHeader(view, p, { compact }) {
  const pl = view.players[p];
  const visible = scorePlayer(view, p, { visibleOnly: true });
  const active = view.phase === 'play' && view.turn === p;
  return h(
    'div.player-head',
    { class: `${active ? 'active' : ''} ${compact ? 'compact' : ''}` },
    h('span.pname', {}, pl.name, p === view.me ? ' (vous)' : ''),
    view.finisher === p ? h('span.badge.finish', {}, 'a fini') : null,
    active ? h('span.badge.turn', {}, 'joue') : null,
    h('span.pscore', { title: 'Points visibles cette manche / total' }, h('b', {}, visible), ` · total ${pl.total}`),
  );
}

export function scoreTable(view) {
  const rounds = view.players[0].rounds.map((r) => r.round);
  return h(
    'table.scores',
    {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Manche'), view.players.map((p) => h('th', {}, p.name)))),
    h(
      'tbody',
      {},
      rounds.map((n, k) =>
        h(
          'tr',
          {},
          h('td', {}, n),
          view.players.map((p) => {
            const r = p.rounds[k];
            return h('td', { class: r.doubled ? 'doubled' : '' }, `${r.score}`, r.doubled ? h('small', {}, ` (${r.raw}×2)`) : null);
          }),
        ),
      ),
    ),
    h('tfoot', {}, h('tr', {}, h('th', {}, 'Total'), view.players.map((p) => h('th', {}, p.total)))),
  );
}

export function boardScreen({ view, session, cfg, ui, act, setUi, onLeave, onRematch, onRules }) {
  const me = view.me;
  const others = view.players.map((_, i) => i).filter((i) => i !== me);
  const opp = others[0];
  const { cols, setupReveals } = view.rules;
  const myTurn = view.phase === 'play' && view.turn === me;
  const picking = ui.picking;
  const busy = ui.pending || session.status !== 'open';

  const pickStep = picking ? picking.def.picks[picking.picks.length] : null;

  function slotHandler(owner, index, slot) {
    if (busy || view.phase === 'roundOver' || view.phase === 'gameOver') return null;
    if (pickStep) {
      let ok = false;
      try {
        ok = !!pickStep.filter({ slot, owner, index, view, picks: picking.picks });
      } catch (e) {
        console.error(e);
      }
      if (!ok) return null;
      return () => {
        const picks = [...picking.picks, { owner, index }];
        if (picks.length >= picking.def.picks.length) {
          setUi({ picking: null });
          act(picking.def.build(picks));
        } else setUi({ picking: { ...picking, picks } });
      };
    }
    if (owner !== me || !slot) return null;
    if (view.phase === 'setup' && !slot.up && countVisible(view.players[me].grid) < setupReveals) return () => act({ type: 'reveal', index });
    if (!myTurn) return null;
    if (view.step === 'decide') return () => act({ type: 'swap', index });
    if (view.step === 'flip' && !slot.up) return () => act({ type: 'flip', index });
    return null;
  }

  function gridEl(owner, size) {
    const g = view.players[owner].grid;
    return h(
      'div.grid',
      { class: size, style: { '--cols': cols } },
      g.map((slot, index) => {
        const onClick = slotHandler(owner, index, slot);
        const picked = picking?.picks.some((p) => p.owner === owner && p.index === index);
        return cardEl(slot, {
          class: `${onClick ? 'tap' : ''} ${picked ? 'picked' : ''}`,
          dataset: { p: owner, i: index },
          role: onClick ? 'button' : null,
          onClick,
        });
      }),
    );
  }

  // --- pioche, défausse, carte en main
  const canDraw = myTurn && view.step === 'draw' && !busy && !picking;
  const canDiscardDrawn = myTurn && view.step === 'decide' && view.drawn?.from === 'deck' && !busy && !picking;
  const canTakeDiscard = canDraw && view.discardTop;

  const deck = h(
    'div.pile',
    {},
    cardEl({ up: false }, { class: `pile-card ${canDraw ? 'tap glow' : ''}`, id: 'deck', role: canDraw ? 'button' : null, onClick: canDraw ? () => act({ type: 'drawDeck' }) : null }),
    h('span.pile-label', {}, `Pioche · ${view.deckCount}`),
  );
  const discardClick = canTakeDiscard ? () => act({ type: 'takeDiscard' }) : canDiscardDrawn ? () => act({ type: 'discardDrawn' }) : null;
  const discard = h(
    'div.pile',
    {},
    cardEl(view.discardTop, { class: `pile-card ${discardClick ? 'tap glow' : ''}`, id: 'discard', role: discardClick ? 'button' : null, onClick: discardClick }),
    h('span.pile-label', {}, canDiscardDrawn ? 'Défausser ici' : `Défausse · ${view.discardCount}`),
  );
  const drawn = view.drawn
    ? h(
        'div.pile.drawn',
        {},
        cardEl(view.drawn.card, { class: 'pile-card', id: 'drawn' }),
        h('span.pile-label', {}, view.turn === me ? 'Votre carte' : `Carte de ${view.players[view.turn].name}`),
      )
    : h('div.pile.drawn.placeholder', {}, h('div.card.empty.pile-card'), h('span.pile-label', {}, ' '));

  const buttons = [];
  if (picking) buttons.push(h('button.ghost.small', { onClick: () => setUi({ picking: null }) }, 'Annuler'));
  else if (!busy) {
    if (canDiscardDrawn) buttons.push(h('button.secondary.small', { onClick: () => act({ type: 'discardDrawn' }) }, 'Défausser'));
    for (const def of addonButtons(view, cfg.modules)) {
      buttons.push(
        h(
          'button.addon-btn.small',
          {
            onClick: () => (def.picks?.length ? setUi({ picking: { def, picks: [] } }) : act(def.build([]))),
          },
          def.label,
        ),
      );
    }
  }

  const center = h(
    'section.center',
    {},
    h('div.piles', {}, deck, discard, drawn),
    h('div.status', { class: myTurn || view.phase === 'setup' ? 'mine' : '', 'aria-live': 'polite' }, statusText(view, picking)),
    h('div.actions', {}, buttons),
  );

  const lastLog = view.log.at(-1);

  const screen = h(
    'main.screen.game',
    { class: picking ? 'picking' : '' },
    h(
      'header.topbar',
      {},
      h('span.room', {}, `${session.code} · manche ${view.round}`),
      h(
        'span.tools',
        {},
        h('button.icon', { 'aria-label': 'Historique', onClick: () => setUi({ showLog: true }) }, '📜'),
        h('button.icon', { 'aria-label': 'Scores', onClick: () => setUi({ showScores: true }) }, '🏆'),
        h('button.icon', { 'aria-label': 'Menu', onClick: () => setUi({ showMenu: true }) }, '⋯'),
      ),
    ),
    opp !== undefined ? h('section.side.opp', {}, playerHeader(view, opp, { compact: true }), gridEl(opp, 'small')) : null,
    center,
    h('section.side.mine', {}, gridEl(me, 'large'), playerHeader(view, me, {})),
    h('footer.lastlog', { onClick: () => setUi({ showLog: true }) }, lastLog ? formatLog(lastLog, view, cfg.modules) : ' '),
  );

  const overlays = [];
  if (view.phase === 'roundOver' || view.phase === 'gameOver') overlays.push(roundOverlay({ view, session, act, busy, onRematch, onLeave }));
  else if (ui.showScores) overlays.push(sheet('Scores', [scoreTable(view)], () => setUi({ showScores: false })));
  if (ui.showLog) {
    const items = [...view.log].reverse().map((e) => h('li', { class: e.round !== view.round ? 'old' : '' }, formatLog(e, view, cfg.modules)));
    overlays.push(sheet('Derniers coups', [h('ol.log', {}, items)], () => setUi({ showLog: false })));
  }
  if (ui.showMenu) {
    overlays.push(
      sheet(
        'Menu',
        [
          h('button.secondary', { onClick: () => (setUi({ showMenu: false }), onRules()) }, 'Règles'),
          h('button.danger', { onClick: onLeave }, session.role === 'host' ? 'Quitter et fermer la salle' : 'Quitter la partie'),
        ],
        () => setUi({ showMenu: false }),
      ),
    );
  }
  return [screen, ...overlays];
}

function sheet(title, content, onClose) {
  return h(
    'div.overlay',
    { onClick: (e) => e.target === e.currentTarget && onClose() },
    h('div.sheet', {}, h('div.sheet-head', {}, h('h2', {}, title), h('button.icon', { 'aria-label': 'Fermer', onClick: onClose }, '✕')), content),
  );
}

function roundOverlay({ view, session, act, busy, onRematch, onLeave }) {
  const res = view.lastRound;
  const over = view.phase === 'gameOver';
  const winners = over ? view.players.filter((p) => view.winners.includes(p.id)) : [];
  const iWin = over && view.winners.includes(view.players[view.me].id);
  const title = over ? (winners.length > 1 ? 'Égalité !' : iWin ? 'Vous avez gagné ! 🎉' : `${winners[0].name} gagne`) : `Fin de la manche ${view.round}`;
  const notes = [];
  if (res) {
    res.doubled.forEach((d, i) => d && notes.push(`${view.players[i].name} a fini sans avoir le plus petit score : ${res.raw[i]} × 2 = ${res.scores[i]}`));
  }
  return h(
    'div.overlay.round',
    {},
    h(
      'div.sheet',
      {},
      h('h2', {}, title),
      res ? h('p.small', {}, view.players.map((p, i) => `${p.name} : ${res.scores[i] > 0 ? '+' : ''}${res.scores[i]}`).join(' · ')) : null,
      notes.map((n) => h('p.note', {}, n)),
      scoreTable(view),
      over
        ? session.role === 'host'
          ? h('button.primary.big', { onClick: onRematch }, 'Revanche')
          : h('p.notice', {}, 'L’hôte peut lancer une revanche.')
        : h('button.primary.big', { disabled: busy, onClick: () => act({ type: 'nextRound' }) }, 'Manche suivante'),
      over ? h('button.ghost', { onClick: onLeave }, 'Retour à l’accueil') : h('p.small', {}, `Fin de partie à ${view.rules.endThreshold} points.`),
    ),
  );
}

/** Animations simples déclenchées par les événements du dernier coup. */
export function animate(root, events, me) {
  const slot = (p, i) => root.querySelector(`.grid .card[data-p="${p}"][data-i="${i}"]`);
  for (const ev of events ?? []) {
    switch (ev.type) {
      case 'flip':
        slot(ev.player, ev.index)?.classList.add(ev.final ? 'anim-flip-late' : 'anim-flip');
        break;
      case 'swap':
        slot(ev.player, ev.index)?.classList.add('anim-swap');
        root.querySelector('#discard')?.classList.add('anim-pop');
        break;
      case 'draw':
        root.querySelector('#drawn')?.classList.add(ev.from === 'deck' ? 'anim-draw' : 'anim-take');
        break;
      case 'discard':
        root.querySelector('#discard')?.classList.add('anim-pop');
        break;
      case 'column':
        for (const i of ev.indices) slot(ev.player, i)?.classList.add('anim-cleared');
        break;
      case 'turn':
        if (ev.player === me && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(40);
        break;
      case 'joker:move':
        slot(ev.player, ev.from)?.classList.add('anim-swap');
        slot(ev.player, ev.to)?.classList.add('anim-swap');
        break;
    }
  }
}
