import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fixture, put, git, command, cli } from './helpers.mjs';
import { ship } from '../src/ship.mjs';
import { collectOwnWork, recordSuccessfulPush, reportSettings, previewReports, prepareSuccessfulPush, reconcileWorkIntents, settleWorkIntent } from '../src/daily-reports.mjs';
import { Git, repository } from '../src/git.mjs';
import { unlinkSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
const muted = { log: () => {}, notify: async () => {}, notifyError: async () => {}, prepareWork: () => null, recordWork: () => null };
const settings = { enabled: true, chatId: '-123456' };

test('a real push records own page work while excluding incoming main commits; repeat no-op does not record', async t => {
  const f = fixture(t, { checksMode: 'final' }), directory = join(f.root, 'daily');
  reportSettings(directory, { enabled: true, timeZone: 'Asia/Tashkent', at: '18:00' });
  const other = f.clone(); put(other, 'src/Pages/Foreign/index.tsx', 'export default 1;'); git(other, 'add', '.'); git(other, 'commit', '-m', 'Foreign page changed'); git(other, 'push', 'origin', 'main');
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 2;');
  let records = 0;
  const options = { cwd: f.repo, ...muted, recordWork: context => { records++; return recordSuccessfulPush(context, { directory, settings }); } };
  await ship(options);
  const reports = previewReports({ directory });
  assert.equal(reports.length, 1); assert.match(reports[0].text, /Savdo/); assert(!reports[0].text.includes('Foreign'));
  await ship(options); assert.equal(records, 1);
});
test('a main-only merge is never recorded as the user doing those tasks', async t => {
  const f = fixture(t, { checksMode: 'final' });
  const other = f.clone(); put(other, 'src/Pages/Savdo/index.tsx', 'export default 1;'); git(other, 'add', '.'); git(other, 'commit', '-m', 'Savdo sahifasi yaratildi'); git(other, 'push', 'origin', 'main');
  let items;
  await ship({ cwd: f.repo, ...muted, recordWork: context => { items = collectOwnWork(context).items; } });
  assert.deepEqual(items, []);
});
test('failed checks and dry runs do not journal a successful work event', async t => {
  const f = fixture(t, { checksMode: 'final', checks: [[process.execPath, '-e', 'process.exit(2)']] });
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 1;'); let records = 0;
  const options = { cwd: f.repo, ...muted, recordWork: () => { records++; } };
  await ship({ ...options, dryRun: true });
  await assert.rejects(ship(options)); assert.equal(records, 0);
});
test('journal storage failure never turns a confirmed push into a retry or undoes work', async t => {
  const f = fixture(t, { checksMode: 'final' }), directory = join(f.root, 'daily'); put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 1;'); const logs = [];
  reportSettings(directory, { enabled: true, timeZone: 'Asia/Tashkent', at: '18:00' });
  await ship({ cwd: f.repo, ...muted, log: text => logs.push(text), prepareWork: context => prepareSuccessfulPush(context, { directory, settings }), recordWork: () => { throw new Error('Disk full'); } });
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/feature/demo'), git(f.repo, 'rev-parse', 'HEAD'));
  assert(logs.some(line => line.includes('hisobotga saqlanmadi')));
  assert.equal(reconcileWorkIntents({ directory }), 1);
  assert.match(previewReports({ directory })[0].text, /Savdo/);
  assert.equal(reconcileWorkIntents({ directory }), 0);
});
test('CLI accepts multiple business work notes and rejects technical notes before creating a commit', t => {
  const f = fixture(t); put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 1;');
  const oldHead = git(f.repo, 'rev-parse', 'HEAD');
  assert.equal(f.run('--dry-run', '--work', 'Savdo: summa ko‘rsatildi', '--work', 'Ombor: qidiruv yaxshilandi').status, 0);
  const result = f.run('--work', 'npm run build'); assert.notEqual(result.status, 0); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), oldHead);
  const preview = command(f.root, process.execPath, [cli, 'reports', 'preview'], { DEVSHIP_GLOBAL_CONFIG: join(f.root, 'absent.json') });
  assert.equal(preview.status, 0, preview.text);
});
test('a definitively rejected push intent is never revived after a later descendant success', async t => {
  const f = fixture(t, { checksMode: 'final' }), directory = join(f.root, 'daily');
  reportSettings(directory, { enabled: true, timeZone: 'Asia/Tashkent', at: '18:00' });
  put(f.remote, 'hooks/pre-receive', '#!/bin/sh\nexit 1\n'); put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 1;');
  chmodSync(join(f.remote, 'hooks/pre-receive'), 0o755);
  const prepareWork = context => prepareSuccessfulPush(context, { directory, settings });
  await assert.rejects(ship({ cwd: f.repo, ...muted, work: ['Savdo: eski urinish'], prepareWork }), error => error.code === 'PUSH');
  const oldIntent = JSON.parse(readFileSync(join(directory, 'intents', readdirSync(join(directory, 'intents'))[0]), 'utf8'));
  assert.equal(oldIntent.status, 'rejected'); unlinkSync(join(f.remote, 'hooks/pre-receive'));
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 2;');
  await ship({ cwd: f.repo, ...muted, work: ['Savdo: qidiruv yangilandi'], prepareWork, recordWork: context => recordSuccessfulPush(context, { directory, settings }) });
  reconcileWorkIntents({ directory });
  const reports = previewReports({ directory }); assert.equal(reports.length, 1); assert(!reports[0].text.includes('eski urinish'));
});
test('confirmed intent snapshot uses completion day and original recipient for normal and recovered paths', async t => {
  const f = fixture(t), directory = join(f.root, 'daily'), second = join(f.root, 'daily-normal');
  for (const dir of [directory, second]) reportSettings(dir, { enabled: true, timeZone: 'Asia/Tashkent', at: '18:00' });
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 1;'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'work');
  const client = new Git(f.repo), after = git(f.repo, 'rev-parse', 'HEAD'), baseHead = git(f.repo, 'rev-parse', 'origin/main');
  const context = { git: client, config: { telegram: true }, branch: 'feature/demo', remote: 'origin', before: baseHead, baseHead, workHead: after, after, pushedAt: '2026-10-20T12:59:59Z', log: () => {} };
  const prepared = prepareSuccessfulPush(context, { directory, settings });
  assert(prepared, JSON.stringify(collectOwnWork(context)));
  git(f.repo, 'push', 'origin', 'feature/demo');
  context.reportIntent = prepared; context.pushedAt = '2026-10-20T13:00:01Z'; settleWorkIntent(context);
  const checkpoint = JSON.parse(readFileSync(join(directory, 'intents', `${prepared.id}.json`), 'utf8'));
  assert.equal(checkpoint.status, 'confirmed');
  assert.equal(repository(checkpoint.root), checkpoint.root, 'canonical root');
  assert.match(client.exec('ls-remote', '--heads', '--', 'origin', 'refs/heads/feature/demo'), new RegExp('^' + after), 'remote confirmation');
  const recoveryLog = [];
  assert.equal(reconcileWorkIntents({ directory, log: line => recoveryLog.push(line) }), 1, recoveryLog.join('\n'));
  const recovered = previewReports({ directory })[0];
  assert.equal(recovered.day, '2026-10-21'); assert.equal(recovered.recipient.chatId, settings.chatId);
  // First-time normal finalization must match recovery even if settings changed.
  const normalContext = { ...context, pushedAt: '2026-10-20T12:59:59Z' };
  normalContext.reportIntent = prepareSuccessfulPush(normalContext, { directory: second, settings });
  normalContext.pushedAt = '2026-10-20T13:00:01Z'; settleWorkIntent(normalContext);
  const normal = recordSuccessfulPush(normalContext, { directory: second, settings: { enabled: true, chatId: '-999999' } });
  assert.equal(normal.status, 'recorded');
  assert.equal(previewReports({ directory: second })[0].recipient.chatId, settings.chatId);
  assert.equal(previewReports({ directory: second })[0].day, recovered.day);
});
