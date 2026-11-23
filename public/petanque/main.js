// Pétanque à Quiberon dans la salle de jeux : le serveur simule chaque lancer, cette page vise,
// rejoue les lancers et anime la plage. URL : /petanque/?match=<id>

import { api, session as auth, Live, registerServiceWorker } from '/shared/api.js';
import { h, clear, toast } from '/shared/dom.js';
import { terrainById } from './terrains.js';
import { BOULES, BOULE_R, COCHONNET_R, SAMPLE_HZ, throwDistance, terrainFor } from './engine.js';
import { TerrainView } from './render.js';

const root = document.getElementById('app');
const matchId = new URLSearchParams(location.search).get('match');
const goHome = () => (location.href = '/');
const METERS = 0.0625; // 1 unité du plateau ≈ 6 cm

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
  mode: 'pointer',
  aim: null,
  anim: null, // { lt, base, start }
  queue: [],
  hold: null, // fin de mène : on garde les boules à l'écran un moment
  puffs: [],
  card: null, // carton (mène gagnée, nouvelle mène)
  menu: false,
  rules: false,
  peek: false,
};

const canvas = h('canvas.course', { 'aria-label': 'Terrain de pétanque' });
const view = new TerrainView(canvas);

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
      document.title = `Pétanque · ${msg.summary.opponent?.name ?? ''}`;
      const events = msg.events ?? [];
      if (events.some((e) => e.type === 'throw') && msg.view.lastThrow) enqueue(prev ?? msg.view, msg.view.lastThrow, events);
      else if (!prev) showMeneCard(msg.view);
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
  if (!app.live.send({ t: 'action', match: matchId, action })) return toast('Hors connexion : lancer non joué.', 'error');
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

const v = () => app.view;
const isBot = () => !!app.summary?.opponent?.bot;
const nameOf = (i) => (i === v().me ? 'Toi' : app.summary?.opponent?.name ?? 'L’adversaire');
const avatarOf = (i) => app.summary?.players?.[i]?.avatar ?? '🙂';
const flavor = (i) => (i === 0 ? 'chocolat' : 'caramel');

function throwText(lt, events) {
  const mine = lt.player === v().me;
  const who = mine ? '' : `${nameOf(lt.player)} : `;
  const ev = events.find((e) => e.type === 'throw');
  if (lt.mode === 'cochonnet') return ev?.ok ? { text: `${who}Le caramel est lancé ! 🍬`, kind: 'good' } : { text: `${who}Cochonnet hors zone, on recommence`, kind: 'bad' };
  const map = {
    carreau: ['CARREAU ! 💥 Kenavo la boule', 'great'],
    tir: ['Tir réussi, la boule part en croisière ⛵', 'good'],
    casquette: ['Casquette… à peine effleurée 🧢', 'bad'],
    trou: ['Dans le sable… les goélands rigolent 🐦', 'bad'],
    biberon: ['Biberon ! Collée au caramel 🍼', 'great'],
    point: [mine ? 'Tu prends le point 👌' : 'prend le point', 'good'],
    out: ['Boule perdue chez les baigneurs 🏖️', 'bad'],
    flaque: [`Plouf ! ${flavor(lt.player) === 'chocolat' ? 'Chocolat fondu' : 'Caramel mou'} dans la flaque 🫠`, 'bad'],
    'cochonnet-mort': ['Le cochonnet s’est fait la malle ! 🍬💨', 'bad'],
  };
  const m = map[lt.result];
  if (!m) return mine ? null : { text: `${nameOf(lt.player)} n’a pas le point`, kind: 'meh' };
  return { text: lt.result === 'point' && !mine ? `${nameOf(lt.player)} prend le point` : who + m[0], kind: m[1] };
}

function flash({ text, kind }, delay = 0) {
  setTimeout(() => {
    document.querySelector('.pq-flash')?.remove();
    const el = h('div.pq-flash', { class: kind, role: 'status' }, text);
    document.body.append(el);
    setTimeout(() => el.remove(), 2300);
  }, delay);
}

