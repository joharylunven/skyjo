// Service worker de la salle de jeux : l'interface s'ouvre même sans réseau (le jeu, lui, a besoin
// du serveur). Réseau d'abord pour toujours avoir la dernière version, cache en secours.
// L'API et le WebSocket ne passent jamais par le cache.

const VERSION = 'arcade-v3';

const PRECACHE = [
  '/',
  '/arcade.json',
  '/bataille/engine.js',
  '/bataille/index.html',
  '/bataille/main.js',
  '/bataille/style.css',
  '/hub.css',
  '/hub.js',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/icon.svg',
  '/index.html',
  '/manifest.webmanifest',
  '/shared/api.js',
  '/shared/base.css',
  '/shared/dom.js',
  '/skyjojo/addons/coup-oeil.js',
  '/skyjojo/addons/double.js',
  '/skyjojo/addons/etoile.js',
  '/skyjojo/addons/joker.js',
  '/skyjojo/addons/spy.js',
  '/skyjojo/config/addons.json',
  '/skyjojo/config/cards.json',
  '/skyjojo/config/game.json',
  '/skyjojo/css/style.css',
  '/skyjojo/engine/addons.js',
  '/skyjojo/engine/deck.js',
  '/skyjojo/engine/game.js',
  '/skyjojo/engine/grid.js',
  '/skyjojo/engine/index.js',
  '/skyjojo/engine/rng.js',
  '/skyjojo/engine/scoring.js',
  '/skyjojo/engine/view.js',
  '/skyjojo/index.html',
  '/skyjojo/ui/board.js',
  '/skyjojo/ui/cards.js',
  '/skyjojo/ui/config.js',
  '/skyjojo/ui/dom.js',
  '/skyjojo/ui/format.js',
  '/skyjojo/ui/main.js',
  '/skyjojo/ui/screens.js',
];

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
    const cached = (await cache.match(request, { ignoreSearch: true })) ?? (request.mode === 'navigate' ? await cache.match('/') : null);
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws' || url.pathname === '/healthz') return;
  event.respondWith(networkFirst(request));
});
