// Terrains de pétanque à Quiberon. Plateau de 100 × 160 (y vers le bas) ; le cercle de lancer est
// en bas, on joue vers le haut.
//
//   bounds   limites du terrain : une boule qui sort est morte
//   zones    sol différent : wet (sable mouillé, roule mieux), paves, deck (planches, roulent
//            loin), algues et galets (freinent), flaque (boule noyée = morte)
//   obstacles  ronds { x, y, r } ou polygones { poly } : on rebondit dessus
//   decor    purement visuel

export const TERRAINS = [
  {
    id: 'grande-plage',
    name: 'La Grande Plage',
    ground: 'sand',
    sea: 'top',
    bounds: { x0: 20, x1: 80, y0: 20, y1: 154 },
    circle: [50, 145],
    zones: [
      {
        type: 'wet',
        poly: [
          [58, 20],
          [80, 20],
          [80, 58],
          [66, 48],
        ],
      },
    ],
    obstacles: [
      { x: 65, y: 76, r: 4.6, style: 'castle' },
      { x: 33, y: 60, r: 2.2, style: 'bucket' },
    ],
    decor: [
      { k: 'parasol', x: 9, y: 70, s: 1 },
      { k: 'sunbather', x: 9, y: 96, s: 1 },
      { k: 'parasol', x: 91, y: 120, s: 0.9, color: '#e1262d' },
      { k: 'gull', x: 89, y: 60, s: 1 },
      { k: 'gull', x: 12, y: 140, s: 0.9 },
      { k: 'kite', x: 90, y: 32, s: 1 },
      { k: 'crab', x: 90, y: 92, s: 1 },
      { k: 'flag', x: 10, y: 34, s: 1 },
      { k: 'stand', x: 91, y: 150, s: 1, label: 'Caramels' },
      { k: 'boat', x: 30, y: 7, s: 1 },
      { k: 'boat', x: 75, y: 11, s: 0.8, sail: '#e1262d' },
    ],
  },
  {
    id: 'port-maria',
    name: 'Le quai de Port Maria',
    ground: 'paves',
    sea: 'left',
    bounds: { x0: 22, x1: 82, y0: 18, y1: 154 },
    circle: [52, 145],
    zones: [
      {
        type: 'flaque',
        poly: [
          [60, 92],
          [70, 88],
          [76, 94],
          [70, 102],
          [61, 100],
        ],
      },
    ],
    obstacles: [
      {
        style: 'pot',
        poly: [
          [30, 70],
          [39, 70],
          [39, 77],
          [30, 77],
        ],
      },
      { x: 70, y: 52, r: 2.4, style: 'bollard' },
      { x: 36, y: 112, r: 2.4, style: 'bollard' },
    ],
    decor: [
      { k: 'trawler', x: 10, y: 60, s: 1 },
      { k: 'boat', x: 10, y: 120, s: 0.9 },
      { k: 'lighthouse', x: 92, y: 34, s: 1 },
      { k: 'gull', x: 92, y: 80, s: 1 },
      { k: 'gull', x: 90, y: 112, s: 0.85 },
      { k: 'lobsterpots', x: 92, y: 140, s: 1 },
      { k: 'stand', x: 92, y: 100, s: 0.9, label: 'Crêpes' },
    ],
  },
  {
    id: 'cote-sauvage',
    name: 'La Côte Sauvage',
    ground: 'sand',
    sea: 'right',
    bounds: { x0: 16, x1: 76, y0: 18, y1: 154 },
    circle: [46, 145],
    zones: [
      {
        type: 'galets',
        poly: [
          [16, 70],
          [40, 64],
          [46, 80],
          [16, 88],
        ],
      },
      {
        type: 'algues',
        poly: [
          [52, 40],
          [76, 34],
          [76, 54],
          [56, 56],
        ],
      },
    ],
    obstacles: [
      {
        style: 'rock',
        poly: [
          [52, 96],
          [60, 90],
          [66, 96],
          [62, 104],
          [53, 103],
        ],
      },
      { x: 28, y: 44, r: 3.2, style: 'rock' },
    ],
    decor: [
      { k: 'castle', x: 88, y: 20, s: 1 },
      { k: 'gull', x: 88, y: 90, s: 1 },
      { k: 'crab', x: 6, y: 120, s: 1 },
      { k: 'crab', x: 86, y: 140, s: 0.9 },
      { k: 'flag', x: 7, y: 40, s: 0.9 },
      { k: 'boat', x: 92, y: 62, s: 0.8 },
    ],
  },
  {
    id: 'haliguen',
    name: 'Les pontons de Port Haliguen',
    ground: 'deck',
    sea: 'both',
    bounds: { x0: 24, x1: 76, y0: 18, y1: 154 },
    circle: [50, 145],
    zones: [
      {
        type: 'sand',
        poly: [
          [24, 104],
          [44, 104],
          [44, 122],
          [24, 122],
        ],
      },
    ],
    obstacles: [
      { x: 56, y: 64, r: 3.4, style: 'table' },
      {
        style: 'dinghy',
        poly: [
          [30, 40],
          [42, 36],
          [46, 42],
          [34, 47],
        ],
      },
      { x: 64, y: 110, r: 2.2, style: 'bollard' },
    ],
    decor: [
      { k: 'boat', x: 9, y: 40, s: 1 },
      { k: 'boat', x: 91, y: 90, s: 1, sail: '#f2b84b' },
      { k: 'trawler', x: 9, y: 120, s: 0.85 },
      { k: 'gull', x: 90, y: 40, s: 0.9 },
      { k: 'gull', x: 10, y: 84, s: 0.9 },
      { k: 'stand', x: 90, y: 140, s: 0.9, label: 'Chocolats' },
      { k: 'flag', x: 92, y: 116, s: 0.9 },
    ],
  },
];

export const terrainById = (id) => TERRAINS.find((t) => t.id === id) ?? TERRAINS[0];

/** Zone où le cochonnet doit s'arrêter (entre « 6 et 10 mètres »). */
export const COCHONNET_ZONE = { y0: 34, y1: 100, margin: 5 };
