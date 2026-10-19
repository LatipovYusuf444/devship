import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, put, git, command } from './helpers.mjs';

function savedReport(f) {
  const directory = join(f.repo, '.git', 'devship-conflicts');
  assert.ok(existsSync(directory), 'conflict report directory must be created');
  const names = readdirSync(directory).filter(name => name.endsWith('.json'));
  assert.equal(names.length, 1);
  return JSON.parse(readFileSync(join(directory, names[0]), 'utf8'));
}

test('main conflict reports branches, per-file authors and line ranges, saves report and never pushes', t => {
  const f = fixture(t); const other = f.clone();
  git(f.repo, 'config', 'user.name', 'Mahmud Local'); git(f.repo, 'config', 'user.email', 'mahmud@example.invalid');
  git(other, 'config', 'user.name', 'Ali Remote'); git(other, 'config', 'user.email', 'ali@example.invalid');
  put(other, 'app.txt', 'INCOMING_BODY_MUST_NOT_BE_PRINTED\n'); git(other, 'add', '.'); git(other, 'commit', '-m', 'remote edit'); git(other, 'push');
  const incomingHead = git(other, 'rev-parse', 'HEAD');
  put(f.repo, 'app.txt', 'LOCAL_BODY_MUST_NOT_BE_PRINTED\n');
  const r = f.run(); assert.equal(r.status, 1, r.text); assert.match(r.text, /\[MERGE\]/);
  assert.match(r.text, /feature\/demo/); assert.match(r.text, /origin\/main/);
  assert.match(r.text, /app\.txt/); assert.match(r.text, /Mahmud Local/); assert.match(r.text, /Ali Remote/);
  assert.match(r.text, /1–5/); assert.match(r.text, /CONFLICT \(content\)/);
  assert.doesNotMatch(r.text, /LOCAL_BODY_MUST_NOT_BE_PRINTED|INCOMING_BODY_MUST_NOT_BE_PRINTED/);
  const report = savedReport(f);
  assert.equal(report.currentBranch, 'feature/demo'); assert.equal(report.incomingBranch, 'origin/main');
  assert.equal(report.incomingHead, incomingHead); assert.equal(report.pushPerformed, false);
  assert.equal(report.files[0].path, 'app.txt'); assert.equal(report.files[0].status, 'UU');
  assert.deepEqual(report.files[0].markerRanges, [{ start: 1, end: 5 }]);
  assert.equal(report.files[0].oursCommit.author.name, 'Mahmud Local');
  assert.equal(report.files[0].theirsCommit.author.name, 'Ali Remote');
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
  assert.ok(existsSync(join(f.repo, '.git', 'MERGE_HEAD')));
  assert.equal(f.run().status, 1);
});

test('remote feature conflict identifies that branch and preserves the already-published head', t => {
  const f = fixture(t); assert.equal(f.run().status, 0); const other = f.clone();
  git(other, 'switch', '-c', 'feature/demo', '--track', 'origin/feature/demo');
  put(other, 'app.txt', 'remote feature\n'); git(other, 'add', '.'); git(other, 'commit', '-m', 'remote feature edit'); git(other, 'push');
  const published = git(other, 'rev-parse', 'HEAD'); put(f.repo, 'app.txt', 'local feature\n');
  const r = f.run(); assert.equal(r.status, 1, r.text);
  const report = savedReport(f); assert.equal(report.incomingBranch, 'origin/feature/demo');
  assert.equal(report.currentBranch, 'feature/demo'); assert.equal(report.incomingHead, published);
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/feature/demo'), published);
});

test('modify-delete conflicts have a precise type without invented line numbers', t => {
  const f = fixture(t); const other = f.clone(); git(other, 'rm', 'app.txt');
  git(other, 'commit', '-m', 'remove app'); git(other, 'push'); put(f.repo, 'app.txt', 'local modified\n');
  const r = f.run(); assert.equal(r.status, 1, r.text); const report = savedReport(f);
  assert.equal(report.files[0].status, 'UD'); assert.deepEqual(report.files[0].markerRanges, []);
  assert.match(r.text, /kiruvchi tomonda o‘chirilgan/i);
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
});

test('report write failure still prints conflict details and blocks push', t => {
  const f = fixture(t); const other = f.clone(); put(other, 'app.txt', 'remote\n');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'remote edit'); git(other, 'push');
  put(f.repo, '.git/devship-conflicts', 'directory blocked'); put(f.repo, 'app.txt', 'local\n');
  const r = f.run(); assert.equal(r.status, 1, r.text); assert.match(r.text, /\[MERGE\]/);
  assert.match(r.text, /app\.txt/); assert.match(r.text, /Hisobot faylga saqlanmadi/);
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
});

test('conflict marker ranges support diff3, CRLF and custom marker widths', async () => {
  const { markerRanges } = await import('../src/conflicts.mjs');
  assert.deepEqual(markerRanges('context\r\n<<<<<<<<< HEAD\r\nours\r\n||||||||| base\r\nbase\r\n=========\r\ntheirs\r\n>>>>>>>>> origin/main\r\n'), [{ start: 2, end: 8 }]);
  assert.deepEqual(markerRanges('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> other\ncontext\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> other\n'), [{ start: 1, end: 5 }, { start: 7, end: 11 }]);
  assert.deepEqual(markerRanges('binary\0<<<<<<< HEAD'), []);
});

test('unmerged index parsing preserves unusual filenames and handles add/delete states', async () => {
  const { parseUnmerged } = await import('../src/conflicts.mjs');
  const oid = 'a'.repeat(40), name = '-o‘zbek\tfile\n.txt';
  const records = parseUnmerged(`100644 ${oid} 2\t${name}\0` + `100644 ${oid} 3\t${name}\0` + `100644 ${oid} 1\tdeleted.txt\0` + `100644 ${oid} 2\tdeleted.txt\0`);
  assert.equal(records[0].path, name); assert.equal(records[0].status, 'AA');
  assert.equal(records[1].status, 'UD');
});

test('conflict report terminal text escapes hostile metadata without displaying file contents', async () => {
  const { renderConflictReport } = await import('../src/conflicts.mjs');
  const output = renderConflictReport({ currentBranch: 'feature/demo', incomingBranch: 'origin/main',
    oursHead: 'a'.repeat(40), incomingHead: 'b'.repeat(40), files: [{ path: 'bad\u001b[31m\nfile',
      status: 'UU', markerRanges: [], oursCommit: { hash: 'a'.repeat(40), author: { name: 'Name\u001b[31m', email: 'x@example.invalid' }, date: '2026-10-19' }, theirsCommit: null }] });
  assert.doesNotMatch(output, /\u001b/); assert.match(output, /\\u001b/);
});
