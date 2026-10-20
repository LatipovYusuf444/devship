import { basename, join } from 'node:path';
import { mkdirSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { redact } from './process.mjs';
import { telegramCall, TelegramError } from './telegram-api.mjs';
import { loadTelegramSettings, atomicJson } from './telegram-store.mjs';
import { pushCard, failureCard } from './telegram-format.mjs';
import { sourceExcerpt, diagnosticLocations } from './notification-source.mjs';

const clean = value => redact(String(value ?? '')).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
const clip = (value, length) => { let result = ''; for (const char of clean(value)) { if (result.length + char.length > length) break; result += char; } return result; };
function localTime(iso, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return `${parts.day}.${parts.month}.${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} (${timeZone})`;
}
function header(report, timeZone) {
  return ['✅ DevShip: push muvaffaqiyatli', `Loyiha: ${clip(report.project, 180)}`, `Branch: ${clip(report.branch, 220)}`, `Remote: ${clip(report.remote, 80)}`,
    `Sana/soat: ${localTime(report.pushedAt, timeZone)}`, `UTC: ${report.pushedAt}`, `Commit: ${report.after.slice(0, 12)}`,
    `O‘zgarishlar: ${report.files.length} fayl; ${report.commits.length} commit`];
}
export function fullPushText(report, timeZone) {
  return [...header(report, timeZone), '', 'Commitlar:', ...report.commits.map(c => `• ${c.hash.slice(0, 12)} ${clean(c.subject)} — ${clean(c.author)} (${clean(c.date)})`),
    '', 'Fayllar:', ...report.files.map(f => `• ${clean(f.status)} ${clean(f.path)}`)].join('\n');
}
export function formatPushMessage(report, timeZone) {
  return pushCard(report, timeZone).html;
}

export function collectFailureReport({ git, branch, remote, stage, error, failedAt }) {
  const raw = redact(String(error.message || error)).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  // Send diagnostic lines, not full test output, source frames, diffs or environment dumps.
  const lines = raw.split(/\r?\n/).slice(1);
  const diagnostics = lines.filter((line, index) =>
    !/^\s*\^+/.test(lines[index + 1] || '') &&
    !/^\s*(?:>\s*)?\d+\s*[|│]|^\s*[|│^~]|^\s*[+-]\s/.test(line) &&
    (/^\s*(?:error(?:\s+TS\d+)?\s*:|error Command failed\b|type error:|AssertionError:|TypeError:|ReferenceError:|SyntaxError:|FAIL(?:ED)?(?:\s|:)|\[ERROR\])/i.test(line) ||
      /^\s*(?:[A-Za-z]:[\\/]|file:\/\/\/|\.{0,2}[\\/])?[^<>|"'`{};=]*\.(?:[cm]?[jt]sx?|vue|svelte|java|kt|json|xml)(?:\(\d+(?:,\d+)?\)|:\d+(?::\d+)?)(?:\s|:|\)|$)/i.test(line))
  ).slice(0, 24).map(line => clip(line, 500));
  const argv = error.check?.argv || [];
  const inline = argv.findIndex(arg => /^(?:--(?:eval|print)(?:=|$)|-[ep])/.test(arg));
  const check = argv.length ? (inline >= 0 ? argv.slice(0, inline).map(clean).join(' ') + ' [inline dastur]' : argv.map(clean).join(' ')) : null;
  const conflict = error.conflictReport ? { ...error.conflictReport, files: error.conflictReport.files.map((file, index) => ({ ...file,
    snippets: index < 6 ? (file.markerRanges || []).slice(0, 2).map(range => sourceExcerpt(git.root, file.path, { start: range.start, end: range.end || range.start })) : [{ text: null, reason: 'Kod parchalari dastlabki 6 ta fayl uchun berildi.' }] })) } : null;
  return JSON.parse(redact(JSON.stringify({ project: basename(git.root), branch, remote, stage, failedAt, code: error.code || 'INTERNAL',
    actor: git.result?.(['config', 'user.name']).stdout.trim() || 'Aniqlanmadi',
    summary: clip(raw.split(/\r?\n/)[0], 600), check, diagnostics, locations: diagnosticLocations(git.root, diagnostics, error.check?.cwd || git.root), conflict })));
}
export function fullFailureText(report, timeZone) {
  return failureCard(report, timeZone).plain;
}
export function formatFailureMessage(report, timeZone) {
  return failureCard(report, timeZone).html;
}

export function collectPushReport({ git, branch, remote, before, after, pushedAt }) {
  const entries = git.raw('diff', '--name-status', '--no-renames', '-z', before, after, '--').split('\0').filter(Boolean);
  const files = []; for (let i = 0; i < entries.length; i += 2) files.push({ status: entries[i], path: entries[i + 1] });
  const values = git.raw('log', '-z', '--format=%H%x00%an%x00%aI%x00%s', `${before}..${after}`, '--').split('\0');
  if (values.at(-1) === '') values.pop();
  const commits = []; for (let i = 0; i + 3 < values.length; i += 4) commits.push({ hash: values[i], author: values[i + 1], date: values[i + 2], subject: values[i + 3] });
  return JSON.parse(redact(JSON.stringify({ project: basename(git.root), branch, remote, before, after, pushedAt, commits, files,
    actor: git.result?.(['config', 'user.name']).stdout.trim() || 'Aniqlanmadi' })));
}
function outboxDirectory(git) {
  const directory = join(git.exec('rev-parse', '--absolute-git-dir'), 'devship-telegram');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new TelegramError('Telegram outbox katalogi oddiy papka bo‘lishi kerak.');
  return directory;
}

async function deliver(record, path, settings, fetchFn) {
  try {
    if (record.parseMode && record.parseMode !== 'HTML') throw new TelegramError('Xabar formatini o‘qib bo‘lmadi; yuborilmadi.');
    if (!record.summaryMessageId) {
      const result = await telegramCall(settings.botToken, 'sendMessage', { chat_id: record.chatId, text: record.text, link_preview_options: { is_disabled: true },
        ...(record.parseMode ? { parse_mode: record.parseMode } : {}),
        ...(record.threadId ? { message_thread_id: record.threadId } : {}) }, { fetchFn });
      if (!Number.isSafeInteger(result?.message_id) || result.message_id < 1) throw new TelegramError('Telegram xabar tasdig‘i o‘qilmadi.', true);
      record.summaryMessageId = result.message_id; atomicJson(path, record);
    }
    if (record.attachmentText && !record.documentMessageId) {
      const data = new FormData(); data.set('chat_id', record.chatId);
      if (record.threadId) data.set('message_thread_id', String(record.threadId));
      data.set('document', new Blob([record.attachmentText], { type: 'text/plain;charset=utf-8' }), record.kind === 'failure' ? 'xato-hisobot.txt' : 'push-hisobot.txt');
      const result = await telegramCall(settings.botToken, 'sendDocument', data, { fetchFn });
      if (!Number.isSafeInteger(result?.message_id) || result.message_id < 1) throw new TelegramError('Telegram ilova tasdig‘i o‘qilmadi.', true);
      record.documentMessageId = result.message_id;
    }
    record.status = 'sent'; record.sentAt = new Date().toISOString(); record.uncertain = false; delete record.error;
    atomicJson(path, record); return { status: 'sent', path };
  } catch (error) {
    record.status = 'pending'; record.uncertain = Boolean(error.uncertain || record.summaryMessageId);
    record.error = error instanceof TelegramError ? error.message : 'Xabar holatini diskka saqlash xatosi; yetkazilish holati noaniq.';
    try { atomicJson(path, record); } catch { /* original pending receipt may still be available */ }
    return { status: 'pending', path, uncertain: record.uncertain, error: record.error };
  }
}

export async function notifyPush(context, options = {}) {
  if (context.config.telegram === false) return { status: 'disabled' };
  const settings = options.settings || loadTelegramSettings();
  if (!settings?.enabled) return { status: 'disabled' };
  const report = collectPushReport(context), full = fullPushText(report, settings.timeZone), card = pushCard(report, settings.timeZone);
  const record = { version: 1, id: randomUUID(), status: 'pending', chatId: settings.chatId, chatTitle: settings.chatTitle,
    ...(settings.threadId ? { threadId: settings.threadId } : {}),
    timeZone: settings.timeZone, report, parseMode: 'HTML', text: card.html, attachmentText: full.length > 4000 || card.omitted ? full : null };
  const path = join(outboxDirectory(context.git), `${record.id}.json`); atomicJson(path, record);
  const result = await deliver(record, path, settings, options.fetchFn);
  if (result.status === 'sent') context.log(`Telegram: ${clean(settings.chatTitle || settings.chatId)} guruhiga push xabari yuborildi.`);
  else context.log(`Push muvaffaqiyatli; Telegram xabari kutilmoqda. ${result.error} devship telegram retry bilan qayta yuboring.${result.uncertain ? ' Avvalgi urinish yetib borgan bo‘lishi mumkin.' : ''}`);
  return result;
}

export async function notifyFailure(context, options = {}) {
  if (context.config.telegram === false) return { status: 'disabled' };
  const settings = options.settings || loadTelegramSettings();
  if (!settings?.enabled) return { status: 'disabled' };
  const report = collectFailureReport(context), card = failureCard(report, settings.timeZone), full = card.plain;
  const record = { version: 1, kind: 'failure', id: randomUUID(), status: 'pending', chatId: settings.chatId, chatTitle: settings.chatTitle,
    ...(settings.threadId ? { threadId: settings.threadId } : {}), timeZone: settings.timeZone, report,
    parseMode: 'HTML', text: card.html, attachmentText: full.length > 4000 || card.omitted ? full : null };
  const path = join(outboxDirectory(context.git), `${record.id}.json`); atomicJson(path, record);
  const result = await deliver(record, path, settings, options.fetchFn);
  if (result.status === 'sent') context.log(`Telegram: ${clean(settings.chatTitle || settings.chatId)} guruhiga konflikt/xato xabari yuborildi.`);
  else context.log(`Telegram xato xabari kutilmoqda. ${result.error} devship telegram retry bilan qayta yuboring.${result.uncertain ? ' Avvalgi urinish yetib borgan bo‘lishi mumkin.' : ''}`);
  return result;
}

export async function retryNotifications(git, { settings = loadTelegramSettings(), fetchFn, log = console.log } = {}) {
  if (!settings?.enabled) throw new TelegramError('Telegram yoqilmagan. devship telegram setup ni bajaring.');
  const directory = outboxDirectory(git), pending = [];
  for (const name of readdirSync(directory).filter(n => /^[a-f0-9-]+\.json$/.test(n)).sort()) {
    const path = join(directory, name); if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) continue;
    let record; try { record = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new TelegramError('Telegram outbox fayli buzilgan; avtomatik yuborilmadi.'); }
    if (record.status === 'sent') continue;
    const migration = settings.verifiedMigration;
    if (record.chatId !== settings.chatId && migration?.from === record.chatId && migration.to === settings.chatId
      && /^-\d+$/.test(migration.from) && /^-\d+$/.test(migration.to) && Number.isFinite(Date.parse(migration.verifiedAt))
      && (record.threadId || null) === (settings.threadId || null)) {
      record.chatId = settings.chatId; record.chatTitle = settings.chatTitle;
      record.migratedFrom = migration.from; atomicJson(path, record);
    }
    if (record.chatId !== settings.chatId || (record.threadId || null) !== (settings.threadId || null)) throw new TelegramError('Kutilayotgan xabarning guruhi/topici hozirgi sozlamadan farq qiladi. Eski guruhga mos sozlamani tiklang; xabar boshqa guruhga yo‘naltirilmadi.');
    pending.push({ path, record });
  }
  for (const { path, record } of pending) {
    if (record.uncertain) log('Ogohlantirish: avvalgi urinish yetib borgan bo‘lishi mumkin; qo‘lda qayta yuborishda takror xabar ehtimoli bor.');
    const result = await deliver(record, path, settings, fetchFn);
    if (result.status !== 'sent') throw new TelegramError(result.error, result.uncertain);
    log(`Telegram xabari yuborildi: ${record.report?.project || 'loyiha'} / ${record.report?.branch || ''}`);
  }
  if (!pending.length) log('Telegram: qayta yuboriladigan xabar yo‘q.');
  return pending.length;
}
