import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { telegramCall, TelegramError, validBotToken } from './telegram-api.mjs';
import { saveTelegramSettings, telegramSettingsPath, readTelegramStatus, disableTelegram, loadTelegramSettings } from './telegram-store.mjs';
import { retryNotifications } from './telegram.mjs';
import { Git, repository, lockRepository } from './git.mjs';
import { run, redact } from './process.mjs';
import { telegramHealth } from './telegram-health.mjs';

export function createPrompter({ input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) throw new TelegramError('Sozlash uchun oddiy interaktiv terminalda devship telegram setup ni bajaring.');
  let muted = false;
  const sink = new Writable({ write(chunk, encoding, callback) { if (!muted) output.write(chunk); callback(); } });
  const rl = createInterface({ input, output: sink, terminal: true, historySize: 0 });
  const abort = new AbortController(); rl.on('SIGINT', () => abort.abort());
  return {
    async ask(question, { secret = false } = {}) {
      if (secret) output.write(question);
      muted = secret;
      try { return (await rl.question(secret ? '' : question, { signal: abort.signal })).trim(); }
      catch { throw new TelegramError('Telegram sozlash bekor qilindi.'); }
      finally { muted = false; if (secret) output.write('\n'); }
    },
    close() { rl.close(); sink.end(); }
  };
}

export function findPairingChat(updates, command) {
  const matches = new Map();
  for (const update of updates) {
    const message = update?.message;
    if (message?.text?.trim() !== command || !['group', 'supergroup'].includes(message.chat?.type)) continue;
    const chat = { ...message.chat, ...(message.message_thread_id ? { threadId: message.message_thread_id } : {}) };
    matches.set(`${chat.id}:${chat.threadId || ''}`, chat);
  }
  if (matches.size > 1) throw new TelegramError('Ulash kodi bir nechta guruh/topicda topildi. Chat IDni qo‘lda tanlab qayta sozlang.');
  return [...matches.values()][0] || null;
}

function ensureOutsideProject(file) {
  const result = run('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), allowFailure: true });
  if (!result.ok) return;
  const rel = relative(resolve(result.stdout.trim()), resolve(file));
  if (rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel))
    throw new TelegramError('Telegram token fayli Git loyiha ichida bo‘lishi mumkin emas. Global config manzilini loyiha tashqarisiga o‘zgartiring.');
}

