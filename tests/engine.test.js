import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, buildDeck, DEFAULT_DECK, normalizeDeckSpec, viewFor, scorePlayer } from '../engine/index.js';
import { newGame, act, setGrid, toPlay } from './helpers.js';

test('le paquet par défaut contient 150 cartes avec la bonne répartition', () => {
  const deck = buildDeck(normalizeDeckSpec(DEFAULT_DECK));
  assert.equal(deck.length, 150);
  const count = (v) => deck.filter((c) => c.value === v).length;
  assert.equal(count(-2), 5);
  assert.equal(count(-1), 10);
  assert.equal(count(0), 15);
  for (let v = 1; v <= 12; v++) assert.equal(count(v), 10);
});

test('distribution : 12 cartes cachées par joueur, 1 défausse, le reste en pioche', () => {
  const s = newGame();
  for (const p of s.players) {
    assert.equal(p.grid.length, 12);
    assert.ok(p.grid.every((x) => x && !x.up));
  }
  assert.equal(s.discard.length, 1);
  assert.equal(s.deck.length, 150 - 24 - 1);
  const ids = new Set([...s.deck, ...s.discard, ...s.players.flatMap((p) => p.grid.map((x) => x.card))].map((c) => c.id));
  assert.equal(ids.size, 150);
  assert.equal(s.phase, 'setup');
});

test('même seed => même partie (déterminisme)', () => {
  const a = newGame({ seed: 42 });
  const b = newGame({ seed: 42 });
  assert.deepEqual(a, b);
  const c = newGame({ seed: 43 });
  assert.notDeepEqual(a.deck, c.deck);
  const a2 = act(act(a, { type: 'reveal', index: 0 }, 'p0'), { type: 'reveal', index: 1 }, 'p0');
  const b2 = act(act(b, { type: 'reveal', index: 0 }, 'p0'), { type: 'reveal', index: 1 }, 'p0');
  assert.deepEqual(a2, b2);
});

test('applyAction ne modifie pas l’état reçu', () => {
  const s = newGame();
  const before = structuredClone(s);
  act(s, { type: 'reveal', index: 0 }, 'p0');
  assert.deepEqual(s, before);
});

