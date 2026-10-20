import { mkdirSync } from 'node:fs';
import { reportDirectory, reportSettings, previewReports, runDueReports, retryDailyReport } from './daily-reports.mjs';
import { readTelegramStatus } from './telegram-store.mjs';
import { installReportScheduler, disableReportScheduler, schedulerStatus } from './report-scheduler.mjs';
import { fail } from './process.mjs';

export async function reportCommand(args, { directory = reportDirectory(), log = console.log, retryFn = retryDailyReport, runDueFn = runDueReports, installFn = installReportScheduler, telegramStatus = readTelegramStatus } = {}) {
  const outcome = result => {
    if (result.failed || result.blocked || result.uncertain) {
      log(`Kundalik hisobot: xato ${result.failed}, guruh/sozlama mos emas ${result.blocked}, yetkazilish noaniq ${result.uncertain}. ds reports status/preview orqali ko‘ring.`);
      if (result.uncertain) log('Noaniq xabar avtomatik takrorlanmaydi. Kerak bo‘lsa: ds reports retry YYYY-MM-DD --allow-duplicate');
      process.exitCode = 1;
    }
  };
  const [command, ...rest] = args;
  if (!['setup', 'status', 'preview', 'run-due', 'disable', 'retry'].includes(command) || command !== 'retry' && rest.length)
    fail('USAGE', 'Ishlatish: ds reports setup|status|preview|run-due|disable | retry YYYY-MM-DD [--allow-duplicate]');
  if (command === 'setup') {
    const telegram = telegramStatus();
    if (!telegram?.enabled) fail('REPORT', 'Avval ds telegram setup orqali Telegram guruhini ulang.');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    installFn({ directory });
    reportSettings(directory, { enabled: true, timeZone: 'Asia/Tashkent', at: '18:00' });
    log('Kundalik hisobot yoqildi: har kuni 18:00 (Asia/Tashkent), barcha loyihalar alohida. Noutbuk o‘chiq bo‘lsa keyingi kirishda yuboriladi.');
  } else if (command === 'disable') {
    const config = reportSettings(directory);
    if (config) reportSettings(directory, { ...config, enabled: false });
    if (!disableReportScheduler({ directory })) log('Hisobot o‘chirildi; OS jadvalini o‘chirish tasdiqlanmadi. Jadvalni OS sozlamasidan tekshiring.');
    else log('Kundalik hisobot o‘chirildi. Saqlangan ishlar o‘chirilmagan.');
  } else if (command === 'preview') {
    const reports = previewReports({ directory });
    for (const report of reports) log(report.text + '\n');
    if (!reports.length) log('Hozircha hisobotga mos yangi ish yozilmagan. Keyingi muvaffaqiyatli pushdan yig‘iladi.');
  } else if (command === 'status') {
    const config = reportSettings(directory);
    log(config?.enabled ? `Hisobot: yoqilgan, ${config.at} (${config.timeZone}). OS jadvali: ${schedulerStatus({ directory }) ? 'faol' : 'tasdiqlanmadi'}.` : 'Kundalik hisobot o‘chirilgan. Yoqish: ds reports setup');
    log(`Saqlangan hisobot kunlari/guruhlari: ${previewReports({ directory }).length}.`);
  } else if (command === 'retry') {
    if (rest.length < 1 || rest.length > 2 || rest[1] && rest[1] !== '--allow-duplicate') fail('USAGE', 'ds reports retry YYYY-MM-DD [--allow-duplicate]');
    outcome(await retryFn(rest[0], { directory, allowUncertain: rest[1] === '--allow-duplicate', log }));
  } else {
    outcome(await runDueFn({ directory, log }));
  }
}
