// Format des messages échangés (voir docs/PROTOCOL.md).

export const PROTOCOL_VERSION = 1;

export const MSG = {
  HELLO: 'hello', // invité -> hôte  { v, name, clientId }
  WELCOME: 'welcome', // hôte -> invité  { v, you, code }
  LOBBY: 'lobby', // hôte -> invité  { lobby }
  STATE: 'state', // hôte -> invité  { view, events }
  ACTION: 'action', // invité -> hôte  { action }
  LEAVE: 'leave', // invité -> hôte  {}
  ERROR: 'error', // hôte -> invité  { code, message }
  BYE: 'bye', // hôte -> invité  { reason }
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1

export function makeRoomCode(length = 5) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function normalizeRoomCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function makeClientId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cleanName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Joueur';
}

/** Validation minimale d'un message reçu : objet avec un type connu et une taille raisonnable. */
export function isValidMessage(msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return false;
  if (!Object.values(MSG).includes(msg.t)) return false;
  try {
    return JSON.stringify(msg).length < 200_000;
  } catch {
    return false;
  }
}
