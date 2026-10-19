import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, put, git, command, cli } from './helpers.mjs';

test('commits safe changes, runs checks twice, publishes only feature branch and sets upstream', t => {
  const f = fixture(t, { checks: [[process.execPath, '-e', "require('fs').appendFileSync('checks.log','ok\\n')"]] });
  const main = git(f.repo, 'rev-parse', 'main'); put(f.repo, 'new file.txt', 'hello\n');
  const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/feature/demo'), git(f.repo, 'rev-parse', 'HEAD'));
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/main'), main);
  assert.equal(git(f.repo, 'rev-parse', '--abbrev-ref', '@{upstream}'), 'origin/feature/demo');
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
  assert.equal(readFileSync(join(f.repo, 'checks.log'), 'utf8'), 'ok\nok\n');
});

test('dry run changes neither index, HEAD nor remote refs and runs no task', t => {
  const f = fixture(t); put(f.repo, 'app.txt', 'changed'); const head = git(f.repo, 'rev-parse', 'HEAD');
  const before = git(f.repo, 'status', '--porcelain'); const r = f.run('--dry-run');
  assert.equal(r.status, 0, r.text); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.repo, 'status', '--porcelain'), before);
  assert.equal(command(f.remote, 'git', ['rev-parse', '--verify', 'refs/heads/feature/demo']).status, 128);
});

test('protected and detached branches fail before staging', t => {
  const f = fixture(t); git(f.repo, 'switch', 'main'); put(f.repo, 'app.txt', 'x');
  assert.notEqual(f.run().status, 0); assert.equal(git(f.repo, 'diff', '--cached', '--name-only'), '');
  git(f.repo, 'switch', '--detach'); assert.notEqual(f.run().status, 0);
});

for (const [name, file, content] of [
  ['secret path', '.env', 'MODE=production'],
  ['secret content', 'config.txt', 'token = ghp_' + 'A'.repeat(36)],
  ['private key', 'data.txt', '-----BEGIN RSA PRIVATE KEY-----'],
  ['build output', 'dist/app.js', 'compiled']
]) test(`blocks ${name} before commit`, t => {
  const f = fixture(t); const head = git(f.repo, 'rev-parse', 'HEAD'); put(f.repo, file, content);
  const r = f.run(); assert.notEqual(r.status, 0, r.text); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.repo, 'diff', '--cached', '--name-only'), '');
});

test('partial staging is preserved and refused', t => {
  const f = fixture(t); put(f.repo, 'app.txt', 'staged'); git(f.repo, 'add', 'app.txt');
  put(f.repo, 'app.txt', 'unstaged'); const index = git(f.repo, 'show', ':app.txt');
  const r = f.run(); assert.notEqual(r.status, 0); assert.equal(git(f.repo, 'show', ':app.txt'), index);
  assert.equal(readFileSync(join(f.repo, 'app.txt'), 'utf8'), 'unstaged');
});

test('failing initial checks leave HEAD and index untouched', t => {
  const f = fixture(t, { checks: [[process.execPath, '-e', 'process.exit(9)']] });
  put(f.repo, 'app.txt', 'changed'); const head = git(f.repo, 'rev-parse', 'HEAD');
  const r = f.run(); assert.notEqual(r.status, 0); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.repo, 'diff', '--cached', '--name-only'), '');
});

test('checks that rewrite files stop before commit', t => {
  const f = fixture(t, { checks: [[process.execPath, '-e', "require('fs').writeFileSync('app.txt','rewritten')"]] });
  put(f.repo, 'app.txt', 'changed'); const head = git(f.repo, 'rev-parse', 'HEAD');
  assert.notEqual(f.run().status, 0); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
});

test('merges updated main and validates final result', t => {
  const f = fixture(t); const other = f.clone(); put(other, 'upstream.txt', 'main update');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'main update'); git(other, 'push');
  put(f.repo, 'feature.txt', 'feature'); const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal(readFileSync(join(f.repo, 'upstream.txt'), 'utf8'), 'main update');
  assert.equal(command(f.repo, 'git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']).status, 0);
});

test('merges both sides of divergent feature history without rewriting', t => {
  const f = fixture(t); assert.equal(f.run().status, 0); const other = f.clone();
  git(other, 'switch', '-c', 'feature/demo', '--track', 'origin/feature/demo');
  put(other, 'remote.txt', 'remote'); git(other, 'add', '.'); git(other, 'commit', '-m', 'remote change'); git(other, 'push');
  const remoteHead = git(other, 'rev-parse', 'HEAD');
  put(f.repo, 'local.txt', 'local'); const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal(command(f.repo, 'git', ['merge-base', '--is-ancestor', remoteHead, 'HEAD']).status, 0);
  assert.ok(existsSync(join(f.repo, 'remote.txt'))); assert.ok(existsSync(join(f.repo, 'local.txt')));
});

test('merge conflict stops push and leaves conflict for manual resolution', t => {
  const f = fixture(t); const other = f.clone(); put(other, 'app.txt', 'remote\n');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'conflict'); git(other, 'push');
  put(f.repo, 'app.txt', 'local\n'); const r = f.run(); assert.notEqual(r.status, 0, r.text);
  assert.ok(existsSync(join(f.repo, '.git', 'MERGE_HEAD')));
  assert.match(git(f.repo, 'status', '--porcelain'), /UU app.txt/);
  assert.equal(command(f.remote, 'git', ['rev-parse', '--verify', 'refs/heads/feature/demo']).status, 128);
  assert.notEqual(f.run().status, 0);
});

test('scans secrets in earlier unpublished commits even after deletion', t => {
  const f = fixture(t); put(f.repo, 'leak.txt', 'ghp_' + 'B'.repeat(36));
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'leak');
  rmSync(join(f.repo, 'leak.txt')); git(f.repo, 'add', '-u'); git(f.repo, 'commit', '-m', 'remove');
  const r = f.run(); assert.notEqual(r.status, 0, r.text);
  assert.equal(command(f.remote, 'git', ['rev-parse', '--verify', 'refs/heads/feature/demo']).status, 128);
});

test('clean published branch does not create empty commits', t => {
  const f = fixture(t); assert.equal(f.run().status, 0); const head = git(f.repo, 'rev-parse', 'HEAD');
  const r = f.run(); assert.equal(r.status, 0, r.text); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
});

test('literal path staging accepts pathspec-like and non-ASCII filenames', t => {
  const f = fixture(t); put(f.repo, '[abc].txt', 'one'); put(f.repo, 'o‘zbek.txt', 'two');
  put(f.repo, '-file.txt', 'three'); const r = f.run(); assert.equal(r.status, 0, r.text);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('mismatched push URL is refused', t => {
  const f = fixture(t); git(f.repo, 'remote', 'set-url', '--push', 'origin', join(f.root, 'elsewhere.git'));
  put(f.repo, 'app.txt', 'x'); assert.notEqual(f.run().status, 0);
  assert.equal(git(f.repo, 'diff', '--cached', '--name-only'), '');
});

test('final checks failure keeps local commit but never pushes it', t => {
  const f = fixture(t, { checks: [[process.execPath, '-e', "const fs=require('fs');if(fs.existsSync('checks.log'))process.exit(7);fs.writeFileSync('checks.log','first')"]] });
  put(f.repo, 'app.txt', 'x'); const head = git(f.repo, 'rev-parse', 'HEAD'); const r = f.run();
  assert.notEqual(r.status, 0, r.text); assert.notEqual(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.equal(command(f.remote, 'git', ['rev-parse', '--verify', 'refs/heads/feature/demo']).status, 128);
});
