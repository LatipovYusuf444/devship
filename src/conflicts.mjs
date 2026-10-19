import { lstatSync, readFileSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { redact } from './process.mjs';

const statusByStages = { '1': 'DD', '2': 'AU', '3': 'UA', '12': 'UD', '13': 'DU', '23': 'AA', '123': 'UU' };
const descriptions = {
  DD: 'Ikkala tomonda o‘chirilgan', AU: 'Sizning tomonda qo‘shilgan', UA: 'Kiruvchi tomonda qo‘shilgan',
  UD: 'Sizda o‘zgargan, kiruvchi tomonda o‘chirilgan', DU: 'Sizda o‘chirilgan, kiruvchi tomonda o‘zgargan',
  AA: 'Ikkala tomonda qo‘shilgan', UU: 'Ikkala tomonda o‘zgargan'
};

export function parseUnmerged(output) {
  const files = new Map();
  for (const entry of output.split('\0').filter(Boolean)) {
    const match = /^(\d+) ([a-f0-9]+) ([123])\t([\s\S]+)$/.exec(entry);
    if (!match) throw new Error('Unmerged index yozuvi o‘qilmadi.');
    const [, mode, oid, stage, path] = match;
    if (!files.has(path)) files.set(path, { path, stages: {} });
    files.get(path).stages[stage] = { mode, oid };
  }
  return [...files.values()].map(file => ({ ...file, status: statusByStages[Object.keys(file.stages).sort().join('')] || 'UNKNOWN' }));
}

export function markerRanges(content) {
  const text = String(content); if (text.includes('\0')) return [];
  const ranges = []; let opened = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const start = /^(<{7,})(?: |$)/.exec(lines[i]);
    if (start) {
      if (opened) ranges.push({ start: opened.line, end: null });
      opened = { line: i + 1, width: start[1].length };
    } else if (opened && new RegExp(`^>{${opened.width}}(?: |$)`).test(lines[i])) {
      ranges.push({ start: opened.line, end: i + 1 }); opened = null;
    }
  }
  if (opened) ranges.push({ start: opened.line, end: null });
  return ranges;
}

function fileRanges(root, path, maxBytes) {
  try {
    const file = join(root, path), stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) return [];
    const rel = relative(realpathSync(root), realpathSync(file));
    if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) return [];
    return markerRanges(readFileSync(file, 'utf8'));
  } catch { return []; }
}

function lastFileCommit(git, head, base, path) {
  const format = '%H%x00%an%x00%ae%x00%aI%x00';
  for (const sinceMergeBase of base ? [true, false] : [false]) {
    const result = git.result(['--literal-pathspecs', 'log', '-1', `--format=${format}`,
      sinceMergeBase ? `${base}..${head}` : head, '--', path]);
    if (!result.ok || !result.stdout.trim()) continue;
    const [hash, name, email, date] = result.stdout.split('\0');
    if (/^[a-f0-9]{40,64}$/.test(hash)) return { hash, author: { name, email }, date, sinceMergeBase };
  }
  return null;
}

