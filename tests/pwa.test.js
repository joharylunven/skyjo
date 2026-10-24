// Vérifie que le service worker pré-cache bien tous les fichiers statiques du jeu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('sw.js pré-cache tous les fichiers de engine/, net/, ui/, addons/, config/, css/, icons/', () => {
  const sw = read('sw.js');
  const listed = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));
  for (const dir of ['engine', 'net', 'ui', 'addons', 'config', 'css', 'icons']) {
    for (const file of readdirSync(new URL(`${dir}/`, root))) {
      assert.ok(listed.has(`${dir}/${file}`), `${dir}/${file} absent de PRECACHE dans sw.js`);
    }
  }
  for (const p of listed) if (p) assert.doesNotThrow(() => read(p), `${p} listé mais introuvable`);
});

test('manifest : chemins relatifs et icônes présentes', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  for (const icon of m.icons) {
    assert.ok(!icon.src.startsWith('/'), 'chemin absolu interdit (site servi sous /nom-du-repo/)');
    assert.doesNotThrow(() => readFileSync(new URL(icon.src, root)));
  }
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
});

test('index.html : aucun chemin absolu', () => {
  const html = read('index.html');
  assert.ok(!/(src|href)="\//.test(html));
});

test('la version de PeerJS est figée', () => {
  const net = JSON.parse(read('config/network.json'));
  assert.match(net.peerjsUrl, /peerjs@\d+\.\d+\.\d+\//);
});
