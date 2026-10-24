// Moteur de jeu : logique pure, sans DOM ni réseau.
// L'état est un objet JSON ; applyAction() ne le modifie jamais et renvoie un nouvel état.

import { createRng, hashSeed, shuffle } from './rng.js';
import { buildDeck, normalizeDeckSpec, DEFAULT_DECK } from './deck.js';
import { activeAddons, getAddon } from './addons.js';
import { allVisible, columnIndices, countVisible, hasHidden } from './grid.js';
import { scorePlayer } from './scoring.js';

export const DEFAULT_RULES = {
  cols: 4,
  rows: 3,
  setupReveals: 2, // cartes retournées par chaque joueur en début de manche
  endThreshold: 100, // la partie s'arrête quand un joueur atteint ce total
  finisherMultiplier: 2, // pénalité du joueur qui finit sans avoir le score strictement le plus bas
  finalColumnCheck: true, // retirer aussi les colonnes complétées par le retournement final
  logSize: 30,
};

export const ERRORS = {
  bad_action: 'Action invalide.',
  unknown_action: 'Action inconnue.',
  unknown_player: 'Joueur inconnu.',
  wrong_phase: "Cette action n'est pas possible maintenant.",
  not_your_turn: "Ce n'est pas votre tour.",
  wrong_step: "Cette action n'est pas possible à cette étape du tour.",
  bad_index: 'Emplacement invalide.',
  empty_slot: 'Il n’y a plus de carte à cet emplacement.',
  already_visible: 'Cette carte est déjà retournée.',
  setup_done: 'Vous avez déjà retourné vos cartes de départ.',
  discard_empty: 'La défausse est vide.',
  deck_empty: 'Plus aucune carte à piocher.',
  must_swap: 'Une carte prise sur la défausse doit être échangée.',
  addon_rule: 'Action refusée par un add-on.',
  internal: 'Erreur interne du moteur.',
};

