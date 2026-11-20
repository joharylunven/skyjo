// Serveur de la salle de jeux : API, WebSocket, parties Skyjojo arbitrées côté serveur.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { request } from 'node:http';
import { startServer } from '../server/index.js';

let app;
let base;
let dir;
const INVITE = 'code-famille';

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'arcade-'));
  app = await startServer({ port: 0, dataDir: dir, inviteCode: INVITE });
  base = `http://localhost:${app.port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

let alice;
let bob;

test('profils : code d’invitation obligatoire, PIN vérifié', async () => {
  assert.equal((await call('/api/profiles', { method: 'POST', body: { name: 'X', pin: '1234', invite: 'faux' } })).status, 403);
  assert.equal((await call('/api/profiles', { method: 'POST', body: { name: 'X', pin: '12', invite: INVITE } })).status, 400);
  const a = await call('/api/profiles', { method: 'POST', body: { name: 'Johary', avatar: '🐧', pin: '1234', invite: INVITE } });
  assert.equal(a.status, 201);
  alice = { ...a.data.profile, token: a.data.token };
  const b = await call('/api/profiles', { method: 'POST', body: { name: 'Jojo', avatar: '🐱', pin: '9876', invite: INVITE } });
  bob = { ...b.data.profile, token: b.data.token };
  assert.equal((await call('/api/profiles', { method: 'POST', body: { name: 'jojo', pin: '1111', invite: INVITE } })).status, 409);

  const hub = await call('/api/hub');
  assert.deepEqual(hub.data.profiles.map((p) => p.name), ['Johary', 'Jojo']);
  assert.ok(!JSON.stringify(hub.data).includes('pinHash'));
  assert.equal(hub.data.games[0].id, 'skyjojo');

  assert.equal((await call('/api/login', { method: 'POST', body: { profileId: alice.id, pin: '0000' } })).status, 401);
  const login = await call('/api/login', { method: 'POST', body: { profileId: alice.id, pin: '1234' } });
  assert.equal(login.status, 200);
  assert.equal((await call('/api/hub', { token: login.data.token })).data.me.name, 'Johary');
  assert.equal((await call('/api/matches')).status, 401);
  // le PIN n'est jamais stocké en clair
  app.store.flush();
  const db = readFileSync(join(dir, 'db.json'), 'utf8');
  assert.ok(!db.includes('"1234"') && !db.includes(login.data.token));
});

test('fichiers statiques : hub, jeu, et pas de sortie du dossier public', async () => {
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<html/);
  assert.equal((await fetch(base + '/skyjojo/')).status, 200);
  assert.equal((await fetch(base + '/skyjojo')).status, 200); // redirection suivie
  // chemin « .. » envoyé brut (fetch le normaliserait)
  const raw = await new Promise((ok) => request({ port: app.port, path: '/../package.json' }, (r) => ok(r.statusCode)).end());
  assert.notEqual(raw, 200);
  assert.equal((await fetch(base + '/nope.js')).status, 404);
});

function connect(token) {
  return new Promise((ok, ko) => {
    const ws = new WebSocket(`ws://localhost:${app.port}/ws`);
    ws.inbox = [];
    ws.waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      const w = ws.waiters.find((x) => x.pred(msg));
      if (w) {
        ws.waiters.splice(ws.waiters.indexOf(w), 1);
        w.ok(msg);
      } else ws.inbox.push(msg);
    });
    ws.next = (pred) =>
      new Promise((res) => {
        const i = ws.inbox.findIndex(pred);
        if (i >= 0) return res(ws.inbox.splice(i, 1)[0]);
        ws.waiters.push({ pred, ok: res });
      });
    ws.on('open', async () => {
      ws.send(JSON.stringify({ t: 'hello', token }));
      await ws.next((m) => m.t === 'welcome');
      ok(ws);
    });
    ws.on('error', ko);
  });
}

