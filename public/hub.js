// Accueil de la salle de jeux : profils, parties en cours, choix du jeu, scores et historique.

import { api, session, Live, ApiError, registerServiceWorker, isIos, isStandalone } from './shared/api.js';
import { h, clear, toast } from './shared/dom.js';

const root = document.getElementById('app');

const state = {
  hub: null, // { name, avatars, profiles, games, me }
  arcade: { upcoming: [] },
  me: null,
  matches: [],
  stats: { rivals: [], history: [] },
  sheet: null, // { type: 'pin', profile } | { type: 'create' } | { type: 'new', game } | { type: 'account' }
  busy: false,
};

let live = null;

// ---------------------------------------------------------------------------- données

async function loadHub() {
  const [hub, arcade] = await Promise.all([api('/api/hub'), fetch('/arcade.json').then((r) => r.json()).catch(() => ({ upcoming: [] }))]);
  state.hub = hub;
  state.arcade = arcade;
  state.me = hub.me;
  document.title = arcade.name ?? hub.name;
}

async function refresh() {
  if (!state.me) return;
  try {
    const [matches, stats] = await Promise.all([api('/api/matches'), api('/api/stats')]);
    state.matches = matches;
    state.stats = stats;
    const waiting = matches.filter((m) => m.status === 'active' && m.yourTurn).length;
    if ('setAppBadge' in navigator) (waiting ? navigator.setAppBadge(waiting) : navigator.clearAppBadge()).catch(() => {});
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return logout(false);
    toast(e.message, 'error');
  }
  render();
}

function startLive() {
  live?.close();
  live = new Live();
  live.on((ev) => {
    if (ev.type === 'message' && ev.msg.t === 'matches') refresh();
    if (ev.type === 'status' && ev.status === 'open') refresh();
  });
}

async function logout(callServer = true) {
  if (callServer) await api('/api/logout', { method: 'POST' }).catch(() => {});
  session.token = null;
  live?.close();
  live = null;
  state.me = null;
  state.sheet = null;
  await loadHub().catch(() => {});
  render();
}

async function signedIn({ token, profile }) {
  session.token = token;
  state.me = profile;
  state.sheet = null;
  startLive();
  await refresh();
}

// ---------------------------------------------------------------------------- actions

function openSheet(sheet) {
  state.sheet = sheet;
  render();
}

async function submit(fn) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    await fn();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    state.busy = false;
    render();
  }
}

const openMatch = (m) => (location.href = `${m.path}?match=${m.id}`);

// ---------------------------------------------------------------------------- écrans

const avatar = (p, cls = '') => h(`span.avatar-badge${cls ? '.' + cls : ''}`, {}, p?.avatar ?? '🙂');

function loginScreen() {
  const profiles = state.hub.profiles;
  return h(
    'main.screen.hub.login',
    {},
    h('div.brand', {}, h('div.brand-icon', { innerHTML: LOGO }), h('h1', {}, state.arcade.name ?? state.hub.name), h('p.tagline', {}, state.arcade.tagline ?? '')),
    profiles.length
      ? h(
          'section',
          {},
          h('h2.section-title', {}, 'Qui joue ?'),
          h(
            'div.profiles',
            {},
            profiles.map((p) => h('button.profile', { onClick: () => openSheet({ type: 'pin', profile: p }) }, avatar(p, 'big'), h('span', {}, p.name))),
            h('button.profile.add', { onClick: () => openSheet({ type: 'create' }) }, h('span.avatar-badge.big', {}, '+'), h('span', {}, 'Nouveau')),
          ),
        )
      : h(
          'section.panel',
          {},
          h('p', {}, 'Bienvenue ! Créez votre profil pour commencer. Il vous faut le code d’invitation de la salle.'),
          h('button.primary.big', { onClick: () => openSheet({ type: 'create' }) }, 'Créer mon profil'),
        ),
    installHint(),
  );
}

