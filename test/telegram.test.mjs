import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { fixture, put, git, cleanupTemp } from './helpers.mjs';

process.env.DEVSHIP_GLOBAL_CONFIG = join(tmpdir(), `devship-test-settings-${process.pid}`, 'absent.json');

const token = '123456789:' + 'A'.repeat(35);
const settings = { enabled: true, botToken: token, chatId: '-1001234567890', chatType: 'supergroup', chatTitle: 'Dev team', timeZone: 'Asia/Tashkent' };
function temp(t) {
  const base = process.env.DEVSHIP_TEST_TMP || tmpdir(), root = mkdtempSync(join(base, 'devship-telegram-'));
  t.after(() => cleanupTemp(root, base)); return root;
}
const successful = result => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });

test('notification runs only after a successful push and uses the published branch', async t => {
  const f = fixture(t); put(f.repo, 'new.txt', 'hello'); const calls = [];
  const { ship } = await import('../src/ship.mjs');
  await ship({ cwd: f.repo, log: () => {}, notify: async context => {
    calls.push(context); assert.equal(git(f.remote, 'rev-parse', 'refs/heads/feature/demo'), context.after);
  } });
  assert.equal(calls.length, 1); assert.equal(calls[0].branch, 'feature/demo');
  assert.equal(calls[0].remote, 'origin'); assert.ok(!Number.isNaN(Date.parse(calls[0].pushedAt)));
  await ship({ cwd: f.repo, log: () => {}, notify: async () => calls.push('duplicate') });
  assert.equal(calls.length, 1, 'up-to-date branch must not notify again');
});

test('dry run and failed checks never notify', async t => {
  const f = fixture(t, { checks: [[process.execPath, '-e', 'process.exit(3)']] }); put(f.repo, 'app.txt', 'x');
  const { ship } = await import('../src/ship.mjs'); let calls = 0;
  const options = { cwd: f.repo, log: () => {}, notify: async () => calls++ };
  await ship({ ...options, dryRun: true });
  await assert.rejects(ship(options)); assert.equal(calls, 0);
});

test('a concurrent publisher of the same commit does not trigger a redundant notification', async t => {
  const f = fixture(t); put(f.repo, 'new.txt', 'hello'); let calls = 0, published = false;
  const { ship } = await import('../src/ship.mjs');
  await ship({ cwd: f.repo, log: line => {
    if (line.startsWith('Push:')) { git(f.repo, 'push', 'origin', 'refs/heads/feature/demo:refs/heads/feature/demo'); published = true; }
  }, notify: async () => calls++ });
  assert.equal(published, true); assert.equal(calls, 0);
});

test('Telegram failure does not turn a completed Git push into a Git failure', async t => {
  const f = fixture(t); put(f.repo, 'app.txt', 'x'); const logs = [];
  const { ship } = await import('../src/ship.mjs');
  await ship({ cwd: f.repo, log: line => logs.push(line), notify: async () => { throw new Error('simulated Telegram timeout'); } });
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/feature/demo'), git(f.repo, 'rev-parse', 'HEAD'));
  assert.match(logs.join('\n'), /Push muvaffaqiyatli.*Telegram/);
});

test('Telegram API posts JSON to the fixed HTTPS endpoint with plain text and no link previews', async () => {
  const { telegramCall } = await import('../src/telegram-api.mjs'); let request;
  const result = await telegramCall(token, 'sendMessage', { chat_id: settings.chatId, text: '<plain>&text' }, {
    fetchFn: async (url, options) => { request = { url, options }; return successful({ message_id: 42 }); }
  });
  assert.equal(request.url, `https://api.telegram.org/bot${token}/sendMessage`);
  assert.equal(request.options.method, 'POST'); assert.equal(request.options.redirect, 'error');
  assert.equal(JSON.parse(request.options.body).text, '<plain>&text'); assert.equal(result.message_id, 42);
});

