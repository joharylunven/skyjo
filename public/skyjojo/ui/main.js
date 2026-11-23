// Skyjojo dans la salle de jeux : le serveur arbitre la partie, cette page affiche la vue du joueur
// et envoie ses coups. URL : /skyjojo/?match=<id>

import { api, session as auth, Live, registerServiceWorker } from '../../shared/api.js';
import { loadConfig } from './config.js';
import { initCards } from './cards.js';
import { h, clear, toast } from './dom.js';
import { rulesDialog } from './screens.js';
import { boardScreen, animate, addonActions } from './board.js';

const root = document.getElementById('app');
const matchId = new URLSearchParams(location.search).get('match');
const goHome = () => (location.href = '/');

const app = {
  cfg: null,
  live: null,
  ui: { picking: null, pending: false, showLog: false, showScores: false, showMenu: false, showRules: false, peekBoard: false },
  // Interface attendue par board.js
  session: {
    role: 'player',
    status: 'connecting',
    notice: null,
    view: null,
    summary: null,
    online: [],
    act: (action) => act(action),
  },
};

async function boot() {
  if (!auth.token || !matchId) return goHome();
  registerServiceWorker();
  try {
    app.cfg = await loadConfig();
  } catch (e) {
    return fatal(e.message);
  }
  initCards(app.cfg.cards, app.cfg.modules);

  const live = new Live();
  app.live = live;
  live.on((ev) => {
    if (ev.type === 'status') {
      app.session.status = ev.status;
      app.session.notice =
        ev.status === 'reconnecting' ? 'Connexion perdue — reconnexion…' : ev.status === 'closed' ? 'Session expirée : reconnectez-vous depuis l’accueil.' : null;
      if (ev.status !== 'open') app.ui.pending = false;
      render();
      return;
    }
    const msg = ev.msg;
    if (msg.t === 'match' && msg.summary.id === matchId) {
      app.session.view = msg.view;
      app.session.summary = msg.summary;
      app.ui.pending = false;
      if (!['roundOver', 'gameOver'].includes(msg.view.phase)) app.ui.peekBoard = false;
      document.title = `Skyjojo · ${msg.summary.opponent?.name ?? ''}`;
      render(msg.events);
    } else if (msg.t === 'presence' && msg.match === matchId) {
      app.session.online = msg.online;
      render();
    } else if (msg.t === 'error') {
      app.ui.pending = false;
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
  if (app.ui.pending) return;
  if (!app.live.send({ t: 'action', match: matchId, action })) return toast('Hors connexion : coup non envoyé.', 'error');
  app.ui.pending = true;
  render();
}

function setUi(patch) {
  Object.assign(app.ui, patch);
  render();
}

async function rematch() {
  const s = app.session.summary;
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

function banner() {
  const s = app.session;
  if (!s.notice) return null;
  return h('div.banner', { class: s.status === 'closed' ? 'error' : 'warn', role: 'alert' }, h('span', {}, s.notice), s.status === 'closed' ? h('button.small', { onClick: goHome }, 'Accueil') : null);
}

/** Une action « auto » n'a de sens que s'il existe au moins une carte à toucher (sinon on bloquerait). */
function hasTarget(view, def) {
  const step = def.picks?.[0];
  if (!step) return true;
  return view.players.some((pl, owner) => pl.grid.some((slot, index) => step.filter({ slot, owner, index, view, picks: [] })));
}

function render(events = null) {
  const { cfg, session } = app;
  const view = session.view;
  if (!view) {
    clear(root).append(banner() ?? '', h('div.splash', {}, 'Connexion à la partie…'));
    return;
  }
  document.body.dataset.screen = 'game';
  // Actions d'add-on « auto » (ex. coup d'œil du 13) : le mode sélection s'ouvre tout seul.
  const playing = session.summary?.status === 'active';
  const auto = playing ? addonActions(view, cfg.modules).find((d) => d.auto && hasTarget(view, d)) : null;
  if (auto && !app.ui.picking && !app.ui.pending) app.ui.picking = { def: auto, picks: [] };
  if (app.ui.picking?.def.auto && !auto) app.ui.picking = null;

  const nodes = [
    banner(),
    ...boardScreen({
      view,
      session,
      cfg,
      ui: app.ui,
      act,
      setUi,
      onHome: goHome,
      onAbandon: abandon,
      onRematch: rematch,
      onRules: () => setUi({ showRules: true, showMenu: false }),
    }),
  ];
  if (app.ui.showRules) nodes.push(rulesDialog({ cfg, onClose: () => setUi({ showRules: false }) }));
  clear(root).append(...nodes.filter(Boolean));
  if (events?.length) animate(root, events, view.me);
}

boot();
