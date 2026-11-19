// Générateur pseudo-aléatoire déterministe.
// L'état du générateur est un simple entier 32 bits, stocké dans l'état de jeu (sérialisable).

/** Transforme n'importe quelle seed (texte ou nombre) en entier 32 bits (hachage xmur3). */
export function hashSeed(seed) {
  const str = String(seed);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Crée un générateur mulberry32 à partir d'un état entier. `rng.state` permet de le sauvegarder. */
export function createRng(stateInt) {
  let s = stateInt >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) {
      return Math.floor(this.next() * n);
    },
    get state() {
      return s;
    },
  };
}

/** Mélange de Fisher-Yates, en place. */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
