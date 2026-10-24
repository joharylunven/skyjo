// Service worker : le jeu s'ouvre même hors-ligne (le jeu en ligne a bien sûr besoin du réseau).
// Stratégie : réseau d'abord pour nos fichiers (toujours la dernière version en ligne), cache en
// secours ; cache d'abord pour la bibliothèque PeerJS (URL versionnée, donc immuable).
// Pensez à incrémenter VERSION si vous voulez forcer le rafraîchissement du cache.

const VERSION = 'douze-v1';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './config/game.json',
  './config/cards.json',
  './config/addons.json',
  './config/network.json',
  './engine/index.js',
  './engine/game.js',
  './engine/view.js',
  './engine/scoring.js',
  './engine/addons.js',
  './engine/deck.js',
  './engine/grid.js',
  './engine/rng.js',
  './net/index.js',
  './net/transport.js',
  './net/peerjs-transport.js',
  './net/local-transport.js',
  './net/protocol.js',
  './net/emitter.js',
  './net/host-session.js',
  './net/guest-session.js',
  './ui/main.js',
  './ui/dom.js',
  './ui/storage.js',
  './ui/config.js',
  './ui/cards.js',
  './ui/format.js',
  './ui/screens.js',
  './ui/board.js',
  './addons/joker.js',
  './addons/double.js',
  './addons/spy.js',
];

const IMMUTABLE_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = (await cache.match(request, { ignoreSearch: true })) ?? (request.mode === 'navigate' ? await cache.match('./index.html') : null);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (IMMUTABLE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
  // Le reste (serveur de signalisation PeerJS, etc.) passe directement par le réseau.
});
