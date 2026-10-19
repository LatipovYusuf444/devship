import { ShipError } from './process.mjs';

export class TelegramError extends ShipError {
  constructor(message, uncertain = false) { super('TELEGRAM', message); this.uncertain = uncertain; }
}
export function validBotToken(token) { return typeof token === 'string' && /^\d{5,15}:[A-Za-z0-9_-]{30,100}$/.test(token); }

export async function telegramCall(token, method, data, { fetchFn = globalThis.fetch, timeoutMs = 10000 } = {}) {
  if (!validBotToken(token)) throw new TelegramError('Telegram bot tokeni formati noto‘g‘ri. devship telegram setup orqali sozlang.');
  if (!['getMe', 'getUpdates', 'getChat', 'getChatMember', 'sendMessage', 'sendDocument'].includes(method)) throw new TelegramError('Telegram metodi qo‘llanmaydi.');
  const multipart = data instanceof FormData;
  let response, body;
  try {
    response = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      ...(multipart ? {} : { headers: { 'Content-Type': 'application/json' } }),
      body: multipart ? data : JSON.stringify(data)
    });
    body = await response.json();
  } catch { throw new TelegramError('Telegram bilan ulanish tugamadi yoki javob o‘qilmadi. Xabar yetib borgan bo‘lishi mumkin; avtomatik qayta yuborilmadi.', true); }
  if (!response.ok || body?.ok !== true) {
    const code = Number(body?.error_code || response.status);
    const hints = { 400: 'Chat ID, topic va botning guruhdagi huquqlarini tekshiring.', 401: 'Bot tokeni yaroqsiz.',
      403: 'Bot guruhga qo‘shilmagan yoki xabar yuborish huquqi yo‘q.', 409: 'Bot webhook yoki boshqa getUpdates jarayoni bilan band. Chat IDni qo‘lda kiriting; mavjud webhook o‘zgartirilmagan.',
      429: 'Telegram so‘rov limiti. Keyinroq qayta yuboring.' };
    const migration = body?.parameters?.migrate_to_chat_id;
    const migrated = Number.isSafeInteger(migration) && migration < 0;
    const description = typeof body?.description === 'string' ? body.description.toLowerCase() : '';
    const specific = migrated ? 'Guruh supergroupga ko‘chgan. ds telegram health buyrug‘ini bajaring.'
      : description.includes('message thread not found') || description.includes('topic_closed') ? 'Telegram topici topilmadi/yopilgan. ds telegram setup bilan topicni qayta tanlang.'
      : description.includes('chat not found') ? 'Guruh topilmadi. Botni guruhga qo‘shing va ds telegram health ni bajaring.'
      : description.includes('not enough rights') ? 'Botga guruhda xabar va fayl yuborish huquqini bering.' : hints[code];
    const error = new TelegramError(`Telegram so‘rovni rad etdi (${Number.isFinite(code) ? code : 'API'}). ${specific || 'Telegram sozlamasini va xizmat holatini tekshiring.'}`, code >= 500);
    if (migrated) error.migrateTo = String(migration);
    throw error;
  }
  return body.result;
}
