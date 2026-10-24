// Persistance locale. Avec le transport local (deux onglets du même navigateur), on utilise
// sessionStorage pour que chaque onglet ait sa propre session. Le paramètre d'URL ?profil=xxx
// isole aussi les sauvegardes (utile pour tester PeerJS avec deux onglets du même navigateur).

export function createStorage(kind = 'local', profile = '') {
  const backend = kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
  const PREFIX = profile ? `douze.${profile}.` : 'douze.';
  const get = (key, fallback = null) => {
    try {
      const raw = backend.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const set = (key, value) => {
    try {
      backend.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('Sauvegarde locale impossible', e);
    }
  };
  const remove = (key) => {
    try {
      backend.removeItem(PREFIX + key);
    } catch {}
  };
  return {
    get,
    set,
    remove,
    /** Objet { save, clear } attendu par les sessions réseau. */
    sessionStore: { save: (data) => set('session', data), clear: () => remove('session') },
  };
}
