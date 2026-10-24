// Plateau de jeu : rendu complet à chaque mise à jour, à partir de la vue filtrée.

import { countVisible, scorePlayer } from '../engine/index.js';
import { h } from './dom.js';
import { cardEl } from './cards.js';
import { formatLog } from './format.js';

const AVATARS = ['🐧', '🐱', '🦊', '🐻'];

const ICONS = {
  history: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
};

const iconButton = (name, label, onClick) => h('button.icon', { 'aria-label': label, title: label, onClick, innerHTML: ICONS[name] });

/** Actions d'add-ons disponibles pour cette vue. */
export function addonActions(view, modules) {
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
  const turnName = view.players[view.turn]?.name;
  if (picking) return picking.def.picks[picking.picks.length]?.prompt ?? '…';
  if (view.phase === 'setup') {
    const left = view.rules.setupReveals - countVisible(view.players[me].grid);
    return left > 0 ? `Retournez ${left} carte${left > 1 ? 's' : ''}` : 'En attente de l’adversaire…';
  }
  if (view.phase !== 'play') return '';
  const last = view.finisher !== null && view.finisher !== view.turn ? 'Dernier tour · ' : '';
  if (view.turn !== me) return `${last}${turnName} joue…`;
  switch (view.step) {
    case 'draw':
      return `${last}Piochez ou prenez la défausse`;
    case 'decide':
      return view.drawn.from === 'deck' ? 'Placez-la dans votre grille ou sur la défausse' : 'Placez-la dans votre grille';
    case 'flip':
      return 'Retournez une de vos cartes';
    default:
      return '';
  }
}

