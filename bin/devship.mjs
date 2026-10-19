#!/usr/bin/env node
import { ship } from '../src/ship.mjs';
import { ShipError, fail, redact } from '../src/process.mjs';
import { telegramCommand } from '../src/telegram-setup.mjs';
import { setupProject, doctor } from '../src/project-setup.mjs';
import { applyUpdate, checkUpdate, updateNotice, installationGate, currentVersion } from '../src/updates.mjs';

const help = `DevShip ${currentVersion} — xavfsiz tekshirish, commit, merge va push

Ishlatish: devship [--dry-run] [-m "commit matni"] [--config path]
           devship --init | --help | --version
           devship setup | doctor | update [check]
           devship telegram setup|status|health|test|retry|disable

Qisqa buyruq: ds (Windows PowerShell’da ds.cmd). Barcha parametrlar bir xil.
Yangilanish mavjud bo‘lsa terminalda xabar chiqadi. Qo‘llash: ds update.
Loyiha menejerini bir marta tanlash: ds setup. Holatni tekshirish: ds doctor.

  --dry-run       Faqat lokal rejani ko‘rsatadi; checks/fetch/commit/push yo‘q
  -m, --message   Commit matnini o‘zingiz belgilang (bitta qator)
  --config PATH   Repo rootga nisbatan yoki absolute JSON config
  --init          Repo rootda .devship.json yaratadi; mavjudini almashtirmaydi
  -h, --help      Yordam
  -v, --version   Versiya

Telegram: bir marta devship telegram setup bilan guruhni ulang.
Push muvaffaqiyatidan keyin guruhga loyiha/branch/o‘zgarishlar/sana-soat yuboriladi.
Konflikt va tekshiruv xatosida ham tafsilotli xabar yuboriladi; push davom etmaydi.

Oddiy foydalanish: loyiha ichida devship
Tezroq bir davrali tekshiruv: .devship.json ichida "checksMode": "final".
Barcha checks merge’dan keyin, pushdan oldin bajariladi; xatoda lokal commit qoladi, push yo‘q.
Node.js >=22 va Git >=2.30 kerak. Loyiha bog‘liqliklarini oldindan o‘rnating.
Faqat ishonchli loyihada ishlating: build/test, wrapper va Git hooklar bajariladi.
Xatoda lokal ish saqlanadi; force push, reset, clean, stash ishlatilmaydi.
`;

try {
  const args = process.argv.slice(2), options = {}, seen = new Set();
  let releaseInstallation;
  const commandOnly = ['setup', 'doctor', 'update'].includes(args[0]);
  try {
  if (commandOnly) {
    if (args[0] === 'update') {
      if (args.length === 2 && args[1] === 'check') await checkUpdate();
      else if (args.length === 1) { const result = await applyUpdate(); if (result.status === 'rolled-back') process.exitCode = 1; }
      else fail('USAGE', 'Ishlatish: ds update | ds update check');
    } else {
      if (args.length !== 1) fail('USAGE', `Ishlatish: ds ${args[0]}`);
      if (args[0] === 'setup') { releaseInstallation = installationGate(); await setupProject(); }
      else if (!doctor()) process.exitCode = 1;
    }
  } else
  if (args[0] === 'telegram') {
    if (args.length !== 2) fail('USAGE', 'Ishlatish: devship telegram setup|status|test|retry|disable');
    if (args[1] !== 'status') releaseInstallation = installationGate();
    await telegramCommand(args[1]);
  } else {
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    const name = ({ '-m': '--message', '-h': '--help', '-v': '--version' })[token] || token;
    if (seen.has(name)) fail('USAGE', `Takrorlangan parametr: ${token}`); seen.add(name);
    if (name === '--dry-run') options.dryRun = true;
    else if (name === '--init') options.init = true;
    else if (name === '--help' || name === '--version') options[name.slice(2)] = true;
    else if (name === '--message' || name === '--config') {
      const value = args[++i]; if (!value || value.startsWith('--')) fail('USAGE', `${token} uchun qiymat kerak.`);
      options[name === '--message' ? 'message' : 'configFile'] = value;
    } else fail('USAGE', `Noma’lum parametr: ${token}. devship --help ni ko‘ring.`);
  }
  if ((options.init || options.help || options.version) && seen.size !== 1) fail('USAGE', '--init, --help va --version alohida ishlatiladi.');
  if (options.help) console.log(help);
  else if (options.version) console.log(currentVersion);
  else {
    if (!options.dryRun) releaseInstallation = installationGate();
    if (!options.dryRun && !options.init && process.stdout.isTTY) await updateNotice();
    await ship(options);
  }
  }
  } finally { releaseInstallation?.(); }
} catch (error) {
  console.error(redact(`DevShip [${error instanceof ShipError ? error.code : 'INTERNAL'}]: ${error.message}`));
  process.exitCode = error instanceof ShipError && error.code === 'USAGE' ? 2 : 1;
}
