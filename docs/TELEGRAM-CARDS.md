# Telegram xabarlarining yangi ko‘rinishi — 2.3.0

Oddiy `ds` ish tartibi saqlanadi. Xabarlar avtomatik yangi formatda yuboriladi:

- 🟢 **PUSH MUVAFFAQIYATLI**: tasdiqlangan push, loyiha, Git foydalanuvchisi, branch, vaqt, fayl/commitlar soni va sahifalar bo‘yicha qisqa xulosa.
- 🔴 **KONFLIKT**: push bajarilmaganligi, qabul qiluvchi va kiruvchi branch, sahifa, fayl, konflikt turi, marker qatorlari va ikki tomondagi oxirgi fayl commiti mualliflari.
- 🔴 **XATO**: tekshiruv bosqichi, xato kodi, diagnostika, aniqlangan fayl/qator/ustun va xavfsiz bo‘lsa tegishli kod parchasi.

Sarlavhalar qalin, bo‘limlar orasida bo‘sh qator, ma’lumotlar blockquote, kodlar qator raqami bilan monospace `pre` ramkada chiqadi. Telegram oddiy xabar matniga qizil rang tanlashni qo‘llamaydi; xatolar qizil doira bilan ajratiladi. Fon, ramka rangi va shrift Telegram mijozining mavzusiga bog‘liq. [Telegram rasmiy HTML formatlash hujjati](https://core.telegram.org/bots/api#html-style).

## Kod parchasi chegaralari

Foydalanuvchi so‘raganidek, konflikt yoki build/test xatosining qisqa kod parchasi mavjud ulangan guruhga yuboriladi. Ixtiyoriy source-frame loglari ko‘chirilmaydi: fayl loyihaning o‘zidan o‘qiladi. Kod uchun `ts/js/tsx/jsx/mjs/cjs/vue/svelte/java/kt/gradle/xml/json/css/scss/html` manbalari qabul qilinadi.

Maxfiy fayl nomi, aniqlangan token/parol, credential URL, binary, symlink, repo tashqarisidagi manzil yoki 1 MiB dan katta fayl bo‘lsa kod yuborilmaydi, sababi yoziladi. Bu barcha turdagi noma’lum sirlarni aniqlash kafolati emas; real maxfiy ma’lumotni source kodga joylamang.

Har bir parcha ko‘pi bilan 12 qator, har qator 180 belgidan iborat. Konfliktda dastlabki 6 faylning dastlabki 2 marker oralig‘i, oddiy xatoda dastlabki 3 diagnostik manzil uchun parcha olinadi. Qisqartirilgan parcha belgilanadi. Ichki paketlarda yo‘l xato chiqqan tekshiruv katalogiga nisbatan yechiladi; repo chegarasi baribir tekshiriladi. Qator aniqlanmagan binary/o‘chirish konfliktiga taxminiy qator yoki kod berilmaydi.

“Git foydalanuvchisi” lokal Git konfiguratsiyasidan olinadi. Fayl mualliflari ikki tomondagi oxirgi Git commit metadatasidir; branch egasi yoki aynan kim konfliktga sabab bo‘lganini tasdiqlamaydi. Sahifa nomi yo‘ldan olinadi; nom ishonchli aniqlanmasa “Umumiy fayl” chiqadi.

## Uzun xabarlar va avvalgi yozuvlar

HTML kartochka 3900 UTF-16 belgidan oshmaydi; entity va teglar o‘rtasidan kesilmaydi. Qolgan tafsilotlar `push-hisobot.txt` yoki `xato-hisobot.txt` ilovasiga tushadi. Kengaytirilgan xavfsiz kod parchasi ham shu ilovaga kirishi mumkin.

Yangi outbox yozuvlari HTML formatini saqlaydi va retry ham shu formatda ishlaydi. Avvaldan kutilayotgan oddiy matnli xabarlar oddiy matn bo‘lib qoladi; yuborilgan summary ilova xatosidan keyin qayta yuborilmaydi. Mavjud guruh/topic/token, kundalik hisobot, MR matni va feature-only push saqlanadi. Yangilanish eski yuborilgan xabarlarni tahrirlamaydi; keyingi yangi xabarlardan amal qiladi.

Boshqa noutbuklarda: `ds.cmd update`. Oddiy ish: `ds.cmd`. Telegramni qayta sozlash shart emas.
