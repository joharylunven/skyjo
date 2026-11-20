// Minigolf malgache dans la salle de jeux : le serveur simule chaque coup, cette page vise, rejoue
// les trajectoires et anime le décor. URL : /minigolf/?match=<id>

import { api, session as auth, Live, registerServiceWorker } from '/shared/api.js';
import { h, clear, toast } from '/shared/dom.js';
import { holeById } from './courses.js';
import { tauFor, MAX_STROKES, SAMPLE_HZ } from './engine.js';
import { CourseView } from './render.js';

const root = document.getElementById('app');
const matchId = new URLSearchParams(location.search).get('match');
const goHome = () => (location.href = '/');

const ICONS = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
};
const iconButton = (name, label, onClick) => h('button.icon', { 'aria-label': label, title: label, onClick, innerHTML: ICONS[name] });
const BALL_COLORS = ['#ffffff', '#ffd23f'];

const app = {
  live: null,
  status: 'connecting',
  notice: null,
  view: null,
  summary: null,
  online: [],
  pending: false,
  anim: null, // { shot, from, start }
  queue: [], // coups reçus pendant qu'un autre se rejoue
  aim: null, // { start: {x,y}, angle, power }
  splash: null, // { x, y, at }
  intro: null, // carton de présentation d'un trou
  menu: false,
  rules: false,
  card: false,
  peek: false,
};

const canvas = h('canvas.course', { 'aria-label': 'Parcours de minigolf' });
const course = new CourseView(canvas);

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
      const prev = app.view;
      app.view = msg.view;
      app.summary = msg.summary;
      app.pending = false;
      document.title = `Minigolf · ${msg.summary.opponent?.name ?? ''}`;
      const shot = (msg.events ?? []).find((e) => e.type === 'shot');
      if (shot && msg.view.lastShot) startReplay(prev ?? msg.view, msg.view.lastShot);
      else if (!prev && msg.view.phase === 'play' && msg.view.players.every((p) => p.strokes === 0)) showIntro(msg.view);
      render();
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
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => render());
}

function fatal(message) {
  clear(root).append(h('main.screen.fatal', {}, h('h2', {}, 'Oups'), h('p', {}, message), h('button.primary', { onClick: goHome }, 'Retour à l’accueil')));
}

const set = (patch) => (Object.assign(app, patch), render());

function send(action) {
  if (app.pending) return;
  if (!app.live.send({ t: 'action', match: matchId, action })) return toast('Hors connexion : coup non joué.', 'error');
  app.pending = true;
  render();
}

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

// ---------------------------------------------------------------------------- textes

const playerName = (i) => (i === app.view.me ? 'Toi' : app.summary?.opponent?.name ?? 'L’adversaire');
const avatarOf = (i) => app.summary?.players?.[i]?.avatar ?? (i ? '🙂' : '😀');
const vsPar = (v) => (v === 0 ? 'par' : v > 0 ? `+${v}` : `${v}`);
const totalOf = (p) => p.scores.reduce((a, b) => a + (b ?? 0), 0);
const parSoFar = (view, p) => p.scores.reduce((a, b, i) => a + (b != null ? view.pars[i] : 0), 0);

function resultText(shot, view) {
  const mine = shot.player === view.me;
  const who = mine ? '' : `${playerName(shot.player)} : `;
  const par = view.pars[shot.hole];
  if (shot.result === 'hole') {
    const d = shot.strokes - par;
    const label = shot.strokes === 1 ? 'Trou en un ! Tsara be ! 🎉' : d <= -2 ? 'Aigle ! 🦅' : d === -1 ? 'Birdie ! 🐦' : d === 0 ? 'Par, mazotoa ! ✔' : d === 1 ? 'Bogey' : `Dans le trou en ${shot.strokes}`;
    return { text: who + label, kind: d < 0 || shot.strokes === 1 ? 'great' : 'good' };
  }
  if (shot.result === 'water') return { text: `${who}Plouf ! Le croco garde la balle 🐊 · +1`, kind: 'bad' };
  if (shot.result === 'max' || shot.result === 'water-max') return { text: `${who}Balle ramassée · ${MAX_STROKES + 1}`, kind: 'bad' };
  return null;
}

