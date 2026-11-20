// Sushi maritime : la bataille navale de nos parties en vrai, où les bateaux étaient des makis et
// où l'on mangeait ce qu'on touchait. Le serveur arbitre, cette page affiche la vue du joueur.
// URL : /bataille/?match=<id> (identifiant historique du jeu)

import { api, session as auth, Live, registerServiceWorker } from '/shared/api.js';
import { h, clear, toast } from '/shared/dom.js';
import { shipCells, validateFleet, randomFleet, cellName } from './engine.js';

const root = document.getElementById('app');
const matchId = new URLSearchParams(location.search).get('match');
const goHome = () => (location.href = '/');
const DRAFT_KEY = `bataille.draft.${matchId}`;

// Allure de chaque pièce : makis en tranches (futo, cali, maki) ou pièces d'un seul tenant.
const PIECES = {
  'porte-avions': 'futo', // futomaki
  croiseur: 'spring', // rouleau de printemps
  'contre-torpilleur': 'cali', // california roll
  'sous-marin': 'maki', // maki saumon
  torpilleur: 'nigiri',
};
const SLICED = ['futo', 'cali', 'maki'];
const kindOf = (id) => PIECES[id] ?? 'maki';
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Dessin d'une pièce (tranches de maki ou pièce entière), orientée « h » ou « v ». */
function pieceEl(id, len, dir, extra = {}) {
  const kind = kindOf(id);
  return h(
    'div.piece',
    { ...extra, class: [`p-${kind}`, dir, extra.class ?? ''].join(' ') },
    SLICED.includes(kind) ? Array.from({ length: len }, () => h('span.slice')) : null,
  );
}

const ICONS = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
};
const iconButton = (name, label, onClick) => h('button.icon', { 'aria-label': label, title: label, onClick, innerHTML: ICONS[name] });

const app = {
  live: null,
  status: 'connecting',
  notice: null,
  view: null,
  summary: null,
  online: [],
  pending: false,
  aim: null, // case visée {x, y}
  draft: null, // flotte en cours de placement
  selected: null, // navire sélectionné pendant le placement
  menu: false,
  rules: false,
  peek: false, // fin de partie : grilles visibles derrière le bilan
};

// ---------------------------------------------------------------------------- connexion

function boot() {
  if (!auth.token || !matchId) return goHome();
  registerServiceWorker();
  const live = new Live();
  app.live = live;
  live.on((ev) => {
    if (ev.type === 'status') {
      app.status = ev.status;
      app.notice = ev.status === 'reconnecting' ? 'Connexion perdue — reconnexion…' : ev.status === 'closed' ? 'Session expirée : reconnectez-vous depuis l’accueil.' : null;
      if (ev.status !== 'open') app.pending = false;
      return render();
    }
    const msg = ev.msg;
    if (msg.t === 'match' && msg.summary.id === matchId) {
      app.view = msg.view;
      app.summary = msg.summary;
      app.pending = false;
      if (app.aim && msg.view.myShots.some((s) => s.x === app.aim.x && s.y === app.aim.y)) app.aim = null;
      if (msg.view.phase !== 'placement') sessionStorage.removeItem(DRAFT_KEY);
      document.title = `Sushi maritime · ${msg.summary.opponent?.name ?? ''}`;
      render(msg.events ?? []);
      announce(msg.events ?? []);
    } else if (msg.t === 'presence' && msg.match === matchId) {
      app.online = msg.online;
      render();
    } else if (msg.t === 'error') {
      app.pending = false;
      if (['not_found', 'forbidden'].includes(msg.code)) return fatal(msg.message);
      if (msg.code !== 'auth') toast(msg.message, 'error');
      render();
    }
  });
  live.watch(matchId);
  render();
}

function fatal(message) {
  clear(root).append(h('main.screen.fatal', {}, h('h2', {}, 'Oups'), h('p', {}, message), h('button.primary', { onClick: goHome }, 'Retour à l’accueil')));
}

function act(action) {
  if (app.pending) return;
  if (!app.live.send({ t: 'action', match: matchId, action })) return toast('Hors connexion : coup non envoyé.', 'error');
  app.pending = true;
  render();
}

