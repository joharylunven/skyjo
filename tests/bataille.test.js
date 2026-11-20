// Bataille navale : moteur, vues secrètes, et une partie complète jouée par le serveur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, viewFor, validateFleet, randomFleet, shipCells, FLEETS } from '../public/bataille/engine.js';
import bataille from '../server/games/bataille.js';

const PLAYERS = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
];
// flotte 10 × 10 rangée en lignes paires, collée à gauche
const LINES = FLEETS[10].map((f, i) => ({ id: f.id, x: 0, y: i * 2, dir: 'h' }));

function ok(state, action, who) {
  const res = applyAction(state, action, who);
  if (res.error) throw new Error(`${action.type} refusée : ${res.error.message}`);
  return res;
}

function seeded(n) {
  let s = n;
  return { next: () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646 };
}

test('validation de flotte : bords, chevauchements, contact', () => {
  const fleet = FLEETS[10];
  assert.equal(validateFleet(LINES, 10, fleet), null);
  assert.match(validateFleet(LINES.slice(1), 10, fleet), /tout le plateau/);
  assert.match(validateFleet(LINES.map((s, i) => (i === 0 ? { ...s, x: 6 } : s)), 10, fleet), /dépasse/);
  assert.match(validateFleet(LINES.map((s, i) => (i === 1 ? { ...s, y: 1 } : s)), 10, fleet), /toucher/);
  // contact par un coin
  assert.match(validateFleet(LINES.map((s, i) => (i === 4 ? { id: s.id, x: 5, y: 1, dir: 'v' } : s)), 10, fleet), /toucher/);
  assert.match(validateFleet([...LINES.slice(0, 4), { ...LINES[0] }], 10, fleet), /inconnue/);
});

test('placement au hasard toujours valable', () => {
  for (const size of [8, 10])
    for (let i = 1; i < 200; i++) assert.equal(validateFleet(randomFleet(size, FLEETS[size], seeded(i)), size, FLEETS[size]), null);
});

test('placement secret, puis tirs : dans l’eau, touché, coulé, victoire', () => {
  let s = createGame({ players: PLAYERS, seed: 'x' });
  assert.equal(applyAction(s, { type: 'fire', x: 0, y: 0 }, 'a').error.code, 'wrong_phase');
  s = ok(s, { type: 'place', ships: LINES }, 'a').state;
  assert.equal(applyAction(s, { type: 'place', ships: LINES }, 'a').error.code, 'already_ready');
  // Bob ne voit rien de la flotte d'Alice
  assert.deepEqual(viewFor(s, 'b').enemyShips, []);
  assert.ok(!JSON.stringify(viewFor(s, 'b')).includes('porte-avions","x'));
  s = ok(s, { type: 'unplace' }, 'a').state;
  s = ok(s, { type: 'place', ships: LINES }, 'a').state;
  const res = ok(s, { type: 'place', ships: LINES }, 'b');
  s = res.state;
  assert.equal(s.phase, 'battle');
  assert.deepEqual(res.events.at(-1), { type: 'battle', turn: s.starter });

  const first = s.players[s.turn].id;
  const second = s.players[1 - s.turn].id;
  assert.equal(applyAction(s, { type: 'fire', x: 9, y: 9 }, second).error.code, 'not_your_turn');
  let r = ok(s, { type: 'fire', x: 9, y: 9 }, first);
  assert.equal(r.events[0].result, 'miss');
  assert.equal(r.state.turn, 1 - s.turn); // chacun son tour
  s = r.state;
  s = ok(s, { type: 'fire', x: 9, y: 9 }, second).state;
  assert.equal(applyAction(s, { type: 'fire', x: 9, y: 9 }, first).error.code, 'already_shot');
  assert.equal(applyAction(s, { type: 'fire', x: 10, y: 0 }, first).error.code, 'bad_cell');

  // le premier joueur coule le torpilleur (y = 8, x = 0..1) ; l'autre tire dans l'eau entre-temps
  const water = [];
  for (let y = 1; y < 10; y += 2) for (let x = 0; x < 10; x++) water.push([x, y]);
  const fireBoth = (x, y) => {
    const r1 = ok(s, { type: 'fire', x, y }, first);
    s = r1.state;
    if (s.phase === 'over') return r1;
    const [wx, wy] = water.shift();
    s = ok(s, { type: 'fire', x: wx, y: wy }, second).state;
    return r1;
  };
  assert.equal(fireBoth(0, 8).events[0].result, 'hit');
  const sunk = fireBoth(1, 8);
  assert.equal(sunk.events[0].result, 'sunk');
  assert.equal(sunk.events[0].ship, 'torpilleur');
  const vb = viewFor(s, first);
  assert.deepEqual(vb.enemyShips.map((x) => x.id), ['torpilleur']);
  assert.deepEqual(viewFor(s, second).mySunk, ['torpilleur']);

  let last;
  for (const ship of LINES.slice(0, 4)) for (const [x, y] of shipCells(ship, FLEETS[10])) last = fireBoth(x, y);
  assert.equal(s.phase, 'over');
  assert.equal(last.events.at(-1).type, 'over');
  assert.equal(viewFor(s, second).enemyShips.length, 5); // tout est révélé à la fin
  const st = bataille.status(s);
  assert.equal(st.over, true);
  assert.deepEqual(st.result.winners, [first]);
  assert.equal(st.result.scores[first], 5);
  assert.equal(applyAction(s, { type: 'fire', x: 5, y: 5 }, second).error.code, 'wrong_phase');
});

test('option « touché : on rejoue » et grille 8 × 8', () => {
  const opts = bataille.cleanOptions({ size: '8', rule: 'again' });
  assert.deepEqual(opts, { size: 8, rule: 'again' });
  assert.deepEqual(bataille.cleanOptions({ size: 12, rule: 'x' }), { size: 10, rule: 'alternate' });
  let s = bataille.create({ players: PLAYERS, options: opts, seed: 's' });
  assert.equal(s.fleet.length, 4);
  const fleet = FLEETS[8].map((f, i) => ({ id: f.id, x: 0, y: i * 2, dir: 'h' }));
  s = ok(s, { type: 'place', ships: fleet }, 'a').state;
  assert.deepEqual(bataille.status(s).awaiting, ['b']);
  s = ok(s, { type: 'place', ships: fleet }, 'b').state;
  const p = s.turn;
  const who = s.players[p].id;
  s = ok(s, { type: 'fire', x: 0, y: 0 }, who).state;
  assert.equal(s.turn, p); // touché : on rejoue
  s = ok(s, { type: 'fire', x: 7, y: 7 }, who).state;
  assert.equal(s.turn, 1 - p);
  assert.deepEqual(bataille.status(s).awaiting, [s.players[1 - p].id]);
});
