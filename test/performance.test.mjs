import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, put, git, command } from './helpers.mjs';

test('final check mode validates committed merged code exactly once and pushes only the feature', t => {
  const script = "const fs=require('fs');if(!fs.existsSync('upstream.txt'))process.exit(4);fs.appendFileSync('checks.log','ok\\n')";
  const f = fixture(t, { checksMode: 'final', checks: [[process.execPath, '-e', script]] });
  const other = f.clone(); put(other, 'upstream.txt', 'main change'); git(other, 'add', '.'); git(other, 'commit', '-m', 'upstream'); git(other, 'push');
  const remoteMain = git(f.remote, 'rev-parse', 'refs/heads/main'); put(f.repo, 'local.txt', 'local change');
  const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal(readFileSync(join(f.repo, 'checks.log'), 'utf8'), 'ok\n');
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/main'), remoteMain);
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/feature/demo'), git(f.repo, 'rev-parse', 'HEAD'));
  assert.equal(command(f.repo, 'git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']).status, 0);
});

test('final mode failing checks preserve the local commit and never push', t => {
  const f = fixture(t, { checksMode: 'final', checks: [[process.execPath, '-e', 'process.exit(9)']] });
  put(f.repo, 'app.txt', 'work'); const head = git(f.repo, 'rev-parse', 'HEAD');
  const r = f.run(); assert.notEqual(r.status, 0); assert.match(r.text, /\[COMMAND\]/);
  assert.notEqual(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.repo, 'show', 'HEAD:app.txt'), 'work');
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
});

test('final mode checks that rewrite a file block push', t => {
  const f = fixture(t, { checksMode: 'final', checks: [[process.execPath, '-e', "require('fs').writeFileSync('app.txt','rewritten')"]] });
  put(f.repo, 'app.txt', 'work'); const r = f.run();
  assert.notEqual(r.status, 0); assert.match(r.text, /\[(?:DIRTY|CHANGED)\]/);
  assert.equal(git(f.repo, 'show', 'HEAD:app.txt'), 'work');
  assert.equal(readFileSync(join(f.repo, 'app.txt'), 'utf8'), 'rewritten');
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
});

test('final mode detects conflicts before spending time on checks', t => {
  const f = fixture(t, { checksMode: 'final', checks: [[process.execPath, '-e', "require('fs').appendFileSync('checks.log','ran')"]] });
  const other = f.clone(); put(other, 'app.txt', 'remote'); git(other, 'add', '.'); git(other, 'commit', '-m', 'conflict'); git(other, 'push');
  put(f.repo, 'app.txt', 'local'); const r = f.run(); assert.match(r.text, /\[MERGE\]/);
  assert.notEqual(r.status, 0); assert.equal(existsSync(join(f.repo, 'checks.log')), false);
  assert.ok(existsSync(join(f.repo, '.git', 'MERGE_HEAD')));
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
});

test('final mode dry run remains read-only and secret scanning still precedes commits', t => {
  const f = fixture(t, { checksMode: 'final' }); put(f.repo, 'app.txt', 'work');
  const head = git(f.repo, 'rev-parse', 'HEAD'), state = git(f.repo, 'status', '--porcelain');
  const dry = f.run('--dry-run'); assert.equal(dry.status, 0, dry.text);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head); assert.equal(git(f.repo, 'status', '--porcelain'), state);
  put(f.repo, '.env', 'MODE=private'); const r = f.run(); assert.match(r.text, /\[SECRET\]/);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
});

test('only supported check modes are accepted', async () => {
  const { validateConfig } = await import('../src/config.mjs');
  for (const checksMode of ['both', 'final']) assert.equal(validateConfig({ checksMode }).checksMode, checksMode);
  for (const checksMode of ['none', 'fast', false, null]) assert.throws(() => validateConfig({ checksMode }), error => error.code === 'CONFIG');
});

test('run-local history scan cache avoids rereading immutable verified blobs', async t => {
  const f = fixture(t); put(f.repo, 'file.txt', 'content'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'local');
  const { Git, scanHistory } = await import('../src/git.mjs'); const { defaults } = await import('../src/config.mjs');
  const repository = new Git(f.repo); let reads = 0;
  const raw = repository.raw.bind(repository); repository.raw = (...args) => { if (args[0] === 'cat-file' && args[1] === 'blob') reads++; return raw(...args); };
  const verified = new Set(); scanHistory(repository, defaults, 'refs/remotes/origin/feature/demo', 'origin/main', verified);
  const firstReads = reads; assert.ok(firstReads > 0);
  scanHistory(repository, defaults, 'refs/remotes/origin/feature/demo', 'origin/main', verified);
  assert.equal(reads, firstReads);
  put(f.repo, '.env', 'content'); git(f.repo, 'add', '.env'); git(f.repo, 'commit', '-m', 'same blob secret path');
  assert.throws(() => scanHistory(repository, defaults, 'refs/remotes/origin/feature/demo', 'origin/main', verified), error => error.code === 'SECRET');
});