const set = (patch) => (Object.assign(app, patch), render());

async function rematch() {
  const s = app.summary;
  try {
    const m = await api('/api/matches', { method: 'POST', body: { game: s.game, opponent: s.opponent.id, options: s.options } });
    location.href = `${m.path}?match=${m.id}`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function abandon() {
  if (!confirm('Abandonner cette partie ? Elle ne comptera pas dans les scores.')) return;
  try {
    await api(`/api/matches/${matchId}/abandon`, { method: 'POST' });
    goHome();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---------------------------------------------------------------------------- annonces

const shipName = (id) => app.view.fleet.find((f) => f.id === id)?.name ?? 'pièce';
const oppName = () => app.summary?.opponent?.name ?? 'L’adversaire';

/**
 * Après chaque coup : les baguettes arrivent sur la case (elles attrapent le morceau, piquent
 * dedans, ou claquent dans le vide), puis un bandeau annonce le résultat.
 */
function announce(events) {
  const shot = events.find((e) => e.type === 'shot');
  if (!shot) return;
  const mine = shot.by === app.view.me;
  const where = cellName(shot.x, shot.y);
  const name = shot.ship ? shipName(shot.ship) : '';
  const lower = name.toLowerCase();
  let text;
  if (mine)
    text =
      shot.result === 'miss'
        ? pick([`${where} · Rien dans l’assiette`, `${where} · Clac ! Dans le vide`, `${where} · Juste un grain de riz`])
        : shot.result === 'hit'
          ? pick([`Miam ! Un bout de ${lower}`, `Oishii ! ${name} entamé`, `${where} · Une bouchée de ${lower}`])
          : `Itadakimasu ! ${name} englouti`;
  else
    text =
      shot.result === 'miss'
        ? `${oppName()} pique dans le vide en ${where}`
        : shot.result === 'hit'
          ? `${oppName()} croque votre ${lower}`
          : `${oppName()} engloutit votre ${lower} 😱`;
  const kind = events.some((e) => e.type === 'over') ? 'sunk' : shot.result;
  chopsticks(shot, mine);
  // hors du rendu principal : l'animation ne redémarre pas à chaque rafraîchissement
  document.querySelector('.flash')?.remove();
  const el = h('div.flash', { class: `${kind} ${mine ? 'mine' : 'theirs'}`, role: 'status' }, h('span.hanko', {}, kind === 'miss' ? '空' : kind === 'sunk' ? '完' : '旨'), h('span', {}, text));
  setTimeout(() => document.body.append(el), 450);
  setTimeout(() => el.remove(), 2600);
}

const STICKS = `<svg viewBox="0 0 120 200" aria-hidden="true">
  <defs><linearGradient id="hashi" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b3261e"/><stop offset="0.34" stop-color="#8f1d17"/>
    <stop offset="0.345" stop-color="#e9c46a"/><stop offset="0.37" stop-color="#e9c46a"/>
    <stop offset="0.375" stop-color="#e6c79a"/><stop offset="1" stop-color="#c99a5e"/>
  </linearGradient></defs>
  <polygon class="stick l" points="37,0 49,0 59.5,197 57,197" fill="url(#hashi)"/>
  <polygon class="stick r" points="71,0 83,0 63,197 60.5,197" fill="url(#hashi)"/>
</svg>`;

/** Animation des baguettes au-dessus de la case visée. */
function chopsticks(shot, mine) {
  const cell = document.querySelector(`.grid.${mine ? 'enemy' : 'small'} .cell[data-x="${shot.x}"][data-y="${shot.y}"]`);
  if (!cell) return;
  const r = cell.getBoundingClientRect();
  const variant = shot.result === 'miss' ? pick(['poke', 'clack']) : pick(['pinch', 'stab', 'swoop']);
  const el = h(
    'div.chop',
    { class: `v-${variant} ${shot.result} ${mine ? 'mine' : 'theirs'}`, style: { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px`, '--cell': `${r.width}px` } },
    h('div.sticks', { innerHTML: STICKS }),
    shot.result === 'miss' ? h('span.splash') : pieceEl(shot.ship, 1, 'h', { class: 'morsel' }),
  );
  document.body.append(el);
  setTimeout(() => el.remove(), 1500);
}

// ---------------------------------------------------------------------------- grilles

const key = (x, y) => `${x},${y}`;

function neighbours(ships, fleet, size) {
  const out = new Set();
  for (const s of ships)
    for (const [x, y] of shipCells(s, fleet))
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.add(key(nx, ny));
        }
  return out;
}

/**
 * Un plateau : cases (boutons), pièces de sushi (sur plusieurs cases) et marques de coups de
 * baguettes posées par-dessus, tous placés dans la même grille CSS.
 */
function grid({ size, fleet, ships = [], shots = [], onTap, cellClass, labels = false, cls = '', selected = null, sunk = [], boom = null, bites = false }) {
  const o = labels ? 1 : 0;
  const items = [];
  if (labels) {
    for (let i = 0; i < size; i++) {
      items.push(h('span.lbl', { style: { gridColumn: i + 2, gridRow: 1 } }, 'ABCDEFGHIJ'[i]));
      items.push(h('span.lbl', { style: { gridColumn: 1, gridRow: i + 2 } }, String(i + 1)));
    }
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const extra = cellClass?.(x, y) ?? {};
      items.push(
        h('button.cell', {
          class: extra.cls ?? '',
          disabled: !onTap || extra.disabled,
          'aria-label': cellName(x, y),
          dataset: { x, y },
          style: { gridColumn: x + 1 + o, gridRow: y + 1 + o },
          onClick: onTap ? () => onTap(x, y) : null,
        }),
      );
    }
  const eatenCells = new Set();
  for (const s of ships) {
    const len = fleet.find((f) => f.id === s.id).len;
    if (bites || sunk.includes(s.id)) for (const [x, y] of shipCells(s, fleet)) eatenCells.add(key(x, y));
    items.push(
      pieceEl(s.id, len, s.dir, {
        dataset: { id: s.id },
        class: ['ship', selected === s.id ? 'selected' : '', sunk.includes(s.id) ? 'sunk' : ''].join(' '),
        style: {
          gridColumn: s.dir === 'h' ? `${s.x + 1 + o} / span ${len}` : `${s.x + 1 + o}`,
          gridRow: s.dir === 'v' ? `${s.y + 1 + o} / span ${len}` : `${s.y + 1 + o}`,
        },
      }),
    );
  }
  const last = shots[shots.length - 1];
  for (const t of shots) {
    // touché : sur une pièce visible, une bouchée en moins ; sinon le morceau découvert
    const eaten = t.r !== 'miss' && eatenCells.has(key(t.x, t.y));
    items.push(
      h(
        'div.mark',
        {
          class: [t.r === 'miss' ? 'miss' : eaten ? 'eaten' : 'hit', t === last ? 'recent' : '', boom && boom.x === t.x && boom.y === t.y ? 'boom' : ''].join(' '),
          style: { gridColumn: t.x + 1 + o, gridRow: t.y + 1 + o },
        },
        t.r !== 'miss' && !eaten ? pieceEl(t.ship, 1, 'h', { class: 'morsel' }) : null,
      ),
    );
  }
  return h('div.tray', { class: cls }, h('div.grid', { class: `${cls} ${labels ? 'labelled' : ''}`, style: { '--n': size } }, items));
}

function fleetChips(fleet, sunkIds) {
  return h(
    'ul.fleet',
    {},
    fleet.map((f) =>
      h(
        'li',
        { class: sunkIds.includes(f.id) ? 'down' : '' },
        h('span.mini', { style: { '--len': f.len } }, pieceEl(f.id, f.len, 'h')),
        h('span', {}, f.name),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------- placement

function loadDraft(view) {
  if (app.draft) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    if (saved && !validateFleet(saved, view.size, view.fleet)) return (app.draft = saved);
  } catch {}
  shuffleDraft(view);
}

function shuffleDraft(view) {
  app.draft = randomFleet(view.size, view.fleet, { next: Math.random });
  app.selected = null;
  saveDraft();
}

const saveDraft = () => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(app.draft));

/** Essaie de remplacer un navire du brouillon ; garde l'ancien si la nouvelle place est impossible. */
function tryPlace(view, ship) {
  const len = view.fleet.find((f) => f.id === ship.id).len;
  const candidates = [];
  const clampX = (x) => Math.max(0, Math.min(x, view.size - (ship.dir === 'h' ? len : 1)));
  const clampY = (y) => Math.max(0, Math.min(y, view.size - (ship.dir === 'v' ? len : 1)));
  candidates.push({ ...ship, x: clampX(ship.x), y: clampY(ship.y) });
  // pivoter près du bord ou d'un autre navire : on cherche la place libre la plus proche
  for (let d = 1; d < len; d++) {
    if (ship.dir === 'h') candidates.push({ ...ship, x: clampX(ship.x - d), y: clampY(ship.y) });
    else candidates.push({ ...ship, x: clampX(ship.x), y: clampY(ship.y - d) });
  }
  for (const c of candidates) {
    const next = app.draft.map((s) => (s.id === ship.id ? c : s));
    if (!validateFleet(next, view.size, view.fleet)) {
      app.draft = next;
      saveDraft();
      return true;
    }
  }
  return false;
}

function shipAt(ships, fleet, x, y) {
  return ships.find((s) => shipCells(s, fleet).some(([cx, cy]) => cx === x && cy === y)) ?? null;
}

function rotateSelected(view) {
  const s = app.draft.find((x) => x.id === app.selected);
  if (!s) return;
  if (!tryPlace(view, { ...s, dir: s.dir === 'h' ? 'v' : 'h' })) toast('Pas la place pour la tourner ici.', 'error');
  render();
}

function onPlacementTap(view, x, y) {
  if (Date.now() < dragEndedAt + 350) return; // le clic qui suit un glisser
  const hit = shipAt(app.draft, view.fleet, x, y);
  if (hit) {
    if (hit.id === app.selected) return rotateSelected(view);
    return set({ selected: hit.id });
  }
  if (!app.selected) return toast('Touchez d’abord une pièce.');
  const s = app.draft.find((v) => v.id === app.selected);
  if (!tryPlace(view, { ...s, x, y })) toast('Trop près d’une autre pièce.', 'error');
  render();
}

// Glisser-déposer : on saisit un navire (doigt ou souris) et on le lâche sur sa nouvelle place.
// Pendant le geste, seul l'élément du navire bouge (pas de nouveau rendu, qui casserait le geste).
let dragEndedAt = 0;

function enableDrag(tray, view) {
  const g = tray.querySelector('.grid');
  let drag = null;
  // case la plus proche du doigt (les interstices entre cases comptent aussi)
  const cellAt = (e) => {
    let best = null;
    let bestD = Infinity;
    for (const el of g.querySelectorAll('.cell')) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (d < bestD) [best, bestD] = [{ x: Number(el.dataset.x), y: Number(el.dataset.y), size: r.width }, d];
    }
    return best && bestD < best.size ? best : null;
  };
  g.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const c = cellAt(e);
    const ship = c && shipAt(app.draft, view.fleet, c.x, c.y);
    if (!ship) return;
    drag = { ship, dx: c.x - ship.x, dy: c.y - ship.y, start: c, moved: false, candidate: null, el: g.querySelector(`.ship[data-id="${ship.id}"]`) };
  });
  g.addEventListener('pointermove', (e) => {
    if (!drag) return;
    e.preventDefault();
    const c = cellAt(e);
    if (!c || (!drag.moved && c.x === drag.start.x && c.y === drag.start.y)) return;
    drag.moved = true;
    const { ship } = drag;
    const len = view.fleet.find((f) => f.id === ship.id).len;
    const x = Math.max(0, Math.min(c.x - drag.dx, view.size - (ship.dir === 'h' ? len : 1)));
    const y = Math.max(0, Math.min(c.y - drag.dy, view.size - (ship.dir === 'v' ? len : 1)));
    const cand = { ...ship, x, y };
    const ok = !validateFleet(app.draft.map((v) => (v.id === ship.id ? cand : v)), view.size, view.fleet);
    drag.candidate = ok ? cand : null;
    drag.el.classList.add('dragging');
    drag.el.classList.toggle('invalid', !ok);
    drag.el.style.gridColumn = ship.dir === 'h' ? `${x + 2} / span ${len}` : `${x + 2}`;
    drag.el.style.gridRow = ship.dir === 'v' ? `${y + 2} / span ${len}` : `${y + 2}`;
  });
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) return; // simple toucher : géré par le clic (choisir / pivoter)
    dragEndedAt = Date.now();
    if (d.candidate) {
      app.draft = app.draft.map((v) => (v.id === d.ship.id ? d.candidate : v));
      saveDraft();
    } else toast('Trop près d’une autre pièce.', 'error');
    app.selected = d.ship.id;
    render();
  };
  g.addEventListener('pointerup', end);
  g.addEventListener('pointercancel', end);
  return tray;
}

function placementScreen(view) {
  const me = view.players[view.me];
  if (me.ready) {
    const opp = view.players[1 - view.me];
    return [
      h('div.status', {}, h('strong', {}, `${oppName()} dresse son plateau…`), h('small', {}, opp.ready ? '' : 'Le repas commence dès que les deux plateaux sont prêts.')),
      h('section.board', {}, grid({ size: view.size, fleet: view.fleet, ships: view.myShips, cls: 'big' })),
      h('div.actions', {}, h('button', { onClick: () => act({ type: 'unplace' }), disabled: app.pending }, 'Modifier mon plateau')),
    ];
  }
  loadDraft(view);
  return [
    h(
      'div.status.mine',
      {},
      h('strong', {}, 'Dressez votre plateau'),
      h('small', {}, 'Faites glisser une pièce pour la déplacer, touchez-la deux fois pour la tourner. Les pièces ne se touchent pas.'),
    ),
    h(
      'section.board',
      {},
      enableDrag(
        grid({
          size: view.size,
          fleet: view.fleet,
          ships: app.draft,
          selected: app.selected,
          labels: true,
          cls: 'big placing',
          onTap: (x, y) => onPlacementTap(view, x, y),
        }),
        view,
      ),
    ),
    h(
      'div.actions',
      {},
      h('button', { onClick: () => shuffleDraft(view) || render() }, 'Mélanger'),
      h('button', { onClick: () => rotateSelected(view), disabled: !app.selected }, 'Tourner'),
    ),
    h(
      'button.primary.big',
      {
        disabled: app.pending || app.status !== 'open',
        onClick: () => {
          app.selected = null;
          act({ type: 'place', ships: app.draft });
        },
      },
      'Plateau prêt !',
    ),
  ];
}

// ---------------------------------------------------------------------------- bataille

function battleScreen(view, events) {
  const myTurn = view.phase === 'battle' && view.turn === view.me;
  const over = view.phase === 'over';
  const shotEvent = events.find((e) => e.type === 'shot');
  const enemySunkIds = view.enemyShips.filter((s) => view.myShots.filter((t) => t.ship === s.id && t.r !== 'miss').length === view.fleet.find((f) => f.id === s.id).len).map((s) => s.id);
  const known = neighbours(view.enemyShips.filter((s) => enemySunkIds.includes(s.id)), view.fleet, view.size);
  const shotAt = new Set(view.myShots.map((t) => key(t.x, t.y)));
  const me = view.players[view.me];
  const opp = view.players[1 - view.me];

  const enemyGrid = grid({
    size: view.size,
    fleet: view.fleet,
    ships: view.enemyShips,
    shots: view.myShots,
    sunk: enemySunkIds,
    labels: true,
    cls: `big enemy ${myTurn ? 'armed' : ''}`,
    boom: shotEvent?.by === view.me ? shotEvent : null,
    onTap: myTurn
      ? (x, y) => {
          if (app.aim && app.aim.x === x && app.aim.y === y) return act({ type: 'fire', x, y });
          set({ aim: { x, y } });
        }
      : null,
    cellClass: (x, y) => {
      const k = key(x, y);
      const cls = [known.has(k) && !shotAt.has(k) ? 'known' : '', app.aim && app.aim.x === x && app.aim.y === y && myTurn ? 'aim' : ''].join(' ');
      return { cls, disabled: shotAt.has(k) || known.has(k) || app.pending };
    },
  });

  const ownGrid = grid({
    size: view.size,
    fleet: view.fleet,
    ships: view.myShips ?? [],
    shots: view.theirShots,
    sunk: view.mySunk,
    bites: true,
    cls: 'small',
    boom: shotEvent && shotEvent.by !== view.me ? shotEvent : null,
  });

  const statusText = over
    ? view.winner === view.me
      ? 'Gochisōsama ! Vous avez tout dévoré.'
      : `${oppName()} a dévoré tout votre plateau.`
    : myTurn
      ? app.aim
        ? `Case ${cellName(app.aim.x, app.aim.y)} — touchez-la encore pour croquer`
        : 'À vous de piquer : choisissez une case.'
      : `${oppName()} prépare ses baguettes…`;

  return [
    h('div.status', { class: myTurn ? 'mine' : '', 'aria-live': 'polite' }, h('strong', {}, statusText), h('small', {}, `Vous : ${me.hits} bouchées en ${me.shots} coups · ${oppName()} : ${opp.hits} en ${opp.shots}`)),
    h('section.board', {}, enemyGrid, fleetChips(view.fleet, enemySunkIds)),
    h('section.home-waters', {}, ownGrid, h('div.home-side', {}, h('span.caption', {}, 'Votre plateau'), fleetChips(view.fleet, view.mySunk))),
    myTurn
      ? h(
          'button.primary.big.fire',
          { disabled: !app.aim || app.pending || app.status !== 'open', onClick: () => app.aim && act({ type: 'fire', ...app.aim }) },
          app.aim ? `🥢 Croquer en ${cellName(app.aim.x, app.aim.y)}` : '🥢 Choisissez une case',
        )
      : null,
  ];
}

// ---------------------------------------------------------------------------- calques

function sheet(title, content, onClose, cls = '') {
  return h(
    'div.overlay',
    { class: cls, onClick: (e) => e.target === e.currentTarget && onClose?.() },
    h('div.sheet', {}, title ? h('h2', {}, title) : null, ...content),
  );
}

function rulesSheet() {
  const v = app.view;
  return sheet(
    'Règles du Sushi maritime',
    [
      h(
        'ul.rules',
        {},
        h('li', {}, `Chacun dresse en secret son plateau de ${v.size} × ${v.size} : ${v.fleet.map((f) => `${f.name.toLowerCase()} (${f.len})`).join(', ')}.`),
        h('li', {}, 'Les pièces sont droites (horizontales ou verticales) et ne se touchent pas, même par un coin.'),
        h('li', {}, 'À tour de rôle, on plante ses baguettes dans une case du plateau d’en face : rien dans l’assiette, une bouchée, ou la pièce entière engloutie quand toutes ses cases sont mangées.'),
        h('li', {}, v.rule === 'again' ? 'Dans cette partie, une bouchée réussie donne droit à une autre.' : 'Dans cette partie, on pique chacun son tour, bouchée ou pas.'),
        h('li', {}, 'Autour d’une pièce engloutie, le plateau est vide : inutile d’y piquer.'),
        h('li', {}, 'Le premier qui dévore tout le plateau d’en face gagne. Gochisōsama !'),
      ),
      h('button.primary', { onClick: () => set({ rules: false }) }, 'Hai, compris !'),
    ],
    () => set({ rules: false }),
  );
}

function endSheet(view) {
  const s = app.summary;
  if (s?.status === 'abandoned') {
    const who = s.players.find((p) => p?.id === s.abandonedBy)?.name ?? 'Un joueur';
    return sheet(
      'Partie abandonnée',
      [h('p.notice', {}, `${who} a abandonné. Elle ne compte pas dans les scores.`), h('button.primary.big', { onClick: rematch }, 'Nouvelle partie'), h('button', { onClick: goHome }, 'Accueil')],
      null,
      'round',
    );
  }
  const won = view.winner === view.me;
  const line = (p) => {
    const acc = p.shots ? Math.round((100 * p.hits) / p.shots) : 0;
    return h('tr', {}, h('th', {}, p.name), h('td', {}, p.shots), h('td', {}, p.hits), h('td', {}, `${acc} %`));
  };
  return sheet(
    won ? 'Gochisōsama ! 🎉' : 'Plateau dévoré… 🥲',
    [
      h('p.kanji', {}, won ? 'ごちそうさま' : '完食'),
      h('p.notice', {}, won ? `Vous avez dévoré le plateau de ${oppName()} en ${view.players[view.me].shots} coups de baguettes.` : `${oppName()} a dévoré votre plateau en ${view.players[1 - view.me].shots} coups de baguettes.`),
      h('table.scores', {}, h('thead', {}, h('tr', {}, h('th'), h('th', {}, 'Coups'), h('th', {}, 'Bouchées'), h('th', {}, 'Précision'))), h('tbody', {}, view.players.map(line))),
      h('button.primary.big', { onClick: rematch }, 'Revanche'),
      h('div.row', {}, h('button', { style: { flex: 1 }, onClick: () => set({ peek: true }) }, 'Voir les plateaux'), h('button', { style: { flex: 1 }, onClick: goHome }, 'Accueil')),
    ],
    null,
    'round',
  );
}

function menuSheet() {
  return sheet(
    'Menu',
    [
      h('button', { onClick: () => set({ menu: false, rules: true }) }, 'Règles'),
      h('button', { onClick: goHome }, 'Retour à l’accueil'),
      app.summary?.status === 'active' ? h('button.danger', { onClick: abandon }, 'Abandonner la partie') : null,
    ],
    () => set({ menu: false }),
  );
}

// ---------------------------------------------------------------------------- rendu

function banner() {
  if (!app.notice) return null;
  return h(
    'div.banner',
    { class: app.status === 'closed' ? 'error' : 'warn', role: 'alert' },
    h('span', {}, app.notice),
    app.status === 'closed' ? h('button.small', { onClick: goHome }, 'Accueil') : null,
  );
}

function render(events = []) {
  const view = app.view;
  if (!view) {
    clear(root).append(...[banner(), h('div.splash', {}, 'Connexion à la partie…')].filter(Boolean));
    return;
  }
  document.body.dataset.screen = 'game';
  document.body.dataset.game = 'sushi';
  const opp = app.summary?.opponent;
  const here = opp && app.online.includes(opp.id);
  const topbar = h(
    'header.topbar',
    {},
    h(
      'span.title',
      {},
      iconButton('back', 'Accueil', goHome),
      h('span.avatar', {}, opp?.avatar ?? '🙂', h('span.presence', { class: here ? 'on' : '', title: here ? 'En ligne' : 'Hors ligne' })),
      h('span.who', {}, h('strong', {}, opp?.name ?? ''), h('small', {}, `寿司 · ${view.size === 8 ? 'Apéro rapide 8 × 8' : 'Sushi maritime'}`)),
    ),
    iconButton('menu', 'Menu', () => set({ menu: true })),
  );

  const body = view.phase === 'placement' && app.summary?.status === 'active' ? placementScreen(view) : battleScreen(view, events);
  const nodes = [banner(), h('main.screen.naval', { class: `phase-${view.phase}` }, topbar, ...body.filter(Boolean))];

  const ended = view.phase === 'over' || app.summary?.status === 'abandoned';
  if (ended && !app.peek) nodes.push(endSheet(view));
  else if (ended) nodes.push(h('button.primary.floating', { onClick: () => set({ peek: false }) }, 'Voir le bilan'));
  if (app.menu) nodes.push(menuSheet());
  if (app.rules) nodes.push(rulesSheet());
  clear(root).append(...nodes.filter(Boolean));
}

boot();
