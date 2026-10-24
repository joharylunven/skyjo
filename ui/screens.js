// Écrans hors partie : accueil, lobby, règles.

import { h } from './dom.js';

const LOGO = `<svg viewBox="0 0 120 90" aria-hidden="true">
  <g transform="rotate(-14 60 80)"><rect x="10" y="14" width="40" height="50" rx="7" fill="#5b8cff"/><text x="30" y="47" font-size="20" font-weight="500" text-anchor="middle" fill="#14161b">-2</text></g>
  <g transform="rotate(14 60 80)"><rect x="70" y="14" width="40" height="50" rx="7" fill="#f26b6b"/><text x="90" y="47" font-size="20" font-weight="500" text-anchor="middle" fill="#14161b">12</text></g>
  <g><rect x="40" y="6" width="40" height="50" rx="7" fill="#f3e04f"/><text x="60" y="39" font-size="22" font-weight="500" text-anchor="middle" fill="#14161b">5</text></g>
</svg>`;

export function homeScreen({ cfg, name, joinCode, saved, onCreate, onJoin, onResume, onForget, onRules }) {
  const nameInput = h('input', { id: 'name', value: name ?? '', maxlength: 20, autocomplete: 'nickname', placeholder: 'Votre pseudo', enterkeyhint: 'done' });
  const codeInput = h('input.code', {
    id: 'code',
    value: joinCode ?? '',
    maxlength: 8,
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'CODE',
    enterkeyhint: 'go',
  });
  const getName = () => {
    const v = nameInput.value.trim();
    if (!v) {
      nameInput.focus();
      nameInput.classList.add('shake');
      setTimeout(() => nameInput.classList.remove('shake'), 400);
      return null;
    }
    return v;
  };
  const join = () => {
    const n = getName();
    if (n && codeInput.value.trim()) onJoin(n, codeInput.value);
    else if (n) codeInput.focus();
  };
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());

  return h(
    'main.screen.home',
    {},
    h('div.logo', { innerHTML: LOGO }),
    h('h1', {}, cfg.game.name),
    h('p.tagline', {}, cfg.game.tagline),
    saved
      ? h(
          'div.panel.resume',
          {},
          h('p', {}, `Partie en cours (salle ${saved.code}, ${saved.role === 'host' ? 'hôte' : 'invité'}).`),
          h('div.row', {}, h('button.primary', { onClick: onResume }, 'Reprendre'), h('button.ghost', { onClick: onForget }, 'Abandonner')),
        )
      : null,
    h(
      'div.panel',
      {},
      h('label', { for: 'name' }, 'Pseudo'),
      nameInput,
      h('button.primary.big', { onClick: () => getName() && onCreate(getName()) }, 'Créer une salle'),
      h('div.or', {}, 'ou rejoindre avec un code'),
      h('div.row', {}, codeInput, h('button.secondary', { onClick: join }, 'Rejoindre')),
    ),
    h('button.link', { onClick: onRules }, 'Règles du jeu'),
  );
}

export function lobbyScreen({ cfg, session, shareUrl, onShare, onToggleAddon, onThreshold, onStart, onLeave }) {
  const isHost = session.role === 'host';
  const lobby = isHost ? session._publicLobby() : session.lobby;
  const status = session.status;
  const players = lobby?.players ?? [];
  const ready = players.length >= 2 && players.every((p) => p.connected);

  const addonList = cfg.addons.available.map((id) => {
    const m = cfg.modules[id];
    const on = lobby?.addons?.includes(id);
    return h(
      'label.addon',
      { class: on ? 'on' : '' },
      h('input', { type: 'checkbox', checked: on, disabled: !isHost, onChange: (e) => onToggleAddon(id, e.target.checked) }),
      h('span', {}, h('strong', {}, m.name ?? id), h('small', {}, m.description ?? '')),
    );
  });

  const choices = [...new Set([...(cfg.game.endThresholdChoices ?? []), lobby?.endThreshold ?? 100])].sort((a, b) => a - b);

  return h(
    'main.screen.lobby',
    {},
    h('h2', {}, isHost ? 'Votre salle' : 'Salle'),
    h(
      'div.panel.room',
      {},
      h('div.room-code', { 'aria-label': 'Code de la salle' }, session.code),
      isHost ? h('p.small', {}, 'Envoyez ce code ou le lien à votre adversaire.') : null,
      isHost ? h('button.secondary', { onClick: onShare }, navigator.share ? 'Partager le lien' : 'Copier le lien') : null,
      isHost ? h('p.share-url', {}, shareUrl) : null,
    ),
    status !== 'open' ? h('p.notice', {}, session.notice ?? 'Connexion…') : null,
    h(
      'div.panel',
      {},
      h('h3', {}, 'Joueurs'),
      h(
        'ul.players',
        {},
        players.map((p) => h('li', {}, h('span.dot', { class: p.connected ? 'on' : '' }), p.name, p.id === session.me ? h('em', {}, ' (vous)') : null)),
        players.length < 2 ? h('li.waiting', {}, h('span.dot'), 'En attente d’un adversaire…') : null,
      ),
    ),
    h(
      'div.panel',
      {},
      h('h3', {}, 'Options'),
      h(
        'label.threshold',
        {},
        'Fin de partie à ',
        h(
          'select',
          { disabled: !isHost, onChange: (e) => onThreshold(Number(e.target.value)) },
          choices.map((v) => h('option', { value: v, selected: v === lobby?.endThreshold }, String(v))),
        ),
        ' points',
      ),
      addonList.length ? h('div.addons', {}, addonList) : h('p.small', {}, 'Aucun add-on disponible.'),
    ),
    isHost
      ? h('button.primary.big', { disabled: !ready || status !== 'open', onClick: onStart }, ready ? 'Lancer la partie' : 'En attente du 2e joueur')
      : h('p.notice', {}, 'L’hôte va lancer la partie…'),
    h('button.ghost', { onClick: onLeave }, 'Quitter'),
  );
}

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
