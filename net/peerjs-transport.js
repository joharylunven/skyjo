// Transport WebRTC via PeerJS (serveur de signalisation public 0.peerjs.com par défaut).
// PeerJS est chargé à la demande depuis l'URL (version figée) de config/network.json.

import { Transport, TransportError, sleep } from './transport.js';

let loading = null;

function loadPeerJS(url) {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => (globalThis.Peer ? resolve(globalThis.Peer) : reject(new TransportError('unsupported', 'PeerJS introuvable.')));
    s.onerror = () => {
      loading = null;
      reject(new TransportError('network', 'Impossible de charger la bibliothèque réseau. Êtes-vous hors-ligne ?'));
    };
    document.head.append(s);
  });
  return loading;
}

function mapError(err) {
  switch (err?.type) {
    case 'unavailable-id':
      return new TransportError('room_taken', 'Ce code de salle est déjà utilisé.');
    case 'peer-unavailable':
      return new TransportError('room_not_found', 'Salle introuvable : vérifiez le code, ou l’hôte n’est pas (encore) en ligne.');
    case 'browser-incompatible':
      return new TransportError('unsupported', 'Ce navigateur ne gère pas WebRTC.');
    default:
      return new TransportError('network', `Erreur réseau (${err?.type ?? err?.message ?? 'inconnue'}).`);
  }
}

export class PeerJSTransport extends Transport {
  constructor(config) {
    super(config);
    this.peer = null;
    this.conns = new Map();
    this.isHost = false;
    this.closed = false;
  }

  _peerId(code) {
    return `${this.config.roomPrefix ?? 'douze-jeu-'}${code}`.toLowerCase();
  }

  _options() {
    const rtc = { iceServers: this.config.iceServers ?? [] };
    if (this.config.iceTransportPolicy) rtc.iceTransportPolicy = this.config.iceTransportPolicy;
    return { ...(this.config.peerjs ?? {}), config: rtc };
  }

  _openPeer(Peer, id) {
    const timeout = this.config.connectTimeoutMs ?? 15000;
    return new Promise((resolve, reject) => {
      const peer = id ? new Peer(id, this._options()) : new Peer(this._options());
      const done = (fn, v) => {
        clearTimeout(timer);
        peer.off('open', onOpen);
        peer.off('error', onError);
        fn(v);
      };
      const onOpen = () => done(resolve, peer);
      const onError = (err) => {
        peer.destroy();
        done(reject, mapError(err));
      };
      const timer = setTimeout(() => {
        peer.destroy();
        done(reject, new TransportError('timeout', 'Le serveur de mise en relation ne répond pas.'));
      }, timeout);
      peer.on('open', onOpen);
      peer.on('error', onError);
    });
  }

  _watchPeer() {
    this.peer.on('error', (err) => console.warn('[peerjs]', err?.type, err));
    // Perte du serveur de signalisation : les connexions établies continuent, on se réinscrit.
    this.peer.on('disconnected', () => {
      if (this.closed) return;
      setTimeout(() => {
        if (!this.closed && this.peer && !this.peer.destroyed && this.peer.disconnected) this.peer.reconnect();
      }, 1500);
    });
  }

  async create(code) {
    const Peer = await loadPeerJS(this.config.peerjsUrl);
    const { attempts = 20, delayMs = 3000 } = this.config.hostRetry ?? {};
    // Après un rechargement, le serveur peut garder l'ancien id quelques secondes : on réessaie.
    for (let i = 0; ; i++) {
      try {
        this.peer = await this._openPeer(Peer, this._peerId(code));
        break;
      } catch (e) {
        if (e.code !== 'room_taken' || i >= attempts - 1 || this.closed) throw e;
        this.config.onRetry?.(i + 1, attempts);
        await sleep(delayMs);
      }
    }
    this.isHost = true;
    this._watchPeer();
    this.peer.on('connection', (conn) => this._setupConn(conn, conn.peer));
    this._startHeartbeat();
  }

  async join(code) {
    const Peer = await loadPeerJS(this.config.peerjsUrl);
    this.peer = await this._openPeer(Peer, null);
    const timeout = this.config.connectTimeoutMs ?? 15000;
    await new Promise((resolve, reject) => {
      const conn = this.peer.connect(this._peerId(code), { reliable: true, serialization: 'json' });
      const finish = (err) => {
        clearTimeout(timer);
        this.peer.off('error', onPeerError);
        if (err) {
          this.peer.destroy();
          reject(err);
        } else resolve();
      };
      const onPeerError = (err) => finish(mapError(err));
      const timer = setTimeout(
        () =>
          finish(
            new TransportError(
              'timeout',
              'Connexion directe impossible avec l’hôte. Le réseau (4G, wifi d’entreprise…) bloque peut-être WebRTC : configurez un serveur TURN.',
            ),
          ),
        timeout,
      );
      this.peer.on('error', onPeerError);
      conn.on('open', () => {
        this._setupConn(conn, 'host');
        finish();
      });
      conn.on('error', (e) => finish(mapError(e)));
    });
    this._watchPeer();
    this._startHeartbeat();
  }

  _setupConn(conn, key) {
    const register = () => {
      const old = this.conns.get(key);
      if (old && old !== conn) old.close();
      this.conns.set(key, conn);
      this._trackPeer(key);
      if (this.isHost) this._emit('connect', key);
    };
    if (conn.open) register();
    else conn.on('open', register);
    conn.on('data', (data) => {
      this._touch(key);
      if (!data || typeof data !== 'object' || data.__hb) return;
      this._emit('message', data, key);
    });
    conn.on('close', () => this.conns.get(key) === conn && this._lost(key, 'closed'));
    conn.on('error', () => this.conns.get(key) === conn && this._lost(key, 'error'));
  }

  _lost(key, reason) {
    const conn = this.conns.get(key);
    if (!conn) return;
    this.conns.delete(key);
    this._untrackPeer(key);
    try {
      conn.close();
    } catch {}
    this._emit('disconnect', key, reason);
  }

  _sendRaw(key, msg) {
    const conn = this.conns.get(key);
    if (conn?.open) {
      try {
        conn.send(msg);
      } catch (e) {
        console.warn('[peerjs] envoi impossible', e);
      }
    }
  }

  send(msg, to) {
    if (!this.isHost) return this._sendRaw('host', msg);
    for (const key of to ? [to] : [...this.conns.keys()]) this._sendRaw(key, msg);
  }

  close() {
    this.closed = true;
    super.close();
    for (const conn of this.conns.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