test('Telegram transport errors never reveal the token or request URL', async () => {
  const { telegramCall } = await import('../src/telegram-api.mjs');
  await assert.rejects(telegramCall(token, 'sendMessage', {}, { fetchFn: async () => { throw new Error(`failed https://api.telegram.org/bot${token}/sendMessage`); } }), error => !error.message.includes(token) && !error.message.includes('https://'));
  await assert.rejects(telegramCall(token, 'sendMessage', {}, { fetchFn: async () => ({ ok: false, status: 403, json: async () => ({ ok: false, description: token }) }) }), error => error.code === 'TELEGRAM' && !error.message.includes(token));
});

test('Telegram credentials save outside the repo, round-trip and can be disabled', async t => {
  const { saveTelegramSettings, loadTelegramSettings } = await import('../src/telegram-store.mjs');
  const file = join(temp(t), 'telegram.json');
  saveTelegramSettings(settings, file);
  assert.deepEqual(loadTelegramSettings(file), settings);
  if (process.platform === 'win32') assert.ok(!readFileSync(file, 'utf8').includes(token), 'Windows storage must use DPAPI');
  saveTelegramSettings({ ...settings, enabled: false }, file); assert.equal(loadTelegramSettings(file).enabled, false);
});

test('notification text includes project, branch, changed files and timezone timestamp', async () => {
  const { formatPushMessage } = await import('../src/telegram.mjs');
  const text = formatPushMessage({ project: 'YePost', branch: 'feature/demo', remote: 'origin', after: 'a'.repeat(40), pushedAt: '2026-10-19T10:00:00.000Z',
    commits: [{ hash: 'b'.repeat(40), subject: 'feat: search', author: 'Mahmud', date: '2026-10-19T09:00:00Z' }], files: [{ status: 'M', path: 'src/a.tsx' }] }, 'Asia/Tashkent');
  assert.match(text, /YePost/); assert.match(text, /feature\/demo/); assert.match(text, /src\/a\.tsx/);
  assert.match(text, /19\.10\.2026/); assert.match(text, /15:00:00/); assert.match(text, /Asia\/Tashkent/);
  assert.match(text, /feat: search/); assert.ok(text.length <= 4096);
});

test('long push summaries explicitly indicate omitted entries and remain within Telegram limits', async () => {
  const { formatPushMessage } = await import('../src/telegram.mjs');
  const text = formatPushMessage({ project: 'Project', branch: 'feature/demo', remote: 'origin', after: 'a'.repeat(40), pushedAt: '2026-10-19T10:00:00Z', commits: [],
    files: Array.from({ length: 1000 }, (_, i) => ({ status: 'A', path: 'src/' + 'uzun'.repeat(80) + i + '.ts' })) }, 'Asia/Tashkent');
  assert.ok(text.length <= 4096); assert.match(text, /1000/); assert.match(text, /to‘liq|yana/i);
});

test('successful notification persists a receipt and has no secret in the project outbox', async t => {
  const f = fixture(t); put(f.repo, 'file.txt', 'x'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'feat: new file');
  const { notifyPush } = await import('../src/telegram.mjs'); const { Git } = await import('../src/git.mjs'); const requests = [];
  const result = await notifyPush({ git: new Git(f.repo), config: { telegram: true }, branch: 'feature/demo', remote: 'origin', before: git(f.repo, 'rev-parse', 'main'), after: git(f.repo, 'rev-parse', 'HEAD'), pushedAt: '2026-10-19T10:00:00Z', log: () => {} }, {
    settings, fetchFn: async (url, options) => { requests.push(JSON.parse(options.body)); return successful({ message_id: 7 }); }
  });
  assert.equal(result.status, 'sent'); assert.equal(requests[0].chat_id, settings.chatId); assert.match(requests[0].text, /file\.txt/);
  assert.match(requests[0].text, /feat: new file/); assert.deepEqual(requests[0].link_preview_options, { is_disabled: true });
  const stored = readFileSync(result.path, 'utf8'); assert.ok(!stored.includes(token)); assert.equal(JSON.parse(stored).summaryMessageId, 7);
});

