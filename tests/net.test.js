// Sessions hôte/invité branchées sur un transport en mémoire (aucun réseau).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transport, TransportError } from '../net/transport.js';
import { HostSession } from '../net/host-session.js';
import { GuestSession } from '../net/guest-session.js';

class Hub {
  constructor() {
    this.hosts = new Map();
    this.wire = [];
  }
}

class MemoryTransport extends Transport {
  constructor(hub) {
    super();
    this.hub = hub;
    this.id = Math.random().toString(36).slice(2);
    this.links = new Map();
  }
  async create(code) {
    this.hub.hosts.set(code, this);
  }
  async join(code) {
    const host = this.hub.hosts.get(code);
    if (!host) throw new TransportError('room_not_found', 'introuvable');
    this.links.set('host', host);
    host.links.set(this.id, this);
    host._emit('connect', this.id);
  }
  send(msg, to) {
    const deliver = (target, from) => {
      const copy = JSON.parse(JSON.stringify(msg));
      this.hub.wire.push(copy);
      queueMicrotask(() => target._emit('message', copy, from));
    };
    if (this.links.has('host')) return deliver(this.links.get('host'), this.id);
    for (const [k, t] of this.links) if (!to || to === k) deliver(t, 'host');
  }
  drop() {
    const host = this.links.get('host');
    host.links.delete(this.id);
    host._emit('disconnect', this.id, 'test');
    this._emit('disconnect', 'host', 'test');
  }
  close() {
    this.links.clear();
  }
}

const memStore = () => ({ data: null, save(d) { this.data = structuredClone(d); }, clear() { this.data = null; } });
const tick = () => new Promise((r) => setTimeout(r, 5));
const settings = { rules: {}, deck: undefined, addons: [], available: [], addonOptions: {}, endThreshold: 100 };

async function setup() {
  const hub = new Hub();
  const hostStore = memStore();
  const host = new HostSession({ createTransport: () => new MemoryTransport(hub), code: 'ABCDE', name: 'Hôte', clientId: 'h', settings, store: hostStore });
  await host.open();
  const guestStore = memStore();
  const guestTransports = [];
  const guest = new GuestSession({
    createTransport: () => {
      const t = new MemoryTransport(hub);
      guestTransports.push(t);
      return t;
    },
    code: 'ABCDE',
    name: 'Invité',
    clientId: 'g1',
    store: guestStore,
    retryDelayMs: 1,
  });
  await guest.open();
  await tick();
  return { hub, host, guest, hostStore, guestStore, guestTransports };
}

test('l’invité rejoint, l’hôte lance, l’invité reçoit une vue filtrée', async () => {
  const { hub, host, guest } = await setup();
  assert.equal(guest.me, 'p1');
  assert.equal(guest.lobby.players.length, 2);
  assert.ok(host.start().ok);
  await tick();
  assert.equal(guest.view.me, 1);
  assert.equal(guest.view.phase, 'setup');
  // aucune carte cachée ni seed ne transite
  const wire = JSON.stringify(hub.wire);
  assert.ok(!wire.includes('"seed"') && !wire.includes('"rng"') && !wire.includes('"deck":'));
  for (const p of host.game.players) for (const slot of p.grid) assert.ok(!wire.includes(`"id":${slot.card.id},`));
});

test('les actions de l’invité sont validées par l’hôte', async () => {
  const { host, guest } = await setup();
  host.start();
  await tick();
  const errors = [];
  guest.onUpdate((u) => u.kind === 'error' && errors.push(u.error.code));
  guest.act({ type: 'reveal', index: 0 });
  guest.act({ type: 'reveal', index: 0 });
  await tick();
  assert.deepEqual(errors, ['already_visible']);
  assert.equal(guest.view.players[1].grid[0].up, true);
  assert.ok(host.act({ type: 'reveal', index: 3 }).ok);
  assert.equal(host.act({ type: 'reveal', index: 3 }).error.code, 'already_visible');
});

test('coupure : l’invité se reconnecte et retrouve sa place et la partie', async () => {
  const { host, guest, guestTransports } = await setup();
  host.start();
  await tick();
  const seen = [];
  host.onUpdate(() => seen.push(host.lobby.players[1].connected));
  guest.onUpdate(() => seen.push(guest.status));
  guestTransports.at(-1).drop();
  await tick();
  await tick();
  assert.ok(seen.includes(false) && seen.includes('reconnecting'));
  assert.equal(guestTransports.length, 2);
  assert.equal(guest.status, 'open');
  assert.equal(host.lobby.players[1].connected, true);
  assert.equal(guest.view.phase, 'setup');
});

test('rechargement de l’hôte : la partie est restaurée depuis la sauvegarde', async () => {
  const { hub, host, hostStore } = await setup();
  host.start();
  host.act({ type: 'reveal', index: 1 });
  const saved = hostStore.data;
  assert.equal(saved.code, 'ABCDE');
  const host2 = new HostSession({ createTransport: () => new MemoryTransport(hub), code: saved.code, name: 'Hôte', clientId: 'h', settings, store: hostStore, saved });
  await host2.open();
  assert.deepEqual(host2.game, host.game);
  assert.equal(host2.view.players[0].grid[1].up, true);
});

test('un troisième joueur est refusé une fois la partie lancée', async () => {
  const { hub, host } = await setup();
  host.start();
  const intruder = new GuestSession({ createTransport: () => new MemoryTransport(hub), code: 'ABCDE', name: 'X', clientId: 'g2', store: memStore() });
  await intruder.open();
  await tick();
  assert.equal(intruder.status, 'closed');
  assert.match(intruder.notice, /complète/);
});
