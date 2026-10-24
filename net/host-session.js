// Session hôte : seule autorité de la partie. Elle exécute le moteur, valide toutes les actions
// et n'envoie à chacun que sa vue filtrée. L'état complet est sauvegardé localement après chaque
// coup pour pouvoir rouvrir la même salle après un rechargement.

import { applyAction, createGame, viewFor } from '../engine/index.js';
import { Emitter } from './emitter.js';
import { MSG, PROTOCOL_VERSION, cleanName, isValidMessage } from './protocol.js';

export class HostSession extends Emitter {
  /**
   * @param {object} o
   * @param {() => import('./transport.js').Transport} o.createTransport
   * @param {string} o.code  code de salle
   * @param {string} o.name  pseudo de l'hôte
   * @param {{rules:object, deck:object[], addonOptions:object, addons:string[], endThreshold:number}} o.settings
   * @param {{save(data), clear()}} o.store  persistance locale
   * @param {object} [o.saved]  données sauvegardées à restaurer
   */
  constructor({ createTransport, code, name, clientId, settings, store, saved = null }) {
    super();
    this.role = 'host';
    this.me = 'p0';
    this.code = code;
    this.clientId = clientId;
    this.settings = settings;
    this.store = store;
    this.createTransport = createTransport;
    this.status = 'connecting'; // connecting | open | closed | error
    this.notice = null;
    this.peers = new Map(); // clé transport -> id joueur
    if (saved) {
      this.lobby = saved.lobby;
      this.lobby.players.forEach((p) => (p.connected = p.id === this.me));
      this.game = saved.game;
    } else {
      this.lobby = {
        players: [{ id: 'p0', name: cleanName(name), clientId, connected: true }],
        addons: [...settings.addons],
        endThreshold: settings.endThreshold,
      };
      this.game = null;
    }
    this.view = this.game ? viewFor(this.game, this.me) : null;
  }

  async open() {
    this.transport = this.createTransport({
      onRetry: (i, n) => this._setStatus('connecting', `Réouverture de la salle ${this.code}… (essai ${i}/${n})`),
    });
    this.transport.onMessage((msg, peer) => this._onMessage(msg, peer));
    this.transport.onDisconnect((peer, reason) => this._onPeerLost(peer, reason));
    try {
      await this.transport.create(this.code);
    } catch (e) {
      this._setStatus('error', e.message);
      throw e;
    }
    this._save();
    this._setStatus('open', this.game && !this._guestConnected() ? 'En attente de la reconnexion de l’adversaire…' : null);
  }

  // ------------------------------------------------------------------ API pour l'interface

  get started() {
    return !!this.game;
  }

  /** L'hôte modifie les options du lobby (avant le lancement). */
  setOptions({ addons, endThreshold }) {
    if (this.game) return;
    if (addons) this.lobby.addons = addons.filter((id) => this.settings.available.includes(id));
    if (endThreshold) this.lobby.endThreshold = Math.max(10, Math.min(1000, Math.round(endThreshold)));
    this._save();
    this._broadcastLobby();
  }

  start() {
    if (this.game) return { error: { code: 'started', message: 'Partie déjà lancée.' } };
    if (this.lobby.players.length < 2) return { error: { code: 'waiting', message: 'En attente d’un second joueur.' } };
    try {
      this.game = createGame({
        players: this.lobby.players.map(({ id, name }) => ({ id, name })),
        rules: { ...this.settings.rules, endThreshold: this.lobby.endThreshold },
        deck: this.settings.deck,
        addons: this.lobby.addons,
        addonOptions: this.settings.addonOptions,
        seed: `${this.code}-${Date.now()}-${Math.random()}`,
      });
    } catch (e) {
      return { error: { code: 'internal', message: e.message } };
    }
    this._save();
    this._broadcastLobby();
    this._broadcastState([{ type: 'deal', round: 1 }]);
    return { ok: true };
  }

  /** Revanche : retour au lobby avec les mêmes joueurs (totaux remis à zéro). */
  rematch() {
    if (!this.game || this.game.phase !== 'gameOver') return;
    this.game = null;
    this.view = null;
    this._save();
    this._broadcastLobby();
  }

  /** Coup joué par l'hôte lui-même : même chemin de validation que pour l'invité. */
  act(action) {
    return this._apply(this.me, action);
  }

  /** Quitter définitivement : prévient l'invité et efface la sauvegarde. */
  leave() {
    this.transport?.send({ t: MSG.BYE, reason: 'host_left' });
    setTimeout(() => this.transport?.close(), 200);
    this.store.clear();
    this._setStatus('closed', null);
  }