test('failed notification remains retryable, and retry only targets the original configured chat', async t => {
  const f = fixture(t); const { Git } = await import('../src/git.mjs'); const { notifyPush, retryNotifications } = await import('../src/telegram.mjs');
  const context = { git: new Git(f.repo), config: { telegram: true }, branch: 'feature/demo', remote: 'origin', before: git(f.repo, 'rev-parse', 'main'), after: git(f.repo, 'rev-parse', 'HEAD'), pushedAt: '2026-10-19T10:00:00Z', log: () => {} };
  const failed = await notifyPush(context, { settings, fetchFn: async () => { throw new Error('timeout'); } });
  assert.equal(failed.status, 'pending'); assert.ok(existsSync(failed.path)); let calls = 0;
  await assert.rejects(retryNotifications(context.git, { settings: { ...settings, chatId: '-100999999' }, fetchFn: async () => { calls++; return successful({ message_id: 8 }); }, log: () => {} }));
  assert.equal(calls, 0);
  await retryNotifications(context.git, { settings, fetchFn: async () => { calls++; return successful({ message_id: 8 }); }, log: () => {} });
  assert.equal(calls, 1);
  await retryNotifications(context.git, { settings, fetchFn: async () => { calls++; return successful({ message_id: 9 }); }, log: () => {} });
  assert.equal(calls, 1, 'acknowledged messages must not be resent');
});

test('group pairing accepts only the unique command and ignores private chats and old unrelated messages', async () => {
  const { findPairingChat } = await import('../src/telegram-setup.mjs');
  const updates = [
    { message: { text: '/devship_setup@my_bot CODE', chat: { id: 5, type: 'private' } } },
    { message: { text: '/devship_setup@my_bot WRONG', chat: { id: -5, type: 'group' } } },
    { message: { text: '/devship_setup@my_bot CODE', chat: { id: -1005, type: 'supergroup', title: 'Team' } } }
  ];
  assert.deepEqual(findPairingChat(updates, '/devship_setup@my_bot CODE'), { id: -1005, type: 'supergroup', title: 'Team' });
  assert.equal(findPairingChat(updates, '/devship_setup@my_bot OTHER'), null);
});

test('bot tokens are blocked in staged content and redacted from console diagnostics', async () => {
  const { inspectContent } = await import('../src/safety.mjs'); const { redact } = await import('../src/process.mjs');
  assert.throws(() => inspectContent('config.json', JSON.stringify({ botToken: token })), error => error.code === 'SECRET');
  assert.equal(redact(`token=${token}`), 'token=[hidden-token]');
});

test('Telegram API URLs and tokens ending in a dash cannot bypass protection', async () => {
  const { inspectContent } = await import('../src/safety.mjs'); const { redact } = await import('../src/process.mjs');
  for (const secret of [token, token.slice(0, -1) + '-']) {
    const url = `https://api.telegram.org/bot${secret}/sendMessage`;
    assert.throws(() => inspectContent('request.txt', url), error => error.code === 'SECRET');
    assert.ok(!redact(url).includes(secret));
  }
});

test('credentials cannot be saved inside any Git project', async t => {
  const f = fixture(t); const { saveTelegramSettings } = await import('../src/telegram-store.mjs');
  const file = join(f.repo, 'private-settings', 'telegram.json');
  assert.throws(() => saveTelegramSettings(settings, file), error => error.code === 'TELEGRAM');
  assert.equal(existsSync(file), false);
});

test('secret prompt returns the token without echoing it or adding terminal history', async () => {
  const { createPrompter } = await import('../src/telegram-setup.mjs'); let printed = '';
  const input = new PassThrough(); input.isTTY = true;
  const output = new Writable({ write(chunk, encoding, done) { printed += chunk.toString(); done(); } });
  const ui = createPrompter({ input, output });
  const answer = ui.ask('Token: ', { secret: true });
  setImmediate(() => input.write(token + '\r'));
  assert.equal(await answer, token); ui.close(); input.destroy();
  assert.ok(!printed.includes(token)); assert.match(printed, /Token:/);
});

