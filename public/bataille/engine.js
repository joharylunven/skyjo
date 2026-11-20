// Bataille navale : moteur pur et déterministe, partagé par le serveur (arbitre) et la page
// (aperçu du placement). Aucun accès au DOM ni au réseau.
//
// Phases : placement (chacun place sa flotte en secret) → battle (tirs) → over.
// Les navires ne peuvent ni se chevaucher ni se toucher, même en diagonale.

export const FLEETS = {
  10: [
    { id: 'porte-avions', name: 'Porte-avions', len: 5 },
    { id: 'croiseur', name: 'Croiseur', len: 4 },
    { id: 'contre-torpilleur', name: 'Contre-torpilleur', len: 3 },
    { id: 'sous-marin', name: 'Sous-marin', len: 3 },
    { id: 'torpilleur', name: 'Torpilleur', len: 2 },
  ],
  8: [
    { id: 'croiseur', name: 'Croiseur', len: 4 },
    { id: 'contre-torpilleur', name: 'Contre-torpilleur', len: 3 },
    { id: 'sous-marin', name: 'Sous-marin', len: 3 },
    { id: 'torpilleur', name: 'Torpilleur', len: 2 },
  ],
};

export const SIZES = Object.keys(FLEETS).map(Number);
export const RULES = ['alternate', 'again'];

const LETTERS = 'ABCDEFGHIJ';
/** Nom d'une case : (1, 6) -> « B7 ». */
export const cellName = (x, y) => `${LETTERS[x]}${y + 1}`;

/** Cases occupées par un navire placé `{ id, x, y, dir }`. */
export function shipCells(ship, fleet) {
  const len = fleet.find((f) => f.id === ship.id).len;
  return Array.from({ length: len }, (_, i) => (ship.dir === 'v' ? [ship.x, ship.y + i] : [ship.x + i, ship.y]));
}

/** Vérifie une flotte. Renvoie null si elle est valable, sinon un message. */
export function validateFleet(ships, size, fleet) {
  if (!Array.isArray(ships) || ships.length !== fleet.length) return 'Il faut placer toute la flotte.';
  const ids = new Set();
  const taken = new Map(); // "x,y" -> id
  for (const s of ships) {
    if (!s || !fleet.some((f) => f.id === s.id) || ids.has(s.id)) return 'Flotte inconnue.';
    ids.add(s.id);
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || !['h', 'v'].includes(s.dir)) return 'Position invalide.';
    for (const [x, y] of shipCells(s, fleet)) {
      if (x < 0 || y < 0 || x >= size || y >= size) return 'Un navire dépasse de la grille.';
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const other = taken.get(`${x + dx},${y + dy}`);
          if (other && other !== s.id) return 'Les navires ne doivent pas se toucher.';
        }
    }
    for (const [x, y] of shipCells(s, fleet)) taken.set(`${x},${y}`, s.id);
  }
  return null;
}

/** Flotte placée au hasard. `rng.next()` renvoie un nombre dans [0, 1[. */
export function randomFleet(size, fleet, rng) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships = [];
    let ok = true;
    for (const f of fleet) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const dir = rng.next() < 0.5 ? 'h' : 'v';
        const max = size - f.len;
        const s = { id: f.id, dir, x: Math.floor(rng.next() * (dir === 'h' ? max + 1 : size)), y: Math.floor(rng.next() * (dir === 'v' ? max + 1 : size)) };
        const trial = [...ships, s];
        if (!validatePartial(trial, size, fleet)) {
          ships.push(s);
          placed = true;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return ships;
  }
  throw new Error('Placement impossible');
}

/** Comme validateFleet, sans exiger la flotte complète. */
export function validatePartial(ships, size, fleet) {
  return validateFleet(ships, size, fleet.filter((f) => ships.some((s) => s.id === f.id)));
}

// ---------------------------------------------------------------------------- état

