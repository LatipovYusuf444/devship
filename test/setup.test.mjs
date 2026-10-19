import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough, Writable } from 'node:stream';
import { put, cleanupTemp, fixture, git, command, cli } from './helpers.mjs';
import { detectTasks } from '../src/tasks.mjs';

function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'devship-setup-')); t.after(() => cleanupTemp(root));
  put(root, 'project/package.json', JSON.stringify({ scripts: { 'check:types': 'tsc --noEmit', 'test:unit': 'node --test', build: 'vite build', dev: 'vite' } }));
  put(root, 'project/yarn.lock', ''); put(root, 'project/package-lock.json', '{}');
  return { root: join(root, 'project'), file: join(root, 'preferences.json') };
}

test('explicit manager selection resolves duplicate lockfiles without modifying project files', async t => {
  const { root, file } = project(t), before = readFileSync(join(root, 'package.json'), 'utf8');
  const { saveProjectManager } = await import('../src/project-settings.mjs');
  saveProjectManager(root, 'yarn', file);
  assert.deepEqual(detectTasks(root, {}, { preferencesFile: file }).map(t => t.argv), [
    ['yarn', 'run', 'check:types'], ['yarn', 'run', 'test:unit'], ['yarn', 'run', 'build']
  ]);
  assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before);
  assert.equal(existsSync(join(root, '.devship.json')), false);
  assert.equal(existsSync(join(root, 'package-lock.json')), true);
});

test('a manager declaration change invalidates saved selection and requires explicit review', async t => {
  const { root, file } = project(t);
  const { saveProjectManager } = await import('../src/project-settings.mjs');
  saveProjectManager(root, 'yarn', file);
  put(root, 'package.json', JSON.stringify({ packageManager: 'npm@10.0.0', scripts: { build: 'vite build' } }));
  assert.throws(() => detectTasks(root, {}, { preferencesFile: file }), e => e.code === 'TASKS_SETUP');
});

test('ordinary prompts remain visible after a hidden token prompt', async () => {
  const { createPrompter } = await import('../src/telegram-setup.mjs'); let printed = '';
  const input = new PassThrough(); input.isTTY = true;
  const output = new Writable({ write(chunk, encoding, done) { printed += chunk; done(); } });
  const ui = createPrompter({ input, output });
  const secret = ui.ask('Token: ', { secret: true }); input.write('PRIVATE_TOKEN\r'); await secret;
  printed = '';
  const answer = ui.ask('Guruh IDsi: ');
  assert.match(printed, /Guruh IDsi:/);
  printed = ''; input.write('x'); input.write('\x7f');
  assert.match(printed, /Guruh IDsi:/, 'redrawing the input must keep its question');
  input.write('-123\r'); assert.equal(await answer, '-123');
  ui.close(); input.destroy();
});

test('setup records an explicit interactive choice and doctor never alters the repository', async t => {
  const { root, file } = project(t); const { setupProject } = await import('../src/project-setup.mjs');
  await setupProject({ root, preferencesFile: file, prompt: { ask: async () => 'yarn', close() {} }, log() {} });
  assert.equal(detectTasks(root, {}, { preferencesFile: file })[0].argv[0], 'yarn');
  const f = fixture(t), before = git(f.repo, 'status', '--porcelain=v1');
  const result = f.run('doctor');
  assert.equal(result.status, 0, result.text); assert.match(result.text, /feature\/demo/);
  assert.equal(git(f.repo, 'status', '--porcelain=v1'), before);
  assert.equal(existsSync(join(f.repo, '.git/devship.lock')), false);
});

test('doctor reports the common repository lock from a linked worktree', t => {
  const f = fixture(t), linked = join(f.root, 'linked');
  git(f.repo, 'worktree', 'add', '-b', 'feature/linked', linked, 'main');
  put(f.repo, '.git/devship.lock', '{"pid":1}');
  const result = command(linked, process.execPath, [cli, 'doctor'], { DEVSHIP_GLOBAL_CONFIG: join(f.root, 'absent.json') });
  assert.equal(result.status, 1, result.text); assert.match(result.text, /XATO Lock: Lock mavjud/);
});