function playerHead(view, p) {
  const pl = view.players[p];
  const visible = scorePlayer(view, p, { visibleOnly: true });
  return h(
    'div.player-head',
    {},
    h('span.avatar', {}, AVATARS[p % AVATARS.length]),
    h('span.pname', {}, pl.name, p === view.me ? h('span.you', {}, ' (vous)') : null),
    h('span.pscore', { title: 'Points visibles cette manche' }, visible),
    pl.total || view.round > 1 ? h('span.ptotal', { title: 'Total de la partie' }, `Σ ${pl.total}`) : null,
    view.finisher === p ? h('span.badge', {}, 'a fini') : null,
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
  const opp = view.players.map((_, i) => i).find((i) => i !== me);
  const { cols, setupReveals } = view.rules;
  const myTurn = view.phase === 'play' && view.turn === me;
  const picking = ui.picking;
  const busy = ui.pending || session.status !== 'open';
  const pickStep = picking ? picking.def.picks[picking.picks.length] : null;
  const decorators = view.addons.map((id) => cfg.modules[id]?.ui?.decorate).filter(Boolean);

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

  function badgeFor(owner, index, slot) {
    for (const decorate of decorators) {
      try {
        const d = decorate({ view, owner, index, slot });
        if (d?.badge) return d.badge;
      } catch (e) {
        console.error(e);
      }
    }
    return null;
  }

  function side(owner, size) {
    const g = view.players[owner].grid;
    const active = (view.phase === 'play' && view.turn === owner) || (view.phase === 'setup' && owner === me && countVisible(g) < setupReveals);
    const grid = h(
      'div.grid',
      { style: { '--cols': cols } },
      g.map((slot, index) => {
        const onClick = slotHandler(owner, index, slot);
        const picked = picking?.picks.some((p) => p.owner === owner && p.index === index);
        return cardEl(slot, {
          class: `${onClick ? 'tap' : ''} ${picked ? 'picked' : ''}`,
          badge: badgeFor(owner, index, slot),
          dataset: { p: owner, i: index },
          role: onClick ? 'button' : null,
          onClick,
        });
      }),
    );
    const head = playerHead(view, owner);
    return h(`section.side.${size}`, { class: active ? 'active' : '' }, size === 'opp' ? [head, grid] : [grid, head]);
  }

  // --- pioche et défausse : la carte en main reste à l'endroit d'où elle vient
  const free = !busy && !picking;
  const canDraw = myTurn && view.step === 'draw' && free;
  const canDiscardDrawn = myTurn && view.step === 'decide' && view.drawn?.from === 'deck' && free;
  const drawn = view.drawn;

  const deckPile = h(
    'div.pile.deck',
    { title: `Pioche : ${view.deckCount} cartes` },
    view.deckCount > 0 ? h('div.card.back.under') : h('div.card.empty.under'),
    drawn?.from === 'deck'
      ? cardEl(drawn.card, { class: 'in-hand', id: 'drawn' })
      : view.deckCount
        ? cardEl({ up: false }, { class: canDraw ? 'tap' : '', id: 'deck', role: canDraw ? 'button' : null, onClick: canDraw ? () => act({ type: 'drawDeck' }) : null })
        : null,
  );

  const discardClick = canDraw && view.discardTop ? () => act({ type: 'takeDiscard' }) : canDiscardDrawn ? () => act({ type: 'discardDrawn' }) : null;
  const discardPile = h(
    'div.pile.discard',
    { title: `Défausse : ${view.discardCount} cartes` },
    cardEl(view.discardTop, {
      class: `top ${discardClick ? 'tap' : ''} ${canDiscardDrawn ? 'target' : ''}`,
      id: 'discard',
      role: discardClick ? 'button' : null,
      onClick: discardClick,
    }),
    drawn?.from === 'discard' ? cardEl(drawn.card, { class: 'in-hand', id: 'drawn' }) : null,
  );

  const buttons = [];
  for (const def of free ? addonActions(view, cfg.modules) : []) {
    if (def.auto) continue;
    buttons.push(h('button.small', { onClick: () => (def.picks?.length ? setUi({ picking: { def, picks: [] } }) : act(def.build([]))) }, def.label));
  }
  if (picking && !picking.def.auto) buttons.push(h('button.small.ghost', { onClick: () => setUi({ picking: null }) }, 'Annuler'));

  const center = h(
    'section.center',
    {},
    h('div.piles', {}, deckPile, discardPile),
    h('div.status', { class: myTurn || picking || view.phase === 'setup' ? 'mine' : '', 'aria-live': 'polite' }, statusText(view, picking)),
    buttons.length ? h('div.actions', {}, buttons) : null,
  );

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
        iconButton('history', 'Historique', () => setUi({ showLog: true })),
        iconButton('trophy', 'Scores', () => setUi({ showScores: true })),
        iconButton('menu', 'Menu', () => setUi({ showMenu: true })),
      ),
    ),
    opp !== undefined ? side(opp, 'opp') : h('section'),
    center,
    side(me, 'mine'),
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
          h('button', { onClick: () => (setUi({ showMenu: false }), onRules()) }, 'Règles'),
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
  const title = over ? (winners.length > 1 ? 'Égalité !' : iWin ? 'Vous avez gagné !' : `${winners[0].name} gagne`) : `Fin de la manche ${view.round}`;
  const notes = [];
  if (res) res.doubled.forEach((d, i) => d && notes.push(`${view.players[i].name} a fini sans avoir le plus petit score : ${res.raw[i]} × 2 = ${res.scores[i]}`));
  return h(
    'div.overlay.round',
    {},
    h(
      'div.sheet',
      {},
      h('h2', {}, title),
      notes.map((n) => h('p.note', {}, n)),
      scoreTable(view),
      over
        ? session.role === 'host'
          ? h('button.primary.big', { onClick: onRematch }, 'Revanche')
          : h('p.notice', {}, 'L’hôte peut lancer une revanche.')
        : h('button.primary.big', { disabled: busy, onClick: () => act({ type: 'nextRound' }) }, 'Manche suivante'),
      over ? h('button.ghost', { onClick: onLeave }, 'Retour à l’accueil') : h('p.small', {}, `Fin de partie à ${view.rules.endThreshold} points`),
    ),
  );
}

/** Animations simples déclenchées par les événements du dernier coup. */
export function animate(root, events, me) {
  const slot = (p, i) => root.querySelector(`.grid .card[data-p="${p}"][data-i="${i}"]`);
  for (const ev of events ?? []) {
    switch (ev.type) {
      case 'flip':
        slot(ev.player, ev.index)?.classList.add('anim-flip');
        break;
      case 'swap':
        slot(ev.player, ev.index)?.classList.add('anim-place');
        root.querySelector('#discard')?.classList.add('anim-drop');
        break;
      case 'draw':
        // pioche : la carte se retourne sur place ; défausse : elle se soulève
        root.querySelector('#drawn')?.classList.add(ev.from === 'deck' ? 'anim-flip' : 'anim-lift');
        break;
      case 'discard':
        root.querySelector('#discard')?.classList.add('anim-drop');
        break;
      case 'column':
        for (const i of ev.indices) slot(ev.player, i)?.classList.add('anim-cleared');
        break;
      case 'turn':
        if (ev.player === me && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(30);
        break;
      default:
        if (ev.player !== undefined) {
          for (const i of [ev.index, ev.from, ev.to]) if (Number.isInteger(i)) slot(ev.player, i)?.classList.add('anim-place');
        }
    }
  }
}