function flash({ text, kind }) {
  document.querySelector('.golf-flash')?.remove();
  const el = h('div.golf-flash', { class: kind, role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 2400);
}

function showIntro(view, index = view.hole) {
  const hole = holeById(view.holes[index]);
  app.intro = { hole, index, count: view.holes.length, until: performance.now() + 2600 };
  setTimeout(() => app.intro && performance.now() >= app.intro.until && set({ intro: null }), 2700);
}

// ---------------------------------------------------------------------------- rejouer un coup

function startReplay(from, shot = app.view.lastShot) {
  app.aim = null;
  if (app.anim) app.queue.push({ shot, from });
  else app.anim = { shot, from, start: performance.now() };
}

/** Position de la balle le long de la trajectoire au temps t (s). */
function along(path, t) {
  const pts = [];
  for (const p of path) if (p) pts.push(p);
  const f = t * SAMPLE_HZ;
  // les « null » marquent un passage dans un tronc creux : on saute
  let i = Math.floor(f);
  if (i >= path.length - 1) return { pos: path.at(-1), done: true };
  let a = path[i];
  let b = path[i + 1];
  if (!a) a = path[i + 1];
  if (!b) b = path[i + 2] ?? a;
  const u = f - i;
  return { pos: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], done: false };
}

function finishReplay() {
  const { shot } = app.anim;
  const view = app.view;
  const next = app.queue.shift();
  app.anim = next ? { ...next, start: performance.now() + 900 } : null;
  const res = resultText(shot, view);
  if (shot.result.startsWith('water')) app.splash = { ...shot.splash, at: performance.now() };
  if (res) flash(res);
  const nextHole = next ? next.shot.hole : view.hole;
  if (nextHole !== shot.hole && nextHole < view.holes.length && (next || view.phase === 'play')) {
    if (app.anim) app.anim.start += 2600;
    setTimeout(() => (showIntro(view, nextHole), render()), res ? 1100 : 300);
  }
  render();
}

// ---------------------------------------------------------------------------- boucle d'animation

const t0 = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const view = app.view;
  if (!view || document.hidden) return;
  const t = (now - t0) / 1000;
  let base = view;
  let shooter = null;
  let tau = tauFor(view.shots);
  if (app.anim) {
    const { shot, from } = app.anim;
    const el = Math.max(0, (now - app.anim.start) / 1000);
    const { pos, done } = along(shot.path, el);
    base = from.hole === shot.hole ? from : view;
    shooter = { i: shot.player, pos };
    tau = shot.tau0 + el;
    if (done) finishReplay();
  }
  const hole = holeById(base.holes[app.anim ? app.anim.shot.hole : base.hole]);
  course.setHole(hole);
  const balls = base.players.map((p, i) => {
    const moving = shooter && shooter.i === i;
    const [x, y] = moving ? shooter.pos : [p.ball.x, p.ball.y];
    const hidden = !moving && p.done;
    return { x, y, color: BALL_COLORS[i === view.me ? 0 : 1], label: moving ? null : avatarOf(i), hidden };
  });
  // deux balles au même endroit (au départ) : on décale un peu l'affichage de la seconde
  if (balls.length === 2 && !balls[0].hidden && !balls[1].hidden && Math.hypot(balls[0].x - balls[1].x, balls[0].y - balls[1].y) < 2.4) {
    balls[1] = { ...balls[1], x: balls[1].x + 3 };
  }
  const splash = app.splash ? { x: app.splash.x, y: app.splash.y, age: (now - app.splash.at) / 1000 } : null;
  let aim = null;
  if (app.aim && myTurn()) {
    const me = view.players[view.me];
    aim = { x: me.ball.x, y: me.ball.y, angle: app.aim.angle, power: app.aim.power };
  }
  course.draw({ t, tau, balls, aim, splash });
}

