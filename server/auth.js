// Profils joueurs protégés par un code PIN, jetons de session, limitation des essais.

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const AVATARS = ['🐧', '🐱', '🦊', '🐻', '🐼', '🐨', '🐸', '🦉', '🐙', '🦄', '🐝', '🐢'];

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hashPin = (pin, salt) => scryptSync(String(pin), salt, 32).toString('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class Auth {
  constructor(store, { inviteCode }) {
    this.store = store;
    this.inviteCode = inviteCode;
    this.failures = new Map(); // ip -> [timestamps]
  }

  get profiles() {
    return this.store.data.profiles;
  }

  publicProfile(p) {
    return p && { id: p.id, name: p.name, avatar: p.avatar };
  }

  listProfiles() {
    return this.profiles.map((p) => this.publicProfile(p));
  }

  getProfile(id) {
    return this.profiles.find((p) => p.id === id) ?? null;
  }

  createProfile({ name, avatar, pin, invite }, ip) {
    this._checkRate(ip);
    if (!this.inviteCode || !safeEqual(invite ?? '', this.inviteCode)) {
      this._fail(ip);
      throw new AuthError(403, 'Code d’invitation incorrect.');
    }
    const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!clean) throw new AuthError(400, 'Choisissez un prénom.');
    if (this.profiles.some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new AuthError(409, 'Ce prénom est déjà pris.');
    if (!/^\d{4,8}$/.test(String(pin ?? ''))) throw new AuthError(400, 'Le code PIN doit faire 4 à 8 chiffres.');
    const salt = randomBytes(16).toString('hex');
    const profile = {
      id: `u_${randomBytes(5).toString('hex')}`,
      name: clean,
      avatar: AVATARS.includes(avatar) ? avatar : AVATARS[this.profiles.length % AVATARS.length],
      salt,
      pinHash: hashPin(pin, salt),
      createdAt: Date.now(),
    };
    this.profiles.push(profile);
    this.store.save();
    return { profile: this.publicProfile(profile), token: this._issue(profile) };
  }

  login({ profileId, pin }, ip) {
    this._checkRate(ip);
    const p = this.getProfile(profileId);
    if (!p || !safeEqual(hashPin(String(pin ?? ''), p.salt), p.pinHash)) {
      this._fail(ip);
      throw new AuthError(401, 'Code PIN incorrect.');
    }
    return { profile: this.publicProfile(p), token: this._issue(p) };
  }

  authenticate(token) {
    if (!token) return null;
    const h = sha(String(token));
    const t = this.store.data.tokens.find((x) => x.hash === h);
    if (!t) return null;
    const p = this.getProfile(t.profileId);
    if (!p) return null;
    if (Date.now() - (t.lastSeen ?? 0) > 3600_000) {
      t.lastSeen = Date.now();
      this.store.save();
    }
    return this.publicProfile(p);
  }

  logout(token) {
    const h = sha(String(token ?? ''));
    this.store.data.tokens = this.store.data.tokens.filter((t) => t.hash !== h);
    this.store.save();
  }

  _issue(profile) {
    const token = randomBytes(32).toString('base64url');
    this.store.data.tokens.push({ hash: sha(token), profileId: profile.id, createdAt: Date.now(), lastSeen: Date.now() });
    this.store.save();
    return token;
  }

  // 8 erreurs par adresse IP et par quart d'heure, ensuite on bloque.
  _checkRate(ip) {
    const now = Date.now();
    const list = (this.failures.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
    this.failures.set(ip, list);
    if (list.length >= 8) throw new AuthError(429, 'Trop d’essais. Réessayez dans un quart d’heure.');
  }

  _fail(ip) {
    this.failures.set(ip, [...(this.failures.get(ip) ?? []), Date.now()]);
  }
}
