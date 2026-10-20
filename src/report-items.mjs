import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { businessText } from './work-summary.mjs';
import { fail, redact } from './process.mjs';

export const itemHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function readReportEdits(directory, day) {
  const file = join(directory, 'edits', `${day}.json`);
  if (!existsSync(file)) return { version: 1, operations: [] };
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) fail('REPORT', 'Hisobot tahriri noto‘g‘ri.');
  let value; try { value = JSON.parse(readFileSync(file, 'utf8')); } catch { fail('REPORT', 'Hisobot tahriri o‘qilmadi.'); }
  if (value?.version !== 1 || !Array.isArray(value.operations) || value.operations.length > 10000 || value.operations.some(op => !Array.isArray(op.sources) || !op.sources.length || op.sources.some(id => !/^[a-f0-9]{64}$/.test(id)) || !businessText(op.text))) fail('REPORT', 'Hisobot tahriri noto‘g‘ri.');
  return value;
}
export function reportItems(events, edits = { operations: [] }) {
  const overrides = new Map();
  for (const op of edits.operations) for (const id of op.sources) overrides.set(id, op.text);
  const result = new Map();
  for (const event of events) for (let i = 0; i < event.items.length; i++) {
    const source = itemHash([event.id, i]), text = businessText(overrides.get(source) || event.items[i]);
    if (!text) continue;
    const scope = itemHash([event.projectId, event.branch, event.recipient.chatId, event.recipient.threadId || null]);
    const key = itemHash([scope, text]);
    if (!result.has(key)) result.set(key, { scope, projectId: event.projectId, project: event.project, branch: event.branch, text, sources: [] });
    result.get(key).sources.push(source);
  }
  return [...result.values()].map(entry => ({ ...entry, id: itemHash([entry.scope, entry.text, [...entry.sources].sort()]) }));
}
export function formatReportItems(day, entries) {
  const projects = new Map();
  for (const entry of entries) {
    if (!projects.has(entry.scope)) projects.set(entry.scope, { ...entry, items: [] });
    projects.get(entry.scope).items.push(entry.text);
  }
  const clean = text => redact(String(text)).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 160);
  let index = 0; const lines = [`${day.split('-').reverse().join('.')}  #Qilingan-ishlar`];
  for (const project of projects.values()) lines.push('', `${clean(project.project)} — ${clean(project.branch)}`, ...project.items.map(item => `${++index}. ${item}`));
  return lines.join('\n');
}
