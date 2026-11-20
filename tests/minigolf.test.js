// Minigolf malgache : physique, parcours jouables, règles de partie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLES, holeById } from '../public/minigolf/courses.js';
import { simulate, createGame, applyAction, viewFor, inPoly, MAX_STROKES } from '../public/minigolf/engine.js';
import minigolf from '../server/games/minigolf.js';
import { solve } from './golf-solver.js';

const PLAYERS = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Ben' },
];
const deg = (d) => (d * Math.PI) / 180;
const ok = (s, action, who) => {
  const r = applyAction(s, action, who);
  if (r.error) throw new Error(r.error.message);
  return r;
};

test('parcours : départ et trou sur le green, hors obstacles', () => {
  for (const h of HOLES) {
    for (const [x, y] of [h.tee, h.hole]) {
      assert.ok(inPoly(h.shape, x, y), `${h.id} : point hors du green`);
      assert.ok(!(h.blocks ?? []).some((b) => inPoly(b.poly, x, y)), `${h.id} : point dans un obstacle`);
      assert.ok(!(h.zones ?? []).some((z) => z.type === 'water' && inPoly(z.poly, x, y)), `${h.id} : point dans l’eau`);
    }
  }
  assert.equal(new Set(HOLES.map((h) => h.id)).size, HOLES.length);
});

test('chaque trou se termine en au plus son par (joueur parfait)', () => {
  for (const h of HOLES) assert.ok(solve(h) <= h.par, `${h.id} injouable`);
});

test('physique : déterministe, la balle reste sur le green, rebonds', () => {
  for (const h of HOLES) {
    for (let i = 0; i < 24; i++) {
      const from = { x: h.tee[0], y: h.tee[1] };
      const r1 = simulate(h, from, deg(i * 15), 1, 3.3);
      const r2 = simulate(h, from, deg(i * 15), 1, 3.3);
      assert.deepEqual(r1, r2);
      assert.ok(inPoly(h.shape, r1.end.x, r1.end.y), `${h.id} : balle sortie à ${i * 15}°`);
    }
  }
  // tir plein droit dans le mur du fond : la balle revient
  const r = simulate(holeById('rn7'), { x: 30, y: 140 }, deg(90), 0.6);
  assert.ok(r.path.some(([, y]) => y > 145) && r.end.y < 151);
});

test('eau : un coup de pénalité et retour au point de départ du coup', () => {
  let s = createGame({ players: PLAYERS, holes: ['tsiribihina'], seed: 1 });
  const who = s.players[s.turn].id;
  const r = ok(s, { type: 'shot', angle: deg(-90), power: 0.7 }, who);
  assert.equal(r.events[0].result, 'water');
  const p = r.state.players.find((x) => x.id === who);
  assert.equal(p.strokes, 2);
  assert.deepEqual(p.ball, { x: 30, y: 140 });
  assert.ok(r.state.lastShot.splash.y <= 95);
});

test('tours alternés, balle ramassée après le maximum, trou suivant, vainqueur', () => {
  let s = createGame({ players: PLAYERS, holes: ['baobabs', 'tsingy'], seed: 'x' });
  const first = s.turn;
  assert.equal(applyAction(s, { type: 'shot', angle: 0, power: 0.5 }, PLAYERS[1 - first].id).error.code, 'not_your_turn');
  assert.equal(applyAction(s, { type: 'shot', angle: 0, power: 2 }, PLAYERS[first].id).error.code, 'bad_shot');
  // trou en un pour le premier joueur
  let r = ok(s, { type: 'shot', angle: deg(237), power: 0.875 }, PLAYERS[first].id);
  assert.equal(r.events[0].result, 'hole');
  s = r.state;
  assert.equal(s.turn, 1 - first);
  // l'autre tape tout petit jusqu'à la balle ramassée
  for (let i = 0; i < MAX_STROKES; i++) {
    assert.equal(s.turn, 1 - first); // le premier, déjà dans le trou, ne joue plus
    r = ok(s, { type: 'shot', angle: deg(0), power: 0.03 }, PLAYERS[1 - first].id);
    s = r.state;
  }
  assert.equal(r.events[0].result, 'max');
  assert.deepEqual(s.players[first].scores, [1]);
  assert.deepEqual(s.players[1 - first].scores, [MAX_STROKES + 1]);
  assert.equal(r.events.at(-1).type, 'nextHole');
  assert.equal(s.hole, 1);
  assert.equal(s.turn, first); // honneur au meilleur score
  assert.deepEqual(s.players[0].ball, { x: 50, y: 140 });

  // trou 2 : chacun abandonne vite (tapes minuscules) -> fin de partie
  while (s.phase === 'play') s = ok(s, { type: 'shot', angle: 0, power: 0.03 }, s.players[s.turn].id).state;
  assert.deepEqual(s.winners, [PLAYERS[first].id]);
  const st = minigolf.status(s);
  assert.equal(st.over, true);
  assert.equal(st.result.scores[PLAYERS[first].id], 1 + MAX_STROKES + 1);
  assert.equal(viewFor(s, 'b').me, 1);
});

test('module serveur : options et choix des trous', () => {
  assert.deepEqual(minigolf.cleanOptions({ parcours: 'nope' }), { parcours: 'tour' });
  const s = minigolf.create({ players: PLAYERS, options: minigolf.cleanOptions({ parcours: 'balade' }), seed: 'abc' });
  assert.equal(s.holes.length, 4);
  assert.deepEqual(minigolf.create({ players: PLAYERS, options: { parcours: 'balade' }, seed: 'abc' }).holes, s.holes);
  assert.equal(minigolf.create({ players: PLAYERS, options: { parcours: 'tour' }, seed: 1 }).holes.length, HOLES.length);
  assert.match(minigolf.status(s).label, /Trou 1\/4/);
});
