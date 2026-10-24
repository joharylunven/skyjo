// Grille stockée ligne par ligne : index = ligne * cols + colonne.

export function columnOf(index, cols) {
  return index % cols;
}

export function columnIndices(col, cols, rows) {
  return Array.from({ length: rows }, (_, r) => r * cols + col);
}

/** Vrai si toutes les cartes encore présentes sont visibles. */
export function allVisible(grid) {
  return grid.every((slot) => slot === null || slot.up);
}

export function countVisible(grid) {
  return grid.filter((slot) => slot && slot.up).length;
}

export function hasHidden(grid) {
  return grid.some((slot) => slot && !slot.up);
}