function showMeneCard(view) {
  if (view.phase === 'over') return;
  const t = terrainFor(view);
  app.card = { kind: 'mene', title: `Mène ${view.mene}`, sub: t.name, line: `${nameOf(view.starter)} ${view.starter === view.me ? 'lances' : 'lance'} le cochonnet`, until: performance.now() + 2400 };
  setTimeout(() => app.card && performance.now() >= app.card.until && set({ card: null }), 2500);
}

// ---------------------------------------------------------------------------- rejouer un lancer

function enqueue(base, lt, events) {
  app.aim = null;
  const item = { lt, base, events, view: app.view };
  if (app.anim) app.queue.push(item);
  else app.anim = { ...item, start: performance.now() };
}

/** Boules d'un lancer à l'instant f (en images). */
function ballsAt(item, f) {
  const { lt, base } = item;
  const frames = lt.frames;
  const i = Math.min(frames.length - 1, Math.floor(f));
  const j = Math.min(frames.length - 1, i + 1);
  const u = Math.min(1, f - i);
  const known = new Map(base.balls.map((b) => [b.id, b]));
  return lt.ids
    .map((id, k) => {
      const a = frames[i];
      const b = frames[j];
      if (a[1 + 2 * k] === null) return null;
      const x = b[1 + 2 * k] === null ? a[1 + 2 * k] : a[1 + 2 * k] + (b[1 + 2 * k] - a[1 + 2 * k]) * u;
      const y = b[2 + 2 * k] === null ? a[2 + 2 * k] : a[2 + 2 * k] + (b[2 + 2 * k] - a[2 + 2 * k]) * u;
      const thrown = k === lt.ids.length - 1;
      const z = thrown ? a[0] + (b[0] - a[0]) * u : 0;
      const kind = thrown ? (lt.mode === 'cochonnet' ? 'cochonnet' : 'boule') : known.get(id)?.kind;
      return { id, x, y, z, kind, owner: thrown ? (lt.mode === 'cochonnet' ? null : lt.player) : known.get(id)?.owner };
    })
    .filter(Boolean);
}

function finishReplay() {
  const item = app.anim;
  const next = app.queue.shift();
  app.anim = next ? { ...next, start: performance.now() + 700 } : null;
  const msg = throwText(item.lt, item.events);
  if (msg) flash(msg);
  const done = item.events.find((e) => e.type === 'meneDone');
  if (done) {
    const over = item.events.find((e) => e.type === 'over');
    const w = done.winner;
    app.hold = { balls: item.view.lastMene?.balls ?? [], until: performance.now() + 3200 };
    app.card = {
      kind: 'score',
      title: w === null ? 'Mène nulle' : `${w === v().me ? 'Tu marques' : `${nameOf(w)} marque`} ${done.points} point${done.points > 1 ? 's' : ''}`,
      sub: `${done.scores[v().me]} – ${done.scores[1 - v().me]}`,
      line: done.reason === 'cochonnet' ? 'Cochonnet mort' : over ? (over.fanny ? 'FANNY ! 13 à 0… 💋' : 'Fin de partie') : '',
      until: performance.now() + 3000,
    };
    if (app.anim) app.anim.start += 3200;
    setTimeout(() => {
      if (app.card?.kind === 'score') app.card = null;
      app.hold = null;
      if (!over && !app.anim) showMeneCard(app.view);
      render();
    }, 3100);
  }
  render();
}

// ---------------------------------------------------------------------------- boucle d'animation

function scoringIds(balls) {
  const c = balls.find((b) => b.kind === 'cochonnet');
  if (!c) return { ids: [] };
  const d = (b) => Math.hypot(b.x - c.x, b.y - c.y) - BOULE_R - COCHONNET_R;
  const best = [0, 1].map((p) => Math.min(Infinity, ...balls.filter((b) => b.owner === p).map(d)));
  if (best[0] === best[1]) return { ids: [] };
  const holder = best[0] < best[1] ? 0 : 1;
  return { ids: balls.filter((b) => b.owner === holder && d(b) < best[1 - holder]).map((b) => b.id), holder };
}

