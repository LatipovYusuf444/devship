import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPath, inspectContent } from './safety.mjs';
import { redact } from './process.mjs';

const inside = path => path && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path);
export function sourceExcerpt(root, path, { start, end = start } = {}) {
  const omitted = { text: null, reason: 'Kod ko‘rsatilmadi: maxfiylik, fayl turi, hajm yoki manzil cheklovi.' };
  try {
    if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(end) || end < start || typeof path !== 'string') return omitted;
    const file = resolve(root, path), rel = relative(resolve(root), file).replaceAll('\\', '/');
    if (!inside(rel) || !/\.(?:[cm]?[jt]sx?|vue|svelte|java|kt|gradle|xml|json|css|scss|html)$/i.test(rel)) return omitted;
    inspectPath(rel, { exclude: [], allowSecretPaths: [] });
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || !inside(relative(realpathSync(root), realpathSync(file)))) return omitted;
    const content = readFileSync(file, 'utf8');
    if (content.includes('\0') || /[\u001b\u202a-\u202e\u2066-\u2069]/.test(content)) return omitted;
    inspectContent(rel, content);
    // Short passwords, connection strings and unfamiliar secret variable names
    // also suppress the whole excerpt, even outside the selected lines.
    if (redact(content) !== content || /(?:password|passwd|secret|token|api[_-]?key|authorization|database[_-]?url|connection[_-]?string)\s*["']?\s*[:=]/i.test(content) || /https?:\/\/[^\s/@]+:[^\s/@]+@/i.test(content)) return omitted;
    const lines = content.split(/\r?\n/); if (start > lines.length) return omitted;
    const first = Math.max(1, start - 1), last = Math.min(lines.length, end + 1, first + 11);
    const text = lines.slice(first - 1, last).map((line, i) => `${first + i} │ ${[...line.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')].slice(0, 180).join('')}${[...line].length > 180 ? '…' : ''}`).join('\n');
    return { start: first, end: last, text, clipped: end > last || lines.slice(first - 1, last).some(line => line.length > 180) };
  } catch { return omitted; }
}
export function diagnosticLocations(root, diagnostics, cwd = root) {
  const result = [], seen = new Set();
  const workingDirectory = resolve(root, cwd), workingRelative = relative(resolve(root), workingDirectory);
  if (workingRelative && !inside(workingRelative)) return result;
  for (const diagnostic of diagnostics) {
    const match = /^\s*(.+?\.(?:[cm]?[jt]sx?|vue|svelte|java|kt|xml|json))(?::(\d+)(?::(\d+))?|\((\d+)(?:,(\d+))?\))(?=\s|:|\)|$)/i.exec(diagnostic);
    if (!match) continue;
    let path = match[1];
    try { if (path.startsWith('file:///')) path = fileURLToPath(path); } catch { continue; }
    const full = resolve(workingDirectory, path), rel = relative(resolve(root), full).replaceAll('\\', '/');
    if (!inside(rel)) continue;
    const line = Number(match[2] || match[4]), column = Number(match[3] || match[5] || 0), key = `${rel}:${line}`;
    if (seen.has(key)) continue; seen.add(key);
    result.push({ path: rel, line, column, diagnostic, excerpt: sourceExcerpt(root, rel, { start: line }) });
    if (result.length === 3) break;
  }
  return result;
}
