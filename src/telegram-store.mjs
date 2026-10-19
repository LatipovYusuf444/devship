import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { globalConfigPath } from './config.mjs';
import { TelegramError, validBotToken } from './telegram-api.mjs';
import { run } from './process.mjs';

export function telegramSettingsPath() { return join(dirname(globalConfigPath()), 'telegram.json'); }
export function atomicJson(file, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  if (!lstatSync(dirname(file)).isDirectory() || lstatSync(dirname(file)).isSymbolicLink()) throw new TelegramError('Telegram ma’lumot papkasi oddiy katalog bo‘lishi kerak.');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); renameSync(temporary, file); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

function dpapi(text, decrypt = false) {
  const prefix = '$ErrorActionPreference="Stop";[void][Reflection.Assembly]::LoadWithPartialName("System.Security");';
  const script = decrypt
    ? '$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Text.Encoding]::UTF8.GetString($p))'
    : '$b=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Write([Convert]::ToBase64String($p))';
  const powershell = join(process.env.SystemRoot || 'C:/Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const r = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', prefix + script], {
    input: text, encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024
  });
  if (r.error || r.status !== 0 || !r.stdout.trim()) throw new TelegramError('Windows DPAPI kalitni saqlay/ocholmadi. Shu Windows foydalanuvchisida devship telegram setup ni qayta bajaring.');
  return r.stdout.trim();
}

export function validateTelegramSettings(value) {
  if (!value || typeof value.enabled !== 'boolean' || !validBotToken(value.botToken) || !/^-\d{1,20}$/.test(value.chatId)
    || !['group', 'supergroup'].includes(value.chatType)) throw new TelegramError('Telegram sozlamasi noto‘g‘ri. devship telegram setup ni bajaring.');
  try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format(); }
  catch { throw new TelegramError('Telegram vaqt zonasi noto‘g‘ri. Masalan: Asia/Tashkent.'); }
  if ('threadId' in value && (!Number.isSafeInteger(value.threadId) || value.threadId < 1)) throw new TelegramError('Telegram topic IDsi noto‘g‘ri.');
  return value;
}
export function saveTelegramSettings(value, file = telegramSettingsPath()) {
  validateTelegramSettings(value);
  mkdirSync(dirname(resolve(file)), { recursive: true, mode: 0o700 });
  const parent = realpathSync(dirname(resolve(file)));
  if (run('git', ['--no-optional-locks', '-C', parent, 'rev-parse', '--git-dir'], { cwd: parent, allowFailure: true }).ok)
    throw new TelegramError('Telegram token fayli Git loyiha yoki Git metadata papkasiga saqlanmaydi. Global config manzilini loyiha tashqarisiga tanlang.');
  const { botToken, ...rest } = value;
  atomicJson(file, { version: 1, ...rest, ...(process.platform === 'win32'
    ? { protection: 'windows-dpapi', protectedToken: dpapi(botToken) }
    : { protection: 'file-mode-0600', botToken }) });
}
export function readTelegramStatus(file = telegramSettingsPath()) {
  if (!existsSync(file)) return null;
  let value; try { value = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new TelegramError('Telegram sozlama fayli o‘qilmadi. devship telegram setup ni qayta bajaring.'); }
  if (value.version !== 1) throw new TelegramError('Telegram sozlama versiyasi qo‘llanmaydi.');
  return value;
}
export function loadTelegramSettings(file = telegramSettingsPath()) {
  const raw = readTelegramStatus(file); if (!raw) return null;
  const result = { enabled: raw.enabled, chatId: raw.chatId, chatType: raw.chatType, chatTitle: raw.chatTitle || '', timeZone: raw.timeZone,
    ...(raw.threadId ? { threadId: raw.threadId } : {}), ...(raw.verifiedMigration ? { verifiedMigration: raw.verifiedMigration } : {}) };
  if (!raw.enabled) return result;
  const botToken = raw.protection === 'windows-dpapi'
    ? (process.platform === 'win32' ? dpapi(raw.protectedToken, true) : null) : raw.botToken;
  return validateTelegramSettings({ ...result, botToken });
}
export function disableTelegram(file = telegramSettingsPath()) {
  const raw = readTelegramStatus(file); if (!raw) return false;
  atomicJson(file, { ...raw, enabled: false }); return true;
}
