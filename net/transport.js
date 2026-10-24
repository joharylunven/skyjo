// Interface abstraite de transport. Les sessions (host-session.js, guest-session.js) ne dépendent
// que de cette interface : ajouter Firebase, WebSocket… revient à écrire une nouvelle sous-classe
// et à l'ajouter dans net/index.js.
//
//   create(roomCode)  -> Promise  devenir l'hôte de la salle
//   join(roomCode)    -> Promise  se connecter à l'hôte de la salle
//   send(msg, peer?)              hôte : vers un pair (tous si omis) ; invité : vers l'hôte
//   onMessage(cb(msg, peer))
//   onConnect(cb(peer))           hôte : un pair vient de se connecter
//   onDisconnect(cb(peer, reason)) côté invité, peer vaut 'host'
//   close()
//
// Les messages sont des objets JSON. La classe de base fournit un battement de cœur optionnel
// (messages { __hb: 1 }, jamais remontés) pour détecter les connexions mortes sur mobile.

export class TransportError extends Error {
  /** @param {'room_not_found'|'room_taken'|'timeout'|'network'|'unsupported'} code */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class Transport {
  constructor(config = {}) {
    this.config = config;
    this._handlers = { message: new Set(), connect: new Set(), disconnect: new Set() };
    this._seen = new Map();
    this._hb = null;
  }

  async create(_roomCode) {
    throw new Error('create() non implémenté');
  }
  async join(_roomCode) {
    throw new Error('join() non implémenté');
  }
  send(_msg, _peer) {
    throw new Error('send() non implémenté');
  }
  close() {
    this._stopHeartbeat();
  }

  onMessage(cb) {
    return this._on('message', cb);
  }
  onConnect(cb) {
    return this._on('connect', cb);
  }
  onDisconnect(cb) {
    return this._on('disconnect', cb);
  }

  _on(kind, cb) {
    this._handlers[kind].add(cb);
    return () => this._handlers[kind].delete(cb);
  }
  _emit(kind, ...args) {
    for (const cb of this._handlers[kind]) {
      try {
        cb(...args);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // --- battement de cœur : les sous-classes appellent _trackPeer/_touch/_untrackPeer
  //     et implémentent _sendRaw(peer, msg) et _lost(peer, reason).
  _trackPeer(peer) {
    this._seen.set(peer, Date.now());
  }
  _touch(peer) {
    if (this._seen.has(peer)) this._seen.set(peer, Date.now());
  }
  _untrackPeer(peer) {
    this._seen.delete(peer);
  }
  _startHeartbeat() {
    this._stopHeartbeat();
    const every = this.config.heartbeatMs ?? 4000;
    const timeout = this.config.heartbeatTimeoutMs ?? 15000;
    this._hb = setInterval(() => {
      const now = Date.now();
      for (const [peer, last] of this._seen) {
        if (now - last > timeout) this._lost(peer, 'timeout');
        else this._sendRaw(peer, { __hb: 1 });
      }
    }, every);
  }
  _stopHeartbeat() {
    if (this._hb) clearInterval(this._hb);
    this._hb = null;
  }
  _sendRaw(_peer, _msg) {}
  _lost(_peer, _reason) {}
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
