import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fail } from './process.mjs';

const keys = new Set(['base', 'remote', 'protectedBranches', 'checks', 'checksMode', 'allowNoChecks', 'exclude', 'allowSecretPaths', 'maxScanBytes', 'timeoutMs', 'telegram']);
export const defaults = Object.freeze({
  base: 'main', remote: 'origin', protectedBranches: [], checks: null, allowNoChecks: false,
  exclude: [], allowSecretPaths: [], maxScanBytes: 1024 * 1024, timeoutMs: 600000, telegram: true, checksMode: 'both'
});
export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CONFIG', 'Config JSON obyekti bo‘lishi kerak.');
  for (const key of Object.keys(value)) if (!keys.has(key)) fail('CONFIG', `Noma’lum config kaliti: ${key}`);
  for (const key of ['base', 'remote']) if (key in value && (typeof value[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value[key]) || value[key].includes('..')))
    fail('CONFIG', `${key}: branch/remote nomi noto‘g‘ri.`);
  for (const key of ['protectedBranches', 'exclude', 'allowSecretPaths'])
    if (key in value && (!Array.isArray(value[key]) || value[key].some(x => typeof x !== 'string' || !x || /[\r\n\0]/.test(x))))
      fail('CONFIG', `${key}: bo‘sh bo‘lmagan matnlar ro‘yxati kerak.`);
  if ('allowSecretPaths' in value && value.allowSecretPaths.some(x => /[*?]/.test(x) || x.startsWith('/') || x.split(/[\\/]/).includes('..')))
    fail('CONFIG', 'allowSecretPaths faqat aniq repo-relative fayl yo‘llarini qabul qiladi; wildcard mumkin emas.');
  if ('allowNoChecks' in value && typeof value.allowNoChecks !== 'boolean') fail('CONFIG', 'allowNoChecks boolean bo‘lishi kerak.');
  if ('checksMode' in value && !['both', 'final'].includes(value.checksMode)) fail('CONFIG', 'checksMode faqat both yoki final bo‘lishi kerak. final barcha tekshiruvlarni merge’dan keyin, pushdan oldin bir marta bajaradi.');
  if ('telegram' in value && typeof value.telegram !== 'boolean') fail('CONFIG', 'telegram faqat true/false bo‘lishi kerak. Token/chat manzili repo configiga yozilmaydi; devship telegram setup ni ishlating.');
  for (const [key, min, max] of [['maxScanBytes', 1024, 10 * 1024 * 1024], ['timeoutMs', 1000, 3600000]])
    if (key in value && (!Number.isInteger(value[key]) || value[key] < min || value[key] > max)) fail('CONFIG', `${key}: ${min}..${max} oralig‘idagi butun son kerak.`);
  if ('checks' in value && (!Array.isArray(value.checks) || value.checks.some(check => {
    const argv = Array.isArray(check) ? check : check?.argv;
    return !Array.isArray(argv) || !argv.length || argv.some(x => typeof x !== 'string' || /[\0\r\n]/.test(x)) || !argv[0]
      || (!Array.isArray(check) && (Object.keys(check).some(k => !['argv', 'cwd'].includes(k)) || ('cwd' in check && typeof check.cwd !== 'string')));
  }))) fail('CONFIG', 'checks: har bir buyruq argv ro‘yxati yoki {argv, cwd} obyekti bo‘lishi kerak.');
  return value;
}

export function within(root, child) {
  const rel = relative(realpathSync(root), realpathSync(child));
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) fail('CONFIG', 'checks.cwd repo ichida bo‘lishi kerak.');
  return realpathSync(child);
}

export function globalConfigPath() {
  return process.env.DEVSHIP_GLOBAL_CONFIG || (process.platform === 'win32'
    ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'DevShip', 'config.json')
    : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'devship', 'config.json'));
}
export function loadConfig(root, explicit) {
  const config = { ...defaults };
  for (const [file, required] of [[globalConfigPath(), false], [explicit ? resolve(root, explicit) : join(root, '.devship.json'), !!explicit]]) {
    if (!existsSync(file)) { if (required) fail('CONFIG', `Config topilmadi: ${file}`); continue; }
    let value;
    try { value = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch { fail('CONFIG', `JSON config o‘qilmadi: ${file}`); }
    validateConfig(value);
    const protections = [...config.protectedBranches, ...(value.protectedBranches || [])];
    Object.assign(config, value, { protectedBranches: protections });
  }
  return config;
}
