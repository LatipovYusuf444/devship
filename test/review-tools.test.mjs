import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fixture, put, git, cleanupTemp } from './helpers.mjs';
import { ship } from '../src/ship.mjs';
import { Git } from '../src/git.mjs';
import { reportSettings, saveWorkEvent, previewReports, runDueReports } from '../src/daily-reports.mjs';

const muted = { notify: async () => {}, notifyError: async () => {}, prepareWork: () => null, recordWork: () => null, draftMR: () => null };
test('shipping prints separate own and main sections before merging', async t => {
  const f = fixture(t, { checksMode: 'final' }), other = f.clone();
  put(other, 'src/Pages/Ombor/index.tsx', 'export default 1;'); git(other, 'add', '.'); git(other, 'commit', '-m', 'main change'); git(other, 'push', 'origin', 'main');
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 2;'); const logs = [];
  await ship({ cwd: f.repo, ...muted, log: line => logs.push(line) });
  const text = logs.join('\n');
  assert.match(text, /Sizning yangi lokal ishlaringiz: 1 fayl/);
  assert.match(text, /origin\/main dan keladigan: 1 fayl/);
  assert(text.indexOf('Pushdan oldingi xulosa') < text.indexOf('Merge:'));
});
test('summary excludes main commits already pulled locally and counts only newly incoming main files', async t => {
  const { buildChangeSummary } = await import('../src/change-summary.mjs');
  const f = fixture(t), other = f.clone();
  put(other, 'src/Pages/Foreign/index.tsx', 'export default 1;'); git(other, 'add', '.'); git(other, 'commit', '-m', 'old main'); git(other, 'push', 'origin', 'main');
  git(f.repo, 'fetch', 'origin'); git(f.repo, 'merge', '--no-edit', 'origin/main');
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 2;'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'own work');
  put(other, 'src/Pages/Ombor/index.tsx', 'export default 3;'); git(other, 'add', '.'); git(other, 'commit', '-m', 'new main'); git(other, 'push', 'origin', 'main'); git(f.repo, 'fetch', 'origin');
  const client = new Git(f.repo), result = buildChangeSummary({ git: client, workHead: client.oid(), baseHead: client.oid('origin/main'), remoteHead: null });
  assert.deepEqual(result.own.paths, ['src/Pages/Savdo/index.tsx']); assert.deepEqual(result.main.paths, ['src/Pages/Ombor/index.tsx']);
});
test('summary separates divergent remote feature and marks overlaps without claiming conflict', async t => {
  const { buildChangeSummary, formatChangeSummary } = await import('../src/change-summary.mjs');
  const f = fixture(t); put(f.repo, 'src/Pages/Savdo/index.tsx', 'base\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'shared'); git(f.repo, 'push', '-u', 'origin', 'feature/demo');
  const old = git(f.repo, 'rev-parse', 'HEAD'); put(f.repo, 'src/Pages/Savdo/index.tsx', 'ours\n'); git(f.repo, 'commit', '-am', 'ours'); const ours = git(f.repo, 'rev-parse', 'HEAD');
  git(f.repo, 'switch', '-c', 'other-side', old); put(f.repo, 'src/Pages/Savdo/index.tsx', 'theirs\n'); git(f.repo, 'commit', '-am', 'theirs'); const theirs = git(f.repo, 'rev-parse', 'HEAD'); git(f.repo, 'switch', 'feature/demo');
  const client = new Git(f.repo), result = buildChangeSummary({ git: client, workHead: ours, baseHead: client.oid('origin/main'), remoteHead: theirs });
  assert.equal(result.remote.paths.length, 1); assert.equal(result.overlap.length, 1);
  assert.match(formatChangeSummary(result, { branch: 'feature/demo', remote: 'origin', base: 'main' }), /konflikt tasdig‘i emas/);
});
test('summary includes unpublished merge resolutions without claiming clean incoming main files as own work', async t => {
  const { buildChangeSummary } = await import('../src/change-summary.mjs'); const f = fixture(t);
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'base\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'base');
  git(f.repo, 'switch', 'main'); git(f.repo, 'merge', '--ff-only', 'feature/demo'); git(f.repo, 'push', 'origin', 'main'); git(f.repo, 'switch', 'feature/demo');
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'own\n'); git(f.repo, 'commit', '-am', 'own'); git(f.repo, 'push', '-u', 'origin', 'feature/demo');
  git(f.repo, 'switch', 'main'); put(f.repo, 'src/Pages/Savdo/index.tsx', 'main\n'); put(f.repo, 'src/Pages/Ombor/index.tsx', 'clean main\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'main'); git(f.repo, 'push', 'origin', 'main'); git(f.repo, 'switch', 'feature/demo');
  const client = new Git(f.repo); assert(!client.result(['merge', '--no-edit', 'origin/main']).ok);
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'resolved third content\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'resolve');
  const result = buildChangeSummary({ git: client, workHead: client.oid(), baseHead: client.oid('origin/main'), remoteHead: client.oid('origin/feature/demo') });
  assert.deepEqual(result.own.paths, ['src/Pages/Savdo/index.tsx']);
});
test('dry run summary includes uncommitted pages and creates no journal/draft or Git mutations', t => {
  const f = fixture(t); put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 1;');
  const head = git(f.repo, 'rev-parse', 'HEAD'), before = git(f.repo, 'status', '--porcelain');
  const result = f.run('--dry-run'); assert.equal(result.status, 0, result.text);
  assert.match(result.text, /Pushdan oldingi xulosa/); assert.match(result.text, /fetch qilinmagan/);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head); assert.equal(git(f.repo, 'status', '--porcelain'), before);
});
test('GitLab draft links encode branch/title/body and never retain remote credentials', async () => {
  const { gitLabNewMRUrl } = await import('../src/merge-request.mjs');
  for (const remote of ['https://user:password@gitlab.example.invalid/group/sub/repo.git', 'git@gitlab.example.invalid:group/sub/repo.git', 'ssh://git@gitlab.example.invalid:2222/group/sub/repo.git']) {
    const link = gitLabNewMRUrl(remote, { source: 'Yusuf/a&b', target: 'release/main', title: 'Savdo & ombor', description: '1. Ko‘rinish yangilandi\n2. Qidiruv yangilandi' });
    const url = new URL(link); assert.equal(url.username, ''); assert.equal(url.password, ''); assert.equal(url.port, '');
    assert.equal(url.pathname, '/group/sub/repo/-/merge_requests/new'); assert.equal(url.searchParams.get('merge_request[source_branch]'), 'Yusuf/a&b');
    assert.equal(url.searchParams.get('merge_request[title]'), 'Savdo & ombor'); assert(!link.includes('password'));
  }
  assert.equal(gitLabNewMRUrl('https://github.com/team/repo.git', {}), null);
  assert.equal(gitLabNewMRUrl('file:///tmp/repo.git', {}), null);
});
test('MR draft covers the entire feature diff against base rather than just the last push', async t => {
  const { createMergeRequestDraft, readMergeRequestDraft } = await import('../src/merge-request.mjs');
  const f = fixture(t), directory = join(f.root, 'mr');
  put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 1;'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'earlier work'); git(f.repo, 'push', '-u', 'origin', 'feature/demo');
  put(f.repo, 'src/Pages/Ombor/index.tsx', 'export default 2;'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'later work');
  const client = new Git(f.repo), context = { git: client, config: { base: 'main' }, branch: 'feature/demo', remote: 'origin', baseHead: client.oid('origin/main'), after: client.oid(), notes: [], checks: [{ argv: ['npm', 'run', 'build'] }], pushedAt: new Date().toISOString(), log: () => {} };
  const draft = createMergeRequestDraft(context, { directory }); assert.equal(draft.fileCount, 2); assert.match(draft.description, /Savdo/); assert.match(draft.description, /Ombor/);
  assert.equal(readMergeRequestDraft({ git: client, branch: 'feature/demo', remote: 'origin', directory }).draft.after, context.after);
  put(f.repo, 'another.txt', 'new'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-m', 'new');
  assert.equal(readMergeRequestDraft({ git: client, branch: 'feature/demo', remote: 'origin', directory }).stale, true);
});

function reportStore(t) {
  const directory = mkdtempSync(join(tmpdir(), 'devship-edit-')); t.after(() => cleanupTemp(directory));
  reportSettings(directory, { enabled: true, at: '18:00', timeZone: 'Asia/Tashkent' });
  const event = { projectId: 'a'.repeat(64), project: 'Navoiyazot', branch: 'Yusuf', after: 'b'.repeat(40), pushedAt: '2026-10-20T08:00:00Z', items: ['Monitoring sahifasi yangilandi.', 'Savdo sahifasi yangilandi.'], recipient: { chatId: '-123456' } };
  saveWorkEvent(event, { directory }); return { directory, event, now: '2026-10-20T12:00:00Z', day: '2026-10-20' };
}
test('report editing changes preview/delivery while immutable push events remain byte-identical', async t => {
  const { editableReport, editDailyReport } = await import('../src/report-edit.mjs');
  const f = reportStore(t), file = join(f.directory, 'events', readdirSync(join(f.directory, 'events'))[0]), original = readFileSync(file, 'utf8');
  const snapshot = editableReport(f.day, f); editDailyReport(f.day, [{ ids: [snapshot.entries[0].id], text: 'Monitoring: kirish huquqlari tartiblandi' }], { ...f, revision: snapshot.revision });
  assert.equal(readFileSync(file, 'utf8'), original); assert.match(previewReports(f)[0].text, /kirish huquqlari/);
  const sent = []; await runDueReports({ directory: f.directory, now: '2026-10-20T13:01:00Z', settings: { enabled: true, chatId: '-123456' }, send: async text => { sent.push(text); return { message_id: 1 }; } });
  assert.match(sent[0], /kirish huquqlari/);
});
test('same-project work can be merged but cross-project/branch work cannot', async t => {
  const { editableReport, editDailyReport } = await import('../src/report-edit.mjs'); const f = reportStore(t);
  saveWorkEvent({ ...f.event, projectId: 'c'.repeat(64), after: 'd'.repeat(40), project: 'Kimyosanoat' }, f);
  const view = editableReport(f.day, f), own = view.entries.filter(e => e.project === 'Navoiyazot'), other = view.entries.find(e => e.project === 'Kimyosanoat');
  assert.throws(() => editDailyReport(f.day, [{ ids: [own[0].id, other.id], text: 'Sahifalar yangilandi' }], { ...f, revision: view.revision }), /loyiha|branch|guruh/);
  editDailyReport(f.day, [{ ids: own.map(e => e.id), text: 'Monitoring va savdo ko‘rinishlari tartiblandi' }], { ...f, revision: view.revision });
  assert.equal(editableReport(f.day, f).entries.filter(e => e.project === 'Navoiyazot').length, 1);
});
test('stale edits, expired report day, API paths and prepared deliveries are rejected', async t => {
  const { editableReport, editDailyReport } = await import('../src/report-edit.mjs'); const f = reportStore(t); const old = editableReport(f.day, f);
  saveWorkEvent({ ...f.event, after: 'e'.repeat(40), items: ['Ombor sahifasi yangilandi.'] }, f);
  assert.throws(() => editDailyReport(f.day, [{ ids: [old.entries[0].id], text: 'Yangi matn' }], { ...f, revision: old.revision }), /yangilangan|eskirgan/);
  const view = editableReport(f.day, f);
  assert.throws(() => editDailyReport(f.day, [{ ids: [view.entries[0].id], text: '/api/v1/users qo‘shildi' }], { ...f, revision: view.revision }), /texnik|hisobot/);
  assert.throws(() => editableReport(f.day, { ...f, now: '2026-10-20T13:00:00Z' }), /muddat|18:00|yuborish/);
  await runDueReports({ directory: f.directory, now: '2026-10-20T13:01:00Z', settings: { enabled: true, chatId: '-999999' }, send: async () => { throw new Error('must not send'); } });
  assert.throws(() => editableReport(f.day, f), /tayyorlangan|yuboril/);
});
test('a future push with the same generic page summary does not inherit an earlier precise edit', async t => {
  const { editableReport, editDailyReport } = await import('../src/report-edit.mjs'); const f = reportStore(t), view = editableReport(f.day, f);
  editDailyReport(f.day, [{ ids: [view.entries.find(e => e.text.includes('Monitoring')).id], text: 'Monitoring: eski vazifa tugatildi' }], { ...f, revision: view.revision });
  saveWorkEvent({ ...f.event, after: 'f'.repeat(40), items: ['Monitoring sahifasi yangilandi.'] }, f);
  const text = previewReports(f)[0].text; assert(text.includes('eski vazifa')); assert(text.includes('Monitoring sahifasi yangilandi.'));
});

test('MR draft failure does not repeat or invalidate a confirmed push; no-op and failed checks never draft', async t => {
  const f = fixture(t, { checksMode: 'final' }); put(f.repo, 'src/Pages/Savdo/index.tsx', 'export default 1;');
  let calls = 0; const logs = [];
  const options = { cwd: f.repo, ...muted, log: text => logs.push(text), draftMR: () => { calls++; throw new Error('Disk unavailable'); } };
  await ship(options); assert.equal(calls, 1); assert.match(logs.join('\n'), /MR matni saqlanmadi/);
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/feature/demo'), git(f.repo, 'rev-parse', 'HEAD'));
  await ship(options); assert.equal(calls, 1);
  const broken = fixture(t, { checksMode: 'final', checks: [[process.execPath, '-e', 'process.exit(2)']] });
  put(broken.repo, 'src/Pages/Savdo/index.tsx', 'broken');
  await assert.rejects(ship({ ...options, cwd: broken.repo })); assert.equal(calls, 1);
});
test('MR drafts are isolated between repositories even with identical branch names', async t => {
  const { createMergeRequestDraft, readMergeRequestDraft } = await import('../src/merge-request.mjs');
  const a = fixture(t), b = fixture(t), directory = join(a.root, 'drafts');
  const make = (f, note) => { const client = new Git(f.repo); return createMergeRequestDraft({ git: client, branch: 'feature/demo', remote: 'origin', config: { base: 'main' }, baseHead: client.oid('origin/main'), after: client.oid(), notes: [note], checks: [] }, { directory }); };
  make(a, 'Savdo oynasi tartiblandi'); make(b, 'Ombor oynasi tartiblandi');
  assert.equal(readdirSync(directory).length, 2);
  assert.match(readMergeRequestDraft({ git: new Git(a.repo), branch: 'feature/demo', remote: 'origin', directory }).draft.title, /Savdo/);
});
test('interactive report edit supports merging and closes the prompt without holding a delivery lock', async t => {
  const { editReportCommand } = await import('../src/report-edit.mjs'); const f = reportStore(t);
  const answers = ['1,2', 'Monitoring va savdo oynalari tartiblandi', '']; let closed = false;
  const prompt = { ask: async () => { assert(!readdirSync(f.directory).includes('delivery.lock')); return answers.shift(); }, close: () => { closed = true; } };
  await editReportCommand(f.day, { directory: f.directory, now: () => f.now, prompt, log: () => {} });
  assert(closed); assert.match(previewReports(f)[0].text, /Monitoring va savdo/);
});
test('report edit rejects a save when the cutoff arrives while the user is typing', async t => {
  const { editReportCommand } = await import('../src/report-edit.mjs'); const f = reportStore(t);
  let current = f.now, asks = 0, closed = false;
  const prompt = { ask: async () => { if (++asks === 1) return '1'; current = '2026-10-20T13:00:00Z'; return 'Monitoring oynasi tartiblandi'; }, close: () => { closed = true; } };
  await assert.rejects(editReportCommand(f.day, { directory: f.directory, now: () => current, prompt, log: () => {} }), /muddat/);
  assert(closed); assert(!previewReports(f)[0].text.includes('oynasi tartiblandi'));
});
test('edited delivery followed by a late generic item sends only the new work', async t => {
  const { editableReport, editDailyReport } = await import('../src/report-edit.mjs'); const f = reportStore(t), view = editableReport(f.day, f);
  editDailyReport(f.day, [{ ids: [view.entries.find(e => e.text.includes('Monitoring')).id], text: 'Monitoring: kirish oynasi tartiblandi' }], { ...f, revision: view.revision });
  const sent = [], options = { directory: f.directory, now: '2026-10-20T13:01:00Z', settings: { enabled: true, chatId: '-123456' }, send: async text => { sent.push(text); return { message_id: sent.length }; } };
  await runDueReports(options);
  saveWorkEvent({ ...f.event, after: '1'.repeat(40), items: ['Monitoring sahifasi yangilandi.'] }, f);
  await runDueReports(options); await runDueReports(options);
  assert.equal(sent.length, 2); assert.match(sent[0], /kirish oynasi/); assert.match(sent[1], /Monitoring sahifasi/); assert(!sent[1].includes('kirish oynasi'));
});