function installHint() {
  if (isStandalone() || !isIos()) return null;
  return h(
    'div.install',
    {},
    h('strong', {}, 'Astuce iPhone'),
    h('span', {}, ' : touchez ', h('span.share-icon', { innerHTML: SHARE_ICON }), ' Partager, puis « Sur l’écran d’accueil » pour avoir l’appli en un geste.'),
  );
}

function matchRow(m) {
  const tag = m.status !== 'active' ? null : m.yourTurn ? h('span.tag.go', {}, 'À toi !') : h('span.tag', {}, `À ${m.opponent?.name ?? '…'}`);
  return h(
    'button.match',
    { onClick: () => openMatch(m) },
    h('span.game-chip', { style: { '--c': gameOf(m.game)?.color ?? '#888' } }, m.emoji ?? '🎲'),
    h('span.match-text', {}, h('strong', {}, `${m.gameName}`), h('small', {}, `contre ${m.opponent?.name ?? '?'} · ${m.label}`)),
    tag,
  );
}

const gameOf = (id) => state.hub.games.find((g) => g.id === id);

function homeScreen() {
  const active = state.matches.filter((m) => m.status === 'active').sort((a, b) => b.yourTurn - a.yourTurn || b.updatedAt - a.updatedAt);
  const games = state.hub.games;
  return h(
    'main.screen.hub.home',
    {},
    h(
      'header.hub-head',
      {},
      h('div', {}, h('h1', {}, state.arcade.name ?? state.hub.name), h('p.tagline', {}, `Salut ${state.me.name} !`)),
      h('button.me', { 'aria-label': 'Mon compte', onClick: () => openSheet({ type: 'account' }) }, avatar(state.me)),
    ),
    installHint(),
    h(
      'section',
      {},
      h('h2.section-title', {}, 'Parties en cours'),
      active.length ? h('div.list', {}, active.map(matchRow)) : h('p.empty', {}, 'Aucune partie en cours : choisis un jeu ci-dessous.'),
    ),
    h(
      'section',
      {},
      h('h2.section-title', {}, 'Jouer'),
      h(
        'div.games',
        {},
        games.map((g) =>
          h(
            'button.game',
            { style: { '--c': g.color }, onClick: () => openSheet({ type: 'new', game: g, options: defaults(g) }) },
            h('span.game-emoji', {}, g.emoji),
            h('strong', {}, g.name),
            h('small', {}, g.description),
          ),
        ),
        (state.arcade.upcoming ?? []).map((g) =>
          h('div.game.soon', { style: { '--c': g.color } }, h('span.game-emoji', {}, g.emoji), h('strong', {}, g.name), h('small', {}, 'Bientôt')),
        ),
      ),
    ),
    scoresSection(),
  );
}

function scoresSection() {
  const { rivals, history } = state.stats;
  if (!rivals.length) return h('section', {}, h('h2.section-title', {}, 'Scores'), h('p.empty', {}, 'Les victoires apparaîtront ici après votre première partie.'));
  return h(
    'section',
    {},
    h('h2.section-title', {}, 'Scores'),
    rivals.map((r) =>
      h(
        'div.panel.rival',
        {},
        h(
          'div.versus',
          {},
          h('div.side-score', {}, avatar(state.me, 'big'), h('span.big-num', {}, r.wins), h('small', {}, 'Moi')),
          h('span.vs', {}, r.draws ? `${r.draws} nul${r.draws > 1 ? 's' : ''}` : '–'),
          h('div.side-score', {}, avatar(r.opponent, 'big'), h('span.big-num', {}, r.losses), h('small', {}, r.opponent?.name ?? '?')),
        ),
        h(
          'table.per-game',
          {},
          r.byGame.map((g) => h('tr', {}, h('td', {}, g.gameName), h('td', {}, `${g.wins} – ${g.losses}`), h('td.dim', {}, `${g.played} partie${g.played > 1 ? 's' : ''}`))),
        ),
      ),
    ),
    h('h2.section-title', {}, 'Historique'),
    h(
      'ol.history',
      {},
      history.slice(0, 20).map((m) => {
        const won = m.result?.winners?.length === 1 && m.result.winners[0] === state.me.id;
        const draw = (m.result?.winners?.length ?? 0) !== 1;
        const scores = m.players.map((p) => `${p?.name ?? '?'} ${m.result?.scores?.[p?.id] ?? ''}`).join(' · ');
        return h(
          'li',
          { onClick: () => openMatch(m) },
          h('span.result', { class: draw ? 'draw' : won ? 'won' : 'lost' }, draw ? 'Égalité' : won ? 'Gagnée' : 'Perdue'),
          h('span.hist-text', {}, h('strong', {}, m.gameName), h('small', {}, scores)),
          h('time', {}, new Date(m.finishedAt ?? m.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })),
        );
      }),
    ),
  );
}