test('partie Skyjojo arbitrée par le serveur, vues filtrées, statistiques', async () => {
  const bad = await call('/api/matches', { method: 'POST', token: alice.token, body: { game: 'skyjojo', opponent: alice.id } });
  assert.equal(bad.status, 400);
  const created = await call('/api/matches', {
    method: 'POST',
    token: alice.token,
    body: { game: 'skyjojo', opponent: bob.id, options: { endThreshold: 50, addons: ['etoile', 'inconnu'] } },
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.deepEqual(created.data.options, { endThreshold: 50, addons: ['etoile'] });
  assert.equal(created.data.yourTurn, true); // phase de départ : les deux doivent retourner 2 cartes

  const wa = await connect(alice.token);
  const wb = await connect(bob.token);
  wa.send(JSON.stringify({ t: 'watch', match: id }));
  wb.send(JSON.stringify({ t: 'watch', match: id }));
  const va = await wa.next((m) => m.t === 'match');
  const vb = await wb.next((m) => m.t === 'match');
  assert.equal(va.view.me, 0);
  assert.equal(vb.view.me, 1);
  assert.equal(va.view.deck, undefined);
  assert.ok(va.view.players[1].grid.every((s) => !s.card));

  // un intrus ne peut pas regarder la partie
  const c = await call('/api/profiles', { method: 'POST', body: { name: 'Intrus', pin: '5555', invite: INVITE } });
  const wc = await connect(c.data.token);
  wc.send(JSON.stringify({ t: 'watch', match: id }));
  assert.equal((await wc.next((m) => m.t === 'error')).code, 'forbidden');
  wc.close();

  // action illégale renvoyée à son auteur
  wa.send(JSON.stringify({ t: 'action', match: id, action: { type: 'drawDeck' }, id: 7 }));
  const err = await wa.next((m) => m.t === 'error');
  assert.equal(err.code, 'wrong_phase');
  assert.equal(err.id, 7);

  // départ : chacun retourne 2 cartes, chaque joueur reçoit sa propre vue
  for (const [ws, idx] of [[wa, 0], [wa, 1], [wb, 0], [wb, 1]]) {
    ws.send(JSON.stringify({ t: 'action', match: id, action: { type: 'reveal', index: idx } }));
    await wa.next((m) => m.t === 'match');
    await wb.next((m) => m.t === 'match');
  }

  // on joue jusqu'au bout avec une stratégie simple : piocher, échanger la première carte cachée
  const sockets = { [alice.id]: wa, [bob.id]: wb };
  let state = app.matches.get(id);
  let guard = 0;
  while (state.status === 'active' && guard++ < 2000) {
    const s = state.state;
    let who;
    let action;
    if (s.phase === 'roundOver') {
      who = alice.id;
      action = { type: 'nextRound' };
    } else if (s.phase === 'setup') {
      const p = s.players.find((pl) => pl.grid.filter((x) => x && x.up).length < 2);
      who = p.id;
      action = { type: 'reveal', index: p.grid.findIndex((x) => x && !x.up) };
    } else {
      const p = s.players[s.turn];
      who = p.id;
      const hidden = p.grid.findIndex((x) => x && !x.up);
      if (s.step === 'draw') action = { type: 'drawDeck' };
      else action = { type: 'swap', index: hidden >= 0 ? hidden : p.grid.findIndex((x) => x) };
    }
    sockets[who].send(JSON.stringify({ t: 'action', match: id, action }));
    await wa.next((m) => m.t === 'match');
    await wb.next((m) => m.t === 'match');
    state = app.matches.get(id);
  }
  assert.equal(state.status, 'finished');
  assert.ok(state.result.winners.length >= 1);

  const stats = await call('/api/stats', { token: alice.token });
  assert.equal(stats.data.rivals[0].opponent.name, 'Jojo');
  assert.equal(stats.data.rivals[0].played, 1);
  assert.equal(stats.data.history[0].id, id);
  const bobStats = await call('/api/stats', { token: bob.token });
  assert.equal(stats.data.rivals[0].wins + stats.data.rivals[0].draws, bobStats.data.rivals[0].losses + bobStats.data.rivals[0].draws);

  wa.send(JSON.stringify({ t: 'action', match: id, action: { type: 'nextRound' } }));
  assert.equal((await wa.next((m) => m.t === 'error')).code, 'over');
  wa.close();
  wb.close();
});

test('abandon : la partie sort des parties en cours et ne compte pas dans les stats', async () => {
  const m = await call('/api/matches', { method: 'POST', token: bob.token, body: { game: 'skyjojo', opponent: alice.id } });
  const r = await call(`/api/matches/${m.data.id}/abandon`, { method: 'POST', token: alice.token });
  assert.equal(r.data.status, 'abandoned');
  const stats = await call('/api/stats', { token: alice.token });
  assert.equal(stats.data.rivals[0].played, 1);
});

test('les données survivent à un redémarrage', async () => {
  app.store.flush();
  const again = await startServer({ port: 0, dataDir: dir, inviteCode: INVITE });
  assert.equal(again.auth.authenticate(alice.token).name, 'Johary');
  assert.equal(again.matches.listFor(alice.id).length, 2);
  await again.close();
});

test('notifications : envoyées au joueur dont c’est le tour, pas à celui qui a l’appli ouverte', async () => {
  const dir2 = mkdtempSync(join(tmpdir(), 'arcade-push-'));
  const sent = [];
  const srv = await startServer({ port: 0, dataDir: dir2, inviteCode: INVITE, pushSend: async (sub, payload) => sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }) });
  const url = `http://localhost:${srv.port}`;
  const post = async (path, body, token) =>
    (await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })).json();
  const mk = async (name) => post('/api/profiles', { name, pin: '1234', invite: INVITE });
  const a = await mk('Ana');
  const b = await mk('Ben');
  const sub = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p', auth: 'a' } });
  assert.equal((await post('/api/push/subscribe', { subscription: { endpoint: 'http://x' } }, a.token)).error, 'Abonnement invalide.');
  await post('/api/push/subscribe', { subscription: sub('ana') }, a.token);
  await post('/api/push/subscribe', { subscription: sub('ben') }, b.token);
  const key = await (await fetch(url + '/api/push', { headers: { Authorization: `Bearer ${b.token}` } })).json();
  assert.ok(key.publicKey.length > 40);
  assert.equal(key.devices, 1);

  // Ana lance une partie : Ben est prévenu, pas Ana
  const m = await post('/api/matches', { game: 'bataille', opponent: b.profile.id }, a.token);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(sent.map((x) => x.endpoint), ['https://push.example/ben']);
  assert.match(sent[0].body, /Ana te lance une partie/);
  assert.equal(sent[0].url, `/bataille/?match=${m.id}`);
  assert.equal(sent[0].badge, 1);

  // les deux dressent leur plateau ; Ben a l'appli ouverte (visible) : pas de notification pour lui
  const fleet = [
    { id: 'porte-avions', x: 0, y: 0, dir: 'h' },
    { id: 'croiseur', x: 0, y: 2, dir: 'h' },
    { id: 'contre-torpilleur', x: 0, y: 4, dir: 'h' },
    { id: 'sous-marin', x: 0, y: 6, dir: 'h' },
    { id: 'torpilleur', x: 0, y: 8, dir: 'h' },
  ];
  const wsA = await new Promise((ok) => {
    const ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: a.token })));
    ws.on('message', (raw) => JSON.parse(raw).t === 'welcome' && ok(ws));
  });
  sent.length = 0;
  srv.matches.act(m.id, b.profile.id, { type: 'place', ships: fleet });
  srv.matches.act(m.id, a.profile.id, { type: 'place', ships: fleet });
  await new Promise((r) => setTimeout(r, 20));
  const st = srv.matches.get(m.id).state;
  const first = st.players[st.turn].id;
  // le premier à tirer est prévenu, sauf si c'est Ana qui a l'appli ouverte
  assert.deepEqual(sent.map((x) => x.endpoint), first === b.profile.id ? ['https://push.example/ben'] : []);

  // Ana passe l'appli en arrière-plan : elle redevient notifiable
  wsA.send(JSON.stringify({ t: 'visible', visible: false }));
  await new Promise((r) => setTimeout(r, 20));
  sent.length = 0;
  const shooter = first;
  const other = shooter === a.profile.id ? b.profile.id : a.profile.id;
  srv.matches.act(m.id, shooter, { type: 'fire', x: 9, y: 9 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, other === a.profile.id ? 'https://push.example/ana' : 'https://push.example/ben');
  assert.match(sent[0].body, /a joué : à toi/);

  // un abonnement expiré (410) est oublié
  srv.push.send = async () => {
    throw Object.assign(new Error('gone'), { statusCode: 410 });
  };
  await srv.push.notify(b.profile.id, { title: 't', body: 'b' });
  assert.equal(srv.push.hasDevice(b.profile.id), false);
  wsA.close();
  await srv.close();
  rmSync(dir2, { recursive: true, force: true });
});

