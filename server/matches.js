// Parties : création, coups validés par le module du jeu, résumé pour l'accueil, statistiques.

import { randomBytes } from 'node:crypto';

export class MatchError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class Matches {
  constructor(store, auth, games) {
    this.store = store;
    this.auth = auth;
    this.games = games;
    this.listeners = new Set(); // (match, events, { actor, awaitingBefore }) => void
  }

  get all() {
    return this.store.data.matches;
  }

  onChange(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  _changed(match, events = [], meta = {}) {
    match.updatedAt = Date.now();
    match.rev = (match.rev ?? 0) + 1;
    this.store.save();
    for (const cb of this.listeners) cb(match, events, meta);
  }

  /** Joueurs attendus en ce moment (vide si la partie n'est plus en cours). */
  awaiting(match) {
    return match.status === 'active' ? this.games.get(match.game).status(match.state).awaiting : [];
  }

  get(id) {
    return this.all.find((m) => m.id === id) ?? null;
  }

  _require(id, profileId) {
    const m = this.get(id);
    if (!m) throw new MatchError(404, 'not_found', 'Partie introuvable.');
    if (!m.players.includes(profileId)) throw new MatchError(403, 'forbidden', 'Vous ne jouez pas dans cette partie.');
    return m;
  }

  create({ game: gameId, opponent, options }, creatorId) {
    const game = this.games.get(gameId);
    if (!game) throw new MatchError(400, 'unknown_game', 'Jeu inconnu.');
    const other = this.auth.getProfile(opponent);
    if (!other || other.id === creatorId) throw new MatchError(400, 'bad_opponent', 'Choisissez un adversaire.');
    const players = [creatorId, other.id].map((id) => ({ id, name: this.auth.getProfile(id).name }));
    const clean = game.cleanOptions ? game.cleanOptions(options) : options ?? {};
    const match = {
      id: randomBytes(5).toString('hex'),
      game: game.id,
      players: players.map((p) => p.id),
      options: clean,
      state: game.create({ players, options: clean, seed: randomBytes(12).toString('hex') }),
      status: 'active',
      result: null,
      createdBy: creatorId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      rev: 0,
    };
    this.all.push(match);
    this._changed(match, [{ type: 'deal', round: 1 }], { actor: creatorId, awaitingBefore: [], created: true });
    return match;
  }

  act(id, profileId, action) {
    const match = this._require(id, profileId);
    if (match.status !== 'active') throw new MatchError(409, 'over', 'Cette partie est terminée.');
    const game = this.games.get(match.game);
    const awaitingBefore = this.awaiting(match);
    const res = game.act(match.state, action, profileId);
    if (res.error) throw new MatchError(400, res.error.code, res.error.message);
    match.state = res.state;
    const st = game.status(match.state);
    if (st.over) {
      match.status = 'finished';
      match.result = st.result;
      match.finishedAt = Date.now();
    }
    this._changed(match, res.events, { actor: profileId, awaitingBefore });
    return match;
  }

  abandon(id, profileId) {
    const match = this._require(id, profileId);
    if (match.status !== 'active') return match;
    const awaitingBefore = this.awaiting(match);
    match.status = 'abandoned';
    match.abandonedBy = profileId;
    match.finishedAt = Date.now();
    this._changed(match, [{ type: 'abandon', player: profileId }], { actor: profileId, awaitingBefore });
    return match;
  }

  view(id, profileId) {
    const match = this._require(id, profileId);
    return this.games.get(match.game).view(match.state, profileId);
  }

  /** Résumé d'une partie vu par un joueur (pour l'accueil et l'en-tête du jeu). */
  summary(match, profileId) {
    const game = this.games.get(match.game);
    const st = match.status === 'active' ? game.status(match.state) : { awaiting: [], label: match.status === 'abandoned' ? 'Abandonnée' : 'Terminée' };
    const opponentId = match.players.find((p) => p !== profileId);
    return {
      id: match.id,
      game: match.game,
      gameName: game.name,
      path: game.path,
      emoji: game.emoji,
      status: match.status,
      players: match.players.map((p) => this.auth.publicProfile(this.auth.getProfile(p))),
      opponent: this.auth.publicProfile(this.auth.getProfile(opponentId)),
      yourTurn: st.awaiting.includes(profileId),
      theirTurn: st.awaiting.includes(opponentId),
      label: st.label,
      options: match.options,
      result: match.result,
      abandonedBy: match.abandonedBy ?? null,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      finishedAt: match.finishedAt ?? null,
    };
  }

  listFor(profileId) {
    return this.all
      .filter((m) => m.players.includes(profileId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((m) => this.summary(m, profileId));
  }

  /** Bilan face à chaque adversaire, par jeu, et historique des parties terminées. */
  stats(profileId) {
    const finished = this.all.filter((m) => m.status === 'finished' && m.players.includes(profileId));
    const rivals = new Map();
    for (const m of finished) {
      const opp = m.players.find((p) => p !== profileId);
      const r = rivals.get(opp) ?? { opponent: this.auth.publicProfile(this.auth.getProfile(opp)), played: 0, wins: 0, losses: 0, draws: 0, byGame: {} };
      const g = (r.byGame[m.game] ??= { game: m.game, gameName: this.games.get(m.game)?.name ?? m.game, played: 0, wins: 0, losses: 0, draws: 0 });
      const winners = m.result?.winners ?? [];
      const outcome = winners.length !== 1 ? 'draws' : winners[0] === profileId ? 'wins' : 'losses';
      for (const x of [r, g]) {
        x.played += 1;
        x[outcome] += 1;
      }
      rivals.set(opp, r);
    }
    const history = finished
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, 50)
      .map((m) => this.summary(m, profileId));
    return { rivals: [...rivals.values()].map((r) => ({ ...r, byGame: Object.values(r.byGame) })), history };
  }
}
