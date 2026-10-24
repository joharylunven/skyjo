// Jeu par défaut : cartes -4, 13 (coup d'œil) et Étoile (joker de colonne à 20 points).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyAction, registerAddon, clearAddons, scorePlayer, viewFor, buildDeck, normalizeDeckSpec } from '../engine/index.js';
import etoile from '../addons/etoile.js';
import coupOeil from '../addons/coup-oeil.js';
import { newGame, act, setGrid, toPlay } from './helpers.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const cards = readJson('../config/cards.json');
const addonsCfg = readJson('../config/addons.json');
const STAR = { kind: 'star', value: 20 };

beforeEach(() => {
  clearAddons();
  [etoile, coupOeil].forEach(registerAddon);
});

const defaultGame = () =>
  newGame({ deck: cards.deck, addons: addonsCfg.enabled, addonOptions: addonsCfg.options });

test('paquet par défaut : base 150 + un -4 + dix 13 + deux Étoiles', () => {
  const deck = buildDeck(normalizeDeckSpec(cards.deck));
  assert.equal(deck.length, 161);
  assert.equal(deck.filter((c) => c.value === -4).length, 1);
  assert.equal(deck.filter((c) => c.value === 13).length, 10);
  assert.deepEqual(addonsCfg.enabled, ['etoile', 'coup-oeil']);
  const s = defaultGame();
  const all = [...s.deck, ...s.discard, ...s.players.flatMap((p) => p.grid.map((x) => x.card))];
  assert.equal(all.length, 163);
  assert.equal(all.filter((c) => c.kind === 'star').length, 2);
});

test('Étoile : complète une colonne de n’importe quelle valeur', () => {
  let s = toPlay(defaultGame(), 0);
  // colonne 0 = index 0, 4, 8 : 5, ★, (5 à venir)
  setGrid(s, 0, [5, 1, 2, 3, STAR, 2, 3, 1, 9, 3, 1, 2], [true, ...Array(3).fill(false), true, ...Array(7).fill(false)]);
  s.discard.push({ id: 7777, kind: 'number', value: 5 });
  s = act(s, { type: 'takeDiscard' }, 'p0');
  s = act(s, { type: 'swap', index: 8 }, 'p0');
  assert.equal(s.players[0].grid[0], null);
  assert.equal(s.players[0].grid[4], null);
  assert.equal(s.players[0].grid[8], null);
  assert.equal(s.log.find((e) => e.t === 'column').card.value, 5);
});

test('Étoile : deux Étoiles + une carte, ou trois Étoiles, complètent aussi la colonne', () => {
  let s = toPlay(defaultGame(), 0);
  setGrid(s, 0, [STAR, 1, 2, 3, STAR, 2, 3, 1, 9, 3, 1, 2], [true, false, false, false, true, ...Array(7).fill(false)]);
  s = act(s, { type: 'drawDeck' }, 'p0');
  s = act(s, { type: 'discardDrawn' }, 'p0');
  s = act(s, { type: 'flip', index: 8 }, 'p0');
  assert.equal(s.players[0].grid[8], null);
});

test('Étoile : vaut 20 points si elle reste dans la grille', () => {
  const s = toPlay(defaultGame(), 0);
  setGrid(s, 0, [STAR, 1, 2, 3, 0, 2, 3, 1, -4, 3, 1, 2], true);
  assert.equal(scorePlayer(s, 0), 20 + 1 + 2 + 3 + 0 + 2 + 3 + 1 - 4 + 3 + 1 + 2); // 34
});

test('13 : poser un 13 donne un coup d’œil secret sur une carte cachée', () => {
  let s = toPlay(defaultGame(), 0);
  s.discard.push({ id: 8888, kind: 'number', value: 13 });
  s = act(s, { type: 'takeDiscard' }, 'p0');
  s = act(s, { type: 'swap', index: 0 }, 'p0');
  assert.equal(s.turn, 1); // le tour passe, le coup d'œil peut se faire pendant le tour adverse
  assert.equal(viewFor(s, 'p0').addonState['coup-oeil'].pending, 1);
  assert.equal(viewFor(s, 'p1').addonState['coup-oeil'].pending, 0);

  assert.match(applyAction(s, { type: 'coup-oeil:look', index: 0 }, 'p0').error.message, /cachées/);
  assert.match(applyAction(s, { type: 'coup-oeil:look', index: 3 }, 'p1').error.message, /Aucun/);
  s = act(s, { type: 'coup-oeil:look', index: 5 }, 'p0');

  const secret = s.players[0].grid[5].card;
  const mine = viewFor(s, 'p0');
  assert.deepEqual(mine.addonState['coup-oeil'].known, [{ index: 5, card: secret }]);
  assert.equal(mine.addonState['coup-oeil'].pending, 0);
  // l'adversaire ne reçoit rien : ni la carte, ni son identifiant
  const theirs = viewFor(s, 'p1');
  assert.deepEqual(theirs.addonState['coup-oeil'], { pending: 0, known: [] });
  assert.ok(!JSON.stringify(theirs).includes(`"id":${secret.id},`));
  assert.equal(s.log.at(-1).t, 'coup-oeil:look');
  assert.equal(s.log.at(-1).card, undefined);
});

test('13 : la connaissance disparaît quand la carte regardée est retournée ou remplacée', () => {
  let s = toPlay(defaultGame(), 0);
  s.addonState['coup-oeil'] = { pending: [1, 0], known: [[], []] };
  s = act(s, { type: 'coup-oeil:look', index: 7 }, 'p0');
  assert.equal(viewFor(s, 'p0').addonState['coup-oeil'].known.length, 1);
  s = act(s, { type: 'drawDeck' }, 'p0');
  s = act(s, { type: 'swap', index: 7 }, 'p0');
  assert.equal(viewFor(s, 'p0').addonState['coup-oeil'].known.length, 0);
});

test('13 : le retourner aussi déclenche le coup d’œil ; pas de coup d’œil sans carte cachée', () => {
  let s = toPlay(defaultGame(), 0);
  setGrid(s, 0, [13, 1, 2, 3, 0, 2, 3, 1, 4, 3, 1, 2], [false, ...Array(11).fill(true)]);
  s = act(s, { type: 'drawDeck' }, 'p0');
  s = act(s, { type: 'discardDrawn' }, 'p0');
  s = act(s, { type: 'flip', index: 0 }, 'p0');
  assert.equal(s.addonState['coup-oeil'].pending[0], 0); // plus aucune carte cachée

  let t = toPlay(defaultGame(), 0);
  setGrid(t, 0, [13, 1, 2, 3, 0, 2, 3, 1, 4, 3, 1, 2], false);
  t = act(t, { type: 'drawDeck' }, 'p0');
  t = act(t, { type: 'discardDrawn' }, 'p0');
  t = act(t, { type: 'flip', index: 0 }, 'p0');
  assert.equal(t.addonState['coup-oeil'].pending[0], 1);
});