test('robot de minigolf : proposé dans l’accueil, joue tout seul jusqu’au bout', async () => {
  const dir3 = mkdtempSync(join(tmpdir(), 'arcade-bot-'));
  const srv = await startServer({ port: 0, dataDir: dir3, inviteCode: INVITE, botDelay: 0 });
  const url = `http://localhost:${srv.port}`;
  const me = await (await fetch(url + '/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Zoé', pin: '1234', invite: INVITE }) })).json();
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${me.token}` };
  const hub = await (await fetch(url + '/api/hub')).json();
  assert.deepEqual(hub.profiles.map((p) => p.name), ['Zoé']); // pas de robot sur l'écran de connexion
  const golf = hub.games.find((g) => g.id === 'minigolf');
  assert.equal(golf.bots[0].id, 'bot-rakoto');
  assert.deepEqual(hub.games.find((g) => g.id === 'skyjojo').bots, []);
  // personne ne peut se connecter en robot, ni l'inviter à un autre jeu
  assert.equal((await fetch(url + '/api/login', { method: 'POST', headers: auth, body: JSON.stringify({ profileId: 'bot-rakoto', pin: '0000' }) })).status, 401);
  assert.equal((await fetch(url + '/api/matches', { method: 'POST', headers: auth, body: JSON.stringify({ game: 'skyjojo', opponent: 'bot-rakoto' }) })).status, 400);

  const m = await (await fetch(url + '/api/matches', { method: 'POST', headers: auth, body: JSON.stringify({ game: 'minigolf', opponent: 'bot-rakoto', options: { parcours: 'express' } }) })).json();
  const deadline = Date.now() + 60_000;
  let match = srv.matches.get(m.id);
  while (match.status === 'active' && Date.now() < deadline) {
    const s = match.state;
    if (s.players[s.turn].id === me.profile.id) srv.matches.act(m.id, me.profile.id, { type: 'shot', angle: 0, power: 0.03 });
    await new Promise((r) => setTimeout(r, 50));
    match = srv.matches.get(m.id);
  }
  assert.equal(match.status, 'finished');
  const bot = match.state.players.find((p) => p.id === 'bot-rakoto');
  // le robot joue bien : il bat largement quelqu'un qui tapote (7 par trou)
  assert.ok(bot.scores.reduce((x, y) => x + y, 0) < 14, `scores du robot : ${bot.scores}`);
  assert.deepEqual(match.result.winners, ['bot-rakoto']);
  const stats = await (await fetch(url + '/api/stats', { headers: auth })).json();
  assert.equal(stats.rivals[0].opponent.name, 'Rakoto');
  await srv.close();
  rmSync(dir3, { recursive: true, force: true });
});
