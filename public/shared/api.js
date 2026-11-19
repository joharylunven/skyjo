// Client commun à la salle de jeux et aux jeux : session, API JSON, connexion temps réel.

const TOKEN_KEY = 'arcade.token';

export const session = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set token(v) {
    try {
      v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Pas de connexion au serveur.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/login') session.token = null;
    throw new ApiError(res.status, data.error ?? `Erreur ${res.status}`, data.code);
  }
  return data;
}

/**
 * Connexion WebSocket persistante, reconnectée automatiquement (veille du téléphone, 4G…).
 * Événements : status ('connecting' | 'open' | 'reconnecting' | 'closed'), message (msg).
 */
export class Live {
  constructor() {
    this.status = 'connecting';
    this.listeners = new Set();
    this.watching = null;
    this.retry = 0;
    this.closed = false;
    this._connect();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.wake());
    window.addEventListener('online', () => this.wake());
  }

  on(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  _emit(ev) {
    for (const cb of this.listeners) {
      try {
        cb(ev);
      } catch (e) {
        console.error(e);
      }
    }
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this._emit({ type: 'status', status });
  }

  _connect() {
    clearTimeout(this.timer);
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'hello', token: session.token }));
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        this.retry = 0;
        this.me = msg.me;
        this._setStatus('open');
        if (this.watching) this.send({ t: 'watch', match: this.watching });
      }
      if (msg.t === 'error' && msg.code === 'auth') {
        this.closed = true;
        session.token = null;
        this._setStatus('closed');
      }
      this._emit({ type: 'message', msg });
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.closed) return;
      this._setStatus('reconnecting');
      this.retry += 1;
      this.timer = setTimeout(() => this._connect(), Math.min(10_000, 500 * 2 ** this.retry));
    };
  }

  /** Relance tout de suite si la connexion est tombée (retour au premier plan, réseau revenu). */
  wake() {
    if (this.closed) return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.retry = 0;
      this._connect();
    }
  }

  watch(matchId) {
    this.watching = matchId;
    this.send({ t: 'watch', match: matchId });
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'open') {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }
}

/** Enregistre le service worker commun (cache hors-ligne de l'interface). */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => console.warn('Service worker non enregistré', e));
  }
}

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