test('setup binds only the confirmed group using a unique pairing code', async t => {
  const { setupTelegram } = await import('../src/telegram-setup.mjs');
  const { loadTelegramSettings } = await import('../src/telegram-store.mjs');
  const file = join(temp(t), 'telegram.json'); let commandText, closed = false;
  const answers = [token, '', '', 'ha', ''];
  await setupTelegram({ file, prompt: { ask: async () => answers.shift(), close: () => { closed = true; } },
    log: line => { const match = /\/devship_setup@my_bot [a-f0-9]+/.exec(line); if (match) commandText = match[0]; },
    fetchFn: async url => url.endsWith('/getMe') ? successful({ is_bot: true, username: 'my_bot' })
      : successful([{ message: { text: commandText, chat: { id: -1001234567890, type: 'supergroup', title: 'Dev team' } } }]) });
  assert.equal(closed, true); assert.equal(loadTelegramSettings(file).chatId, '-1001234567890');
});

test('ambiguous group pairing refuses to choose a recipient', async () => {
  const { findPairingChat } = await import('../src/telegram-setup.mjs');
  assert.throws(() => findPairingChat([-5, -6].map(id => ({ message: { text: 'command CODE', chat: { id, type: 'group' } } })), 'command CODE'));
});

test('large notifications attach full metadata and retry resumes after the acknowledged summary', async t => {
  const f = fixture(t); for (let i = 0; i < 60; i++) put(f.repo, `src/${'long-name-'.repeat(8)}${i}.txt`, 'SOURCE_CONTENT_NEVER_SENT');
  git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'feat: many files');
  const { notifyPush, retryNotifications } = await import('../src/telegram.mjs'); const { Git } = await import('../src/git.mjs');
  const context = { git: new Git(f.repo), config: { telegram: true }, branch: 'feature/demo', remote: 'origin', before: git(f.repo, 'rev-parse', 'main'), after: git(f.repo, 'rev-parse', 'HEAD'), pushedAt: '2026-10-19T10:00:00Z', log: () => {} };
  const first = await notifyPush(context, { settings, fetchFn: async url => { if (url.endsWith('/sendMessage')) return successful({ message_id: 21 }); throw new Error('attachment timeout'); } });
  assert.equal(first.status, 'pending'); assert.equal(JSON.parse(readFileSync(first.path, 'utf8')).summaryMessageId, 21);
  let calls = 0;
  await retryNotifications(context.git, { settings, log: () => {}, fetchFn: async (url, options) => {
    calls++; assert.ok(url.endsWith('/sendDocument')); assert.ok(options.body instanceof FormData);
    const text = await options.body.get('document').text(); assert.match(text, /60 fayl/); assert.doesNotMatch(text, /SOURCE_CONTENT_NEVER_SENT/);
    return successful({ message_id: 22 });
  } });
  assert.equal(calls, 1); assert.equal(JSON.parse(readFileSync(first.path, 'utf8')).status, 'sent');
});

test('Unicode summaries obey the text limit and generic credentials are hidden', async () => {
  const { formatPushMessage } = await import('../src/telegram.mjs'); const password = 'Q'.repeat(24);
  const text = formatPushMessage({ project: '🙂'.repeat(300), branch: 'feature/' + '🙂'.repeat(300), remote: 'origin', after: 'a'.repeat(40), pushedAt: '2026-10-19T10:00:00Z',
    commits: [{ hash: 'b'.repeat(40), subject: 'password=' + password, author: 'User', date: '2026-10-19' }],
    files: Array.from({ length: 100 }, () => ({ status: 'M', path: '🙂'.repeat(300) })) }, 'Asia/Tashkent');
  assert.ok(text.length <= 4096); assert.ok(!text.includes(password));
  assert.ok(![...text].some(c => c.length === 1 && /[\uD800-\uDFFF]/.test(c)));
});