const display = value => JSON.stringify(String(value ?? '')).replace(/[\u007f-\u009f]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
function describeCommit(commit) {
  if (!commit) return 'Git tarixida tegishli muallif ma’lumoti topilmadi';
  return `${display(commit.author.name)} <${display(commit.author.email)}> | ${commit.hash.slice(0, 12)} | ${display(commit.date)}${commit.sinceMergeBase ? '' : ' (umumiy tarixdagi oxirgi commit)'}`;
}

export function renderConflictReport(report) {
  const lines = [
    'KONFLIKT — PUSH BAJARILMADI.',
    `Joriy branch (qabul qiluvchi): ${display(report.currentBranch)} [${report.oursHead.slice(0, 12)}]`,
    `Kiruvchi branch (merge manbasi): ${display(report.incomingBranch)} [${report.incomingHead.slice(0, 12)}]`,
    `Konfliktli fayllar: ${report.files.length}`
  ];
  for (const [index, file] of report.files.entries()) {
    lines.push('', `${index + 1}. ${display(file.path)} — ${file.status}: ${descriptions[file.status] || 'Hal qilinmagan index holati'}`);
    lines.push(file.markerRanges.length
      ? `   Konflikt belgilari, qatorlar: ${file.markerRanges.map(r => r.end ? `${r.start}–${r.end}` : `${r.start} dan boshlangan (yopilmagan)`).join(', ')}`
      : '   Qatorlar aniqlanmadi: o‘chirish/rename, binary, marker yo‘qligi yoki scan limiti bo‘lishi mumkin.');
    lines.push(`   Sizning tomondagi oxirgi fayl commiti: ${describeCommit(file.oursCommit)}`);
    lines.push(`   Kiruvchi tomondagi oxirgi fayl commiti: ${describeCommit(file.theirsCommit)}`);
  }
  lines.push('', 'Mualliflar faylga tegishli oxirgi Git commit metadatasidan olindi; aniq konflikt qatori muallifi yoki branch egasi alohida tasdiqlanmagan.');
  return redact(lines.join('\n'));
}

function saveReport(git, report) {
  const gitDir = realpathSync(git.exec('rev-parse', '--absolute-git-dir'));
  const directory = join(gitDir, 'devship-conflicts');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error('Hisobot papkasi oddiy katalog emas.');
  const path = join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`);
  writeFileSync(path, redact(JSON.stringify(report, null, 2)) + '\n', { flag: 'wx', mode: 0o600 });
  return path;
}

export function mergeFailureDetails(git, { branch, ref, oursHead, incomingHead, result, maxScanBytes, onReport }) {
  const incomingBranch = ref.replace(/^refs\/remotes\//, '');
  const gitOutput = redact([result.stdout, result.stderr].filter(Boolean).join('\n').trim());
  const next = 'To‘xtatildi: push bajarilmadi. git status orqali holatni ko‘ring; konfliktlarni qo‘lda tuzatib, aniq fayllarni git add va git commit bilan tugating. So‘ng devship ni qayta bajaring. Bekor qilish uchun git merge --abort ni o‘zingiz tanlab bajaring.';
  try {
    const index = git.result(['ls-files', '--unmerged', '-z']);
    if (!index.ok) throw new Error('Unmerged index o‘qilmadi.');
    const files = parseUnmerged(index.stdout);
    if (!files.length) return `Merge bajarilmadi: ${display(incomingBranch)} → ${display(branch)}.\n${next}\n${gitOutput}`;
    const common = git.result(['merge-base', oursHead, incomingHead]);
    const base = common.ok ? common.stdout.trim() : null;
    const report = {
      schemaVersion: 1, createdAt: new Date().toISOString(), currentBranch: branch, incomingBranch,
      incomingRef: ref, oursHead, incomingHead, mergeBase: base, pushPerformed: false,
      files: files.map(file => ({ ...file, markerRanges: fileRanges(git.root, file.path, maxScanBytes),
        oursCommit: lastFileCommit(git, oursHead, base, file.path),
        theirsCommit: lastFileCommit(git, incomingHead, base, file.path) })),
      attribution: 'Last relevant file commit on each side; not proof of exact conflicting-line authorship or branch ownership.'
    };
    onReport?.(report);
    const lines = [renderConflictReport(report)];
    try { lines.push(`Hisobot saqlandi: ${display(saveReport(git, report))}`); }
    catch (error) { lines.push(`Hisobot faylga saqlanmadi (${error.code || 'WRITE_ERROR'}); yuqoridagi ma’lumot terminalda qoldi.`); }
    lines.push('', next); if (gitOutput) lines.push('', 'Git chiqishi:', gitOutput);
    return lines.join('\n');
  } catch (error) {
    return `Merge to‘xtadi: ${display(incomingBranch)} → ${display(branch)}. Qo‘shimcha hisobot olinmadi (${error.code || 'REPORT_ERROR'}).\n${next}\n${gitOutput}`;
  }
}