test('départ : chacun retourne 2 cartes, la plus grande somme commence', () => {
  let s = newGame();
  setGrid(s, 0, [5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  setGrid(s, 1, [12, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  s = act(s, { type: 'reveal', index: 0 }, 'p0');
  s = act(s, { type: 'reveal', index: 1 }, 'p0');
  assert.equal(applyAction(s, { type: 'reveal', index: 2 }, 'p0').error.code, 'setup_done');
  s = act(s, { type: 'reveal', index: 0 }, 'p1');
  assert.equal(s.phase, 'setup');
  s = act(s, { type: 'reveal', index: 1 }, 'p1');
  assert.equal(s.phase, 'play');
  assert.equal(s.turn, 1); // 13 > 11
  assert.equal(s.step, 'draw');
});

test('actions illégales refusées avec un code d’erreur', () => {
  const s = toPlay(newGame(), 0);
  const err = (a, p = 'p0', st = s) => applyAction(st, a, p).error?.code;
  assert.equal(err({ type: 'drawDeck' }, 'p1'), 'not_your_turn');
  assert.equal(err({ type: 'drawDeck' }, 'intrus'), 'unknown_player');
  assert.equal(err({ type: 'swap', index: 0 }), 'wrong_step');
  assert.equal(err({ type: 'flip', index: 0 }), 'wrong_step');
  assert.equal(err({ type: 'reveal', index: 0 }), 'wrong_phase');
  assert.equal(err({ type: 'nextRound' }), 'wrong_phase');
  assert.equal(err({ type: 'teleport' }), 'unknown_action');
  assert.equal(err({ type: 'toString' }), 'unknown_action');
  assert.equal(err({ type: 'spy:play' }), 'unknown_action'); // add-on non activé
  assert.equal(err(null), 'bad_action');

  const afterDiscard = act(s, { type: 'takeDiscard' }, 'p0');
  assert.equal(err({ type: 'discardDrawn' }, 'p0', afterDiscard), 'must_swap');
  assert.equal(err({ type: 'swap', index: 12 }, 'p0', afterDiscard), 'bad_index');
  assert.equal(err({ type: 'swap', index: '1' }, 'p0', afterDiscard), 'bad_index');

  const afterDraw = act(s, { type: 'drawDeck' }, 'p0');
  const flipStep = act(afterDraw, { type: 'discardDrawn' }, 'p0');
  assert.equal(flipStep.step, 'flip');
  flipStep.players[0].grid[3].up = true;
  assert.equal(err({ type: 'flip', index: 3 }, 'p0', flipStep), 'already_visible');
  flipStep.players[0].grid[4] = null;
  assert.equal(err({ type: 'flip', index: 4 }, 'p0', flipStep), 'empty_slot');
});

test('pioche : échange (l’ancienne carte va sur la défausse, visible) puis tour suivant', () => {
  let s = toPlay(newGame(), 0);
  const top = s.deck.at(-1);
  const old = s.players[0].grid[5].card;
  s = act(s, { type: 'drawDeck' }, 'p0');
  assert.deepEqual(s.drawn, { card: top, from: 'deck' });
  s = act(s, { type: 'swap', index: 5 }, 'p0');
  assert.deepEqual(s.players[0].grid[5], { card: top, up: true });
  assert.deepEqual(s.discard.at(-1), old);
  assert.equal(s.turn, 1);
  assert.equal(s.step, 'draw');
});

test('pioche : défausser puis retourner une carte cachée', () => {
  let s = toPlay(newGame(), 0);
  const top = s.deck.at(-1);
  s = act(s, { type: 'drawDeck' }, 'p0');
  s = act(s, { type: 'discardDrawn' }, 'p0');
  assert.deepEqual(s.discard.at(-1), top);
  s = act(s, { type: 'flip', index: 7 }, 'p0');
  assert.equal(s.players[0].grid[7].up, true);
  assert.equal(s.turn, 1);
});

test('défausse : la carte prise doit être échangée', () => {
  let s = toPlay(newGame(), 0);
  const top = s.discard.at(-1);
  s = act(s, { type: 'takeDiscard' }, 'p0');
  s = act(s, { type: 'swap', index: 0 }, 'p0');
  assert.deepEqual(s.players[0].grid[0].card, top);
});

test('une colonne de 3 cartes identiques visibles est retirée vers la défausse', () => {
  let s = toPlay(newGame(), 0);
  // colonne 1 = index 1, 5, 9 (grille ligne par ligne, 4 colonnes)
  setGrid(s, 0, [3, 7, 3, 3, 3, 7, 3, 3, 3, 0, 3, 3], [false, true, false, false, false, true, false, false, false, false, false, false]);
  s.discard.push({ id: 999, kind: 'number', value: 7 });
  s = act(s, { type: 'takeDiscard' }, 'p0');
  s = act(s, { type: 'swap', index: 9 }, 'p0');
  const g = s.players[0].grid;
  assert.equal(g[1], null);
  assert.equal(g[5], null);
  assert.equal(g[9], null);
  assert.deepEqual(s.discard.slice(-3).map((c) => c.value), [7, 7, 7]);
  // la colonne 0 (cartes 3 cachées) reste en place
  assert.ok(g[0] && g[4] && g[8]);
});

test('une colonne identique mais avec une carte cachée n’est pas retirée', () => {
  let s = toPlay(newGame(), 0);
  setGrid(s, 0, [7, 1, 1, 1, 7, 1, 1, 1, 7, 1, 1, 1], [true, false, false, false, false, false, false, false, false, false, false, false]);
  s = act(s, { type: 'drawDeck' }, 'p0');
  s = act(s, { type: 'discardDrawn' }, 'p0');
  s = act(s, { type: 'flip', index: 4 }, 'p0');
  assert.ok(s.players[0].grid[0]);
});

/** Prépare une fin de manche : p0 n'a plus qu'une carte cachée (index 11). */
function nearEnd(p0Values, p1Values) {
  const s = toPlay(newGame(), 0);
  setGrid(s, 0, p0Values, p0Values.map((_, i) => i !== 11));
  setGrid(s, 1, p1Values, false);
  return s;
}

function playToRoundEnd(s) {
  s = act(s, { type: 'drawDeck' }, 'p0');
  s = act(s, { type: 'discardDrawn' }, 'p0');
  s = act(s, { type: 'flip', index: 11 }, 'p0'); // p0 a tout retourné
  assert.equal(s.finisher, 0);
  assert.equal(s.phase, 'play');
  assert.equal(s.turn, 1); // dernier tour de l'adversaire
  s = act(s, { type: 'drawDeck' }, 'p1');
  s = act(s, { type: 'discardDrawn' }, 'p1');
  s = act(s, { type: 'flip', index: 0 }, 'p1');
  return s;
}

test('fin de manche : l’adversaire joue un dernier tour puis tout est révélé et compté', () => {
  const s = playToRoundEnd(nearEnd([1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2], [5, 6, 7, 8, 9, 10, 11, 12, 5, 6, 7, 8]));
  assert.equal(s.phase, 'roundOver');
  assert.ok(s.players[1].grid.every((x) => x === null || x.up));
  assert.deepEqual(s.lastRound.raw, [30, 94]);
  assert.deepEqual(s.lastRound.scores, [30, 94]); // le finisseur est le plus bas : pas de doublement
  assert.equal(s.players[0].total, 30);
  assert.equal(s.players[1].total, 94);
  assert.equal(s.round, 1);
  const next = act(s, { type: 'nextRound' }, 'p1');
  assert.equal(next.round, 2);
  assert.equal(next.phase, 'setup');
  assert.equal(next.deck.length, 125);
});

test('scoring : le finisseur qui n’a pas le score strictement le plus bas est doublé', () => {
  const s = playToRoundEnd(nearEnd([5, 5, 5, 6, 6, 6, 1, 1, 1, 2, 2, 2], [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 0]));
  // p0 = 42, p1 = 26 : p0 a fini mais n'est pas le plus bas => 84
  assert.deepEqual(s.lastRound.raw, [42, 26]);
  assert.deepEqual(s.lastRound.scores, [84, 26]);
  assert.deepEqual(s.lastRound.doubled, [true, false]);
});

test('scoring : égalité => doublement (il faut être strictement le plus bas)', () => {
  const s = playToRoundEnd(nearEnd([1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 5], [2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 10]));
  assert.deepEqual(s.lastRound.raw, [20, 20]);
  assert.deepEqual(s.lastRound.scores, [40, 20]);
});

test('scoring : un score négatif ou nul n’est jamais doublé', () => {
  const s = playToRoundEnd(nearEnd([-2, -2, -1, -1, 0, 0, 0, 0, 1, 1, 1, 1], [-2, -2, -2, -1, -1, -1, -1, 0, 0, 0, 0, 0]));
  assert.deepEqual(s.lastRound.raw, [-2, -10]);
  assert.deepEqual(s.lastRound.scores, [-2, -10]);
});

test('colonnes complétées au retournement final retirées avant le décompte', () => {
  // p1 : toutes ses colonnes sont identiques mais cachées ; elles sont retirées à la révélation finale
  const s = playToRoundEnd(nearEnd([1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2], [5, 9, 2, 2, 5, 9, 2, 2, 5, 9, 2, 2]));
  assert.deepEqual(s.lastRound.raw, [30, 0]);
  assert.ok(s.players[1].grid.every((x) => x === null));
});

test('fin de partie au seuil : le total le plus bas gagne, seuil configurable', () => {
  let s = nearEnd([1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2], [5, 6, 7, 8, 9, 10, 11, 12, 5, 6, 7, 8]);
  s.rules.endThreshold = 50;
  s = playToRoundEnd(s);
  assert.equal(s.phase, 'gameOver');
  assert.deepEqual(s.winners, ['p0']);
  assert.equal(applyAction(s, { type: 'nextRound' }, 'p0').error.code, 'wrong_phase');

  const custom = newGame({ rules: { endThreshold: 30 } });
  assert.equal(custom.rules.endThreshold, 30);
});

test('pioche vide : la défausse (sauf le dessus) est remélangée', () => {
  let s = toPlay(newGame(), 0);
  const moved = s.deck.splice(0);
  const top = s.discard.at(-1);
  s.discard = [...moved, top];
  s = act(s, { type: 'drawDeck' }, 'p0');
  assert.equal(s.deck.length, moved.length - 1);
  assert.deepEqual(s.discard, [top]);
});

test('vue filtrée : aucune carte cachée, pioche ni seed transmise', () => {
  let s = newGame();
  s = act(s, { type: 'reveal', index: 0 }, 'p0');
  const v = viewFor(s, 'p1');
  assert.equal(v.me, 1);
  assert.equal(v.deckCount, s.deck.length);
  assert.equal(v.deck, undefined);
  assert.equal(v.seed, undefined);
  assert.equal(v.rng, undefined);
  assert.deepEqual(v.players[0].grid[0], { up: true, card: s.players[0].grid[0].card });
  assert.deepEqual(v.players[0].grid[1], { up: false });
  assert.ok(v.players[1].grid.every((x) => x.up === false && !('card' in x)));
  const json = JSON.stringify(v);
  for (const c of s.deck) assert.ok(!json.includes(`"id":${c.id},`), 'carte de pioche divulguée');
  assert.equal(scorePlayer(v, 0, { visibleOnly: true }), s.players[0].grid[0].card.value);
});
