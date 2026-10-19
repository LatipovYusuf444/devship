import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, put, git } from './helpers.mjs';
const key = 'AIza' + 'D'.repeat(35);
function publishedFirebase(f) {
  const other = f.clone(); put(other, 'public/firebase-messaging-sw.js', `const firebaseConfig = { apiKey: '${key}' };\n`);
  git(other, 'add', '.'); git(other, 'commit', '-m', 'published Firebase browser config'); git(other, 'push');
}
test('merging an identical published base blob at the same path does not rescan its content as new', t => {
  const f = fixture(t, { checksMode: 'final' }); publishedFirebase(f); put(f.repo, 'own.txt', 'my feature');
  const result = f.run(); assert.equal(result.status, 0, result.text);
  assert.equal(git(f.remote, 'show', 'refs/heads/feature/demo:own.txt'), 'my feature');
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/main:public/firebase-messaging-sw.js'), git(f.remote, 'rev-parse', 'refs/heads/feature/demo:public/firebase-messaging-sw.js'));
});
test('a published blob copied to a new path is still scanned in unpublished history', t => {
  const f = fixture(t, { checksMode: 'final' }); publishedFirebase(f);
  put(f.repo, 'z-copied-config.js', `const firebaseConfig = { apiKey: '${key}' };\n`); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'copy config to new location');
  git(f.repo, 'fetch', 'origin'); git(f.repo, 'merge', '--no-edit', 'origin/main');
  const result = f.run(); assert.equal(result.status, 1, result.text); assert.match(result.text, /\[SECRET\]/);
  assert.throws(() => git(f.remote, 'rev-parse', '--verify', 'refs/heads/feature/demo'));
});
test('a different secret blob at an existing published path remains blocked', t => {
  const f = fixture(t, { checksMode: 'final' }); publishedFirebase(f);
  git(f.repo, 'fetch', 'origin'); git(f.repo, 'merge', '--no-edit', 'origin/main');
  put(f.repo, 'public/firebase-messaging-sw.js', `const key = 'AIza${'E'.repeat(35)}';\n`); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'change key');
  const result = f.run(); assert.equal(result.status, 1, result.text); assert.match(result.text, /\[SECRET\]/);
  assert.throws(() => git(f.remote, 'rev-parse', '--verify', 'refs/heads/feature/demo'));
});
