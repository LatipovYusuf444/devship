import { redact } from './process.mjs';
import { pageLabel, summarizeWork } from './work-summary.mjs';

const safe = (value, length = 200) => {
  const text = redact(String(value ?? '')).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ');
  let result = ''; for (const c of text) { if (result.length + c.length > length) return result + '…'; result += c; } return result;
};
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const single = (value, limit = 200) => safe(String(value ?? '').replace(/[\r\n\t]/g, ' '), limit);
// Bound the encoded size as well, so hostile metadata cannot consume the card.
const label = (value, limit = 180) => {
  let encoded = '', plain = ''; for (const c of single(value, limit)) { const e = escape(c); if (encoded.length + e.length > limit) { encoded += '…'; plain += '…'; break; } encoded += e; plain += c; } return { encoded, plain };
};
const line = (name, value, limit) => `${name}: ${label(value, limit).plain}`;
function part(text, tag = '') { return { plain: text, html: tag ? `<${tag}>${escape(text)}</${tag}>` : escape(text) }; }
function card(parts, attachment) {
  const all = parts.map(p => p.html).join('\n\n');
  if (all.length <= 3900) return { html: all, plain: parts.map(p => p.plain).join('\n\n'), omitted: false };
  const footer = part(`… To‘liq tafsilotlar ${attachment} ilovasida.`), selected = [];
  let length = footer.html.length + 2;
  for (const p of parts) { if (length + p.html.length + 2 > 3900) break; selected.push(p); length += p.html.length + 2; }
  return { html: [...selected, footer].map(p => p.html).join('\n\n'), plain: parts.map(p => p.plain).join('\n\n'), omitted: true };
}
export function notificationTime(iso, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return `${values.day}.${values.month}.${values.year}, ${values.hour}:${values.minute}:${values.second} (${timeZone})`;
}
function metadata(report, iso, timeZone) {
  return part([line('📁 Loyiha', report.project, 160), '', line('👤 Git foydalanuvchisi', report.actor || 'Aniqlanmadi', 120), '', line('🌿 Branch', report.branch, 200), line('📡 Remote', report.remote, 80), '', `🕒 ${notificationTime(iso, timeZone)}`, `UTC: ${safe(iso, 50)}`].join('\n'), 'blockquote');
}
export function pushCard(report, timeZone) {
  const parts = [part('🟢 DEVSHIP • PUSH MUVAFFAQIYATLI', 'b'), part('✅ Git push tasdiqlandi.\nFaqat joriy feature branchga yuborildi.', 'blockquote'), metadata(report, report.pushedAt, timeZone), part(`📦 ${report.files.length} fayl · ${report.commits.length} commit\nCommit: ${safe(report.after, 12)}`)];
  const pages = summarizeWork({ files: report.files });
  if (pages.length) parts.push(part('📄 Qilingan ishlar', 'b'), ...pages.map(text => part('• ' + safe(text, 160))));
  if (report.commits.length) parts.push(part('📝 Commitlar', 'b'), ...report.commits.map(commit => part(`${single(commit.hash, 12)} · ${single(commit.subject, 180)}\nMuallif: ${single(commit.author, 100)} · ${single(commit.date, 50)}`)));
  if (report.files.length) parts.push(part('🗂 O‘zgargan fayllar', 'b'), ...report.files.map(file => part(`${single(file.status, 3)}  ${single(file.path, 250)}`, 'pre')));
  return card(parts, 'push-hisobot.txt');
}
const conflictNames = { AA: 'Ikkala tomonda qo‘shilgan', UU: 'Ikkala tomonda o‘zgargan', DD: 'Ikkala tomonda o‘chirilgan', AU: 'O‘z tomoningizda qo‘shilgan', UA: 'Kiruvchi tomonda qo‘shilgan', UD: 'Kiruvchi tomonda o‘chirilgan', DU: 'O‘z tomoningizda o‘chirilgan' };
const stages = { prepare: 'Tayyorgarlik', 'checks-before-commit': 'Commitdan oldingi tekshiruv', commit: 'Stage/commit', fetch: 'Fetch', merge: 'Branchlarni birlashtirish', 'checks-after-merge': 'Mergedan keyingi tekshiruv', 'before-push': 'Pushdan oldingi nazorat', push: 'Push' };
function author(commit) { return commit ? `${single(commit.author?.name, 100)} · ${single(commit.hash, 12)}` : 'Git tarixida aniqlanmadi'; }
export function failureCard(report, timeZone) {
  const parts = [part(report.conflict ? '🔴 DEVSHIP • KONFLIKT' : '🔴 DEVSHIP • XATO', 'b'), part(report.stage === 'push' ? '⛔ PUSH TASDIQLANMADI\nRemote holatini tekshiring; avtomatik qayta push qilinmadi.' : '⛔ PUSH BAJARILMADI\nLokal ishlar saqlangan.', 'blockquote'), metadata(report, report.failedAt, timeZone), part(`Bosqich: ${safe(stages[report.stage] || report.stage, 100)}\nXato kodi: ${safe(report.code, 60)}`)];
  if (report.conflict) {
    const conflict = report.conflict;
    parts.push(part(`Qabul qiluvchi branch: ${label(conflict.currentBranch, 200).plain}\nKiruvchi branch: ${label(conflict.incomingBranch, 200).plain}\nKonfliktli fayllar: ${conflict.files.length}`, 'blockquote'));
    for (const [i, file] of conflict.files.entries()) {
      const page = pageLabel(file.path), ranges = file.markerRanges || [];
      parts.push(part(`${i + 1}. ${page ? single(page, 80) + ' sahifasi' : 'Umumiy fayl'}`, 'b'), part(`${single(file.path, 250)}\n${single(file.status, 8)} · ${conflictNames[file.status] || 'Hal qilinmagan holat'}\nQatorlar: ${ranges.length ? ranges.slice(0, 8).map(r => r.end ? `${r.start}–${r.end}` : `${r.start} dan boshlangan`).join(', ') : 'Aniqlanmadi (binary/o‘chirish/marker yo‘q)'}\n\nO‘z tomoni oxirgi commiti: ${author(file.oursCommit)}\nKiruvchi tomon oxirgi commiti: ${author(file.theirsCommit)}`, 'blockquote'));
      for (const snippet of file.snippets || []) parts.push(part(snippet.text ? safe(snippet.text, 1500) + (snippet.clipped ? '\n… Parcha qisqartirildi.' : '') : safe(snippet.reason, 180), snippet.text ? 'pre' : ''));
    }
    parts.push(part('Mualliflar — faylning oxirgi Git commitlaridan. Bu aniq konflikt qatori muallifi yoki branch egasi tasdig‘i emas.'));
  } else {
    parts.push(part(safe(report.summary, 600)));
    if (report.check) parts.push(part('Tekshiruv: ' + safe(report.check, 220)));
    for (const diagnostic of report.diagnostics || []) parts.push(part(safe(diagnostic, 500), 'pre'));
    for (const location of report.locations || []) {
      parts.push(part(`${safe(pageLabel(location.path) || 'Umumiy fayl', 80)} · ${safe(location.path, 200)}\nQator: ${location.line}${location.column ? ', ustun: ' + location.column : ''}`, 'blockquote'));
      parts.push(part(location.excerpt.text ? safe(location.excerpt.text, 1500) : safe(location.excerpt.reason, 180), location.excerpt.text ? 'pre' : ''));
    }
  }
  parts.push(part('Keyingi qadam: ko‘rsatilgan joyni qo‘lda tuzating, so‘ng ds ni qayta bajaring. DevShip loyiha kodini avtomatik tuzatmaydi.'));
  return card(parts, 'xato-hisobot.txt');
}
