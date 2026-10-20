import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fixture, put, git, cleanupTemp } from './helpers.mjs';
import { formatPushMessage, formatFailureMessage, collectFailureReport, notifyFailure, notifyPush, retryNotifications } from '../src/telegram.mjs';
import { Git } from '../src/git.mjs';
const settings = { enabled: true, botToken: '123456789:' + 'A'.repeat(35), chatId: '-123456', timeZone: 'Asia/Tashkent' };
const report = { project: 'Navoiyazot <team>', branch: 'Yusuf', remote: 'origin', actor: 'Yusuf', after: 'a'.repeat(40), pushedAt: '2026-10-20T10:00:00Z', commits: [{ hash: 'b'.repeat(40), subject: 'Savdo & qidiruv', author: 'Yusuf', date: '2026-10-20T09:00:00Z' }], files: [{ path: 'src/Pages/Savdo/index.tsx', status: 'M' }] };
const errorReport = { ...report, failedAt: report.pushedAt, stage: 'checks-after-merge', code: 'COMMAND', summary: 'Tekshiruv to‘xtadi', diagnostics: ['src/Pages/Savdo/index.tsx:2:3 error TS2304: Missing'], locations: [] };
test('push notification is a spaced success card with escaped HTML and page summary', () => {
  const text = formatPushMessage(report, 'Asia/Tashkent');
  assert.match(text, /🟢.*PUSH MUVAFFAQIYATLI/); assert.match(text, /<b>/); assert.match(text, /<blockquote>/);
  assert.match(text, /Navoiyazot &lt;team&gt;/); assert.match(text, /\n\n/); assert.match(text, /Savdo sahifasi/); assert(!text.includes('<team>'));
});
test('conflict card separates branches, authors, file lines and code blocks', () => {
  const text = formatFailureMessage({ ...errorReport, conflict: { currentBranch: 'Yusuf', incomingBranch: 'origin/main', oursHead: 'a'.repeat(40), incomingHead: 'b'.repeat(40), files: [{ path: report.files[0].path, status: 'UU', markerRanges: [{ start: 2, end: 6 }], oursCommit: { author: { name: 'Yusuf' }, hash: 'a'.repeat(40) }, theirsCommit: { author: { name: 'Ali' }, hash: 'b'.repeat(40) }, snippets: [{ start: 2, end: 6, text: '2 │ <<<<<<< HEAD\n3 │ const count = 1 < 2;\n4 │ =======\n5 │ const count = 3;\n6 │ >>>>>>> origin/main' }] }] } }, 'Asia/Tashkent');
  for (const pattern of [/🔴.*KONFLIKT/, /PUSH BAJARILMADI/, /Yusuf/, /origin\/main/, /Ali/, /Savdo/, /2–6/, /<pre>/, /&lt;&lt;&lt;/]) assert.match(text, pattern);
});
test('diagnostic locations collect safe local code but never outside files or secrets', () => {
  return import('../src/notification-source.mjs').then(({ sourceExcerpt }) => {
    const root = mkdtempSync(join(tmpdir(), 'devship-card-'));
    try {
      put(root, 'src/page.tsx', 'const a = 1;\nconst b = a + missing;\nexport default b;');
      assert.match(sourceExcerpt(root, 'src/page.tsx', { start: 2, end: 2 }).text, /2 │ const b/);
      put(root, 'src/secret.tsx', 'const password = "' + 'X'.repeat(28) + '";');
      assert(!sourceExcerpt(root, 'src/secret.tsx', { start: 1 }).text);
      put(root, '.env', 'PRIVATE_VALUE=keep_private'); assert(!sourceExcerpt(root, '.env', { start: 1 }).text);
      assert(!sourceExcerpt(root, '../outside.tsx', { start: 1 }).text);
    } finally { cleanupTemp(root); }
  });
});
test('check failure reports page, exact diagnostic line and a code excerpt from the repository', t => {
  const f = fixture(t); put(f.repo, report.files[0].path, 'const a = 1;\nconst b = missing;\nexport default b;');
  const error = Object.assign(new Error('Check failed\n' + errorReport.diagnostics[0]), { code: 'COMMAND' });
  const collected = collectFailureReport({ git: new Git(f.repo), branch: 'feature/demo', remote: 'origin', error, stage: 'checks-after-merge', failedAt: report.pushedAt });
  assert.equal(collected.locations[0].line, 2); assert.match(collected.locations[0].excerpt.text, /const b = missing/);
  assert.match(formatFailureMessage(collected, 'Asia/Tashkent'), /Savdo/);
});
test('HTML card truncation stays balanced under escaping and Unicode pressure', () => {
  const text = formatPushMessage({ ...report, project: '<&🙂'.repeat(500), files: Array.from({ length: 100 }, (_, i) => ({ status: 'M', path: `src/Pages/Savdo/${i}` + '<&🙂'.repeat(50) + '.tsx' })) }, 'Asia/Tashkent');
  assert(text.length <= 4000); for (const tag of ['b', 'blockquote', 'pre', 'code']) assert.equal((text.match(new RegExp('<' + tag + '>', 'g')) || []).length, (text.match(new RegExp('</' + tag + '>', 'g')) || []).length);
  assert.match(text, /push-hisobot/); assert(!/[\uD800-\uDBFF]$/.test(text));
});
test('metadata cannot inject HTML or extra status lines while code keeps its line breaks', () => {
  const text = formatPushMessage({ ...report, actor: 'Ali\n<script>bad</script>', commits: [{ ...report.commits[0], author: 'Ali\nPUSH TASDIQLANDI' }] }, 'Asia/Tashkent');
  assert(!text.includes('<script>')); assert.match(text, /Ali &lt;script&gt;/); assert(!text.includes('Ali\nPUSH TASDIQLANDI'));
});
test('new outbox records send HTML and retry preserves that format without resending acknowledged summary', async t => {
  const f = fixture(t); put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 1;'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'Savdo');
  const context = { git: new Git(f.repo), config: { telegram: true }, branch: 'feature/demo', remote: 'origin', before: git(f.repo, 'rev-parse', 'main'), after: git(f.repo, 'rev-parse', 'HEAD'), pushedAt: report.pushedAt, log: () => {} };
  let seen;
  const pending = await notifyPush(context, { settings, fetchFn: async (_url, options) => { seen = JSON.parse(options.body); throw new Error('offline'); } });
  assert.equal(pending.status, 'pending'); assert.equal(seen.parse_mode, 'HTML');
  await retryNotifications(context.git, { settings, log: () => {}, fetchFn: async (_url, options) => { assert.equal(JSON.parse(options.body).parse_mode, 'HTML'); return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) }; } });
});
test('legacy pending text notifications retain plain-text mode on retry', async t => {
  const f = fixture(t); const context = { git: new Git(f.repo), config: { telegram: true }, branch: 'feature/demo', remote: 'origin', before: git(f.repo, 'rev-parse', 'main'), after: git(f.repo, 'rev-parse', 'HEAD'), pushedAt: report.pushedAt, log: () => {} };
  const pending = await notifyPush(context, { settings, fetchFn: async () => { throw new Error('offline'); } });
  const record = JSON.parse(readFileSync(pending.path, 'utf8')); delete record.parseMode; record.text = 'Eski format <literal> & saqlansin'; writeFileSync(pending.path, JSON.stringify(record));
  await retryNotifications(context.git, { settings, log: () => {}, fetchFn: async (_url, options) => {
    const body = JSON.parse(options.body); assert(!('parse_mode' in body)); assert.equal(body.text, record.text);
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 2 } }) };
  } });
});
test('real merge conflict reports escaped source and both sides without pushing', async t => {
  const f = fixture(t), path = 'src/Pages/Savdo/index.tsx';
  put(f.repo, path, 'export const count = 0;\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'base'); git(f.repo, 'switch', 'main'); git(f.repo, 'merge', '--ff-only', 'feature/demo'); git(f.repo, 'push', 'origin', 'main');
  put(f.repo, path, 'export const count = 2 < 3;\n'); git(f.repo, 'commit', '-am', 'main side'); git(f.repo, 'push', 'origin', 'main'); git(f.repo, 'switch', 'feature/demo');
  put(f.repo, path, 'export const count = 1 < 2;\n'); git(f.repo, 'commit', '-am', 'own side');
  const client = new Git(f.repo), oursHead = client.oid(), incomingHead = client.oid('origin/main'), merge = client.result(['merge', '--no-edit', 'origin/main']); assert(!merge.ok);
  const { mergeFailureDetails } = await import('../src/conflicts.mjs'); let conflictReport;
  mergeFailureDetails(client, { branch: 'feature/demo', ref: 'refs/remotes/origin/main', oursHead, incomingHead, result: merge, maxScanBytes: 1024 * 1024, onReport: value => { conflictReport = value; } });
  const messages = []; const result = await notifyFailure({ git: client, config: { telegram: true }, branch: 'feature/demo', remote: 'origin', stage: 'merge', failedAt: report.pushedAt, log: () => {}, error: Object.assign(new Error('Merge failed'), { code: 'MERGE', conflictReport }) }, { settings, fetchFn: async (_url, options) => { messages.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) }; } });
  assert.equal(result.status, 'sent'); assert.equal(messages[0].parse_mode, 'HTML'); assert.match(messages[0].text, /1 &lt; 2/); assert.match(messages[0].text, /2 &lt; 3/); assert.match(messages[0].text, /Savdo/);
  assert(!client.exists('refs/remotes/origin/feature/demo'));
});
test('parent-directory symlinks cannot expose source outside the repository', async t => {
  const { sourceExcerpt } = await import('../src/notification-source.mjs'); const f = fixture(t); put(f.root, 'outside/page.tsx', 'EXTERNAL_PRIVATE_BODY');
  try { symlinkSync(join(f.root, 'outside'), join(f.repo, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Native symlink permission unavailable'); return; } throw error; }
  assert(!sourceExcerpt(f.repo, 'linked/page.tsx', { start: 1 }).text);
});
test('nested check diagnostics resolve from the check cwd rather than an unrelated root file', t => {
  const f = fixture(t); put(f.repo, 'src/Pages/Savdo/index.tsx', 'WRONG_ROOT_BODY'); put(f.repo, 'packages/web/src/Pages/Savdo/index.tsx', 'const value = missing;');
  const error = Object.assign(new Error('Check failed\nsrc/Pages/Savdo/index.tsx:1:2 error TS2304: Missing'), { code: 'COMMAND', check: { argv: ['npm', 'run', 'typecheck'], cwd: join(f.repo, 'packages/web') } });
  const result = collectFailureReport({ git: new Git(f.repo), branch: 'feature/demo', remote: 'origin', stage: 'checks-after-merge', error, failedAt: report.pushedAt });
  assert.equal(result.locations[0].path, 'packages/web/src/Pages/Savdo/index.tsx'); assert.match(result.locations[0].excerpt.text, /const value/); assert(!JSON.stringify(result).includes('WRONG_ROOT_BODY'));
});
