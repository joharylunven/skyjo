// Rendu des cartes : faces (couleurs par plage de valeurs, libellé, emoji, image) et dos (SVG).

import { h } from './dom.js';

let CARDS = { deck: [], palette: [], special: {}, back: {} };
let MODULES = {};

export function initCards(cardsConfig, modules) {
  CARDS = cardsConfig;
  MODULES = modules;
  const back = cardsConfig.back ?? {};
  const root = document.documentElement.style;
  root.setProperty('--back-1', back.primary ?? '#1e293b');
  root.setProperty('--back-2', back.secondary ?? '#334155');
  root.setProperty('--back-accent', back.accent ?? '#f59e0b');
  root.setProperty('--back-img', `url("${backSvg(back)}")`);
  root.setProperty('--back-label', JSON.stringify(String(back.label ?? '')));
}

function backSvg({ pattern = 'waves', secondary = '#334155', accent = '#f59e0b' }) {
  const s = secondary;
  const a = accent;
  const shapes = {
    waves: `<path d="M0 10 Q5 5 10 10 T20 10" stroke="${s}" stroke-width="2" fill="none"/><path d="M0 20 Q5 15 10 20 T20 20" stroke="${a}" stroke-opacity=".35" stroke-width="1" fill="none"/>`,
    dots: `<circle cx="5" cy="5" r="2" fill="${s}"/><circle cx="15" cy="15" r="2" fill="${a}" fill-opacity=".45"/>`,
    stripes: `<path d="M-5 5 L5 -5 M0 20 L20 0 M15 25 L25 15" stroke="${s}" stroke-width="3"/>`,
    grid: `<path d="M0 0 H20 V20" stroke="${s}" stroke-width="1.5" fill="none"/><circle cx="10" cy="10" r="1.5" fill="${a}" fill-opacity=".5"/>`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">${shapes[pattern] ?? shapes.waves}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Apparence d'une carte : { label, name, emoji, image, bg, bg2, fg }. */
export function appearance(card) {
  if (!card) return { label: '?' };
  if (card.kind === 'number') {
    const entry = CARDS.deck.find((d) => (d.kind ?? 'number') === 'number' && d.value === card.value) ?? {};
    const range = CARDS.palette.find((p) => card.value >= p.min && card.value <= p.max) ?? {};
    return { label: String(card.value), name: String(card.value), ...range, ...entry };
  }
  const fromAddon = Object.values(MODULES)
    .map((m) => m.ui?.faces?.[card.kind])
    .find(Boolean);
  const face = { label: card.kind, ...fromAddon, ...(CARDS.special?.[card.kind] ?? {}) };
  const addonName = Object.values(MODULES).find((m) => m.ui?.faces?.[card.kind])?.name;
  return { name: face.name ?? addonName ?? face.label, ...face };
}

export function cardLabel(card) {
  return appearance(card).name;
}

const imgUrl = (path) => new URL(`../${path}`, import.meta.url).href;

/** Élément DOM d'une carte. slot : null (vide) | { up:false } | { up:true, card } ; ou une carte. */
export function cardEl(slotOrCard, extra = {}) {
  const slot = slotOrCard && 'up' in slotOrCard ? slotOrCard : slotOrCard ? { up: true, card: slotOrCard } : null;
  const { class: cls = '', ...props } = extra;
  if (!slot) return h('div.card.empty', { class: cls, ...props });
  if (!slot.up) return h('div.card.back', { class: cls, 'aria-label': 'Carte cachée', ...props });
  const a = appearance(slot.card);
  const long = String(a.label).length > 2;
  return h(
    'div.card.face',
    {
      class: `${cls} kind-${slot.card.kind}${long ? ' long' : ''}`,
      style: { '--bg': a.bg, '--bg2': a.bg2 ?? a.bg, '--fg': a.fg },
      'aria-label': `Carte ${a.name}`,
      ...props,
    },
    h('span.corner.tl', {}, a.label),
    a.image ? h('img.art', { src: imgUrl(a.image), alt: '' }) : a.emoji ? h('span.emoji', {}, a.emoji) : null,
    h('span.value', {}, a.label),
    h('span.corner.br', {}, a.label),
  );
}