const t0 = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const s = v();
  if (!s || document.hidden) return;
  const t = (now - t0) / 1000;
  let balls;
  let terrain;
  if (app.anim) {
    const f = Math.max(0, ((now - app.anim.start) / 1000) * SAMPLE_HZ);
    terrain = terrainById(app.anim.lt.terrain);
    balls = ballsAt(app.anim, f);
    const thrown = balls.at(-1);
    // nuage de sable à l'atterrissage
    if (!app.anim.landed && thrown && thrown.z === 0 && f > 2) {
      app.anim.landed = true;
      app.puffs.push({ x: app.anim.lt.landing.x, y: app.anim.lt.landing.y, at: now });
    }
    if (f >= app.anim.lt.frames.length + 6) finishReplay();
  } else if (app.hold && now < app.hold.until) {
    terrain = terrainById(s.lastMene?.terrain ?? terrainFor(s).id);
    balls = app.hold.balls;
  } else {
    terrain = terrainFor(s);
    balls = s.balls;
  }
  view.setTerrain(terrain);
  app.puffs = app.puffs.filter((p) => now - p.at < 800);
  let aim = null;
  if (app.aim && canThrow()) aim = { angle: app.aim.angle, power: app.aim.power, mode: s.phase === 'cochonnet' ? 'cochonnet' : app.mode };
  const point = balls.some((b) => b.z) ? null : scoringIds(balls);
  view.draw({ t, balls, aim, point, puffs: app.puffs.map((p) => ({ ...p, age: (now - p.at) / 1000 })) });
}

const myTurn = () => v()?.phase !== 'over' && v()?.thrower === v()?.me && app.summary?.status === 'active';
const canThrow = () => myTurn() && !app.anim && !app.pending && app.status === 'open' && !(app.hold && performance.now() < app.hold.until);

// ---------------------------------------------------------------------------- visée au doigt (lance-pierre)

canvas.addEventListener('pointerdown', (e) => {
  if (!canThrow()) return;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
  app.aim = { start: view.toCourse(e.clientX, e.clientY), angle: -Math.PI / 2, power: 0 };
  hint();
});
canvas.addEventListener('pointermove', (e) => {
  if (!app.aim) return;
  e.preventDefault();
  const p = view.toCourse(e.clientX, e.clientY);
  const dx = app.aim.start.x - p.x;
  const dy = app.aim.start.y - p.y;
  const d = Math.hypot(dx, dy);
  app.aim.power = Math.min(1, d / 50);
  if (d > 0.5) app.aim.angle = Math.atan2(dy, dx);
  hint();
});
canvas.addEventListener('pointerup', () => {
  const a = app.aim;
  app.aim = null;
  hint();
  if (!a || !canThrow()) return;
  if (a.power < 0.03) return toast('Tire plus loin en arrière pour lancer.');
  send({ type: 'throw', mode: v().phase === 'cochonnet' ? 'cochonnet' : app.mode, angle: Math.round(a.angle * 1e4) / 1e4, power: Math.round(a.power * 1e3) / 1e3 });
});
canvas.addEventListener('pointercancel', () => {
  app.aim = null;
  hint();
});

function hint() {
  const el = document.querySelector('.pq-status strong');
  if (el) el.textContent = statusText();
}

