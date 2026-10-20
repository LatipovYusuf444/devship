import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { globalConfigPath } from './config.mjs';
import { atomicJson, readTelegramStatus, loadTelegramSettings } from './telegram-store.mjs';
import { telegramCall, TelegramError } from './telegram-api.mjs';
import { acquireLock } from './locks.mjs';
import { fail, redact } from './process.mjs';
import { summarizeWork, businessText } from './work-summary.mjs';
import { Git, repository } from './git.mjs';

export const reportDirectory = () => join(dirname(globalConfigPath()), 'reports');
const sha = text => createHash('sha256').update(text).digest('hex');
const clean = value => redact(String(value ?? '')).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 160);
function read(file) {
  if (!existsSync(file)) return null;
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) fail('REPORT', 'Hisobot yozuvi oddiy va cheklangan JSON fayli bo‘lishi kerak.');
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { fail('REPORT', 'Hisobot yozuvi buzilgan; avtomatik yuborilmadi.'); }
}
function folder(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) fail('REPORT', 'Hisobot katalogi oddiy papka bo‘lishi kerak.');
}
export function reportSettings(directory = reportDirectory(), value) {
  if (value !== undefined) {
    if (typeof value.enabled !== 'boolean' || !/^\d{2}:\d{2}$/.test(value.at) || value.at > '23:59' || Number(value.at.slice(3)) > 59) fail('REPORT', 'Hisobot vaqti HH:MM shaklida bo‘lsin.');
    try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }); } catch { fail('REPORT', 'Hisobot vaqt zonasi noto‘g‘ri.'); }
    atomicJson(join(directory, 'settings.json'), { version: 1, ...value });
  }
  const settings = read(join(directory, 'settings.json'));
  if (settings && (settings.version !== 1 || typeof settings.enabled !== 'boolean')) fail('REPORT', 'Hisobot sozlamasi noto‘g‘ri.');
  return settings;
}
function clock(iso, timeZone) {
  const date = new Date(iso); if (!Number.isFinite(date.getTime())) fail('REPORT', 'Hisobot sanasi noto‘g‘ri.');
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
function shiftDay(day, offset) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); }
export function reportDay(iso, timeZone = 'Asia/Tashkent', at = '18:00') {
  const p = clock(iso, timeZone); return p.time >= at ? shiftDay(p.day, 1) : p.day;
}
function dueDay(iso, config) { const p = clock(iso, config.timeZone); return p.time < config.at ? shiftDay(p.day, -1) : p.day; }
function validRecipient(value) { return value && /^-\d{1,20}$/.test(value.chatId) && (value.threadId === undefined || Number.isSafeInteger(value.threadId) && value.threadId > 0); }
const recipientKey = value => sha(JSON.stringify([value.chatId, value.threadId || null]));
function validateEvent(value) {
  if (!value || value.version !== 1 || !/^[a-f0-9]{64}$/.test(value.projectId) || !/^[a-f0-9]{40,64}$/.test(value.after) || !validRecipient(value.recipient)
    || !Array.isArray(value.items) || value.items.length > 100 || value.items.some(item => !businessText(item)) || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)) fail('REPORT', 'Hisobot hodisasi noto‘g‘ri; avtomatik yuborilmadi.');
  return value;
}
export function saveWorkEvent(event, { directory = reportDirectory() } = {}) {
  const config = reportSettings(directory); if (!config?.enabled || !event.items?.length) return { status: 'disabled-or-empty' };
  const record = validateEvent({ ...event, version: 1, project: clean(event.project), branch: clean(event.branch), day: reportDay(event.pushedAt, config.timeZone, config.at) });
  const id = sha(JSON.stringify([record.projectId, record.branch, record.after]));
  const path = join(directory, 'events', `${id}.json`); folder(dirname(path));
  // Existing records retain their original recipient, date and wording.
  if (existsSync(path)) { validateEvent(read(path)); return { status: 'existing', id }; }
  atomicJson(path, { ...record, id }); return { status: 'recorded', id };
}
export function collectOwnWork({ git, workHead, baseHead, before, notes = [] }) {
  const commits = git.exec('rev-list', '--no-merges', workHead, '--not', baseHead, before).split('\n').filter(Boolean);
  const items = [];
  for (const commit of commits) {
    const files = git.raw('diff-tree', '--root', '-r', '--no-commit-id', '--name-only', '--no-renames', '-z', commit, '--').split('\0').filter(Boolean);
    items.push(...summarizeWork({ files }));
  }
  return { items: commits.length ? notes.length ? summarizeWork({ notes }) : [...new Set(items)] : [], commits };
}
export function recordSuccessfulPush(context, { directory = reportDirectory(), settings } = {}) {
  if (!reportSettings(directory)?.enabled || context.config.telegram === false) return { status: 'disabled' };
  if (context.reportIntent) {
    const snapshot = read(join(context.reportIntent.directory, 'intents', `${context.reportIntent.id}.json`));
    if (!snapshot || snapshot.status === 'rejected') fail('REPORT', 'Push hisobot checkpointi topilmadi yoki rad etilgan.');
    const result = saveWorkEvent({ ...snapshot.event, pushedAt: context.pushedAt }, { directory: context.reportIntent.directory });
    if (result.status === 'recorded') context.log(`Kundalik hisobotga saqlandi: ${snapshot.event.items.length} ta ish.`);
    return result;
  }
  settings ||= readTelegramStatus(); if (!settings?.enabled) return { status: 'disabled' };
  const own = collectOwnWork(context);
  const root = repository(context.git.root);
  const common = realpathSync(resolve(root, context.git.exec('rev-parse', '--git-common-dir')));
  const url = context.git.exec('remote', 'get-url', context.remote);
  const result = saveWorkEvent({ projectId: sha(common + '\0' + url), project: basename(context.git.root), branch: context.branch, after: context.after,
    pushedAt: context.pushedAt, items: own.items, recipient: { chatId: settings.chatId, ...(settings.threadId ? { threadId: settings.threadId } : {}) } }, { directory });
  if (result.status === 'recorded') context.log(`Kundalik hisobotga saqlandi: ${own.items.length} ta ish.`);
  return result;
}
export function prepareSuccessfulPush(context, { directory = reportDirectory(), settings } = {}) {
  if (!reportSettings(directory)?.enabled || context.config.telegram === false) return null;
  settings ||= readTelegramStatus(); if (!settings?.enabled) return null;
  const own = collectOwnWork(context); if (!own.items.length) return null;
  const root = repository(context.git.root);
  const common = realpathSync(resolve(root, context.git.exec('rev-parse', '--git-common-dir')));
  const url = context.git.exec('remote', 'get-url', context.remote), projectId = sha(common + '\0' + url);
  const event = { projectId, project: basename(context.git.root), branch: context.branch, after: context.after, pushedAt: context.pushedAt,
    items: own.items, recipient: { chatId: settings.chatId, ...(settings.threadId ? { threadId: settings.threadId } : {}) } };
  const id = sha(JSON.stringify([projectId, clean(event.branch), event.after]));
  const path = join(directory, 'intents', `${id}.json`);
  if (!existsSync(path) || read(path)?.status === 'rejected') atomicJson(path, { version: 1, id, root, remote: context.remote, urlHash: sha(url), event, status: 'prepared' });
  return { id, directory };
}
export function settleWorkIntent(context, status = 'confirmed') {
  if (!context.reportIntent) return;
  const { directory, id } = context.reportIntent;
  const path = join(directory, 'intents', `${id}.json`), intent = read(path);
  if (!intent || intent.id !== id || intent.event.after !== context.after) fail('REPORT', 'Push checkpointi mos emas.');
  intent.status = status;
  if (status === 'confirmed') intent.event.pushedAt = context.pushedAt;
  atomicJson(path, intent);
}
export function reconcileWorkIntents({ directory = reportDirectory(), log = () => {} } = {}) {
  const parent = join(directory, 'intents'); if (!existsSync(parent)) return 0;
  let recovered = 0;
  for (const name of readdirSync(parent).filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
    const intent = read(join(parent, name));
    if (!intent || intent.version !== 1 || intent.id + '.json' !== name || !/^[a-f0-9]{64}$/.test(intent.urlHash) || typeof intent.root !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(intent.remote) || intent.remote.includes('..')) fail('REPORT', 'Hisobot push checkpointi noto‘g‘ri.');
    const candidate = { ...intent.event, version: 1, day: reportDay(intent.event.pushedAt) }; validateEvent(candidate);
    if (intent.status === 'rejected') continue;
    if (existsSync(join(directory, 'events', name))) continue;
    try {
      const root = repository(intent.root); if (root !== intent.root) continue;
      const git = new Git(root, 15000);
      if (sha(git.exec('remote', 'get-url', intent.remote)) !== intent.urlHash) continue;
      if (!git.result(['check-ref-format', '--branch', intent.event.branch]).ok) continue;
      const output = git.exec('ls-remote', '--heads', '--', intent.remote, `refs/heads/${intent.event.branch}`);
      const remoteHead = /^([a-f0-9]{40,64})\s/.exec(output)?.[1];
      if (!remoteHead) continue;
      const confirmed = remoteHead === intent.event.after || intent.status === 'confirmed' && git.result(['merge-base', '--is-ancestor', intent.event.after, remoteHead]).ok;
      if (!confirmed) continue;
      // Without a successful-client receipt we only know the first verification
      // time, not the historical push time. Never invent a failed-day success.
      const recoveredEvent = intent.status === 'confirmed' ? intent.event : { ...intent.event, pushedAt: new Date().toISOString() };
      const result = saveWorkEvent(recoveredEvent, { directory });
      if (result.status === 'recorded') { recovered++; log('Tasdiqlangan pushdan kundalik ish yozuvi tiklandi.'); }
    } catch (error) { log(`Push checkpointi hozircha tiklanmadi: ${clean(error.message)}`); }
  }
  return recovered;
}
function groups(directory) {
  const path = join(directory, 'events'); if (!existsSync(path)) return [];
  folder(path); const result = new Map();
  for (const name of readdirSync(path).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).sort()) {
    const event = validateEvent(read(join(path, name))), key = `${event.day}-${recipientKey(event.recipient)}`;
    if (!result.has(key)) result.set(key, { key, day: event.day, recipient: event.recipient, events: [] });
    result.get(key).events.push(event);
  }
  return [...result.values()].sort((a, b) => a.key.localeCompare(b.key));
}
export function formatDailyReport(day, events) {
  const projects = new Map(), date = day.split('-').reverse().join('.');
  for (const event of events) {
    const key = `${event.projectId}:${event.branch}`;
    if (!projects.has(key)) projects.set(key, { project: clean(event.project), branch: clean(event.branch), items: new Set() });
    for (const item of event.items) { const safe = businessText(item); if (safe) projects.get(key).items.add(safe); }
  }
  let index = 0; const lines = [`${date}  #Qilingan-ishlar`];
  for (const project of projects.values()) {
    if (!project.items.size) continue;
    lines.push('', `${project.project} — ${project.branch}`, ...[...project.items].map(item => `${++index}. ${item}`));
  }
  return lines.join('\n');
}
export function previewReports({ directory = reportDirectory() } = {}) {
  return groups(directory).map(group => ({ ...group, text: formatDailyReport(group.day, group.events) }));
}
function chunks(text) {
  const result = []; let chunk = '';
  for (const line of text.split('\n')) {
    if (chunk.length + line.length + 1 > 3900) { result.push(chunk); chunk = ''; }
    chunk += (chunk ? '\n' : '') + line;
  }
  if (chunk) result.push(chunk); return result;
}
export async function runDueReports({ directory = reportDirectory(), now = new Date().toISOString(), settings, send, log = () => {}, onlyDay } = {}) {
  const result = { sent: 0, failed: 0, uncertain: 0, blocked: 0 };
  const config = reportSettings(directory); if (!config?.enabled) return result;
  folder(directory); const release = acquireLock(join(directory, 'delivery.lock'), realpathSync(directory));
  try {
    reconcileWorkIntents({ directory, log });
    const due = groups(directory).filter(g => g.day <= dueDay(now, config) && (!onlyDay || g.day === onlyDay));
    if (!due.length) return result;
    settings ||= loadTelegramSettings();
    if (!settings?.enabled) { result.blocked = due.length; return result; }
    for (const group of due) {
      const parent = join(directory, 'deliveries'); folder(parent);
      const receipts = readdirSync(parent).filter(n => n.startsWith(group.key + '-') && /^\d{4}-\d{2}-\d{2}-[a-f0-9]{64}-[a-f0-9]{64}\.json$/.test(n)).map(name => ({ path: join(parent, name), receipt: read(join(parent, name)) }));
      for (const { receipt } of receipts) {
        if (receipt?.version !== 1 || !Array.isArray(receipt.eventIds) || receipt.eventIds.some(id => !/^[a-f0-9]{64}$/.test(id)) || !Array.isArray(receipt.parts)
          || receipt.parts.some(part => typeof part !== 'string' || part.length > 3900) || !Array.isArray(receipt.messageIds) || receipt.messageIds.some(id => !Number.isSafeInteger(id) || id < 1)
          || receipt.messageIds.length > receipt.parts.length || recipientKey(receipt.recipient) !== recipientKey(group.recipient)) fail('REPORT', 'Hisobot yuborish checkpointi noto‘g‘ri.');
      }
      const covered = new Set(receipts.flatMap(({ receipt }) => receipt.eventIds));
      const previousItems = new Set(group.events.filter(e => covered.has(e.id)).flatMap(e => e.items.map(item => `${e.projectId}:${e.branch}:${item}`)));
      const remaining = group.events.filter(e => !covered.has(e.id));
      if (remaining.length) {
        const fresh = remaining.map(e => ({ ...e, items: e.items.filter(item => !previousItems.has(`${e.projectId}:${e.branch}:${item}`)) }));
        const id = sha(remaining.map(e => e.id).sort().join(',')), path = join(parent, `${group.key}-${id}.json`);
        const receipt = { version: 1, key: group.key, day: group.day, recipient: group.recipient, eventIds: remaining.map(e => e.id), status: 'pending', parts: fresh.some(e => e.items.length) ? chunks(formatDailyReport(group.day, fresh)) : [], messageIds: [] };
        atomicJson(path, receipt); receipts.push({ path, receipt });
      }
      for (const { path, receipt } of receipts) {
      if (receipt?.status === 'sent') continue;
      if (receipt?.status === 'sending' || receipt?.status === 'uncertain') { result.uncertain++; continue; }
      if (recipientKey(settings) !== recipientKey(group.recipient)) { result.blocked++; continue; }
      if (receipt?.retryAfter && now < receipt.retryAfter) continue;
      try {
        for (let i = receipt.messageIds.length; i < receipt.parts.length; i++) {
          receipt.status = 'sending'; atomicJson(path, receipt);
          let response;
          try {
            response = send ? await send(receipt.parts[i]) : await telegramCall(settings.botToken, 'sendMessage', {
              chat_id: group.recipient.chatId, text: receipt.parts[i], link_preview_options: { is_disabled: true },
              ...(group.recipient.threadId ? { message_thread_id: group.recipient.threadId } : {})
            });
          } catch (error) { receipt.status = error.uncertain ? 'uncertain' : 'pending'; throw error; }
          if (!Number.isSafeInteger(response?.message_id) || response.message_id < 1) { receipt.status = 'uncertain'; throw new TelegramError('Telegram xabar tasdig‘i o‘qilmadi.', true); }
          receipt.messageIds.push(response.message_id); receipt.status = 'pending';
          // If this disk write fails, the prior 'sending' marker prevents duplicates.
          atomicJson(path, receipt);
        }
        receipt.status = 'sent'; receipt.sentAt = now; delete receipt.retryAfter; delete receipt.error; atomicJson(path, receipt);
        if (receipt.parts.length) { result.sent++; log(`Kundalik hisobot yuborildi: ${group.day}.`); }
      } catch (error) {
        const disk = read(path);
        if (disk?.status === 'sending' && receipt.status === 'pending' && receipt.messageIds.length > disk.messageIds.length) receipt.status = 'uncertain';
        receipt.error = clean(error.message); receipt.retryAfter = new Date(new Date(now).getTime() + 10 * 60000).toISOString();
        atomicJson(path, receipt);
        if (receipt.status === 'uncertain') result.uncertain++; else result.failed++;
      }
      }
    }
    return result;
  } finally { release(); }
}
export async function retryDailyReport(day, { directory = reportDirectory(), allowUncertain = false, log = console.log, ...options } = {}) {
  const parsedDay = new Date(`${day}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) fail('REPORT', 'Sana YYYY-MM-DD shaklida bo‘lsin.');
  folder(directory); const release = acquireLock(join(directory, 'delivery.lock'), realpathSync(directory));
  try {
    const parent = join(directory, 'deliveries');
    if (existsSync(parent)) for (const name of readdirSync(parent).filter(name => name.startsWith(day + '-') && /^\d{4}-\d{2}-\d{2}-[a-f0-9]{64}-[a-f0-9]{64}\.json$/.test(name))) {
      const file = join(parent, name), receipt = read(file);
      if (receipt.status === 'sent') continue;
      if (['sending', 'uncertain'].includes(receipt.status)) {
        if (!allowUncertain) fail('REPORT', 'Avvalgi xabar yetib borgan bo‘lishi mumkin. Takror ehtimolini tasdiqlash: --allow-duplicate');
        log('Ogohlantirish: noaniq xabar qayta yuboriladi; takror xabar ehtimoli bor.');
      }
      receipt.status = 'pending'; delete receipt.retryAfter; atomicJson(file, receipt);
    }
  } finally { release(); }
  return runDueReports({ directory, log, ...options, onlyDay: day });
}