export class RuleError extends Error {
  constructor(code, message) {
    super(message ?? ERRORS[code] ?? code);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Création

/**
 * Crée une partie et distribue la première manche.
 * @param {object} o
 * @param {{id:string,name?:string}[]} o.players
 * @param {object} [o.rules] surcharge de DEFAULT_RULES
 * @param {{kind?:string,value:number,count:number}[]} [o.deck] répartition du paquet
 * @param {string[]} [o.addons] ids d'add-ons enregistrés
 * @param {object} [o.addonOptions] options par add-on { [id]: {...} }
 * @param {string|number} [o.seed]
 */
export function createGame({ players, rules = {}, deck = DEFAULT_DECK, addons = [], addonOptions = {}, seed = Date.now() }) {
  if (!Array.isArray(players) || players.length < 2) throw new Error('Il faut au moins 2 joueurs');
  for (const id of addons) if (!getAddon(id)) throw new Error(`Add-on inconnu : ${id}`);
  const state = {
    v: 1,
    seed: String(seed),
    rng: hashSeed(seed),
    rules: { ...DEFAULT_RULES, ...rules },
    deckSpec: normalizeDeckSpec(deck),
    addons: [...addons],
    addonOptions: structuredClone(addonOptions),
    addonState: {},
    players: players.map((p) => ({ id: String(p.id), name: String(p.name ?? p.id), total: 0, rounds: [], grid: [] })),
    round: 0,
    phase: 'setup', // setup | play | roundOver | gameOver
    turn: null, // index du joueur dont c'est le tour
    step: null, // draw | decide | flip
    turnCount: 0,
    deck: [],
    discard: [], // le dessus est le dernier élément
    drawn: null, // { card, from: 'deck' | 'discard' }
    finisher: null,
    lastTurns: 0,
    lastRound: null,
    winners: null,
    log: [],
  };
  const ctx = makeCtx(state);
  startRound(state, ctx);
  state.rng = ctx.rng.state;
  return state;
}

// ---------------------------------------------------------------------------
// Point d'entrée

const CORE = { reveal, drawDeck, takeDiscard, swap, discardDrawn, flip, nextRound };

/**
 * Valide et applique une action. Déterministe : même état + même action => même résultat.
 * @returns {{state:object, events:object[]} | {error:{code:string,message:string}}}
 */
export function applyAction(state, action, playerId) {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return fail('bad_action');
  const p = state.players.findIndex((pl) => pl.id === playerId);
  if (p < 0) return fail('unknown_player');
  const s = structuredClone(state);
  const ctx = makeCtx(s);
  try {
    const handler = Object.hasOwn(CORE, action.type) ? CORE[action.type] : addonHandler(s, action.type);
    if (!handler) throw new RuleError('unknown_action');
    handler(s, action, p, ctx);
  } catch (e) {
    if (e instanceof RuleError) return fail(e.code, e.message);
    return fail('internal', String(e?.message ?? e));
  }
  s.rng = ctx.rng.state;
  return { state: s, events: ctx.events };
}

function fail(code, message) {
  return { error: { code, message: message ?? ERRORS[code] ?? code } };
}

// ---------------------------------------------------------------------------
// Contexte transmis aux hooks

function makeCtx(s) {
  const ctx = {
    rng: createRng(s.rng),
    events: [],
    emit(event) {
      ctx.events.push(event);
    },
    log(entry) {
      pushLog(s, entry);
    },
    flip(player, index) {
      flipSlot(s, player, index, ctx);
    },
    checkColumns(player) {
      checkColumns(s, player, ctx);
    },
  };
  return ctx;
}

function hookCtx(s, ctx, addon, extra = {}) {
  const c = Object.create(ctx);
  c.addon = addon.id;
  c.options = s.addonOptions?.[addon.id] ?? {};
  c.store = (s.addonState[addon.id] ??= {});
  return Object.assign(c, extra);
}

function runHook(s, ctx, name, extra) {
  for (const addon of activeAddons(s)) {
    if (addon[name]) addon[name](s, hookCtx(s, ctx, addon, extra));
  }
}

function pushLog(s, entry) {
  s.log.push({ round: s.round, n: s.turnCount, ...entry });
  if (s.log.length > s.rules.logSize) s.log.splice(0, s.log.length - s.rules.logSize);
}

// ---------------------------------------------------------------------------
// Manches

function startRound(s, ctx) {
  s.round += 1;
  let deck = buildDeck(s.deckSpec);
  for (const addon of activeAddons(s)) {
    if (addon.modifyDeck) deck = addon.modifyDeck(deck, hookCtx(s, ctx, addon)) ?? deck;
  }
  deck = deck.map((card, i) => ({ ...card, id: i }));
  shuffle(deck, ctx.rng);
  const size = s.rules.cols * s.rules.rows;
  if (deck.length < size * s.players.length + 1) throw new Error('Paquet trop petit pour distribuer');
  for (const pl of s.players) pl.grid = deck.splice(-size).map((card) => ({ card, up: false }));
  const top = deck.pop();
  s.deck = deck;
  s.discard = [top];
  Object.assign(s, { phase: 'setup', turn: null, step: null, drawn: null, finisher: null, lastTurns: 0, lastRound: null });
  ctx.emit({ type: 'deal', round: s.round });
  pushLog(s, { t: 'round', card: top });
  runHook(s, ctx, 'onSetup', {});
}

function chooseStarter(s, ctx) {
  const visible = s.players.map((pl) => pl.grid.filter((x) => x && x.up).map((x) => Number(x.card.value) || 0));
  const sums = visible.map((v) => v.reduce((a, b) => a + b, 0));
  const best = Math.max(...sums);
  let candidates = sums.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
  if (candidates.length > 1) {
    const highs = candidates.map((i) => Math.max(...visible[i]));
    const top = Math.max(...highs);
    candidates = candidates.filter((_, k) => highs[k] === top);
  }
  const starter = candidates.length === 1 ? candidates[0] : candidates[ctx.rng.int(candidates.length)];
  Object.assign(s, { phase: 'play', turn: starter, step: 'draw', turnCount: s.turnCount + 1 });
  ctx.emit({ type: 'start', player: starter, sums });
  pushLog(s, { t: 'start', p: starter, sums });
}

function endTurn(s, p, ctx) {
  checkColumns(s, p, ctx);
  s.drawn = null;
  if (s.finisher === null && allVisible(s.players[p].grid)) {
    s.finisher = p;
    s.lastTurns = s.players.length - 1;
    ctx.emit({ type: 'finish', player: p });
    pushLog(s, { t: 'finish', p });
  } else if (s.finisher !== null) {
    s.lastTurns -= 1;
  }
  if (s.finisher !== null && s.lastTurns <= 0) return endRound(s, ctx);
  s.turn = (p + 1) % s.players.length;
  s.step = 'draw';
  s.turnCount += 1;
  ctx.emit({ type: 'turn', player: s.turn });
}

function endRound(s, ctx) {
  s.players.forEach((pl, p) => {
    pl.grid.forEach((slot, index) => {
      if (slot && !slot.up) {
        slot.up = true;
        ctx.emit({ type: 'flip', player: p, index, card: slot.card, final: true });
      }
    });
  });
  if (s.rules.finalColumnCheck) s.players.forEach((_, p) => checkColumns(s, p, ctx));

  const raw = s.players.map((_, p) => scorePlayer(s, p));
  const scores = [...raw];
  const doubled = raw.map(() => false);
  const f = s.finisher;
  if (f !== null && raw[f] > 0 && raw.some((v, i) => i !== f && v <= raw[f])) {
    scores[f] = raw[f] * s.rules.finisherMultiplier;
    doubled[f] = true;
  }
  const info = { round: s.round, raw, scores, doubled, finisher: f };
  runHook(s, ctx, 'onRoundEnd', { result: info });

  s.players.forEach((pl, i) => {
    pl.total += info.scores[i];
    pl.rounds.push({ round: s.round, raw: info.raw[i], score: info.scores[i], doubled: info.doubled[i] });
  });
  Object.assign(s, { turn: null, step: null, drawn: null, lastRound: info });
  pushLog(s, { t: 'roundEnd', scores: info.scores });

  if (s.players.some((pl) => pl.total >= s.rules.endThreshold)) {
    const min = Math.min(...s.players.map((pl) => pl.total));
    s.winners = s.players.filter((pl) => pl.total === min).map((pl) => pl.id);
    s.phase = 'gameOver';
  } else {
    s.phase = 'roundOver';
  }
  ctx.emit({ type: 'roundEnd', result: info, phase: s.phase });
}

// ---------------------------------------------------------------------------
// Utilitaires de règles

function requirePlay(s, p, step) {
  if (s.phase !== 'play') throw new RuleError('wrong_phase');
  if (s.turn !== p) throw new RuleError('not_your_turn');
  if (step && s.step !== step) throw new RuleError('wrong_step');
}

function slotAt(s, p, index) {
  const grid = s.players[p].grid;
  if (!Number.isInteger(index) || index < 0 || index >= grid.length) throw new RuleError('bad_index');
  const slot = grid[index];
  if (!slot) throw new RuleError('empty_slot');
  return slot;
}

function flipSlot(s, p, index, ctx) {
  const slot = slotAt(s, p, index);
  if (slot.up) throw new RuleError('already_visible');
  slot.up = true;
  ctx.emit({ type: 'flip', player: p, index, card: slot.card });
  runHook(s, ctx, 'onReveal', { player: p, index, card: slot.card });
}

function matchKey(s, card, ctx) {
  for (const addon of activeAddons(s)) {
    if (!addon.matchKey) continue;
    const k = addon.matchKey(card, hookCtx(s, ctx, addon));
    if (k !== undefined) return k;
  }
  return `${card.kind}:${card.value}`;
}

/** Retire les colonnes de cartes visibles identiques (elles partent sur la défausse). */
function checkColumns(s, p, ctx) {
  const { cols, rows } = s.rules;
  const grid = s.players[p].grid;
  for (let c = 0; c < cols; c++) {
    const idx = columnIndices(c, cols, rows);
    const slots = idx.map((i) => grid[i]);
    if (slots.some((x) => !x || !x.up)) continue;
    // Une clé '*' (renvoyée par un add-on via matchKey) est un joker : elle complète n'importe quelle colonne.
    const keys = slots.map((x) => matchKey(s, x.card, ctx));
    if (keys.includes(null)) continue;
    const fixed = keys.filter((k) => k !== '*');
    if (!fixed.every((k) => k === fixed[0])) continue;
    const cards = slots.map((x) => x.card);
    for (const i of idx) grid[i] = null;
    s.discard.push(...cards);
    ctx.emit({ type: 'column', player: p, col: c, indices: idx, cards });
    pushLog(s, { t: 'column', p, card: cards.find((c) => matchKey(s, c, ctx) !== '*') ?? cards[0] });
  }
}

function ensureDeck(s, ctx) {
  if (s.deck.length > 0) return;
  if (s.discard.length <= 1) throw new RuleError('deck_empty');
  const top = s.discard.pop();
  s.deck = shuffle(s.discard, ctx.rng);
  s.discard = [top];
  ctx.emit({ type: 'reshuffle', count: s.deck.length });
  pushLog(s, { t: 'reshuffle' });
}

// ---------------------------------------------------------------------------
// Actions de base

function reveal(s, a, p, ctx) {
  if (s.phase !== 'setup') throw new RuleError('wrong_phase');
  const grid = s.players[p].grid;
  if (countVisible(grid) >= s.rules.setupReveals) throw new RuleError('setup_done');
  flipSlot(s, p, a.index, ctx);
  pushLog(s, { t: 'reveal', p, card: grid[a.index].card });
  if (s.players.every((pl) => countVisible(pl.grid) >= s.rules.setupReveals)) chooseStarter(s, ctx);
}

function drawDeck(s, a, p, ctx) {
  requirePlay(s, p, 'draw');
  ensureDeck(s, ctx);
  const card = s.deck.pop();
  s.drawn = { card, from: 'deck' };
  s.step = 'decide';
  ctx.emit({ type: 'draw', player: p, from: 'deck', card });
  pushLog(s, { t: 'draw', p, from: 'deck', card });
  runHook(s, ctx, 'onDraw', { player: p, card, source: 'deck' });
}

function takeDiscard(s, a, p, ctx) {
  requirePlay(s, p, 'draw');
  if (s.discard.length === 0) throw new RuleError('discard_empty');
  const card = s.discard.pop();
  s.drawn = { card, from: 'discard' };
  s.step = 'decide';
  ctx.emit({ type: 'draw', player: p, from: 'discard', card });
  pushLog(s, { t: 'draw', p, from: 'discard', card });
  runHook(s, ctx, 'onDraw', { player: p, card, source: 'discard' });
}

function swap(s, a, p, ctx) {
  requirePlay(s, p, 'decide');
  const slot = slotAt(s, p, a.index);
  const { card, from } = s.drawn;
  const old = slot.card;
  s.players[p].grid[a.index] = { card, up: true };
  s.discard.push(old);
  s.drawn = null;
  ctx.emit({ type: 'swap', player: p, index: a.index, card, old, wasUp: slot.up, from });
  pushLog(s, { t: 'swap', p, card, old });
  runHook(s, ctx, 'onSwap', { player: p, index: a.index, card, old, source: from });
  endTurn(s, p, ctx);
}

function discardDrawn(s, a, p, ctx) {
  requirePlay(s, p, 'decide');
  if (s.drawn.from !== 'deck') throw new RuleError('must_swap');
  const { card } = s.drawn;
  s.discard.push(card);
  s.drawn = null;
  ctx.emit({ type: 'discard', player: p, card });
  pushLog(s, { t: 'discard', p, card });
  if (hasHidden(s.players[p].grid)) s.step = 'flip';
  else endTurn(s, p, ctx);
}

function flip(s, a, p, ctx) {
  requirePlay(s, p, 'flip');
  flipSlot(s, p, a.index, ctx);
  pushLog(s, { t: 'flip', p, card: s.players[p].grid[a.index].card });
  endTurn(s, p, ctx);
}

function nextRound(s, a, p, ctx) {
  if (s.phase !== 'roundOver') throw new RuleError('wrong_phase');
  startRound(s, ctx);
}

// ---------------------------------------------------------------------------
// Actions d'add-ons : type "idAddon:nomAction"

function addonHandler(s, type) {
  const sep = type.indexOf(':');
  if (sep < 0) return null;
  const id = type.slice(0, sep);
  const name = type.slice(sep + 1);
  if (!s.addons.includes(id)) return null;
  const addon = getAddon(id);
  const def = addon && Object.hasOwn(addon.actions ?? {}, name) ? addon.actions[name] : null;
  if (!def) return null;
  return (s, a, p, ctx) => {
    const phases = def.phases ?? ['play'];
    if (!phases.includes(s.phase)) throw new RuleError('wrong_phase');
    if (def.requireTurn !== false && s.phase === 'play' && s.turn !== p) throw new RuleError('not_your_turn');
    if (def.steps && !def.steps.includes(s.step)) throw new RuleError('wrong_step');
    const hctx = hookCtx(s, ctx, addon, { player: p });
    const err = def.validate?.(s, a, hctx);
    if (err) throw new RuleError('addon_rule', err);
    def.apply(s, a, hctx);
    if (def.endsTurn) endTurn(s, p, ctx);
  };
}
