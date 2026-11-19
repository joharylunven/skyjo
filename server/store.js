// Persistance dans un simple fichier JSON (deux joueurs, quelques centaines de parties : largement
// suffisant). Écriture atomique (fichier temporaire + renommage), regroupée toutes les 200 ms.

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const EMPTY = { version: 1, profiles: [], tokens: [], matches: [] };

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = join(dir, 'db.json');
    mkdirSync(dir, { recursive: true });
    this.data = existsSync(this.file) ? { ...EMPTY, ...JSON.parse(readFileSync(this.file, 'utf8')) } : structuredClone(EMPTY);
    this.timer = null;
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}
