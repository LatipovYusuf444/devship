import { existsSync, readdirSync, realpathSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { reportDirectory, reportSettings, reportDay, previewReports } from './daily-reports.mjs';
import { readReportEdits, reportItems, itemHash } from './report-items.mjs';
import { businessText } from './work-summary.mjs';
import { atomicJson } from './telegram-store.mjs';
import { acquireLock } from './locks.mjs';
import { createPrompter } from './telegram-setup.mjs';
import { fail } from './process.mjs';

function checkedDay(day, directory, now) {
  const date = new Date(`${day}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) fail('REPORT', 'Sana YYYY-MM-DD shaklida bo‘lsin.');
  const config = reportSettings(directory);
  if (!config?.enabled) fail('REPORT', 'Avval ds reports setup orqali hisobotni yoqing.');
  if (day < reportDay(now, config.timeZone, config.at)) fail('REPORT', `Hisobot muddati tugagan; ${config.at} dan keyin tahrirlab bo‘lmaydi.`);
  const parent = join(directory, 'deliveries');
  if (existsSync(parent) && readdirSync(parent).some(name => name.startsWith(day + '-') && name.endsWith('.json'))) fail('REPORT', 'Hisobot yuborishga tayyorlangan yoki yuborilgan; matn muzlatilgan.');
}
export function editableReport(day, { directory = reportDirectory(), now = new Date().toISOString() } = {}) {
  checkedDay(day, directory, now);
  const events = previewReports({ directory }).filter(group => group.day === day).flatMap(group => group.events);
  const edits = readReportEdits(directory, day);
  return { day, revision: itemHash([events, edits]), entries: reportItems(events, edits) };
}
export function editDailyReport(day, changes, { directory = reportDirectory(), now = new Date().toISOString(), revision } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const release = acquireLock(join(directory, 'delivery.lock'), realpathSync(directory));
  try {
    const snapshot = editableReport(day, { directory, now });
    if (!revision || snapshot.revision !== revision) fail('REPORT', 'Hisobot yangilangan; eskirgan tahrir saqlanmadi. Ro‘yxatni qayta oching.');
    if (!Array.isArray(changes) || !changes.length || changes.length > 100) fail('REPORT', 'Hisobot tahriri bo‘sh yoki juda katta.');
    const edits = readReportEdits(directory, day), used = new Set();
    for (const change of changes) {
      const text = businessText(change.text, true);
      if (!Array.isArray(change.ids) || !change.ids.length || new Set(change.ids).size !== change.ids.length || change.ids.some(id => used.has(id))) fail('REPORT', 'Hisobot bandi takrorlangan yoki tanlanmagan.');
      const entries = change.ids.map(id => snapshot.entries.find(entry => entry.id === id));
      if (entries.some(entry => !entry)) fail('REPORT', 'Hisobot bandi topilmadi; qayta oching.');
      if (entries.some(entry => entry.scope !== entries[0].scope)) fail('REPORT', 'Faqat bir loyiha, branch va guruhdagi bandlarni birlashtirish mumkin.');
      for (const id of change.ids) used.add(id);
      edits.operations.push({ sources: [...new Set(entries.flatMap(entry => entry.sources))], text });
    }
    // Flatten superseded edits to keep the overlay bounded and source-specific.
    const latest = new Map();
    for (const op of edits.operations) for (const source of op.sources) latest.set(source, op.text);
    const byText = new Map();
    for (const [source, text] of latest) { if (!byText.has(text)) byText.set(text, []); byText.get(text).push(source); }
    edits.operations = [...byText].map(([text, sources]) => ({ sources, text }));
    atomicJson(join(directory, 'edits', `${day}.json`), edits);
    return editableReport(day, { directory, now });
  } finally { release(); }
}
export async function editReportCommand(day, { directory = reportDirectory(), log = console.log, prompt, now = () => new Date().toISOString() } = {}) {
  const config = reportSettings(directory);
  day ||= reportDay(now(), config?.timeZone, config?.at);
  let view = editableReport(day, { directory, now: now() });
  if (!view.entries.length) { log('Bu kun uchun tahrirlanadigan ish yo‘q. Keyingi muvaffaqiyatli pushdan yig‘iladi.'); return; }
  if (!prompt && !process.stdin.isTTY) fail('REPORT', 'Tahrirlash uchun oddiy interaktiv terminalda ds reports edit ni bajaring.');
  const ui = prompt || createPrompter();
  try {
    for (;;) {
      log(`${day} — kundalik hisobot`);
      view.entries.forEach((entry, i) => log(`${i + 1}. ${entry.project} / ${entry.branch}: ${entry.text}`));
      const answer = await ui.ask('Tahrirlash: 1; birlashtirish: 1,2; tugatish: Enter: ');
      if (!answer) return;
      if (!/^\d+(,\s*\d+)*$/.test(answer)) fail('REPORT', 'Band raqamlarini 1 yoki 1,2 shaklida yozing.');
      const indexes = answer.split(',').map(value => Number(value.trim()) - 1);
      if (new Set(indexes).size !== indexes.length || indexes.some(i => !view.entries[i])) fail('REPORT', 'Band raqami noto‘g‘ri.');
      const text = await ui.ask('Qisqa, tushunarli yangi matn: ');
      view = editDailyReport(day, [{ ids: indexes.map(i => view.entries[i].id), text }], { directory, now: now(), revision: view.revision });
      log('Hisobot matni saqlandi.');
    }
  } finally { ui.close(); }
}
