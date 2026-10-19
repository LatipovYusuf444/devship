import { telegramCall, TelegramError } from './telegram-api.mjs';
import { loadTelegramSettings, saveTelegramSettings, telegramSettingsPath } from './telegram-store.mjs';

function writable(chat, member) {
  if (['creator', 'administrator'].includes(member?.status)) return true;
  if (member?.status === 'restricted') return member.is_member === true && member.can_send_messages === true && member.can_send_documents === true;
  return member?.status === 'member' && chat?.permissions?.can_send_messages !== false && chat?.permissions?.can_send_documents !== false;
}
export async function telegramHealth({ file = telegramSettingsPath(), fetchFn, log = console.log } = {}) {
  const settings = loadTelegramSettings(file);
  if (!settings?.enabled) throw new TelegramError('Telegram ulanmagan. ds telegram setup ni bajaring.');
  const call = (method, data) => telegramCall(settings.botToken, method, data, { fetchFn });
  const bot = await call('getMe', {}); if (!Number.isSafeInteger(bot?.id)) throw new TelegramError('Bot IDsi aniqlanmadi.');
  let chat, member, migratedTo;
  try {
    chat = await call('getChat', { chat_id: settings.chatId });
    member = await call('getChatMember', { chat_id: settings.chatId, user_id: bot.id });
    if (writable(chat, member)) { log(`Telegram tayyor: ${JSON.stringify(chat.title || settings.chatTitle)}; bot xabar/fayl yubora oladi. Xabar yuborilmadi.`); return settings; }
  } catch (e) { if (!e.migrateTo) throw e; migratedTo = e.migrateTo; }
  if (!migratedTo) {
    const updates = await call('getUpdates', { limit: 100, timeout: 0 });
    const destinations = new Set();
    for (const update of updates) {
      const m = update?.message;
      if (String(m?.chat?.id) === settings.chatId && Number.isSafeInteger(m.migrate_to_chat_id) && m.migrate_to_chat_id < 0) destinations.add(String(m.migrate_to_chat_id));
      if (String(m?.migrate_from_chat_id) === settings.chatId && Number.isSafeInteger(m?.chat?.id) && m.chat.id < 0) destinations.add(String(m.chat.id));
    }
    if (destinations.size === 1) migratedTo = [...destinations][0];
  }
  if (!migratedTo || migratedTo === settings.chatId) throw new TelegramError('Bot guruhdan chiqqan yoki yozish/fayl huquqi yo‘q. Botni kerakli guruhga qo‘shing va ruxsat bering. Guruh manzili o‘zgartirilmadi.');
  const destination = await call('getChat', { chat_id: migratedTo });
  const membership = await call('getChatMember', { chat_id: migratedTo, user_id: bot.id });
  if (String(destination.id) !== migratedTo || destination.type !== 'supergroup' || !writable(destination, membership))
    throw new TelegramError('Ko‘chgan guruh tasdiqlandi, lekin botning yozish/fayl huquqi yetarli emas. Ruxsat bering va health ni qaytaring.');
  const updated = { ...settings, chatId: migratedTo, chatTitle: destination.title || '', chatType: destination.type,
    verifiedMigration: { from: settings.chatId, to: migratedTo, verifiedAt: new Date().toISOString() } };
  saveTelegramSettings(updated, file);
  log('Telegram tasdiqlagan guruh ko‘chishi tuzatildi. Shu guruh saqlandi; sinov xabari yuborilmadi.');
  return updated;
}
