// Pétanque à Quiberon : physique, règles des mènes, robot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, viewFor, pointInfo, simulateThrow, BOULES } from '../public/petanque/engine.js';
import { TERRAINS, terrainById } from '../public/petanque/terrains.js';
import petanque from '../server/games/petanque.js';
import { chooseThrow } from '../server/petanque-ai.js';

const PLAYERS = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Ben' },
];
const UP = -Math.PI / 2;
const ok = (s, action, who = s.players[s.thrower].id) => {
  const r = applyAction(s, action, who);
  if (r.error) throw new Error(r.error.message);
  return r;
};
const seeded = (n) => {
  let x = n;
  return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
};

test('terrains : cercle et zone du cochonnet dans les limites', () => {
  for (const t of TERRAINS) {
    const [x, y] = t.circle;
    assert.ok(x > t.bounds.x0 && x < t.bounds.x1 && y > t.bounds.y0 && y < t.bounds.y1, t.id);
  }
});

test('physique : déterministe ; plus fort = plus loin ; tir sur une boule = elle part', () => {
  const t = terrainById('grande-plage');
  const a = simulateThrow(t, [], { id: 'c', kind: 'cochonnet' }, { angle: UP, power: 0.4, mode: 'cochonnet' });
  assert.deepEqual(a, simulateThrow(t, [], { id: 'c', kind: 'cochonnet' }, { angle: UP, power: 0.4, mode: 'cochonnet' }));
  const b = simulateThrow(t, [], { id: 'c', kind: 'cochonnet' }, { angle: UP, power: 0.5, mode: 'cochonnet' });
  assert.ok(b.balls[0].y < a.balls[0].y);
  const target = { id: '1-0', kind: 'boule', owner: 1, x: 50, y: 80 };
  const shot = simulateThrow(t, [target], { id: '0-0', kind: 'boule', owner: 0 }, { angle: UP, power: 0.44, mode: 'tirer' });
  const hit = shot.balls.find((x) => x.id === '1-0');
  assert.ok(!hit || hit.y < 70, 'la boule tirée doit partir');
  assert.deepEqual(shot.hits, ['1-0']);
  // une boule qui sort du terrain est morte
  const out = simulateThrow(t, [], { id: '0-0', kind: 'boule', owner: 0 }, { angle: 0, power: 0.5, mode: 'pointer' });
  assert.equal(out.balls.length, 0);
  assert.equal(out.dead[0].why, 'out');
});

test('mène : cochonnet hors zone relancé, puis joue celui qui n’a pas le point', () => {
  let s = createGame({ players: PLAYERS, terrain: 'grande-plage', seed: 'm' });
  const first = s.thrower;
  assert.equal(applyAction(s, { type: 'throw', angle: UP, power: 0.4 }, PLAYERS[1 - first].id).error.code, 'not_your_turn');
  let r = ok(s, { type: 'throw', angle: UP, power: 0.03 }); // trop court
  assert.equal(r.events[0].ok, false);
  assert.equal(r.state.phase, 'cochonnet');
  assert.equal(r.state.thrower, first);
  s = ok(r.state, { type: 'throw', angle: UP, power: 0.4 }).state;
  assert.equal(s.phase, 'boules');
  assert.equal(s.thrower, first); // il joue aussi la première boule
  const c = s.balls.find((b) => b.kind === 'cochonnet');
  // première boule juste devant le cochonnet : l'autre doit jouer
  s = ok(s, { type: 'throw', angle: Math.atan2(c.y + 6 - 145, c.x - 50), power: (145 - c.y - 6 - 12) / 128 }).state;
  assert.equal(pointInfo(s).holder, first);
  assert.equal(s.thrower, 1 - first);
  // l'autre envoie ses boules dehors : il les joue toutes, puis la mène est finie
  let last;
  for (let i = 0; i < BOULES; i++) {
    last = ok(s, { type: 'throw', angle: 0, power: 0.6 });
    s = last.state;
  }
  assert.equal(last.events[0].result, 'out');
  assert.equal(s.thrower, first);
  assert.equal(s.left[1 - first], 0);
  while (s.mene === 1) {
    last = ok(s, { type: 'throw', angle: Math.atan2(c.y + 8 - 145, c.x - 50), power: (145 - c.y - 8 - 12) / 128 });
    s = last.state;
  }
  const done = last.events.find((e) => e.type === 'meneDone');
  assert.equal(done.winner, first);
  assert.ok(done.points >= 1);
  assert.equal(s.scores[first], done.points);
  assert.equal(s.phase, 'cochonnet');
  assert.equal(s.thrower, first); // le gagnant relance le cochonnet
  assert.deepEqual(s.left, [BOULES, BOULES]);
  assert.equal(viewFor(s, 'b').me, 1);
});

test('compte des points : chaque boule mieux placée que la meilleure adverse', () => {
  const balls = [
    { id: 'c', kind: 'cochonnet', x: 50, y: 60 },
    { id: '0-0', kind: 'boule', owner: 0, x: 50, y: 64 },
    { id: '0-1', kind: 'boule', owner: 0, x: 54, y: 62 },
    { id: '1-0', kind: 'boule', owner: 1, x: 50, y: 70 },
    { id: '0-2', kind: 'boule', owner: 0, x: 50, y: 80 },
  ];
  assert.deepEqual([pointInfo({ balls }).holder, pointInfo({ balls }).points], [0, 2]);
  assert.equal(pointInfo({ balls: balls.filter((b) => b.owner !== 1) }).points, 3);
});

test('robot : partie complète robot contre robot jusqu’à 13 ; options du module', () => {
  let s = petanque.create({ players: PLAYERS, options: petanque.cleanOptions({ target: '7', terrain: 'nope' }), seed: 'r' });
  assert.equal(s.target, 7);
  assert.equal(s.terrains.length, TERRAINS.length);
  const rand = seeded(7);
  let n = 0;
  while (s.phase !== 'over' && n++ < 300) {
    const { expected, ...move } = chooseThrow({ state: s, rand });
    s = ok(s, move).state;
  }
  assert.equal(s.phase, 'over');
  assert.ok(Math.max(...s.scores) >= 7);
  const st = petanque.status(s);
  assert.equal(st.over, true);
  assert.equal(st.result.winners.length, 1);
  assert.match(petanque.status(petanque.create({ players: PLAYERS, options: { target: 13, terrain: 'port-maria' }, seed: 1 })).label, /Mène 1 · 0–0 · Le quai de Port Maria/);
});