function statusText() {
  const s = v();
  if (!s) return '';
  if (app.summary?.status === 'abandoned') return 'Partie abandonnée';
  if (s.phase === 'over') return s.winners[0] === s.players[s.me].id ? 'Tu as gagné ! Yec’hed mat 🍺' : `${nameOf(1 - s.me)} gagne… Kenavo 👋`;
  if (app.anim) return app.anim.lt.player === s.me ? 'Ta boule vole…' : `${nameOf(app.anim.lt.player)} lance…`;
  if (app.aim) {
    if (app.aim.power < 0.03) return 'Tire en arrière…';
    const m = (throwDistance(app.aim.power) * METERS).toFixed(1).replace('.', ',');
    return `≈ ${m} m · relâche pour ${s.phase === 'cochonnet' ? 'lancer le cochonnet' : app.mode === 'tirer' ? 'tirer' : 'pointer'}`;
  }
  if (app.pending) return 'Lancer envoyé…';
  if (myTurn()) {
    if (s.phase === 'cochonnet') return 'À toi de lancer le cochonnet 🍬 (entre les deux traits)';
    const holder = s.point?.holder;
    if (holder === 1 - s.me && s.left[1 - s.me] > 0) return `Tu n’as pas le point : à toi ! (${s.left[s.me]} boule${s.left[s.me] > 1 ? 's' : ''})`;
    return `À toi ! Il te reste ${s.left[s.me]} boule${s.left[s.me] > 1 ? 's' : ''}`;
  }
  return isBot() ? `${nameOf(s.thrower)} mesure… 📏` : `${nameOf(s.thrower)} joue…`;
}

// ---------------------------------------------------------------------------- feuilles

function sheet(title, content, onClose, cls = '') {
  return h('div.overlay', { class: cls, onClick: (e) => e.target === e.currentTarget && onClose?.() }, h('div.sheet', {}, title ? h('h2', {}, title) : null, ...content));
}

function rulesSheet() {
  return sheet(
    'Règles de la pétanque',
    [
      h(
        'ul.rules',
        {},
        h('li', {}, `Tête-à-tête, ${BOULES} boules chacun : chocolat contre caramel. Le cochonnet est un bonbon au caramel beurre salé.`),
        h('li', {}, 'Pour lancer : pose le doigt, tire en arrière comme un lance-pierre, relâche. La croix montre où la boule retombe, le rond où elle devrait s’arrêter.'),
        h('li', {}, '🎯 Pointer : la boule vole puis roule pour s’approcher du cochonnet. 💥 Tirer : elle vole presque jusqu’au bout et frappe fort pour chasser une boule (carreau si elle prend sa place).'),
        h('li', {}, 'Celui qui lance le cochonnet joue la première boule. Ensuite, joue toujours celui qui n’a pas le point, tant qu’il a des boules.'),
        h('li', {}, 'Une boule qui sort du terrain ou tombe dans une flaque est morte. Le sable dévie un tout petit peu chaque lancer.'),
        h('li', {}, 'Le gagnant de la mène marque une boule par boule mieux placée que la meilleure adverse, puis relance le cochonnet. Premier à 13 (ou 7) !'),
      ),
      h('button.primary', { onClick: () => set({ rules: false }) }, 'Trugarez, compris !'),
    ],
    () => set({ rules: false }),
  );
}