const defaults = (g) => Object.fromEntries((g.options ?? []).map((o) => [o.key, structuredClone(o.default)]));

// ---------------------------------------------------------------------------- feuilles

function sheetEl(title, content, { onClose = () => openSheet(null) } = {}) {
  return h(
    'div.overlay',
    { onClick: (e) => e.target === e.currentTarget && onClose() },
    h('div.sheet', {}, h('div.sheet-head', {}, h('h2', {}, title), h('button.icon', { 'aria-label': 'Fermer', onClick: onClose }, '✕')), content),
  );
}

function pinSheet({ profile }) {
  const input = h('input.pin', {
    type: 'password',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    autocomplete: 'current-password',
    maxlength: 8,
    placeholder: '••••',
    'aria-label': 'Code PIN',
  });
  const go = () =>
    submit(async () => {
      const res = await api('/api/login', { method: 'POST', body: { profileId: profile.id, pin: input.value } });
      await signedIn(res);
    });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  setTimeout(() => input.focus(), 50);
  return sheetEl(`${profile.avatar} ${profile.name}`, [
    h('label.field', {}, 'Code PIN', input),
    h('button.primary.big', { disabled: state.busy, onClick: go }, 'Entrer'),
  ]);
}

function createSheet() {
  const avatars = state.hub.avatars;
  const taken = new Set(state.hub.profiles.map((p) => p.avatar));
  let chosen = avatars.find((a) => !taken.has(a)) ?? avatars[0];
  const name = h('input', { maxlength: 20, autocomplete: 'nickname', placeholder: 'Prénom' });
  const pin = h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 8, autocomplete: 'new-password', placeholder: '4 à 8 chiffres' });
  const invite = h('input', { autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Donné par l’administrateur' });
  const picker = h(
    'div.avatar-picker',
    {},
    avatars.map((a) =>
      h(
        'button.avatar-choice',
        {
          class: a === chosen ? 'on' : '',
          'aria-label': `Avatar ${a}`,
          onClick: (e) => {
            chosen = a;
            picker.querySelectorAll('.avatar-choice').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
          },
        },
        a,
      ),
    ),
  );
  const go = () =>
    submit(async () => {
      const res = await api('/api/profiles', { method: 'POST', body: { name: name.value, avatar: chosen, pin: pin.value, invite: invite.value.trim() } });
      await loadHub();
      await signedIn(res);
    });
  setTimeout(() => name.focus(), 50);
  return sheetEl('Nouveau joueur', [
    h('label.field', {}, 'Prénom', name),
    h('div.field', {}, 'Avatar', picker),
    h('label.field', {}, 'Code PIN (pour te reconnecter)', pin),
    h('label.field', {}, 'Code d’invitation', invite),
    h('button.primary.big', { disabled: state.busy, onClick: go }, 'Créer mon profil'),
  ]);
}

function newMatchSheet(sheet) {
  const { game, options } = sheet;
  const others = state.hub.profiles.filter((p) => p.id !== state.me.id);
  sheet.opponent ??= others.length === 1 ? others[0].id : null;
  const optionFields = (game.options ?? []).map((o) => {
    if (o.type === 'select') {
      return h(
        'label.field',
        {},
        o.label,
        h(
          'select',
          { onChange: (e) => (options[o.key] = Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) },
          o.choices.map((c) => h('option', { value: c.value, selected: c.value === options[o.key] }, c.label)),
        ),
      );
    }
    if (o.type === 'multi') {
      return h(
        'div.field',
        {},
        o.label,
        h(
          'div.checks',
          {},
          o.choices.map((c) =>
            h(
              'label.check',
              {},
              h('input', {
                type: 'checkbox',
                checked: options[o.key].includes(c.value),
                onChange: (e) => {
                  const set = new Set(options[o.key]);
                  e.target.checked ? set.add(c.value) : set.delete(c.value);
                  options[o.key] = o.choices.map((x) => x.value).filter((v) => set.has(v));
                },
              }),
              h('span', {}, h('strong', {}, c.label), c.description ? h('small', {}, c.description) : null),
            ),
          ),
        ),
      );
    }
    return null;
  });
  const go = () =>
    submit(async () => {
      if (!sheet.opponent) throw new Error('Choisis ton adversaire.');
      const m = await api('/api/matches', { method: 'POST', body: { game: game.id, opponent: sheet.opponent, options } });
      openMatch(m);
    });
  return sheetEl(`${game.emoji} ${game.name}`, [
    others.length
      ? h(
          'div.field',
          {},
          'Adversaire',
          h(
            'div.opponents',
            {},
            others.map((p) =>
              h(
                'button.opponent',
                {
                  class: sheet.opponent === p.id ? 'on' : '',
                  onClick: () => {
                    sheet.opponent = p.id;
                    render();
                  },
                },
                avatar(p),
                p.name,
              ),
            ),
          ),
        )
      : h('p.notice', {}, 'Personne d’autre n’a encore de profil : envoie le lien et le code d’invitation à ton adversaire.'),
    ...optionFields,
    h('button.primary.big', { disabled: state.busy || !others.length, onClick: go }, 'Lancer la partie'),
  ]);
}

function accountSheet() {
  return sheetEl(`${state.me.avatar} ${state.me.name}`, [
    h('p.small', {}, 'Ton profil reste connecté sur cet appareil.'),
    h('button.danger', { onClick: () => logout() }, 'Se déconnecter'),
  ]);
}

// ---------------------------------------------------------------------------- rendu

function render() {
  const nodes = [];
  if (!state.hub) nodes.push(h('div.splash', {}, 'Chargement…'));
  else nodes.push(state.me ? homeScreen() : loginScreen());
  const s = state.sheet;
  if (s?.type === 'pin') nodes.push(pinSheet(s));
  if (s?.type === 'create') nodes.push(createSheet());
  if (s?.type === 'new') nodes.push(newMatchSheet(s));
  if (s?.type === 'account') nodes.push(accountSheet());
  // ne pas reconstruire une feuille de saisie pendant qu'on tape
  const focused = document.activeElement;
  if (focused?.tagName === 'INPUT' && focused.closest('.sheet') && s && ['pin', 'create'].includes(s.type) && root.querySelector('.sheet')) {
    root.querySelector('.sheet button.primary')?.toggleAttribute('disabled', state.busy);
    return;
  }
  clear(root).append(...nodes);
}

const LOGO = `<svg viewBox="0 0 100 100"><rect x="13" y="36" width="34" height="44" rx="5" fill="#5b8cff" transform="rotate(-17 30 58)"/><rect x="53" y="36" width="34" height="44" rx="5" fill="#f26b6b" transform="rotate(17 70 58)"/><rect x="33" y="30" width="34" height="44" rx="5" fill="#f3e04f"/></svg>`;
const SHARE_ICON = `<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;

async function boot() {
  registerServiceWorker();
  try {
    await loadHub();
  } catch (e) {
    clear(root).append(h('main.screen.hub', {}, h('h1', {}, 'Serveur injoignable'), h('p', {}, e.message), h('button', { onClick: () => location.reload() }, 'Réessayer')));
    return;
  }
  if (state.me) {
    startLive();
    await refresh();
  } else {
    if (session.token) session.token = null;
    render();
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());
}

boot();
