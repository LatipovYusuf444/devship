import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupTemp } from './helpers.mjs';
import { summarizeWork } from '../src/work-summary.mjs';
import { reportDay, formatDailyReport, saveWorkEvent, previewReports, runDueReports, reportSettings, retryDailyReport } from '../src/daily-reports.mjs';
import { reportCommand } from '../src/report-commands.mjs';

function store(t) {
  const directory = mkdtempSync(join(tmpdir(), 'devship-daily-'));
  t.after(() => cleanupTemp(directory));
  reportSettings(directory, { enabled: true, timeZone: 'Asia/Tashkent', at: '18:00' });
  return directory;
}
const recipient = { chatId: '-123456', chatTitle: 'Work', timeZone: 'Asia/Tashkent', botToken: '123456:' + 'X'.repeat(36), enabled: true };
const event = (overrides = {}) => ({ projectId: 'a'.repeat(64), project: 'Navoiyazot', branch: 'Yusuf', after: 'b'.repeat(40),
  pushedAt: '2026-10-20T08:00:00Z', items: ['Monitoring sahifasidagi kirish huquqlari yangilandi.'], recipient: { chatId: recipient.chatId }, ...overrides });

test('work summary excludes tests, API routes, lockfiles and configuration', () => {
  assert.deepEqual(summarizeWork({ files: ['src/services/api.ts', 'src/app/api/sales/route.ts', 'yarn.lock', '.devship.json', 'src/Pages/Savdo/index.test.ts'] }), []);
  assert.deepEqual(summarizeWork({ files: ['src/Pages/Savdo/index.tsx', 'src/Pages/Savdo/Filters.tsx'] }), ['Savdo sahifasi yangilandi.']);
  assert.deepEqual(summarizeWork({ files: ['src/app/invoices/[id]/page.tsx'], subjects: ['feat: Add discount controls'] }), ['Invoices sahifasi yangilandi.']);
  assert.deepEqual(summarizeWork({ files: ['src/Pages/Savdo/index.tsx'], subjects: ['feat: Add discount controls'] }), ['Savdo sahifasi yangilandi.']);
  for (const file of ['src/app/page.tsx', 'src/app/[slug]/page.tsx', 'src/pages/index.tsx'])
    assert.deepEqual(summarizeWork({ files: [file] }), ['Bosh sahifa yangilandi.']);
});
test('explicit business work is retained; endpoints, credentials and technical checks cannot leak', () => {
  assert.deepEqual(summarizeWork({ notes: ['Monitoring: foydalanuvchi huquqlari tartiblandi'] }), ['Monitoring: foydalanuvchi huquqlari tartiblandi']);
  for (const note of ['https://example.invalid/api/users', '/api/v1/users qo‘shildi', 'npm run build', 'token=ghp_' + 'Z'.repeat(36)])
    assert.throws(() => summarizeWork({ notes: [note] }), /hisobot|texnik|maxfiy/i);
});
test('cutoff is calculated in Tashkent, including midnight and late pushes', () => {
  assert.equal(reportDay('2026-10-20T12:59:59Z'), '2026-10-20');
  assert.equal(reportDay('2026-10-20T13:00:00Z'), '2026-10-21');
  assert.equal(reportDay('2026-10-20T20:00:00Z'), '2026-10-21');
});
test('same project names remain separate and repeated work is numbered once per project/branch', () => {
  const text = formatDailyReport('2026-10-20', [event(), event({ after: 'c'.repeat(40) }), event({ projectId: 'd'.repeat(64), items: ['Savdo sahifasi yangilandi.'] })]);
  assert.match(text, /^20\.10\.2026  #Qilingan-ishlar/);
  assert.equal(text.match(/Monitoring sahifasidagi/g).length, 1);
  assert.match(text, /1\. Monitoring/); assert.match(text, /2\. Savdo/);
  assert(!text.includes('Tekshiruv')); assert(!text.includes('/api/'));
});
test('journal deduplicates repeated pushes while keeping same-named repositories separate', t => {
  const directory = store(t);
  saveWorkEvent(event(), { directory }); saveWorkEvent(event(), { directory });
  saveWorkEvent(event({ projectId: 'd'.repeat(64) }), { directory });
  assert.equal(readdirSync(join(directory, 'events')).length, 2);
  assert.equal(previewReports({ directory }).length, 1);
});
test('nothing sends before 18:00, missed report sends once after restart, no empty-day messages', async t => {
  const directory = store(t); saveWorkEvent(event(), { directory }); let calls = 0;
  const send = async () => ({ message_id: ++calls });
  assert.equal((await runDueReports({ directory, now: '2026-10-20T12:59:59Z', settings: recipient, send })).sent, 0);
  assert.equal((await runDueReports({ directory, now: '2026-10-21T06:00:00Z', settings: recipient, send })).sent, 1);
  assert.equal((await runDueReports({ directory, now: '2026-10-21T13:00:00Z', settings: recipient, send })).sent, 0);
  assert.equal(calls, 1);
});
test('uncertain Telegram delivery is checkpointed and never automatically resent', async t => {
  const directory = store(t); saveWorkEvent(event(), { directory }); let calls = 0;
  const send = async () => { calls++; const error = new Error('timeout'); error.uncertain = true; throw error; };
  assert.equal((await runDueReports({ directory, now: '2026-10-20T13:01:00Z', settings: recipient, send })).uncertain, 1);
  await runDueReports({ directory, now: '2026-10-21T13:00:00Z', settings: recipient, send });
  assert.equal(calls, 1);
});
test('recipient/topic changes cannot silently redirect a saved report', async t => {
  const directory = store(t); saveWorkEvent(event(), { directory }); let calls = 0;
  const result = await runDueReports({ directory, now: '2026-10-20T13:01:00Z', settings: { ...recipient, chatId: '-999999' }, send: async () => { calls++; } });
  assert.equal(result.blocked, 1); assert.equal(calls, 0);
});
test('parallel runners use one delivery lock', async t => {
  const directory = store(t); saveWorkEvent(event(), { directory }); let calls = 0;
  let unlock; const pending = new Promise(resolve => { unlock = resolve; });
  const args = { directory, now: '2026-10-20T13:01:00Z', settings: recipient, send: async () => { calls++; await pending; return { message_id: 1 }; } };
  const first = runDueReports(args);
  await new Promise(resolve => setTimeout(resolve, 20));
  await assert.rejects(runDueReports(args), /lock/i); unlock(); await first; assert.equal(calls, 1);
});
test('long Unicode reports resume confirmed chunks without resending earlier chunks', async t => {
  const directory = store(t);
  saveWorkEvent(event({ items: Array.from({ length: 45 }, (_, i) => `Savdo ${i}: ${'Mahsulot nomi 🌱 '.repeat(8)}`) }), { directory });
  let calls = 0;
  const result = await runDueReports({ directory, now: '2026-10-20T13:01:00Z', settings: recipient, send: async text => {
    assert(text.length <= 3900); calls++; if (calls === 2) throw new Error('rejected'); return { message_id: calls };
  } });
  assert.equal(result.failed, 1);
  const sent = [];
  await runDueReports({ directory, now: '2026-10-20T13:20:00Z', settings: recipient, send: async text => { sent.push(text); return { message_id: 10 + sent.length }; } });
  assert(sent.length > 0); assert(!sent[0].includes('1. Savdo 0:'));
});
test('a late journal event for a sent day is delivered without repeating previously reported work', async t => {
  const directory = store(t); saveWorkEvent(event(), { directory }); const sent = [];
  const options = { directory, now: '2026-10-20T13:01:00Z', settings: recipient, send: async text => { sent.push(text); return { message_id: sent.length }; } };
  await runDueReports(options);
  saveWorkEvent(event({ after: 'e'.repeat(40), items: ['Savdo sahifasi yangilandi.'] }), { directory });
  await runDueReports(options);
  assert.equal(sent.length, 2); assert.match(sent[1], /Savdo/); assert(!sent[1].includes('Monitoring'));
});
test('manual retry only sends the requested day', async t => {
  const directory = store(t); saveWorkEvent(event(), { directory });
  saveWorkEvent(event({ after: 'f'.repeat(40), pushedAt: '2026-10-21T08:00:00Z' }), { directory });
  const sent = [];
  await retryDailyReport('2026-10-20', { directory, now: '2026-10-22T13:00:00Z', settings: recipient, send: async text => { sent.push(text); return { message_id: sent.length }; } });
  assert.equal(sent.length, 1); assert(sent[0].startsWith('20.10.2026'));
});
test('run-due and retry commands report failure, blocked recipient and uncertainty with nonzero exit', async () => {
  const before = process.exitCode;
  try {
    for (const command of [['run-due'], ['retry', '2026-10-20']]) for (const key of ['failed', 'blocked', 'uncertain']) {
      const logs = [], result = { sent: 0, failed: 0, blocked: 0, uncertain: 0, [key]: 1 };
      process.exitCode = 0;
      await reportCommand(command, { log: text => logs.push(text), retryFn: async () => result, runDueFn: async () => result });
      assert.equal(process.exitCode, 1); assert(logs.length > 0);
    }
  } finally { process.exitCode = before; }
});
test('OS scheduler setup failure never enables report settings', async t => {
  const directory = store(t); reportSettings(directory, { enabled: false, timeZone: 'Asia/Tashkent', at: '18:00' });
  await assert.rejects(reportCommand(['setup'], { directory, telegramStatus: () => ({ enabled: true }), installFn: () => { throw new Error('OS rejected'); } }));
  assert.equal(reportSettings(directory).enabled, false);
});