const myTurn = () => app.view?.phase === 'play' && app.view.turn === app.view.me && app.summary?.status === 'active';
const canShoot = () => myTurn() && !app.anim && !app.pending && app.status === 'open';

// ---------------------------------------------------------------------------- visée au doigt

canvas.addEventListener('pointerdown', (e) => {
  if (!canShoot()) return;
  canvas.setPointerCapture?.(e.pointerId);
  app.aim = { start: course.toCourse(e.clientX, e.clientY), angle: -Math.PI / 2, power: 0 };
  updateAimHint();
});
canvas.addEventListener('pointermove', (e) => {
  if (!app.aim) return;
  e.preventDefault();
  const p = course.toCourse(e.clientX, e.clientY);
  // on tire « en arrière » comme un lance-pierre : la balle part à l'opposé du doigt
  const dx = app.aim.start.x - p.x;
  const dy = app.aim.start.y - p.y;
  const d = Math.hypot(dx, dy);
  app.aim.power = Math.min(1, d / 42);
  if (d > 0.5) app.aim.angle = Math.atan2(dy, dx);
  updateAimHint();
});
const release = () => {
  const a = app.aim;
  app.aim = null;
  updateAimHint();
  if (!a || !canShoot()) return;
  if (a.power < 0.04) return toast('Tire plus loin en arrière pour jouer.');
  send({ type: 'shot', angle: Math.round(a.angle * 1e4) / 1e4, power: Math.round(a.power * 1e3) / 1e3 });
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', () => {
  app.aim = null;
  updateAimHint();
});

function updateAimHint() {
  const el = document.querySelector('.golf-status strong');
  if (!el) return;
  el.textContent = statusText();
}

function statusText() {
  const v = app.view;
  if (!v) return '';
  if (app.summary?.status === 'abandoned') return 'Partie abandonnée';
  if (v.phase === 'over') return v.winners.length > 1 ? 'Égalité parfaite !' : v.winners[0] === v.players[v.me].id ? 'Tsara be ! Tu as gagné 🏆' : `${playerName(1 - v.me)} gagne cette fois…`;
  if (app.anim) return app.anim.shot.player === v.me ? 'Ta balle roule…' : `${playerName(app.anim.shot.player)} a joué…`;
  if (app.aim) return app.aim.power < 0.04 ? 'Tire en arrière…' : `Puissance ${Math.round(app.aim.power * 100)} % · relâche pour jouer`;
  if (app.pending) return 'Coup envoyé…';
  if (myTurn()) return 'À toi ! Tire en arrière avec le doigt, relâche pour jouer.';
  return app.summary?.opponent?.bot ? `${playerName(v.turn)} réfléchit… 🤖` : `${playerName(v.turn)} joue…`;
}

// ---------------------------------------------------------------------------- feuilles

function sheet(title, content, onClose, cls = '') {
  return h('div.overlay', { class: cls, onClick: (e) => e.target === e.currentTarget && onClose?.() }, h('div.sheet', {}, title ? h('h2', {}, title) : null, ...content));
}

