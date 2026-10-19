import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, git, put, command, cli } from './helpers.mjs';

function blocked(result, code) { assert.equal(result.status, 1, result.text); assert.match(result.text, new RegExp(`\\[${code}\\]`)); }

test('no detected tasks requires explicit allowNoChecks', t => {
  const f = fixture(t); put(f.repo, '.devship.json', '{}'); blocked(f.run(), 'TASKS');
  put(f.repo, '.devship.json', '{"allowNoChecks":true}'); const r = f.run(); assert.equal(r.status, 0, r.text);
});

test('actual npm scripts execute on the host platform twice', t => {
  const f = fixture(t); put(f.repo, '.devship.json', '{}');
  put(f.repo, 'package.json', JSON.stringify({ name: 'fixture', private: true, scripts: {
    test: 'node -e "process.exit(0)"', build: 'node -e "process.exit(0)"' } }));
  const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal((r.text.match(/Tekshiruv: npm run/g) || []).length, 4);
});

test('branch mergeOptions cannot silently discard base changes', t => {
  const f = fixture(t); git(f.repo, 'config', 'branch.feature/demo.mergeOptions', '--strategy=ours --no-ff');
  const other = f.clone(); put(other, 'main-added.txt', 'must be merged');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'base change'); git(other, 'push');
  put(f.repo, 'feature.txt', 'feature'); const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.ok(existsSync(join(f.repo, 'main-added.txt')), 'base change was silently discarded');
});

test('rejects repository lock without touching pending files', t => {
  const f = fixture(t); put(f.repo, '.git/devship.lock', '{"pid":1}'); put(f.repo, 'app.txt', 'pending');
  blocked(f.run(), 'LOCK'); assert.equal(git(f.repo, 'diff', '--cached', '--name-only'), '');
});

test('commit hook rejection preserves files and releases lock', t => {
  const f = fixture(t); put(f.repo, '.git/hooks/pre-commit', '#!/bin/sh\nexit 1\n'); chmodSync(join(f.repo, '.git/hooks/pre-commit'), 0o755);
  const head = git(f.repo, 'rev-parse', 'HEAD'); put(f.repo, 'app.txt', 'pending');
  blocked(f.run(), 'COMMAND'); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(join(f.repo, 'app.txt'), 'utf8'), 'pending');
  assert.equal(existsSync(join(f.repo, '.git/devship.lock')), false);
});

test('remote rejection preserves commit and push retry recovers', t => {
  const f = fixture(t); put(f.remote, 'hooks/pre-receive', '#!/bin/sh\nexit 1\n'); chmodSync(join(f.remote, 'hooks/pre-receive'), 0o755);
  put(f.repo, 'app.txt', 'pending'); blocked(f.run(), 'PUSH'); const head = git(f.repo, 'rev-parse', 'HEAD');
  rmSync(join(f.remote, 'hooks/pre-receive')); const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
});

test('configured base and additional protected patterns are enforced', t => {
  const f = fixture(t, { protectedBranches: ['feature/*'] }); blocked(f.run(), 'PROTECTED');
});

test('unknown config key fails before staging', t => {
  const f = fixture(t); put(f.repo, '.devship.json', '{"chekcs":[]}'); blocked(f.run(), 'CONFIG');
});

test('missing remote base stops publishing while preserving local changes', t => {
  const f = fixture(t, { base: 'nonexistent' }); put(f.repo, 'app.txt', 'x'); blocked(f.run(), 'BASE');
  assert.equal(command(f.remote, 'git', ['rev-parse', '--verify', 'refs/heads/feature/demo']).status, 128);
});

test('filename allowlist never disables token content scan', t => {
  const f = fixture(t, { allowSecretPaths: ['.env'] }); put(f.repo, '.env', 'ghp_' + 'C'.repeat(36)); blocked(f.run(), 'SECRET');
});

test('ignored untracked secret is never staged', t => {
  const f = fixture(t); put(f.repo, '.gitignore', 'node_modules/\nchecks.log\n.env\n');
  put(f.repo, '.env', 'private local configuration'); put(f.repo, 'app.txt', 'x');
  const r = f.run(); assert.equal(r.status, 0, r.text); assert.equal(git(f.repo, 'ls-files', '.env'), '');
});

test('staged secret cannot hide behind a harmless working copy', t => {
  const f = fixture(t); put(f.repo, 'leak.txt', 'ghp_' + 'D'.repeat(36)); git(f.repo, 'add', 'leak.txt');
  put(f.repo, 'leak.txt', 'safe'); blocked(f.run(), 'PARTIAL');
});

