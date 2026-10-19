import { lstatSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { fail } from './process.mjs';

export function matches(path, pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      i++; if (pattern[i + 1] === '/') { i++; source += '(?:.*/)?'; } else source += '.*';
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else source += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i').test(path);
}

export function protectedBranch(branch, config) {
  return ['main', 'master', 'develop', 'development', 'production', 'staging', 'release', 'release/**', config.base, ...config.protectedBranches]
    .some(pattern => matches(branch, pattern));
}

const generated = /(?:^|\/)(?:node_modules|dist|build|target|coverage|\.gradle|\.next|\.nuxt|\.turbo)(?:\/|$)/i;
const secretPaths = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\.json)?|service[-_]?account[^/]*\.json|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|[^/]*\.(?:pem|key|p12|pfx|jks|keystore)|\.aws\/credentials)$/i;
const sampleEnv = /(?:^|\/)\.env\.(?:example|sample|template)$/i;
const secretContent = [
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bsk_live_[A-Za-z0-9]{16,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bnpm_[A-Za-z0-9]{30,}\b/,
  /\bAIza[A-Za-z0-9_-]{35}\b/,
  /(?<!\d)\d{5,15}:[A-Za-z0-9_-]{30,100}(?![A-Za-z0-9_-])/,
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|password)["']?\s*[=:]\s*["']?(?!\$\{|process\.env|os\.environ|example\b|placeholder\b|changeme\b|your[_-]|test\b|dummy\b|<)[A-Za-z0-9_+\/=.-]{16,}/i
];

export function inspectPath(path, config, { history = false } = {}) {
  if (!path || path.includes('\0') || path.startsWith('/') || path.split('/').includes('..')) fail('SAFETY', 'Noto‘g‘ri fayl yo‘li.');
  if (!history && (generated.test(path) || config.exclude.some(pattern => matches(path, pattern))))
    fail('EXCLUDED', `Stage qilinmaydigan fayl bor: ${JSON.stringify(path)}. Untracked bo‘lsa .gitignore ga kiriting; tracked bo‘lsa qo‘lda ko‘rib chiqing.`);
  if (secretPaths.test(path) && !sampleEnv.test(path) && !config.allowSecretPaths.includes(path))
    fail('SECRET', `Maxfiy faylga o‘xshaydi: ${JSON.stringify(path)}. .gitignore va Git indexini tekshiring. Haqiqiy sirlarni commit qilmang.`);
}

export function inspectContent(path, data) {
  if (secretContent.some(pattern => pattern.test(data.toString('utf8'))))
    fail('SECRET', `Maxfiy kalit/token belgisi topildi: ${JSON.stringify(path)}. Qiymat chiqarilmadi; faylni yoki hali push qilinmagan tarixni qo‘lda tuzating.`);
}

export function inspectWorkFile(root, path, config) {
  inspectPath(path, config);
  let stat; try { stat = lstatSync(join(root, path)); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('SAFETY', `Oddiy fayl emas (symlink/submodule mumkin): ${JSON.stringify(path)}. Qo‘lda boshqaring.`);
  if (stat.size > config.maxScanBytes) fail('SAFETY', `Fayl scan limitidan katta: ${JSON.stringify(path)} (${stat.size} bayt). Qo‘lda tekshiring yoki maxScanBytes ni oshiring.`);
  inspectContent(path, readFileSync(join(root, path)));
}

export function sensibleMessage(paths) {
  const docs = paths.every(p => /(^docs\/|\.(md|rst|txt)$)/i.test(p));
  const tests = paths.every(p => /(^|\/)(__tests__|tests?|spec)(\/|\.)|\.(test|spec)\./i.test(p));
  const deps = paths.every(p => /(^|\/)(package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pom\.xml|build\.gradle(?:\.kts)?)$/.test(p));
  const type = deps ? 'build' : tests ? 'test' : docs ? 'docs' : 'chore';
  const names = paths.slice(0, 2).map(p => posix.basename(p).replace(/[\r\n\x00-\x1f\x7f]/g, '?')).join(', ');
  return `${type}: update ${names}${paths.length > 2 ? ` and ${paths.length - 2} more files` : ''}`.slice(0, 100);
}

export function hash(parts) { const h = createHash('sha256'); for (const p of parts) { h.update(p); h.update('\0'); } return h.digest('hex'); }
