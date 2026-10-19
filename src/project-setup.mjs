import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nodeProject, saveProjectManager } from './project-settings.mjs';
import { createPrompter } from './telegram-setup.mjs';
import { repository, Git, preflight } from './git.mjs';
import { loadConfig } from './config.mjs';
import { detectTasks, requireTasks } from './tasks.mjs';
import { readTelegramStatus } from './telegram-store.mjs';
import { fail, run, redact } from './process.mjs';
import { installationLockFile } from './updates.mjs';

export async function setupProject({ root = repository(process.cwd()), preferencesFile, config = loadConfig(root), prompt, log = console.log } = {}) {
  if (config.checks !== null && config.checks !== undefined) { log('Bu loyihada checks aniq yozilgan. Shu buyruqlar ishlatiladi; paket menejeri tanlovi kerak emas.'); return; }
  const info = nodeProject(root);
  if (!info) { const tasks = detectTasks(root, config); requireTasks(tasks, config); log('Maven/Gradle tekshiruvlari aniqlandi. Alohida sozlash kerak emas.'); return; }
  const ui = prompt || createPrompter();
  try {
    log(`Loyiha: ${root}\nLockfile menejerlari: ${info.managers.join(', ') || 'yo‘q'}; packageManager: ${info.pkg.packageManager || 'yo‘q'}`);
    const answer = (await ui.ask('Shu loyihada ishlatadigan menejer [npm/pnpm/yarn]: ')).toLowerCase();
    const manager = ({ '1': 'npm', '2': 'pnpm', '3': 'yarn' })[answer] || answer;
    if (!['npm', 'pnpm', 'yarn'].includes(manager)) fail('TASKS_SETUP', 'npm, pnpm yoki yarn yozing. Tanlov saqlanmadi.');
    saveProjectManager(root, manager, preferencesFile);
    log(`Tanlandi: ${manager}. Tanlov shu kompyuterda saqlandi. Loyiha va lockfilelar o‘zgartirilmadi.`);
  } finally { ui.close(); }
}

export function doctor({ cwd = process.cwd(), log = console.log } = {}) {
  let ready = true;
  const check = (label, fn) => { try { const result = fn(); log(`OK ${label}: ${redact(result || 'tayyor')}`); } catch (e) { ready = false; log(`XATO ${label}: ${redact(e.message)}`); } };
  check('Node.js', () => { if (Number(process.versions.node.split('.')[0]) < 22) fail('NODE', 'Node.js 22 yoki yangiroq kerak.'); return process.version; });
  check('Git', () => run('git', ['--version'], { cwd }).stdout.trim());
  check('Yangilanish lock', () => { const file = installationLockFile(); if (existsSync(file)) fail('LOCK', `Lock mavjud: ${file}. Boshqa DevShip runini tugating; faol/noma’lum lockni o‘chirmang.`); return 'bo‘sh'; });
  let root, config, git;
  check('Loyiha', () => { root = repository(cwd); config = loadConfig(root); git = new Git(root); return root; });
  if (root) {
    check('Branch/remote', () => `${preflight(git, config)} → ${config.remote}; base ${config.base}`);
    check('Tekshiruvlar', () => { const tasks = detectTasks(root, config); requireTasks(tasks, config); return tasks.map(t => t.argv.join(' ')).join(' → ') || 'allowNoChecks=true'; });
    check('Lock', () => {
      const file = join(resolve(git.root, git.exec('rev-parse', '--git-common-dir')), 'devship.lock');
      if (existsSync(file)) {
        let owner; try { owner = JSON.parse(readFileSync(file, 'utf8')); } catch { fail('LOCK', 'Lock mazmuni noma’lum; uni tekshirmasdan o‘chirmang.'); }
        fail('LOCK', `Lock mavjud; PID ${Number.isSafeInteger(owner.pid) ? owner.pid : 'noma’lum'}, host ${typeof owner.host === 'string' ? owner.host.slice(0, 100) : 'noma’lum'}. Keyingi ds faqat tasdiqlangan o‘lik v2 lockni tiklaydi.`);
      }
      return 'bo‘sh';
    });
  }
  check('Telegram sozlamasi', () => { const value = readTelegramStatus(); return value?.enabled ? `${JSON.stringify(value.chatTitle)}. Huquqlarni tekshirish: ds telegram health` : 'ulanmagan/o‘chirilgan; ulash: ds telegram setup'; });
  log('Doctor hech qanday build, commit, merge, push yoki Telegram xabarini bajarmadi.');
  return ready;
}
