import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemp, fixture, put, git } from './helpers.mjs';
import { saveTelegramSettings, loadTelegramSettings } from '../src/telegram-store.mjs';
import { telegramCall } from '../src/telegram-api.mjs';
const token = '123456789:' + 'A'.repeat(35);
const settings = { enabled: true, botToken: token, chatId: '-55', chatType: 'group', chatTitle: 'Team', timeZone: 'Asia/Tashkent' };
const ok = result => new Response(JSON.stringify({ ok: true, result }), { status: 200 });

test('migration errors preserve only verified numeric destination and safe actionable wording', async () => {
  await assert.rejects(telegramCall(token, 'getChat', {}, { fetchFn: async () => new Response(JSON.stringify({ ok: false, error_code: 400, description: token,
    parameters: { migrate_to_chat_id: -10055 } }), { status: 400 }) }), e => e.migrateTo === '-10055' && /health/.test(e.message) && !e.message.includes(token));
});

test('health repairs an attested migration without sending any messages', async t => {
  const root = mkdtempSync(join(tmpdir(), 'devship-health-')); t.after(() => cleanupTemp(root));
  const file = join(root, 'telegram.json'); saveTelegramSettings(settings, file);
  const { telegramHealth } = await import('../src/telegram-health.mjs'); const methods = [];
  await telegramHealth({ file, log: () => {}, fetchFn: async (url, options) => {
    const method = url.split('/').at(-1), data = JSON.parse(options.body); methods.push(method);
    if (method === 'getMe') return ok({ id: 123456789, is_bot: true, username: 'my_bot' });
    if (method === 'getChat') return ok({ id: Number(data.chat_id), type: data.chat_id === '-55' ? 'group' : 'supergroup', title: 'Team', permissions: { can_send_messages: data.chat_id !== '-55', can_send_documents: true } });
    if (method === 'getChatMember') return ok({ status: data.chat_id === '-55' ? 'left' : 'member' });
    if (method === 'getUpdates') return ok([{ message: { chat: { id: -55 }, migrate_to_chat_id: -10055 } }]);
    throw new Error('Unexpected send or method');
  } });
  assert.equal(loadTelegramSettings(file).chatId, '-10055');
  assert.deepEqual(loadTelegramSettings(file).verifiedMigration.from, '-55');
  assert.equal(methods.some(m => m.startsWith('send')), false);
});

test('health refuses to change recipient just because another group has the same name', async t => {
  const root = mkdtempSync(join(tmpdir(), 'devship-health-')); t.after(() => cleanupTemp(root));
  const file = join(root, 'telegram.json'); saveTelegramSettings(settings, file);
  const { telegramHealth } = await import('../src/telegram-health.mjs');
  await assert.rejects(telegramHealth({ file, log: () => {}, fetchFn: async url => url.endsWith('/getMe') ? ok({ id: 123456789 }) : url.endsWith('/getUpdates')
    ? ok([{ message: { chat: { id: -999, title: 'Team' } } }]) : url.endsWith('/getChatMember') ? ok({ status: 'left' }) : ok({ id: -55, type: 'group' }) }));
  assert.equal(loadTelegramSettings(file).chatId, '-55');
});

test('retry follows only a locally saved attested migration and preserves the topic binding', async t => {
  const f = fixture(t), { Git } = await import('../src/git.mjs');
  const { notifyPush, retryNotifications } = await import('../src/telegram.mjs');
  const context = { git: new Git(f.repo), config: { telegram: true }, branch: 'feature/demo', remote: 'origin', before: git(f.repo, 'rev-parse', 'main'), after: git(f.repo, 'rev-parse', 'HEAD'), pushedAt: new Date().toISOString(), log() {} };
  await notifyPush(context, { settings, fetchFn: async () => { throw new Error('offline'); } });
  let recipient;
  await retryNotifications(context.git, { settings: { ...settings, chatId: '-10055', verifiedMigration: { from: '-55', to: '-10055', verifiedAt: new Date().toISOString() } }, log() {},
    fetchFn: async (url, options) => { recipient = JSON.parse(options.body).chat_id; return ok({ message_id: 8 }); } });
  assert.equal(recipient, '-10055');
});
