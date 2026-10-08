import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'gh-pages');
const html = readFileSync(join(output, 'index.html'), 'utf8');

test('build has a current edition marker and every local entry asset exists', () => {
  assert.match(html, /pixel-20261008-fragment-logic/);
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(urls.some(url => /assets\/.*\.js$/.test(url)));
  for (const url of urls.filter(value => !/^(https?:|data:)/.test(value))) {
    const relative = url.replace(/^\/memory-drift-game\//, '').replace(/^\.\//, '').replace(/^\//, '');
    const file = resolve(output, relative);
    assert.ok(file.startsWith(resolve(output)), relative);
    assert.ok(existsSync(file), relative);
  }
  assert.equal(JSON.parse(readFileSync(join(output, 'version.json'), 'utf8')).character, 'brown-hair-faceless');
  assert.equal(JSON.parse(readFileSync(join(output, 'version.json'), 'utf8')).worldProps, 12);
  assert.equal(existsSync(join(output, 'qa.html')), false, 'local staged preview is not a public entry');
});

test('current art and audio are present; obsolete assets are absent', () => {
  const assets = readdirSync(join(output, 'assets'));
  assert.ok(assets.some(name => /^atlas-.*\.png$/.test(name)));
  assert.ok(assets.some(name => /^background-.*\.png$/.test(name)));
  assert.ok(!assets.some(name => /traveler-run-back|grid-surreal|layout-v14/.test(name)));
  const audio = ['memory-static.mp3', 'metal-hit-a.mp3', 'metal-hit-b.mp3', 'pynchon-loop.mp3'];
  assert.deepEqual(readdirSync(join(output, 'audio')).sort(), audio);
  for (const name of audio) assert.ok(readFileSync(join(output, 'audio', name)).length > 1000);
});

test('new entry points do not reference removed vertical components or styles', () => {
  for (const relative of ['standalone/main.tsx', 'app/layout.tsx', 'app/page.tsx']) {
    const text = readFileSync(join(root, relative), 'utf8');
    assert.doesNotMatch(text, /MemoryRushGame|presentation\.css|layout-v14/);
  }
  assert.match(readFileSync(join(root, 'standalone/main.tsx'), 'utf8'), /LandscapeMemoryGame/);
});