  // ------------------------------------------------------------------ interne

  _guestConnected() {
    return this.lobby.players.some((p) => p.id !== this.me && p.connected);
  }

  _setStatus(status, notice = this.notice) {
    this.status = status;
    this.notice = notice;
    this._notify({ kind: 'status' });
  }

  _save() {
    this.store.save({ role: 'host', code: this.code, clientId: this.clientId, lobby: this.lobby, game: this.game, ts: Date.now() });
  }

  _publicLobby() {
    return {
      players: this.lobby.players.map(({ id, name, connected }) => ({ id, name, connected })),
      addons: [...this.lobby.addons],
      endThreshold: this.lobby.endThreshold,
      started: !!this.game,
    };
  }

  _broadcastLobby() {
    const lobby = this._publicLobby();
    for (const peer of this.peers.keys()) this.transport.send({ t: MSG.LOBBY, lobby }, peer);
    this._notify({ kind: 'lobby' });
  }

  _sendState(peer, playerId, events) {
    this.transport.send({ t: MSG.STATE, view: viewFor(this.game, playerId), events }, peer);
  }

  _broadcastState(events = []) {
    for (const [peer, playerId] of this.peers) this._sendState(peer, playerId, events);
    this.view = viewFor(this.game, this.me);
    this._notify({ kind: 'state', events });
  }

  _apply(playerId, action) {
    if (!this.game) return { error: { code: 'not_started', message: 'La partie n’a pas commencé.' } };
    const res = applyAction(this.game, action, playerId);
    if (res.error) return res;
    this.game = res.state;
    this._save();
    this._broadcastState(res.events);
    return { ok: true };
  }

  _sendError(peer, code, message) {
    this.transport.send({ t: MSG.ERROR, code, message }, peer);
  }

  _onMessage(msg, peer) {
    if (!isValidMessage(msg)) return;
    if (msg.t === MSG.HELLO) return this._onHello(msg, peer);
    const playerId = this.peers.get(peer);
    if (!playerId) return this._sendError(peer, 'not_joined', 'Présentez-vous d’abord (hello).');
    if (msg.t === MSG.ACTION) {
      const res = this._apply(playerId, msg.action);
      if (res.error) this._sendError(peer, res.error.code, res.error.message);
    } else if (msg.t === MSG.LEAVE) {
      this._onPeerLost(peer, 'left');
      const seat = this.lobby.players.find((p) => p.id === playerId);
      if (!this.game && seat) {
        this.lobby.players = this.lobby.players.filter((p) => p !== seat);
        this._save();
        this._broadcastLobby();
      }
    }
  }

  _onHello(msg, peer) {
    if (msg.v !== PROTOCOL_VERSION) {
      this._sendError(peer, 'version', 'Version du jeu différente : rechargez la page.');
      return;
    }
    const clientId = String(msg.clientId ?? '').slice(0, 64);
    const name = cleanName(msg.name);
    let seat = this.lobby.players.find((p) => p.id !== this.me && p.clientId === clientId);
    if (!seat) {
      const other = this.lobby.players.find((p) => p.id !== this.me);
      if (!other) {
        seat = { id: 'p1', name, clientId, connected: false };
        this.lobby.players.push(seat);
      } else if (!this.game && !other.connected) {
        Object.assign(other, { name, clientId });
        seat = other;
      } else {
        this._sendError(peer, 'room_full', 'La salle est complète.');
        return;
      }
    }
    // Un même joueur reconnecté : on oublie l'ancienne connexion.
    for (const [k, id] of this.peers) if (id === seat.id && k !== peer) this.peers.delete(k);
    this.peers.set(peer, seat.id);
    seat.connected = true;
    if (!this.game) seat.name = name;
    this._save();
    this.transport.send({ t: MSG.WELCOME, v: PROTOCOL_VERSION, you: seat.id, code: this.code }, peer);
    this._broadcastLobby();
    if (this.game) this._sendState(peer, seat.id, [{ type: 'resync' }]);
    this._setStatus('open', null);
  }

  _onPeerLost(peer) {
    const playerId = this.peers.get(peer);
    this.peers.delete(peer);
    if (!playerId) return;
    if ([...this.peers.values()].includes(playerId)) return;
    const seat = this.lobby.players.find((p) => p.id === playerId);
    if (seat) seat.connected = false;
    this._broadcastLobby();
    if (this.status === 'open') this._setStatus('open', `${seat?.name ?? 'L’adversaire'} s’est déconnecté. En attente de son retour…`);
  }
}
