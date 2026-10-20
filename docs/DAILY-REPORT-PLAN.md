# Amalga oshirish

1. `work-summary.mjs`: route/sahifa aniqlash, mazmunli commit va aniq --work matni, texnik/API/secret filtr; pure regression tests.
2. `daily-reports.mjs`: global journal, repo identifikatori, own-commit collection, sana/window, preview, lock, recipientga bog‘langan atomic delivery receipt va Unicode chunking. Fake transport tests.
3. `report-scheduler.mjs`: native OS scheduler manifest generator va install/disable/status. Generated command escaping tests; live install faqat joriy Windows userga.
4. CLI `reports` buyruqlari va `--work`; muvaffaqiyatli pushdan keyingi journal hook, failures/no-op/dry-run yozuvsiz. Fixture integration tests.
5. To‘liq test, mustaqil ko‘rik, README/Uzbek yo‘riqnoma, 2.1.0 release + matritsa CI; checksum orqali o‘rnatish va lokal jadvalni ulash. Live Telegramga faqat haqiqiy kundalik hisobot yuboriladi.

Ko‘rik fokusi: main tarixidan begona ishni olib qolish; saqlash yoki yuborish orasida uzilish; recipient almashib eski xabar boshqa guruhga ketishi; report ishlaganda normal push/update locklari bilan poyga; ayni nomdagi turli repo aralashishi.