export async function setupTelegram({ prompt, log = console.log, fetchFn, file = telegramSettingsPath() } = {}) {
  ensureOutsideProject(file);
  const ui = prompt || createPrompter();
  try {
    log('Telegram guruhini ulash. Tokenni faqat shu terminalga kiriting; u ekranda ko‘rinmaydi.');
    let existing; try { existing = loadTelegramSettings(file); } catch { log('Oldingi token shu kompyuterda ochilmadi. BotFather tokenini qayta kiriting.'); }
    const botToken = await ui.ask(`BotFather bergan bot tokeni${existing?.botToken ? ' (saqlangan token uchun Enter)' : ''}: `, { secret: true }) || existing?.botToken;
    if (!validBotToken(botToken)) throw new TelegramError('Bot tokeni formati noto‘g‘ri; token saqlanmadi.');
    const bot = await telegramCall(botToken, 'getMe', {}, { fetchFn });
    if (!bot?.is_bot || !/^[A-Za-z0-9_]{5,32}$/.test(bot.username || '')) throw new TelegramError('Telegram bot username’i aniqlanmadi.');
    log(`Bot: @${bot.username}. Uni xabar boradigan guruhga qo‘shing va yozish huquqini bering.`);
    const id = await ui.ask('Guruh Chat IDsi (bilmasangiz Enter): '); let chat;
    if (id) {
      if (!/^-\d{1,20}$/.test(id)) throw new TelegramError('Guruh Chat IDsi manfiy raqam bo‘lsin, masalan -1001234567890.');
      chat = await telegramCall(botToken, 'getChat', { chat_id: id }, { fetchFn });
      if (chat.is_forum) {
        const topic = await ui.ask('Guruhdagi topic IDsi (umumiy guruh uchun Enter): ');
        if (topic && (!/^\d+$/.test(topic) || !Number.isSafeInteger(Number(topic)) || Number(topic) < 1)) throw new TelegramError('Topic ID noto‘g‘ri.');
        if (topic) chat.threadId = Number(topic);
      }
    } else {
      const command = `/devship_setup@${bot.username} ${randomBytes(8).toString('hex')}`;
      log(`Guruhga aynan shu buyruqni yozing:\n${command}`);
      await ui.ask('Guruhga yozgach Enter bosing: ');
      const updates = await telegramCall(botToken, 'getUpdates', { limit: 100, timeout: 0 }, { fetchFn });
      chat = findPairingChat(updates, command);
      if (!chat) throw new TelegramError('Guruhdagi ulash buyrug‘i topilmadi. Bot guruhda ekanini tekshiring yoki Chat IDni qo‘lda kiriting. Boshqa bot ishlatayotgan token o‘rniga DevShip uchun alohida bot qulay.');
    }
    if (!['group', 'supergroup'].includes(chat?.type)) throw new TelegramError('Tanlangan manzil Telegram guruhi emas. Sozlama saqlanmadi.');
    log(`Tanlangan guruh: ${JSON.stringify(chat.title || '')}; ID: ${chat.id}${chat.threadId ? `; topic: ${chat.threadId}` : ''}`);
    const confirmation = await ui.ask('Push xabarlari shu guruhga yuborilsinmi? [ha/yo‘q]: ');
    if (!['ha', 'h', 'yes', 'y'].includes(confirmation.toLowerCase())) throw new TelegramError('Tasdiqlanmadi; Telegram sozlamasi saqlanmadi.');
    const timeZone = await ui.ask('Vaqt zonasi [Asia/Tashkent]: ') || 'Asia/Tashkent';
    saveTelegramSettings({ enabled: true, botToken, chatId: String(chat.id), chatType: chat.type, chatTitle: chat.title || '', timeZone,
      ...(chat.threadId ? { threadId: chat.threadId } : {}) }, file);
    log(`Telegram ulandi: ${JSON.stringify(chat.title || String(chat.id))}. Sinov xabari uchun: devship telegram test`);
  } finally { ui.close(); }
}

export async function telegramCommand(action, { log = console.log } = {}) {
  if (action === 'setup') return setupTelegram({ log });
  if (action === 'health') return telegramHealth({ log });
  if (action === 'status') {
    const value = readTelegramStatus();
    log(value ? `Telegram: ${value.enabled ? 'yoqilgan' : 'o‘chirilgan'}; guruh ${JSON.stringify(value.chatTitle || '')}; ID ${value.chatId}; vaqt zonasi ${value.timeZone}${value.threadId ? `; topic ${value.threadId}` : ''}` : 'Telegram hali ulanmagan. devship telegram setup ni bajaring.');
    return;
  }
  if (action === 'disable') { disableTelegram(); log('Telegram xabarlari o‘chirildi.'); return; }
  if (action === 'test') {
    const settings = loadTelegramSettings(); if (!settings?.enabled) throw new TelegramError('Telegram yoqilmagan. devship telegram setup ni bajaring.');
    const when = new Intl.DateTimeFormat('en-GB', { timeZone: settings.timeZone, dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
    await telegramCall(settings.botToken, 'sendMessage', { chat_id: settings.chatId, text: `✅ DevShip sinov xabari.\nGuruh ulandi.\nSana/soat: ${when} (${settings.timeZone})`, link_preview_options: { is_disabled: true },
      ...(settings.threadId ? { message_thread_id: settings.threadId } : {}) });
    log('Telegram sinov xabari guruhga yuborildi.'); return;
  }
  if (action === 'retry') {
    const git = new Git(repository(process.cwd())), release = lockRepository(git);
    try { await retryNotifications(git, { log: text => log(redact(text)) }); } finally { release(); }
    return;
  }
  throw new TelegramError('Ishlatish: devship telegram setup|status|test|retry|disable');
}
