import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { put, cleanupTemp } from './helpers.mjs';

test('owned locks reject an active owner and release idempotently', async t => {
  const root = mkdtempSync(join(tmpdir(), 'devship-lock-')); t.after(() => cleanupTemp(root));
  const { acquireLock } = await import('../src/locks.mjs'); const file = join(root, 'operation.lock');
  const release = acquireLock(file, root);
  assert.throws(() => acquireLock(file, root), e => e.code === 'LOCK');
  release(); release(); assert.equal(existsSync(file), false);
});

test('only a confirmed dead same-host known lock can be recovered', async t => {
  const root = mkdtempSync(join(tmpdir(), 'devship-lock-')); t.after(() => cleanupTemp(root));
  const { acquireLock } = await import('../src/locks.mjs'); const file = join(root, 'operation.lock');
  const dead = { version: 2, pid: 2147483647, host: hostname(), root, token: randomUUID() };
  put(root, 'operation.lock', JSON.stringify(dead));
  const release = acquireLock(file, root); assert.equal(JSON.parse(readFileSync(file)).pid, process.pid); release();
  for (const invalid of [{ pid: 1 }, { ...dead, host: 'another-machine' }, { ...dead, root: root + 'other' }]) {
    put(root, 'operation.lock', JSON.stringify(invalid));
    assert.throws(() => acquireLock(file, root), e => e.code === 'LOCK');
    assert.deepEqual(JSON.parse(readFileSync(file)), invalid);
  }
});
