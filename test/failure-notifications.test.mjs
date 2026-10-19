import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture, put, git, command } from './helpers.mjs';
import { ship } from '../src/ship.mjs';

// Direct orchestration tests must never load a user's actual Telegram credentials.
process.env.DEVSHIP_GLOBAL_CONFIG = join(tmpdir(), `devship-test-settings-${process.pid}`, 'absent.json');
const token = '123456789:' + 'A'.repeat(35);
const settings = { enabled: true, botToken: token, chatId: '-1001234567890', chatTitle: 'Test group', chatType: 'supergroup', timeZone: 'Asia/Tashkent' };
const successful = () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 45 } }) });

test('main conflict sends metadata to Telegram and preserves the conflict without pushing', async t => {
  const f = fixture(t), other = f.clone();
  git(other, 'config', 'user.name', 'Remote Author');
  put(other, 'app.txt', 'REMOTE_SOURCE_BODY\n'); git(other, 'add', '.'); git(other, 'commit', '-m', 'remote edit'); git(other, 'push');
  put(f.repo, 'app.txt', 'LOCAL_SOURCE_BODY\n'); let successCalls = 0; const messages = [];
  await assert.rejects(ship({ cwd: f.repo, log: () => {}, notify: async () => successCalls++, notifyError: async context => {
    const { notifyFailure } = await import('../src/telegram.mjs');
    await notifyFailure(context, { settings, fetchFn: async (url, options) => { messages.push(JSON.parse(options.body)); return successful(); } });
  } }), error => error.code === 'MERGE');
  assert.equal(messages.length, 1); assert.equal(successCalls, 0);
  const text = messages[0].text;
  for (const expected of ['feature/demo', 'origin/main', 'app.txt', 'Remote Author', 'DevShip Test', '1–5', 'Asia/Tashkent']) assert.ok(text.includes(expected), expected);
  assert.doesNotMatch(text, /LOCAL_SOURCE_BODY|REMOTE_SOURCE_BODY/);
  assert.ok(existsSync(join(f.repo, '.git', 'MERGE_HEAD')));
  assert.equal(existsSync(join(f.repo, '.git', 'devship.lock')), false);
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
});

test('check failure includes stdout diagnostics despite stderr warnings and never pushes', async t => {
  const f = fixture(t, { checks: [[process.execPath, '-e', "console.log('src/app.ts(12,3): error TS2304: Cannot find name Missing.'); console.error('warning: no license'); process.exit(7)"]] });
  put(f.repo, 'app.txt', 'work'); const head = git(f.repo, 'rev-parse', 'HEAD'); const failures = [];
  await assert.rejects(ship({ cwd: f.repo, log: () => {}, notifyError: async context => failures.push(context) }), error => error.code === 'COMMAND');
  assert.equal(failures.length, 1); assert.equal(failures[0].stage, 'checks-before-commit');
  assert.match(failures[0].error.message, /src\/app\.ts\(12,3\).*TS2304/);
  assert.deepEqual(failures[0].error.check.argv.slice(0, 2), [process.execPath, '-e']);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
});

test('a final check failure reports its stage and a Telegram failure cannot replace the original error', async t => {
  const script = "const fs=require('fs'); const n=fs.existsSync('checks.log')?Number(fs.readFileSync('checks.log','utf8')):0; fs.writeFileSync('checks.log',String(n+1)); if(n){console.error('src/final.ts:9:2 error: final check failed');process.exit(8)}";
  const f = fixture(t, { checks: [[process.execPath, '-e', script]] }); put(f.repo, 'app.txt', 'work'); let failures = 0; const logs = [];
  await assert.rejects(ship({ cwd: f.repo, log: line => logs.push(line), notifyError: async context => {
    failures++; assert.equal(context.stage, 'checks-after-merge'); throw new Error('fake Telegram unavailable');
  } }), error => error.code === 'COMMAND' && /final check failed/.test(error.message));
  assert.equal(failures, 1); assert.match(logs.join('\n'), /Telegram/);
  assert.equal(existsSync(join(f.repo, '.git', 'devship.lock')), false);
  assert.equal(command(f.remote, 'git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/demo']).status, 1);
});

test('dry run and rejected protected branches never emit failure messages', async t => {
  const f = fixture(t); let failures = 0;
  const options = { cwd: f.repo, log: () => {}, notifyError: async () => failures++ };
  await ship({ ...options, dryRun: true }); git(f.repo, 'switch', 'main');
  await assert.rejects(ship(options), error => error.code === 'PROTECTED');
  assert.equal(failures, 0);
});

