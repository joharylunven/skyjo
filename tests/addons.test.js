import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyAction, registerAddon, clearAddons, scorePlayer, viewFor, buildDeck, normalizeDeckSpec } from '../engine/index.js';
import joker from '../addons/joker.js';
import double from '../addons/double.js';
import spy from '../addons/spy.js';
import { newGame, act, setGrid, toPlay } from './helpers.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));

beforeEach(() => {
  clearAddons();
  [joker, double, spy].forEach(registerAddon);
});

test('config/cards.json décrit le paquet de 150 cartes et config/addons.json des add-ons existants', () => {
  const cards = readJson('../config/cards.json');
  assert.equal(buildDeck(normalizeDeckSpec(cards.deck)).length, 150);
  const addons = readJson('../config/addons.json');
  for (const id of addons.available) assert.ok([joker, double, spy].some((a) => a.id === id));
  assert.deepEqual(addons.enabled, []); // désactivés par défaut
});

test('add-on inconnu refusé à la création', () => {
  assert.throws(() => newGame({ addons: ['inexistant'] }), /inconnu/);
});

test('modifyDeck : les cartes spéciales sont ajoutées au paquet, avec options', () => {
  const s = newGame({ addons: ['joker', 'double', 'spy'], addonOptions: { joker: { count: 2 } } });
  const all = [...s.deck, ...s.discard, ...s.players.flatMap((p) => p.grid.map((x) => x.card))];
  assert.equal(all.length, 150 + 2 + 3 + 4);
  assert.equal(all.filter((c) => c.kind === 'joker').length, 2);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
});