/** Graine texte -> entier, puis tirage pour savoir qui commence. */
function seedInt(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function createGame({ players, size = 10, rule = 'alternate', seed = 0 }) {
  if (!FLEETS[size]) throw new Error(`Taille inconnue : ${size}`);
  return {
    game: 'bataille',
    size,
    rule: RULES.includes(rule) ? rule : 'alternate',
    fleet: FLEETS[size],
    phase: 'placement',
    starter: seedInt(seed) % 2,
    turn: null,
    winner: null,
    players: players.map((p) => ({ id: p.id, name: p.name, ships: null, shots: [] })),
  };
}

const fail = (code, message) => ({ error: { code, message } });

/** Résultat d'un tir sur la flotte `ships` déjà visée par `shots`. */
function resolveShot(ships, shots, fleet, x, y) {
  const ship = ships.find((s) => shipCells(s, fleet).some(([cx, cy]) => cx === x && cy === y));
  if (!ship) return { result: 'miss' };
  const hits = new Set([...shots, { x, y }].map((s) => `${s.x},${s.y}`));
  const sunk = shipCells(ship, fleet).every(([cx, cy]) => hits.has(`${cx},${cy}`));
  return { result: sunk ? 'sunk' : 'hit', ship: ship.id };
}

export const sunkShips = (ships, shots, fleet) => {
  const hits = new Set(shots.map((s) => `${s.x},${s.y}`));
  return ships.filter((s) => shipCells(s, fleet).every(([x, y]) => hits.has(`${x},${y}`)));
};

export function applyAction(state, action, playerId) {
  const me = state.players.findIndex((p) => p.id === playerId);
  if (me < 0) return fail('not_player', 'Vous ne jouez pas dans cette partie.');
  if (!action || typeof action !== 'object') return fail('bad_action', 'Action invalide.');
  const s = structuredClone(state);
  const player = s.players[me];
  const enemy = s.players[1 - me];

  switch (action.type) {
    case 'place': {
      if (s.phase !== 'placement') return fail('wrong_phase', 'La bataille a déjà commencé.');
      if (player.ships) return fail('already_ready', 'Votre flotte est déjà en place.');
      const ships = Array.isArray(action.ships) ? action.ships.map((x) => ({ id: x?.id, x: x?.x, y: x?.y, dir: x?.dir })) : null;
      const problem = validateFleet(ships, s.size, s.fleet);
      if (problem) return fail('bad_fleet', problem);
      // ordre de la flotte normalisé
      player.ships = s.fleet.map((f) => ships.find((x) => x.id === f.id));
      const events = [{ type: 'placed', player: me }];
      if (enemy.ships) {
        s.phase = 'battle';
        s.turn = s.starter;
        events.push({ type: 'battle', turn: s.turn });
      }
      return { state: s, events };
    }
    case 'unplace': {
      if (s.phase !== 'placement') return fail('wrong_phase', 'La bataille a déjà commencé.');
      if (!player.ships) return fail('not_ready', 'Votre flotte n’est pas encore en place.');
      player.ships = null;
      return { state: s, events: [{ type: 'unplaced', player: me }] };
    }
    case 'fire': {
      if (s.phase !== 'battle') return fail('wrong_phase', s.phase === 'placement' ? 'Les flottes ne sont pas encore en place.' : 'La partie est terminée.');
      if (s.turn !== me) return fail('not_your_turn', 'Ce n’est pas votre tour.');
      const { x, y } = action;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.size || y >= s.size) return fail('bad_cell', 'Case invalide.');
      if (player.shots.some((t) => t.x === x && t.y === y)) return fail('already_shot', 'Vous avez déjà tiré ici.');
      const hitsSoFar = player.shots.filter((t) => t.r !== 'miss');
      const res = resolveShot(enemy.ships, hitsSoFar, s.fleet, x, y);
      player.shots.push({ x, y, r: res.result, ...(res.ship ? { ship: res.ship } : {}) });
      const events = [{ type: 'shot', by: me, x, y, result: res.result, ship: res.ship ?? null }];
      if (sunkShips(enemy.ships, player.shots.filter((t) => t.r !== 'miss'), s.fleet).length === s.fleet.length) {
        s.phase = 'over';
        s.winner = me;
        s.turn = null;
        events.push({ type: 'over', winner: me });
      } else if (!(s.rule === 'again' && res.result !== 'miss')) {
        s.turn = 1 - me;
      }
      return { state: s, events };
    }
    default:
      return fail('bad_action', 'Action inconnue.');
  }
}

/** Ce que voit le joueur `playerId` : sa flotte, ses tirs, ceux de l'adversaire, les navires coulés. */
export function viewFor(state, playerId) {
  const me = state.players.findIndex((p) => p.id === playerId);
  const enemy = state.players[1 - me];
  const mine = state.players[me];
  const over = state.phase === 'over';
  const hitsOn = (shooter) => shooter.shots.filter((t) => t.r !== 'miss');
  return {
    game: 'bataille',
    phase: state.phase,
    size: state.size,
    rule: state.rule,
    fleet: state.fleet,
    me,
    turn: state.turn,
    winner: state.winner,
    players: state.players.map((p) => ({ id: p.id, name: p.name, ready: !!p.ships, shots: p.shots.length, hits: hitsOn(p).length })),
    myShips: mine.ships,
    myShots: mine.shots,
    theirShots: enemy.shots,
    // navires adverses : seulement ceux qui sont coulés, sauf en fin de partie
    enemyShips: enemy.ships ? (over ? enemy.ships : sunkShips(enemy.ships, hitsOn(mine), state.fleet)) : [],
    mySunk: mine.ships ? sunkShips(mine.ships, hitsOn(enemy), state.fleet).map((s) => s.id) : [],
  };
}