test('failure diagnostics redact secrets and omit source frames and inline programs', async () => {
  const { collectFailureReport, formatFailureMessage } = await import('../src/telegram.mjs');
  const error = Object.assign(new Error(`Check failed\nsrc/app.ts(12,3): error TS2304: Cannot find name Missing.\n> 12 | const password='SOURCE_FRAME_SHOULD_NOT_BE_SENT';\nthrow new Error('UNNUMBERED_SOURCE_SHOULD_NOT_BE_SENT');\nError('UNNUMBERED_FUNCTION_SOURCE');\nError: https://api.telegram.org/bot${token}/sendMessage\n+ added secret source line`), {
    code: 'COMMAND', check: { argv: ['node', '-e', 'INLINE_SOURCE_SHOULD_NOT_BE_SENT'] }
  });
  const report = collectFailureReport({ git: { root: '/projects/kimyosanoat' }, branch: 'Yusuf', remote: 'origin', stage: 'checks-before-commit', error, failedAt: '2026-10-19T12:00:00Z' });
  const text = formatFailureMessage(report, 'Asia/Tashkent');
  for (const expected of ['kimyosanoat', 'Yusuf', '17:00:00', 'src/app.ts(12,3)', 'TS2304']) assert.ok(text.includes(expected), expected);
  assert.doesNotMatch(JSON.stringify(report) + text, /SOURCE_FRAME_SHOULD_NOT_BE_SENT|UNNUMBERED_SOURCE_SHOULD_NOT_BE_SENT|UNNUMBERED_FUNCTION_SOURCE|INLINE_SOURCE_SHOULD_NOT_BE_SENT|added secret source line/);
  assert.ok(!text.includes(token));
  error.message = "Check failed\nsrc/check.js:1\nfail('PRIVATE_FUNCTION_BODY');\n^\nReferenceError: fail is not defined";
  assert.ok(!JSON.stringify(collectFailureReport({ git: { root: '/projects/demo' }, branch: 'Yusuf', remote: 'origin', stage: 'checks-before-commit', error, failedAt: '2026-10-19T12:00:00Z' })).includes('PRIVATE_FUNCTION_BODY'));
  for (const argument of ["--eval=throw new Error('ATTACHED_SOURCE')", "-ethrow new Error('ATTACHED_SOURCE')", "--print='ATTACHED_SOURCE'", "-p'ATTACHED_SOURCE'"]) {
    error.check.argv = ['node', argument];
    assert.ok(!JSON.stringify(collectFailureReport({ git: { root: '/projects/demo' }, branch: 'Yusuf', remote: 'origin', stage: 'checks-before-commit', error, failedAt: '2026-10-19T12:00:00Z' })).includes('ATTACHED_SOURCE'));
  }
});

test('large failure reports respect text limits and retain diagnostic context in an attachment', async t => {
  const f = fixture(t); const { Git } = await import('../src/git.mjs');
  const { notifyFailure, retryNotifications } = await import('../src/telegram.mjs');
  const context = { git: new Git(f.repo), config: { telegram: true }, branch: 'feature/demo', remote: 'origin', stage: 'checks-after-merge',
    failedAt: '2026-10-19T12:00:00Z', log: () => {}, error: Object.assign(new Error('Check failed\n' + Array.from({ length: 24 }, (_, i) => `src/file${i}.ts:12:3 error: ${'🙂'.repeat(300)}`).join('\n')), { code: 'COMMAND' }) };
  let calls = 0;
  const result = await notifyFailure(context, { settings, fetchFn: async (url, options) => {
    calls++; if (url.endsWith('/sendMessage')) {
      const body = JSON.parse(options.body); assert.ok(body.text.length <= 4096); assert.match(body.text, /xato-hisobot/); return successful();
    }
    assert.equal(options.body.get('document').name, 'xato-hisobot.txt');
    const text = await options.body.get('document').text(); assert.match(text, /file23\.ts:12:3/); throw new Error('offline');
  } });
  assert.equal(result.status, 'pending'); assert.equal(calls, 2);
  const record = JSON.parse(readFileSync(result.path, 'utf8')); assert.equal(record.kind, 'failure'); assert.ok(!JSON.stringify(record).includes(token));
  await retryNotifications(context.git, { settings, log: () => {}, fetchFn: async url => { assert.ok(url.endsWith('/sendDocument')); calls++; return successful(); } });
  assert.equal(calls, 3); assert.equal(JSON.parse(readFileSync(result.path, 'utf8')).status, 'sent');
});

test('per-project Telegram opt-out keeps failures local', async t => {
  const f = fixture(t, { telegram: false, checks: [[process.execPath, '-e', 'process.exit(6)']] }); let calls = 0;
  await assert.rejects(ship({ cwd: f.repo, log: () => {}, notifyError: async () => calls++ }), error => error.code === 'COMMAND');
  assert.equal(calls, 0);
});
