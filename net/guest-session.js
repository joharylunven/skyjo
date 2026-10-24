// Session invité : n'envoie que des actions, affiche les vues filtrées reçues de l'hôte et se
// reconnecte automatiquement (même salle, même identifiant client) en cas de coupure.

import { Emitter } from './emitter.js';
import { MSG, PROTOCOL_VERSION, cleanName, isValidMessage } from './protocol.js';
import { sleep } from './transport.js';

export class GuestSession extends Emitter {
  constructor({ createTransport, code, name, clientId, store, retryDelayMs = 3000 }) {
    super();
    this.role = 'guest';
    this.me = null;
    this.code = code;
    this.name = cleanName(name);
    this.clientId = clientId;
    this.store = store;
    this.createTransport = createTransport;
    this.retryDelayMs = retryDelayMs;
    this.status = 'connecting'; // connecting | open | reconnecting | closed | error
    this.notice = null;
    this.lobby = null;
    this.view = null;
    this.transport = null;
    this.attempt = 0;
    this._wake = null;
  }

  get started() {
    return !!this.lobby?.started;
  }

  /**
   * Première connexion. Avec `resume`, un échec n'est pas définitif : on passe en reconnexion
   * (cas d'un rechargement de page pendant que l'hôte recharge lui aussi).
   */
  async open({ resume = false } = {}) {
    try {
      await this._connect();
    } catch (e) {
      if (!resume) {
        this._setStatus('error', e.message);
        throw e;
      }
      this._reconnectLoop();
    }
  }

  act(action) {
    if (this.status !== 'open') return { error: { code: 'offline', message: 'Hors connexion : coup non envoyé.' } };
    this.transport.send({ t: MSG.ACTION, action });
    return { ok: true, pending: true };
  }

  leave() {
    this._leaving = true;
    this.transport?.send({ t: MSG.LEAVE });
    setTimeout(() => this.transport?.close(), 200);
    this.store.clear();
    this._setStatus('closed', null);
  }

  /** À appeler quand la page redevient visible ou que le réseau revient : relance aussitôt. */
  wake() {
    this._wake?.();
  }

  // ------------------------------------------------------------------ interne

  _setStatus(status, notice = this.notice) {
    this.status = status;
    this.notice = notice;
    this._notify({ kind: 'status' });
  }

  async _connect() {
    const t = this.createTransport();
    await t.join(this.code);
    if (this._leaving) return t.close();
    this.transport = t;
    t.onMessage((msg) => this._onMessage(msg));
    t.onDisconnect(() => {
      if (this.transport !== t || this._leaving || this.status === 'closed') return;
      t.close();
      this._reconnectLoop();
    });
    t.send({ t: MSG.HELLO, v: PROTOCOL_VERSION, name: this.name, clientId: this.clientId });
    this.attempt = 0;
    this._setStatus('open', null);
  }

  async _reconnectLoop() {
    if (this._looping) return;
    this._looping = true;
    while (!this._leaving && this.status !== 'closed') {
      this.attempt += 1;
      this._setStatus('reconnecting', `Connexion à l’hôte perdue — reconnexion… (essai ${this.attempt})`);
      await Promise.race([sleep(this.retryDelayMs), new Promise((r) => (this._wake = r))]);
      this._wake = null;
      if (this._leaving) break;
      try {
        await this._connect();
        break;
      } catch (e) {
        console.warn('[guest] reconnexion échouée', e.code, e.message);
      }
    }
    this._looping = false;
  }

  _onMessage(msg) {
    if (!isValidMessage(msg)) return;
    switch (msg.t) {
      case MSG.WELCOME:
        this.me = msg.you;
        this.store.save({ role: 'guest', code: this.code, name: this.name, clientId: this.clientId, ts: Date.now() });
        this._notify({ kind: 'lobby' });
        break;
      case MSG.LOBBY: {
        this.lobby = msg.lobby;
        const host = msg.lobby.players.find((p) => p.id === 'p0');
        this.notice = this.status === 'open' && host && !host.connected ? 'L’hôte est hors ligne…' : null;
        this._notify({ kind: 'lobby' });
        break;
      }
      case MSG.STATE:
        this.view = msg.view;
        this._notify({ kind: 'state', events: msg.events ?? [] });
        break;
      case MSG.ERROR:
        this._notify({ kind: 'error', error: { code: msg.code, message: msg.message } });
        if (msg.code === 'room_full' || msg.code === 'version') {
          this.store.clear();
          this.transport?.close();
          this._setStatus('closed', msg.message);
        }
        break;
      case MSG.BYE:
        this.store.clear();
        this.transport?.close();
        this._setStatus('closed', 'L’hôte a quitté la partie.');
        break;
    }
  }
}