test('add-on factice : tous les hooks sont appelés et une action personnalisée est validée', () => {
  const calls = [];
  registerAddon({
    id: 'trace',
    modifyDeck: (deck) => (calls.push('modifyDeck'), deck),
    onSetup: (s, ctx) => {
      calls.push('onSetup');
      ctx.store.bonus = 0;
    },
    onDraw: (s, ctx) => calls.push(`onDraw:${ctx.source}`),
    onReveal: (s, ctx) => calls.push(`onReveal:${ctx.index}`),
    onSwap: (s, ctx) => calls.push(`onSwap:${ctx.index}`),
    scoreCard: (card) => (card.value === 12 ? 100 : undefined),
    onRoundEnd: (s, ctx) => {
      calls.push('onRoundEnd');
      ctx.result.scores[1] -= 1;
    },
    actions: {
      bonus: {
        steps: ['draw'],
        validate: (s, a, ctx) => (a.amount > 3 ? 'Trop gros' : null),
        apply: (s, a, ctx) => {
          ctx.store.bonus += a.amount;
          ctx.emit({ type: 'trace:bonus' });
        },
      },
    },
  });
  let s = newGame({ addons: ['trace'] });
  assert.deepEqual(calls, ['modifyDeck', 'onSetup']);
  s = act(s, { type: 'reveal', index: 0 }, 'p0');
  assert.ok(calls.includes('onReveal:0'));

  toPlay(s, 0);
  const refused = applyAction(s, { type: 'trace:bonus', amount: 5 }, 'p0');
  assert.deepEqual(refused.error, { code: 'addon_rule', message: 'Trop gros' });
  assert.equal(applyAction(s, { type: 'trace:bonus', amount: 1 }, 'p1').error.code, 'not_your_turn');
  const ok = applyAction(s, { type: 'trace:bonus', amount: 2 }, 'p0');
  assert.equal(ok.state.addonState.trace.bonus, 2);
  assert.deepEqual(ok.events, [{ type: 'trace:bonus' }]);
  assert.equal(ok.state.turn, 0); // endsTurn absent => le tour continue

  s = act(ok.state, { type: 'takeDiscard' }, 'p0');
  s = act(s, { type: 'swap', index: 3 }, 'p0');
  assert.ok(calls.includes('onDraw:discard') && calls.includes('onSwap:3'));

  setGrid(s, 0, [12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true);
  assert.equal(scorePlayer(s, 0), 100 + 55);

  // fin de manche : onRoundEnd peut corriger les scores
  setGrid(s, 1, [1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2], [...Array(11).fill(true), false]);
  s.turn = 1;
  s.step = 'draw';
  s = act(s, { type: 'drawDeck' }, 'p1');
  s = act(s, { type: 'discardDrawn' }, 'p1');
  s = act(s, { type: 'flip', index: 11 }, 'p1');
  s = act(s, { type: 'drawDeck' }, 'p0');
  s = act(s, { type: 'discardDrawn' }, 'p0');
  assert.equal(s.phase, 'gameOver'); // p0 dépasse 100 grâce au 12 qui vaut 100
  assert.ok(calls.includes('onRoundEnd'));
  assert.equal(s.lastRound.scores[1], s.lastRound.raw[1] - 1);
});

test('Double : une carte ×2 visible double sa colonne, y compris pour le score affiché', () => {
  const s = toPlay(newGame({ addons: ['double'] }), 0);
  const D = { kind: 'double', value: 0 };
  // colonne 0 = index 0, 4, 8
  setGrid(s, 0, [D, 1, 1, 1, 5, 1, 1, 1, -2, 1, 1, 1], true);
  assert.equal(scorePlayer(s, 0), (5 - 2) * 2 + 9);
  s.players[0].grid[0].up = false; // ×2 caché => pas d'effet sur l'affichage
  assert.equal(scorePlayer(s, 0, { visibleOnly: true }), 3 + 9);
  s.players[0].grid[0].up = true;
  s.players[0].grid[1] = { card: { id: 5000, ...D }, up: true };
  s.players[0].grid[5] = { card: { id: 5001, ...D }, up: true };
  // colonne 1 = ×2, ×2, 1 => 1 × 4
  assert.equal(scorePlayer(s, 0), 6 + 4 + 6);
  // fonctionne aussi sur une vue filtrée (côté invité)
  assert.equal(scorePlayer(viewFor(s, 'p1'), 0), 6 + 4 + 6);
});

test('Joker : se déplace une fois par tour avant la pioche', () => {
  let s = toPlay(newGame({ addons: ['joker'] }), 0);
  const J = { kind: 'joker', value: 0 };
  setGrid(s, 0, [J, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [true, false, true, false, false, false, false, false, false, false, false, false]);
  const err = (a, st = s) => applyAction(st, a, 'p0').error?.message;
  assert.match(err({ type: 'joker:move', from: 2, to: 1 }), /Joker visible/);
  assert.match(err({ type: 'joker:move', from: 0, to: 0 }), /autre/);
  s = act(s, { type: 'joker:move', from: 0, to: 1 }, 'p0');
  assert.equal(s.players[0].grid[1].card.kind, 'joker');
  assert.equal(s.players[0].grid[0].up, false); // la carte cachée garde son état
  assert.equal(s.turn, 0);
  assert.match(err({ type: 'joker:move', from: 1, to: 2 }), /déjà/);
  assert.equal(viewFor(s, 'p1').addonState.joker.usedTurn, s.turnCount);
  s = act(s, { type: 'drawDeck' }, 'p0');
  assert.equal(applyAction(s, { type: 'joker:move', from: 1, to: 2 }, 'p0').error.code, 'wrong_step');
});

test('Joker : déplacer peut compléter une colonne qui est alors retirée', () => {
  let s = toPlay(newGame({ addons: ['joker'] }), 0);
  const J = { kind: 'joker', value: 0 };
  // colonne 0 : 7, 7, J  ; la carte en index 9 est un 7 visible
  setGrid(s, 0, [7, 1, 2, 3, 7, 5, 6, 8, J, 7, 10, 11], [true, false, false, false, true, false, false, false, true, true, false, false]);
  s = act(s, { type: 'joker:move', from: 8, to: 9 }, 'p0');
  assert.equal(s.players[0].grid[0], null);
  assert.equal(s.players[0].grid[8], null);
  assert.equal(s.players[0].grid[9].card.kind, 'joker');
});

test('Espion : pioché, il révèle une carte cachée adverse et termine le tour', () => {
  let s = toPlay(newGame({ addons: ['spy'] }), 0);
  s.deck.push({ id: 9000, kind: 'spy', value: 0 });
  const err = (a, st) => applyAction(st, a, 'p0').error;
  assert.equal(err({ type: 'spy:play', target: 1, index: 0 }, s).code, 'wrong_step');
  s = act(s, { type: 'drawDeck' }, 'p0');
  assert.match(err({ type: 'spy:play', target: 5, index: 0 }, s).message, /Joueur/);
  s.players[1].grid[2].up = true;
  assert.match(err({ type: 'spy:play', target: 1, index: 2 }, s).message, /cachée/);
  s = act(s, { type: 'spy:play', target: 1, index: 4 }, 'p0');
  assert.equal(s.players[1].grid[4].up, true);
  assert.equal(s.discard.at(-1).kind, 'spy');
  assert.equal(s.turn, 1);
  assert.equal(s.log.at(-1).t, 'spy:play');
});

test('Espion : ne peut pas être joué s’il vient de la défausse', () => {
  let s = toPlay(newGame({ addons: ['spy'] }), 0);
  s.discard.push({ id: 9000, kind: 'spy', value: 0 });
  s = act(s, { type: 'takeDiscard' }, 'p0');
  assert.match(applyAction(s, { type: 'spy:play', target: 1, index: 0 }, 'p0').error.message, /pioche/);
});
