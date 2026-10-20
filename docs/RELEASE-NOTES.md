DevShip 2.3.0

Telegram xabarlari qulay HTML kartochka formatiga o‘tdi: 🟢 muvaffaqiyatli push, 🔴 konflikt yoki tekshiruv xatosi. Qalin sarlavha, bo‘sh qatorlar, blockquote ma’lumot bloklari va monospace kod ramkalari qo‘shildi. Telegram matn rangini ixtiyoriy tanlashni qo‘llamaydi; xato qizil belgi bilan ajratiladi.

Konfliktda loyiha, Git foydalanuvchisi, qabul qiluvchi/kiruvchi branch, sahifa/fayl, marker qatorlari, konflikt turi va ikki tomondagi oxirgi fayl commiti mualliflari ko‘rsatiladi. Bu branch egasi yoki aniq konflikt qatori muallifi tasdig‘i emas. Oddiy tekshiruv xatosida diagnostika, qator/ustun va tegishli kod parchasi beriladi. Monorepo ichidagi nisbiy yo‘llar aynan xato chiqqan tekshiruv katalogidan yechiladi.

Foydalanuvchi so‘ragan qisqa kod parchalari faqat repo ichidagi cheklangan oddiy manba fayllardan olinadi. Maxfiy fayl/qiymat aniqlansa, binary/symlink/tashqi manzil bo‘lsa kod yuborilmaydi. Ko‘pi bilan 12 qator, qatoriga 180 belgi; konfliktda dastlabki 6 faylning 2 tadan parchasi, oddiy diagnostikada 3 ta manzil olinadi. Ixtiyoriy source-frame loglari ko‘chirilmaydi.

HTML entity/teglar buzilmaydi, kartochka 3900 belgi ichida qoladi. Uzun hisobotlar fayl ilovasida davom etadi; eski oddiy matnli xabarlarni qayta yuborish va tasdiqlangan summary dedupi saqlangan. Mavjud Telegram guruh/topic/token, kundalik 18:00 jadvali, MR va push tartibi o‘zgarmaydi. Yangi format keyingi xabarlardan ishlaydi; eski yuborilgan xabarlarni tahrirlamaydi.

To‘liq lokal sinovlar: 168/168 PASS, 0 fail, 0 skip. Mustaqil ko‘rik topgan ichki paket katalogiga oid muammo regressiya sinovi bilan tuzatildi; qayta ko‘rikda Important/Critical muammo qolmadi. Paket Windows/macOS/Linux × Node 22/24 reliz tekshiruvlaridan keyin chiqariladi.

Odatdagi buyruq: ds. Boshqa noutbukda: ds update. Telegramni qayta sozlash shart emas. O‘zbekcha qo‘llanma: docs/TELEGRAM-CARDS.md.