function endSheet(s) {
  const sum = app.summary;
  if (sum?.status === 'abandoned') {
    const who = sum.players.find((p) => p?.id === sum.abandonedBy)?.name ?? 'Un joueur';
    return sheet('Partie abandonnée', [h('p.notice', {}, `${who} a abandonné. Elle ne compte pas dans les scores.`), h('button.primary.big', { onClick: rematch }, 'Nouvelle partie'), h('button', { onClick: goHome }, 'Accueil')], null, 'round');
  }
  const won = s.winners[0] === s.players[s.me].id;
  const fanny = s.scores.includes(0);
  return sheet(
    won ? 'Yec’hed mat ! 🏆' : 'Kenavo… 👋',
    [
      h('p.pq-final', {}, h('span', {}, `🍫 ${nameOf(0)}`), h('strong', {}, `${s.scores[0]} – ${s.scores[1]}`), h('span', {}, `${nameOf(1)} 🍬`)),
      h('p.notice', {}, fanny ? (won ? 'Fanny ! Ton adversaire doit embrasser la Fanny 💋' : 'Fanny… il va falloir embrasser la Fanny 💋') : `${s.history.length} mènes sur les plages de Quiberon.`),
      h('button.primary.big', { onClick: rematch }, 'Revanche'),
      h('div.row', {}, h('button', { style: { flex: 1 }, onClick: () => set({ peek: true }) }, 'Voir le terrain'), h('button', { style: { flex: 1 }, onClick: goHome }, 'Accueil')),
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
      v()?.lastThrow ? h('button', { onClick: () => (enqueue(v(), v().lastThrow, []), set({ menu: false })) }, 'Revoir le dernier lancer') : null,
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

function side(s, i) {
  const left = s.phase === 'cochonnet' || s.phase === 'boules' ? s.left[i] : 0;
  return h(
    'div.pq-side',
    { class: [i === 0 ? 'choco' : 'cara', s.phase !== 'over' && s.thrower === i ? 'turn' : ''].join(' ') },
    h('span.pq-name', {}, `${avatarOf(i)} ${nameOf(i)}`),
    h('span.pq-boules', {}, Array.from({ length: BOULES }, (_, k) => h('i', { class: k < left ? '' : 'used' }))),
  );
}

function render() {
  const s = v();
  if (!s) {
    clear(root).append(...[banner(), h('div.splash', {}, 'Connexion à la partie…')].filter(Boolean));
    return;
  }
  document.body.dataset.screen = 'game';
  document.body.dataset.game = 'petanque';
  const opp = app.summary?.opponent;
  const here = opp && (opp.bot || app.online.includes(opp.id));
  const t = terrainFor(s);
  const topbar = h(
    'header.topbar',
    {},
    h(
      'span.title',
      {},
      iconButton('back', 'Accueil', goHome),
      h('span.avatar', {}, opp?.avatar ?? '🙂', h('span.presence', { class: here ? 'on' : '', title: here ? 'En ligne' : 'Hors ligne' })),
      h('span.who', {}, h('strong', {}, s.phase === 'over' ? 'Partie finie' : `Mène ${s.mene} · en ${s.target}`), h('small', {}, `${t.name} · Quiberon`)),
    ),
    iconButton('menu', 'Menu', () => set({ menu: true })),
  );
  const score = h('div.pq-score', {}, side(s, 0), h('div.pq-points', {}, h('b', {}, s.scores[0]), h('span', {}, '–'), h('b', {}, s.scores[1])), side(s, 1));
  const stage = h('div.stage', {}, canvas);
  const showModes = myTurn() && s.phase === 'boules' && !app.anim;
  const modes = showModes
    ? h(
        'div.pq-modes',
        {},
        h('button', { class: app.mode === 'pointer' ? 'on' : '', onClick: () => set({ mode: 'pointer' }) }, '🎯 Pointer'),
        h('button', { class: app.mode === 'tirer' ? 'on' : '', onClick: () => set({ mode: 'tirer' }) }, '💥 Tirer'),
      )
    : null;
  const nodes = [
    banner(),
    h('main.screen.pq', {}, topbar, score, h('div.pq-status', { class: myTurn() && !app.anim ? 'mine' : '' }, h('strong', {}, statusText())), stage, modes),
  ];
  const ended = (s.phase === 'over' && !app.anim && !app.card) || app.summary?.status === 'abandoned';
  if (ended && !app.peek) nodes.push(endSheet(s));
  else if (ended) nodes.push(h('button.primary.floating', { onClick: () => set({ peek: false }) }, 'Voir le bilan'));
  if (app.card && !ended) {
    const cd = app.card;
    nodes.push(h('div.intro', { onClick: () => set({ card: null }) }, h('div.intro-card', { class: cd.kind }, h('small', {}, cd.sub), h('h2', {}, cd.title), cd.line ? h('p', {}, cd.line) : null, h('span.intro-flag'))));
  }
  if (app.menu) nodes.push(menuSheet());
  if (app.rules) nodes.push(rulesSheet());
  clear(root).append(...nodes.filter(Boolean));
  const w = Math.floor(Math.min(stage.clientWidth, (stage.clientHeight * 100) / 160));
  if (w > 0 && w !== view.cssW) view.resize(w);
}

boot();
