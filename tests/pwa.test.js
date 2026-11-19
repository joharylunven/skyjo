// Vérifie le service worker, le manifest et les pages de la salle de jeux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const read = (p) => readFileSync(join(pub, p), 'utf8');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    statSync(full).isDirectory() ? walk(full, out) : out.push('/' + full.slice(pub.length).split('\\').join('/'));
  }
  return out;
}

test('sw.js pré-cache tous les fichiers de public/ (et rien d’inexistant)', () => {
  const sw = read('sw.js');
  const block = sw.slice(sw.indexOf('const PRECACHE = ['), sw.indexOf('];', sw.indexOf('const PRECACHE = [')));
  const listed = new Set([...block.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]));
  for (const f of walk(pub)) if (f !== '/sw.js') assert.ok(listed.has(f), `${f} absent de PRECACHE dans public/sw.js`);
  for (const p of listed) if (p !== '/') assert.doesNotThrow(() => read(p.slice(1)), `${p} listé mais introuvable`);
});

test('manifest : application installable sur l’écran d’accueil', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.start_url, '/');
  assert.equal(m.display, 'standalone');
  for (const icon of m.icons) assert.doesNotThrow(() => readFileSync(join(pub, icon.src)));
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
});

test('pages : icône iPhone et manifest déclarés', () => {
  for (const page of ['index.html', 'skyjojo/index.html']) {
    const html = read(page);
    assert.match(html, /apple-touch-icon/);
    assert.match(html, /rel="manifest"/);
    assert.match(html, /apple-mobile-web-app-capable/);
  }
});