test('delete and rename are shipped without leftover staged state', t => {
  const f = fixture(t); git(f.repo, 'mv', 'app.txt', 'renamed.txt'); const r = f.run();
  assert.equal(r.status, 0, r.text); assert.equal(git(f.repo, 'status', '--porcelain'), '');
  assert.equal(git(f.repo, 'ls-files', 'app.txt'), ''); assert.equal(git(f.repo, 'ls-files', 'renamed.txt'), 'renamed.txt');
});

test('subdirectory invocation uses repository root', t => {
  const f = fixture(t); put(f.repo, 'nested/file.txt', 'x');
  const r = command(join(f.repo, 'nested'), process.execPath, [cli], { DEVSHIP_GLOBAL_CONFIG: join(f.root, 'missing.json') });
  assert.equal(r.status, 0, r.text); assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('mirror and followTags configuration still pushes exactly one branch and no tag', t => {
  const f = fixture(t); git(f.repo, 'config', 'remote.origin.mirror', 'true'); git(f.repo, 'config', 'push.followTags', 'true');
  git(f.repo, 'branch', 'unrelated'); git(f.repo, 'tag', '-a', 'private-tag', '-m', 'do not publish');
  put(f.repo, 'app.txt', 'x'); const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal(git(f.remote, 'for-each-ref', '--format=%(refname)', 'refs/tags'), '');
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/unrelated']).status, 1);
});

test('global protection is additive with project config', t => {
  const f = fixture(t); const file = join(f.root, 'global.json'); writeFileSync(file, '{"protectedBranches":["feature/*"]}');
  const r = command(f.repo, process.execPath, [cli], { DEVSHIP_GLOBAL_CONFIG: file }); blocked(r, 'PROTECTED');
});

test('oversized untracked files stop before staging', t => {
  const f = fixture(t, { maxScanBytes: 1024 }); put(f.repo, 'large.dat', 'x'.repeat(1025)); blocked(f.run(), 'SAFETY');
});

test('custom checks cannot escape the repository via cwd', t => {
  const f = fixture(t, { checks: [{ argv: [process.execPath, '-e', 'process.exit(0)'], cwd: '..' }] }); blocked(f.run(), 'CONFIG');
});

test('invalid CLI options fail with usage exit code', t => {
  const f = fixture(t); const r = f.run('--force'); assert.equal(r.status, 2, r.text); assert.match(r.text, /\[USAGE\]/);
});

test('assume-unchanged cannot hide a staged version different from tested files', t => {
  const f = fixture(t, { checks: [[process.execPath, '-e', "if(require('fs').readFileSync('app.txt','utf8').includes('bad'))process.exit(1)"]] });
  put(f.repo, 'app.txt', 'bad unvalidated version'); git(f.repo, 'add', 'app.txt');
  git(f.repo, 'update-index', '--assume-unchanged', 'app.txt'); put(f.repo, 'app.txt', 'safe tested version');
  blocked(f.run(), 'INDEX_FLAGS');
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
});

test('skip-worktree flags stop automatic shipping', t => {
  const f = fixture(t); git(f.repo, 'update-index', '--skip-worktree', 'app.txt');
  put(f.repo, 'app.txt', 'hidden worktree version'); blocked(f.run(), 'INDEX_FLAGS');
});

test('fetch pruneTags configuration cannot delete a local-only tag', t => {
  const f = fixture(t); git(f.repo, 'tag', 'local-only-tag');
  git(f.repo, 'config', 'fetch.pruneTags', 'true'); git(f.repo, 'config', 'remote.origin.pruneTags', 'true');
  put(f.repo, 'app.txt', 'x'); const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal(git(f.repo, 'tag', '--list', 'local-only-tag'), 'local-only-tag');
});

test('configured fetch refmap cannot update or prune local branches', t => {
  const f = fixture(t); const main = git(f.repo, 'rev-parse', 'main'); git(f.repo, 'branch', 'local-only');
  const other = f.clone(); put(other, 'upstream.txt', 'remote main'); git(other, 'add', '.'); git(other, 'commit', '-m', 'remote main'); git(other, 'push');
  git(f.repo, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/heads/*');
  put(f.repo, 'feature.txt', 'local feature'); const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal(git(f.repo, 'rev-parse', 'main'), main);
  assert.equal(git(f.repo, 'rev-parse', 'local-only'), main);
});
