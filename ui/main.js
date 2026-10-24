// Point d'entrée de l'application : charge la config, gère les sessions et choisit l'écran.

import { HostSession, GuestSession, transportFactory, makeRoomCode, normalizeRoomCode, makeClientId } from '../net/index.js';
import { loadConfig } from './config.js';
import { initCards } from './cards.js';
import { h, clear, toast } from './dom.js';
import { createStorage } from './storage.js';
import { homeScreen, lobbyScreen, rulesDialog } from './screens.js';
import { boardScreen, animate } from './board.js';

const SESSION_MAX_AGE = 24 * 3600 * 1000;
const root = document.getElementById('app');

const app = {
  cfg: null,
  session: null,
  storage: null,
  prefs: createStorage('local'),
  createTransport: null,
  transportKind: 'peerjs',
  ui: { picking: null, pending: false, showLog: false, showScores: false, showMenu: false, showRules: false },
  lastStateKey: null,
};

// ---------------------------------------------------------------------------- démarrage

async function boot() {
  try {
    app.cfg = await loadConfig();
  } catch (e) {
    clear(root).append(h('main.screen', {}, h('h1', {}, 'Erreur'), h('p', {}, e.message)));
    return;
  }
  const { cfg } = app;
  document.title = cfg.game.name;
  initCards(cfg.cards, cfg.modules);

  const params = new URLSearchParams(location.search);
  app.transportKind = params.get('transport') ?? cfg.network.transport ?? 'peerjs';
  app.createTransport = transportFactory(cfg.network, app.transportKind);
  // Transport local : deux onglets du même navigateur => une session par onglet.
  app.storage = app.transportKind === 'local' ? createStorage('session') : createStorage('local');

  if (params.has('debug')) globalThis.__douze = app; // inspection depuis la console
  registerServiceWorker();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && app.session?.wake?.());
  window.addEventListener('online', () => app.session?.wake?.());
  window.addEventListener('hashchange', () => !app.session && render());
  // Fermer proprement la connexion au déchargement : l'autre joueur le voit tout de suite et le
  // serveur PeerJS libère l'identifiant de salle (utile quand l'hôte recharge la page).
  // La sauvegarde locale n'est pas effacée : la partie reprend au retour.
  window.addEventListener('pagehide', () => app.session?.transport?.close());
  window.addEventListener('pageshow', (e) => e.persisted && location.reload());

  const saved = savedSession();
  const hashCode = joinCodeFromHash();
  if (saved && (!hashCode || hashCode === saved.code)) resume(saved);
  else render();
}

function joinCodeFromHash() {
  const m = location.hash.match(/join=([A-Za-z0-9]+)/);
  return m ? normalizeRoomCode(m[1]) : null;
}

function savedSession() {
  const s = app.storage.get('session');
  if (!s || !s.code || Date.now() - (s.ts ?? 0) > SESSION_MAX_AGE) return null;
  return s;
}

function clientId() {
  let id = app.storage.get('clientId');
  if (!id) {
    id = makeClientId();
    app.storage.set('clientId', id);
  }
  return id;
}

function hostSettings() {
  const { game, cards, addons } = app.cfg;
  return {
    rules: game.rules,
    deck: cards.deck,
    addons: addons.enabled,
    available: addons.available,
    addonOptions: addons.options ?? {},
    endThreshold: game.rules.endThreshold ?? 100,
  };
}

function shareUrl(code) {
  const base = location.href.split('#')[0];
  return `${base}#join=${code}`;
}

// ---------------------------------------------------------------------------- sessions

function bind(session) {
  app.session = session;
  app.ui = { ...app.ui, picking: null, pending: false };
  session.onUpdate((u) => {
    if (app.session !== session) return;
    if (u.kind === 'state' || u.kind === 'error') app.ui.pending = false;
    if (u.kind === 'error') toast(u.error.message, 'error');
    render(u.kind === 'state' ? u.events : null);
  });
}

async function createRoom(name) {
  app.prefs.set('name', name);
  const session = new HostSession({
    createTransport: app.createTransport,
    code: makeRoomCode(),
    name,
    clientId: clientId(),
    settings: hostSettings(),
    store: app.storage.sessionStore,
  });
  bind(session);
  render();
  try {
    await session.open();
  } catch (e) {
    fail(e);
  }
}

async function joinRoom(name, rawCode) {
  const code = normalizeRoomCode(rawCode);
  if (code.length < 4) return toast('Code de salle invalide.', 'error');
  app.prefs.set('name', name);
  const session = new GuestSession({ createTransport: app.createTransport, code, name, clientId: clientId(), store: app.storage.sessionStore });
  bind(session);
  render();
  try {
    await session.open();
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) {
    fail(e);
  }
}

