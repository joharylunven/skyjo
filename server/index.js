// Serveur de la salle de jeux : fichiers statiques, API JSON et WebSocket temps réel.
// Variables d'environnement : PORT (8080), DATA_DIR (./data), INVITE_CODE (obligatoire pour créer
// un profil), HUB_NAME.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Store } from './store.js';
import { Auth, AuthError, AVATARS } from './auth.js';
import { Matches, MatchError } from './matches.js';
import { loadGames, describeGame } from './games/index.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'",
};

export async function startServer({ port = 8080, dataDir, inviteCode, hubName = 'Jojo Arcade', publicDir } = {}) {
  publicDir = resolve(publicDir ?? fileURLToPath(new URL('../public/', import.meta.url)));
  const store = new Store(dataDir ?? fileURLToPath(new URL('../data/', import.meta.url)));
  const auth = new Auth(store, { inviteCode });
  const games = await loadGames();
  const matches = new Matches(store, auth, games);

  // ------------------------------------------------------------------ HTTP

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(body);
  };
  const json = (res, status, data) => send(res, status, JSON.stringify(data), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });

  const readBody = (req) =>
    new Promise((ok, ko) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 32_000) {
          ko(new AuthError(413, 'Requête trop grosse.'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
        } catch {
          ko(new AuthError(400, 'JSON invalide.'));
        }
      });
      req.on('error', ko);
    });

  const clientIp = (req) => String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  const bearer = (req) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;

  async function api(req, res, url) {
    const path = url.pathname.replace(/\/+$/, '');
    const method = req.method;
    const me = auth.authenticate(bearer(req));
    const needMe = () => {
      if (!me) throw new AuthError(401, 'Connectez-vous.');
      return me;
    };

    if (path === '/api/hub' && method === 'GET') {
      return json(res, 200, { name: hubName, avatars: AVATARS, profiles: auth.listProfiles(), games: [...games.values()].map(describeGame), me });
    }
    if (path === '/api/profiles' && method === 'POST') return json(res, 201, auth.createProfile(await readBody(req), clientIp(req)));
    if (path === '/api/login' && method === 'POST') return json(res, 200, auth.login(await readBody(req), clientIp(req)));
    if (path === '/api/logout' && method === 'POST') {
      auth.logout(bearer(req));
      return json(res, 200, { ok: true });
    }
    if (path === '/api/matches' && method === 'GET') return json(res, 200, matches.listFor(needMe().id));
    if (path === '/api/matches' && method === 'POST') {
      const m = matches.create(await readBody(req), needMe().id);
      return json(res, 201, matches.summary(m, me.id));
    }
    const abandon = path.match(/^\/api\/matches\/([a-f0-9]+)\/abandon$/);
    if (abandon && method === 'POST') return json(res, 200, matches.summary(matches.abandon(abandon[1], needMe().id), me.id));
    const one = path.match(/^\/api\/matches\/([a-f0-9]+)$/);
    if (one && method === 'GET') {
      const m = matches.get(one[1]);
      if (!m) throw new MatchError(404, 'not_found', 'Partie introuvable.');
      matches.view(m.id, needMe().id);
      return json(res, 200, matches.summary(m, me.id));
    }
    if (path === '/api/stats' && method === 'GET') return json(res, 200, matches.stats(needMe().id));
    return json(res, 404, { error: 'Route inconnue.' });
  }

  async function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(publicDir, rel));
    if (!file.startsWith(publicDir)) return send(res, 403, 'Interdit');
    try {
      const info = await stat(file);
      if (info.isDirectory()) {
        res.writeHead(301, { Location: `${url.pathname}/` });
        return res.end();
      }
      const body = await readFile(file);
      const ext = extname(file);
      send(res, 200, body, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        // le service worker gère le hors-ligne ; le navigateur revalide toujours
        'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache',
        ...(rel === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
      });
    } catch {
      send(res, 404, 'Introuvable', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (url.pathname === '/healthz') return json(res, 200, { ok: true });
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée');
      return await serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof AuthError || e instanceof MatchError) return json(res, e.status, { error: e.message, code: e.code });
      console.error(e);
      return json(res, 500, { error: 'Erreur interne.' });
    }
  });

  // ------------------------------------------------------------------ WebSocket
  //   client -> { t: 'hello', token } | { t: 'watch', match } | { t: 'action', match, action, id }
  //   serveur -> { t: 'welcome', me } | { t: 'match', summary, view, events } | { t: 'matches' }
  //              | { t: 'presence', match, online } | { t: 'error', code, message, id }

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64_000 });
  const clients = new Set();

  const sendWs = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

  function pushMatch(ws, match, events) {
    sendWs(ws, { t: 'match', summary: matches.summary(match, ws.me.id), view: matches.view(match.id, ws.me.id), events });
  }

  function presence(matchId) {
    const match = matches.get(matchId);
    if (!match) return;
    const online = [...new Set([...clients].filter((c) => c.watching === matchId).map((c) => c.me.id))];
    for (const c of clients) if (c.watching === matchId) sendWs(c, { t: 'presence', match: matchId, online });
  }

  matches.onChange((match, events) => {
    for (const c of clients) {
      if (!c.me || !match.players.includes(c.me.id)) continue;
      if (c.watching === match.id) pushMatch(c, match, events);
      else sendWs(c, { t: 'matches' });
    }
  });

  wss.on('connection', (ws) => {
    ws.alive = true;
    ws.on('pong', () => (ws.alive = true));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      try {
        if (msg.t === 'hello') {
          ws.me = auth.authenticate(msg.token);
          if (!ws.me) return sendWs(ws, { t: 'error', code: 'auth', message: 'Session expirée : reconnectez-vous.' });
          clients.add(ws);
          return sendWs(ws, { t: 'welcome', me: ws.me });
        }
        if (!ws.me) return sendWs(ws, { t: 'error', code: 'auth', message: 'Connectez-vous.' });
        if (msg.t === 'watch') {
          const match = matches.get(String(msg.match));
          if (!match) throw new MatchError(404, 'not_found', 'Partie introuvable.');
          matches.view(match.id, ws.me.id); // vérifie que le joueur en fait partie
          const before = ws.watching;
          ws.watching = match.id;
          pushMatch(ws, match, [{ type: 'resync' }]);
          if (before && before !== match.id) presence(before);
          return presence(match.id);
        }
        if (msg.t === 'action') {
          matches.act(String(msg.match), ws.me.id, msg.action);
          return;
        }
      } catch (e) {
        if (e instanceof MatchError || e instanceof AuthError) return sendWs(ws, { t: 'error', code: e.code ?? 'error', message: e.message, id: msg.id });
        console.error(e);
        sendWs(ws, { t: 'error', code: 'internal', message: 'Erreur interne.', id: msg.id });
      }
    });
    ws.on('close', () => {
      clients.delete(ws);
      if (ws.watching) presence(ws.watching);
    });
  });

  // Battement de cœur : les connexions mobiles mortes sont fermées (le client se reconnecte).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, 25_000);

  await new Promise((ok) => server.listen(port, ok));
  const close = async () => {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    await new Promise((ok) => server.close(ok));
    store.flush();
  };
  return { server, store, auth, matches, port: server.address().port, close };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inviteCode = process.env.INVITE_CODE;
  if (!inviteCode) console.warn('⚠ INVITE_CODE non défini : impossible de créer des profils.');
  const app = await startServer({
    port: Number(process.env.PORT ?? 8080),
    dataDir: process.env.DATA_DIR,
    inviteCode,
    hubName: process.env.HUB_NAME,
  });
  console.log(`Salle de jeux sur http://localhost:${app.port}`);
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