function scoreTable(view) {
  const cell = (p, i) => {
    const s = p.scores[i];
    if (s == null) return h('td', { class: i === view.hole && view.phase === 'play' ? 'now' : '' }, i === view.hole && p.strokes ? `(${p.strokes})` : '·');
    const d = s - view.pars[i];
    return h('td', { class: s === 1 ? 'ace' : d < 0 ? 'under' : d > 0 ? 'over' : '' }, s);
  };
  return h(
    'table.scores.golf-card',
    {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Trou'), h('th', {}, 'Par'), view.players.map((p, i) => h('th', {}, `${avatarOf(i)} ${playerName(i)}`)))),
    h(
      'tbody',
      {},
      view.holes.map((id, i) => h('tr', { class: i === view.hole ? 'current' : '' }, h('td.hole-name', {}, h('b', {}, i + 1), ' ', holeById(id).name), h('td', {}, view.pars[i]), view.players.map((p) => cell(p, i)))),
    ),
    h(
      'tfoot',
      {},
      h(
        'tr',
        {},
        h('th', {}, 'Total'),
        h('th', {}, view.pars.reduce((a, b) => a + b, 0)),
        view.players.map((p) => h('th', {}, `${totalOf(p)} `, h('small', {}, `(${vsPar(totalOf(p) - parSoFar(view, p))})`))),
      ),
    ),
  );
}

function rulesSheet() {
  return sheet(
    'Règles du minigolf',
    [
      h(
        'ul.rules',
        {},
        h('li', {}, 'On joue chacun son tour sur le même trou ; les balles ne se gênent pas.'),
        h('li', {}, 'Pour jouer : pose le doigt n’importe où, tire en arrière comme un lance-pierre (plus tu tires loin, plus c’est fort), relâche.'),
        h('li', {}, 'Sable et boue freinent fort, les pentes (flèches) font rouler, les charrettes à zébus bougent pendant le coup, le tronc creux te fait ressortir plus loin.'),
        h('li', {}, 'Dans l’eau : un coup de pénalité et la balle revient où elle était.'),
        h('li', {}, `Au bout de ${MAX_STROKES} coups sans finir, la balle est ramassée et compte ${MAX_STROKES + 1}.`),
        h('li', {}, 'Celui qui a fait le meilleur score commence le trou suivant. Le plus petit total gagne.'),
      ),
      h('button.primary', { onClick: () => set({ rules: false }) }, 'Misaotra, compris !'),
    ],
    () => set({ rules: false }),
  );
}

function endSheet(view) {
  const s = app.summary;
  if (s?.status === 'abandoned') {
    const who = s.players.find((p) => p?.id === s.abandonedBy)?.name ?? 'Un joueur';
    return sheet('Partie abandonnée', [h('p.notice', {}, `${who} a abandonné. Elle ne compte pas dans les scores.`), h('button.primary.big', { onClick: rematch }, 'Nouvelle partie'), h('button', { onClick: goHome }, 'Accueil')], null, 'round');
  }
  const won = view.winners.length === 1 && view.winners[0] === view.players[view.me].id;
  const draw = view.winners.length > 1;
  return sheet(
    draw ? 'Égalité ! 🤝' : won ? 'Tsara be ! 🏆' : 'Veloma… 🌅',
    [
      h('p.notice', {}, draw ? 'Même total, il faudra une revanche.' : won ? `Tu bats ${playerName(1 - view.me)} sur le ${view.holes.length > 2 ? 'Tour de Madagascar' : 'parcours express'}.` : `${playerName(1 - view.me)} gagne cette fois.`),
      scoreTable(view),
      h('button.primary.big', { onClick: rematch }, 'Revanche'),
      h('div.row', {}, h('button', { style: { flex: 1 }, onClick: () => set({ peek: true }) }, 'Voir le parcours'), h('button', { style: { flex: 1 }, onClick: goHome }, 'Accueil')),
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
      app.view?.lastShot ? h('button', { onClick: () => (startReplay(app.view), set({ menu: false })) }, 'Revoir le dernier coup') : null,
      h('button', { onClick: goHome }, 'Retour à l’accueil'),
      app.summary?.status === 'active' ? h('button.danger', { onClick: abandon }, 'Abandonner la partie') : null,
    ],
    () => set({ menu: false }),
  );
}

// ---------------------------------------------------------------------------- rendu

function banner() {
  if (!app.notice) return null;
  return h('div.banner', { class: app.status === 'closed' ? 'error' : 'warn', role: 'alert' }, h('span', {}, app.notice), app.status === 'closed' ? h('button.small', { onClick: goHome }, 'Accueil') : null);
}

function playerChip(view, i) {
  const p = view.players[i];
  const total = totalOf(p);
  const turn = view.phase === 'play' && view.turn === i;
  return h(
    'div.player-chip',
    { class: turn ? 'turn' : '' },
    h('span.ball-dot', { style: { background: BALL_COLORS[i === view.me ? 0 : 1] } }),
    h('span.pc-text', {}, h('strong', {}, `${avatarOf(i)} ${playerName(i)}`), h('small', {}, `${p.done ? 'dans le trou ✔' : turn ? `joue son coup ${p.strokes + 1}` : p.strokes ? `${p.strokes} coup${p.strokes > 1 ? 's' : ''}` : 'au départ'} · total ${total} (${vsPar(total - parSoFar(view, p))})`)),
  );
}

function render() {
  const view = app.view;
  if (!view) {
    clear(root).append(...[banner(), h('div.splash', {}, 'Connexion à la partie…')].filter(Boolean));
    return;
  }
  document.body.dataset.screen = 'game';
  document.body.dataset.game = 'golf';
  const opp = app.summary?.opponent;
  const here = opp && (opp.bot || app.online.includes(opp.id)); // un robot est toujours là
  const shownHole = app.anim ? app.anim.shot.hole : view.hole;
  const hole = holeById(view.holes[Math.min(shownHole, view.holes.length - 1)]);
  const topbar = h(
    'header.topbar',
    {},
    h(
      'span.title',
      {},
      iconButton('back', 'Accueil', goHome),
      h('span.avatar', {}, opp?.avatar ?? '🙂', h('span.presence', { class: here ? 'on' : '', title: here ? 'En ligne' : 'Hors ligne' })),
      h('span.who', {}, h('strong', {}, `Trou ${shownHole + 1}/${view.holes.length} · Par ${hole.par}`), h('small', {}, `${hole.name} · ${hole.place}`)),
    ),
    h('span.tools', {}, h('button.small', { onClick: () => set({ card: true }) }, 'Carte'), iconButton('menu', 'Menu', () => set({ menu: true }))),
  );
  const stage = h('div.stage', {}, canvas);
  const nodes = [
    banner(),
    h(
      'main.screen.golf',
      {},
      topbar,
      h('div.golf-status', { class: myTurn() && !app.anim ? 'mine' : '' }, h('strong', {}, statusText())),
      stage,
      h('div.players', {}, playerChip(view, view.me), playerChip(view, 1 - view.me)),
    ),
  ];
  const ended = (view.phase === 'over' && !app.anim) || app.summary?.status === 'abandoned';
  if (ended && !app.peek) nodes.push(endSheet(view));
  else if (ended) nodes.push(h('button.primary.floating', { onClick: () => set({ peek: false }) }, 'Voir le bilan'));
  if (app.intro && !ended) {
    const { hole: ih, index, count } = app.intro;
    nodes.push(
      h(
        'div.intro',
        { onClick: () => set({ intro: null }) },
        h('div.intro-card', {}, h('small', {}, `Trou ${index + 1} sur ${count}`), h('h2', {}, ih.name), h('p', {}, `${ih.place} · Par ${ih.par}`), h('span.intro-flag')),
      ),
    );
  }
  if (app.card) nodes.push(sheet('Carte de score', [scoreTable(view), h('button.primary', { onClick: () => set({ card: false }) }, 'Fermer')], () => set({ card: false })));
  if (app.menu) nodes.push(menuSheet());
  if (app.rules) nodes.push(rulesSheet());
  clear(root).append(...nodes.filter(Boolean));
  // le plateau prend toute la place disponible, en gardant ses proportions
  const w = Math.floor(Math.min(stage.clientWidth, (stage.clientHeight * 100) / 160));
  if (w > 0 && w !== course.cssW) course.resize(w);
}

boot();
