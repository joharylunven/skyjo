// Transport local via BroadcastChannel : deux onglets du même navigateur, sans réseau.
// Pratique pour développer et tester (ajoutez ?transport=local à l'URL dans les deux onglets).

import { Transport, TransportError } from './transport.js';

const rid = () => Math.random().toString(36).slice(2, 10);

export class LocalTransport extends Transport {
  constructor(config) {
    super({ heartbeatMs: 2000, heartbeatTimeoutMs: 6000, ...config });
    this.id = rid();
    this.channel = null;
    this.isHost = false;
  }

  _open(code) {
    this.channel = new BroadcastChannel(`douze-local-${code}`);
    this.channel.onmessage = (e) => this._receive(e.data);
  }

  _post(to, kind, data) {
    this.channel?.postMessage({ from: this.id, to, kind, data });
  }

  _receive({ from, to, kind, data }) {
    if (to !== this.id && to !== '*') return;
    const key = this.isHost ? from : 'host';
    if (this.isHost && kind === 'hello') {
      this._trackPeer(from);
      this._post(from, 'ack');
      this._emit('connect', from);
      return;
    }
    if (!this.isHost && kind === 'ack') {
      this.hostId = from;
      this._trackPeer('host');
      this._ack?.();
      return;
    }
    if (!this._seen.has(key)) return;
    this._touch(key);
    if (kind === 'bye') return this._lost(key, 'closed');
    if (kind === 'msg' && data && !data.__hb) this._emit('message', data, key);
  }

  async create(code) {
    this.isHost = true;
    this._open(code);
    this._startHeartbeat();
  }

  async join(code) {
    this._open(code);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.channel.close();
        reject(new TransportError('room_not_found', 'Salle locale introuvable (ouvrez l’hôte dans un autre onglet).'));
      }, 2500);
      this._ack = () => {
        clearTimeout(timer);
        this._ack = null;
        resolve();
      };
      this._post('*', 'hello');
    });
    this._startHeartbeat();
  }

  _sendRaw(key, msg) {
    this._post(key === 'host' ? this.hostId : key, 'msg', msg);
  }

  _lost(key, reason) {
    if (!this._seen.has(key)) return;
    this._untrackPeer(key);
    this._emit('disconnect', key, reason);
  }

  send(msg, to) {
    if (!this.isHost) return this._sendRaw('host', msg);
    for (const key of to ? [to] : [...this._seen.keys()]) this._sendRaw(key, msg);
  }

  close() {
    super.close();
    for (const key of this._seen.keys()) this._post(key === 'host' ? this.hostId : key, 'bye');
    this._seen.clear();
    this.channel?.close();
    this.channel = null;
  }
}