async function resume(saved) {
  let session;
  if (saved.role === 'host') {
    session = new HostSession({
      createTransport: app.createTransport,
      code: saved.code,
      name: saved.lobby?.players?.[0]?.name,
      clientId: saved.clientId ?? clientId(),
      settings: hostSettings(),
      store: app.storage.sessionStore,
      saved,
    });
  } else {
    session = new GuestSession({ createTransport: app.createTransport, code: saved.code, name: saved.name, clientId: saved.clientId ?? clientId(), store: app.storage.sessionStore });
  }
  bind(session);
  render();
  try {
    await session.open({ resume: true });
  } catch (e) {
    fail(e);
  }
}

function fail(e) {
  console.error(e);
  app.session?.transport?.close?.();
  app.session = null;
  toast(e.message ?? String(e), 'error');
  render();
}

function leave() {
  const s = app.session;
  const msg = s?.role === 'host' && s.started ? 'Quitter ferme la salle pour votre adversaire. Continuer ?' : 'Quitter la partie ?';
  if (s && s.status !== 'closed' && !confirm(msg)) return;
  s?.leave();
  app.session = null;
  app.ui = { ...app.ui, showMenu: false, showLog: false, showScores: false, picking: null };
  render();
}

function act(action) {
  const s = app.session;
  if (!s || app.ui.pending) return;
  const res = s.act(action);
  if (res?.error) return toast(res.error.message, 'error');
  if (res?.pending) {
    app.ui.pending = true;
    render();
  }
}

function setUi(patch) {
  Object.assign(app.ui, patch);
  render();
}

async function share() {
  const url = shareUrl(app.session.code);
  const text = `Rejoins-moi sur ${app.cfg.game.name} ! Code : ${app.session.code}`;
  try {
    if (navigator.share) await navigator.share({ title: app.cfg.game.name, text, url });
    else {
      await navigator.clipboard.writeText(url);
      toast('Lien copié !');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Partage impossible : copiez le code.', 'error');
  }
}

// ---------------------------------------------------------------------------- rendu

function banner(session) {
  if (!session?.notice) return null;
  const kind = session.status === 'closed' || session.status === 'error' ? 'error' : session.status === 'open' ? 'info' : 'warn';
  return h(
    'div.banner',
    { class: kind, role: 'alert' },
    h('span', {}, session.notice),
    session.status === 'closed' || session.status === 'reconnecting'
      ? h('button.small', { onClick: () => (session.status === 'closed' ? (app.session = null, render()) : leave()) }, session.status === 'closed' ? 'Accueil' : 'Abandonner')
      : null,
  );
}

function render(events = null) {
  const { cfg, session } = app;
  const nodes = [];
  if (!session) {
    document.body.dataset.screen = 'home';
    const saved = savedSession();
    nodes.push(
      homeScreen({
        cfg,
        name: app.prefs.get('name', ''),
        joinCode: joinCodeFromHash(),
        saved,
        onCreate: createRoom,
        onJoin: joinRoom,
        onResume: () => resume(saved),
        onForget: () => (app.storage.sessionStore.clear(), render()),
        onRules: () => setUi({ showRules: true }),
      }),
    );
  } else {
    const view = session.view;
    const inGame = view && (session.role === 'host' ? session.started : session.started || !session.lobby);
    document.body.dataset.screen = inGame ? 'game' : 'lobby';
    nodes.push(banner(session));
    if (inGame) {
      nodes.push(
        ...boardScreen({
          view,
          session,
          cfg,
          ui: app.ui,
          act,
          setUi,
          onLeave: leave,
          onRematch: () => session.rematch(),
          onRules: () => setUi({ showRules: true }),
        }),
      );
    } else {
      nodes.push(
        lobbyScreen({
          cfg,
          session,
          shareUrl: shareUrl(session.code),
          onShare: share,
          onToggleAddon: (id, on) => {
            const set = new Set(session.lobby.addons);
            on ? set.add(id) : set.delete(id);
            session.setOptions({ addons: cfg.addons.available.filter((a) => set.has(a)) });
          },
          onThreshold: (v) => session.setOptions({ endThreshold: v }),
          onStart: () => {
            const res = session.start();
            if (res?.error) toast(res.error.message, 'error');
          },
          onLeave: leave,
        }),
      );
    }
  }
  if (app.ui.showRules) nodes.push(rulesDialog({ cfg, onClose: () => setUi({ showRules: false }) }));
  clear(root).append(...nodes.filter(Boolean));
  if (events?.length && session?.view) animate(root, events, session.view.me);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('nosw')) return;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker non enregistré', e));
}

boot();
