DevShip 2.1.0

Har kuni 18:00 (Asia/Tashkent) da qilingan ishlar hisobotini Telegramga yuborish qo‘shildi. Barcha loyihalar alohida bo‘limda; noutbuk o‘chiq bo‘lsa keyingi kirishda o‘tgan kunlar yetkaziladi.

Yoqish: ds update, so‘ng ds reports setup. Odatdagi ds push bilan yangi ishlar yig‘iladi. ds reports preview yuborishsiz ko‘rsatadi, ds reports disable to‘xtatadi. Aniq ish nomi uchun --work ixtiyoriy. To‘liq o‘zbekcha yo‘riqnoma: docs/DAILY-REPORTS.md.

Main va remote feature’da oldindan mavjud ishlar, checks, API/texnik loglar hisobotga kiritilmaydi. Avtomatik matn sahifa bo‘yicha konservativ; aniqlanmagan xususiyat bajarildi deb taxmin qilmaydi.

Lokal durable intent, muvaffaqiyat tasdig‘i, atomic journal, repository identity, takror push dedup, kech yozuv batchlari, recipient/topic binding va Unicode checkpointli yetkazish qo‘shildi. Telegram yetkazilishi noaniq bo‘lsa avtomatik takror yo‘q; tasdiqlangan qo‘lda retry bor. Aniq rad etilgan push hisobot bo‘lmaydi.

Windows Task Scheduler, macOS LaunchAgent, Linux systemd user timer integratsiyasi mavjud. Windows’da haqiqiy TASK_VALIDATE_ONLY tekshiruvi va maxsus belgili manzillarda yashirin runnerning argv/exit-code sinovi o‘tdi. Local to‘liq suite 141/141 PASS; reliz CI Windows/macOS/Linux × Node22/24 matritsasidan o‘tmaguncha assetlar chiqarilmaydi.

Oddiy feature push, main merge, konflikt xabarlari va oldingi Telegram sozlamalari saqlangan. OS/internet ishlamasa aniq 18:00 da yetkazish kafolati yo‘q; native scheduler keyingi ishga tushishda catch-up qiladi. macOS/Linux native scheduler xizmatining jonli host sinovi Windows hostida bajarilmagan.
