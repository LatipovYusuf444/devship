import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { put, cleanupTemp } from './helpers.mjs';

test('task discovery selects lockfile manager and both declared checks', async t => {
  const { detectTasks } = await import('../src/tasks.mjs');
  const root = mkdtempSync(join(tmpdir(), 'devship-unit-')); t.after(() => cleanupTemp(root));
  put(root, 'package.json', JSON.stringify({ scripts: { build: 'vite build', test: 'node --test' } }));
  put(root, 'pnpm-lock.yaml', '');
  assert.deepEqual(detectTasks(root, {}).map(x => x.argv), [['pnpm', 'run', 'test'], ['pnpm', 'run', 'build']]);
});

test('mixed Maven and Gradle roots each get a lifecycle check', async t => {
  const { detectTasks } = await import('../src/tasks.mjs');
  const root = mkdtempSync(join(tmpdir(), 'devship-unit-')); t.after(() => cleanupTemp(root));
  put(root, 'pom.xml', '<project/>'); put(root, 'build.gradle.kts', '');
  assert.deepEqual(detectTasks(root, {}).map(x => x.argv), [['mvn', '--batch-mode', 'verify'], ['gradle', '--no-daemon', 'build']]);
});

test('ambiguous Node managers fail closed', async t => {
  const { detectTasks } = await import('../src/tasks.mjs');
  const root = mkdtempSync(join(tmpdir(), 'devship-unit-')); t.after(() => cleanupTemp(root));
  put(root, 'package.json', '{"scripts":{"build":"x"}}'); put(root, 'yarn.lock', ''); put(root, 'pnpm-lock.yaml', '');
  assert.throws(() => detectTasks(root, {}));
});

test('strict config rejects unknown keys and unsafe commands', async () => {
  const { validateConfig } = await import('../src/config.mjs');
  assert.throws(() => validateConfig({ chekcs: [] }));
  assert.throws(() => validateConfig({ checks: ['npm test && echo bad'] }));
  assert.throws(() => validateConfig({ checks: [['node', '-e', 'x']], base: '--main' }));
});

test('Windows batch invocation rejects shell expansions and quotes spaces', async () => {
  const { windowsBatchLine } = await import('../src/process.mjs');
  assert.throws(() => windowsBatchLine('npm.cmd', ['%SECRET%']));
  assert.throws(() => windowsBatchLine('npm.cmd', ['x&whoami']));
  assert.equal(windowsBatchLine('C:\\Program Files\\npm.cmd', ['run', 'build']), '""C:\\Program Files\\npm.cmd" "run" "build""');
});

test('additional common provider secrets are blocked without exposing values', async () => {
  const { inspectContent } = await import('../src/safety.mjs');
  const tokens = ['sk_live_' + 'A'.repeat(24), 'glpat-' + 'B'.repeat(20), 'npm_' + 'C'.repeat(36), 'AIza' + 'D'.repeat(35)];
  for (const token of tokens) assert.throws(() => inspectContent('settings.txt', token), error => error.code === 'SECRET' && !error.message.includes(token));
});

test('nested release branches remain protected', async () => {
  const { protectedBranch } = await import('../src/safety.mjs');
  assert.equal(protectedBranch('release/2026/final', { base: 'main', protectedBranches: [] }), true);
});

test('provider tokens and credential URLs are redacted from diagnostics', async () => {
  const { redact } = await import('../src/process.mjs');
  const token = 'sk_live_' + 'E'.repeat(24);
  assert.equal(redact('https://name:password@example.invalid/repo ' + token), 'https://[hidden]@example.invalid/repo [hidden-token]');
});

test('quoted JSON credential keys are scanned like assignment credentials', async () => {
  const { inspectContent } = await import('../src/safety.mjs');
  const secret = 'Q'.repeat(24);
  assert.throws(() => inspectContent('config.json', JSON.stringify({ password: secret })), error => error.code === 'SECRET' && !error.message.includes(secret));
});
