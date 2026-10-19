# Telegram guruhiga push xabari

Bir marta ulang; shu kompyuterdagi boshqa loyihalarda ham ishlaydi. Xabarda loyiha nomi, branch, remote, commit raqami, commitlar, mualliflar, o‘zgargan fayllar va push sanasi/soati bo‘ladi. Standart vaqt zonasi **Asia/Tashkent**; UTC vaqti ham yoziladi. Ro‘yxat uzun bo‘lsa, qisqa xabar bilan to‘liq `push-hisobot.txt` ilovasi yuboriladi. Hisobotga kod mazmuni kiritilmaydi.

## 1. Bot yarating va guruhga qo‘shing

Telegram’da rasmiy [@BotFather](https://t.me/BotFather) ni oching, **Start** bosing va `/newbot` yuboring. Botga nom bering, so‘ng oxiri `bot` bilan tugaydigan username tanlang. BotFather bergan tokenni saqlang. Tokenni chat, Git yoki loyiha `.env` fayliga yozmang. [Rasmiy qo‘llanma](https://core.telegram.org/bots/features#botfather).

Yaratilgan botni kerakli guruhga qo‘shing va xabar yuborishga ruxsat bering. Guruh cheklovlariga qarab yozish huquqi yetarli; barcha administrator huquqlarini berish shart emas. DevShip uchun alohida bot ishlatish qulay.

## 2. Terminalda bir marta ulang

Windows PowerShell’da:

```text
devship.cmd telegram setup
```

1. Tokenni terminal so‘raganda kiriting. U ekranda ko‘rinmaydi va terminal tarixiga qo‘shilmaydi.
   Oldin shu kompyuterda saqlangan token bo‘lsa, uni qayta ishlatish uchun Enter bosing. Boshqa foydalanuvchi/noutbukga Windows’dagi shifrlangan token faylini ko‘chirmang; setup bilan o‘z tokeningizni kiriting. Setup tugamaguncha keyingi buyruqlarni birga paste qilmang.
2. `Guruh Chat IDsi` so‘ralsa, bilmasangiz **Enter** bosing.
3. DevShip ko‘rsatgan `/devship_setup@... ...` buyrug‘ini aynan kerakli Telegram guruhiga yuboring. Topic ishlatsangiz, kerakli topic ichiga yozing.
4. Terminalga qaytib **Enter** bosing. Guruh nomi/IDsi to‘g‘riligini tekshirib, `ha` yozing.
5. Vaqt zonasi uchun **Enter** bosing — Toshkent vaqti tanlanadi.

Keyin sinov xabarini o‘zingiz yuboring:

```text
devship.cmd telegram test
devship.cmd telegram status
```

macOS/Linux’da `devship.cmd` o‘rniga `devship` ishlatiladi. `setup` o‘zi sinov xabari yubormaydi. Tokenni tekshiradi va guruhni o‘qiydi; ulash buyrug‘ini guruhga siz yuborasiz.

Chat IDni bilsangiz, manfiy raqamni qo‘lda kiriting. Forum guruhida topic IDsi ixtiyoriy so‘raladi. Botda webhook yoki boshqa `getUpdates` jarayoni ishlayotgan bo‘lsa, avtomatik topish ishlamasligi mumkin. DevShip webhookni o‘chirmaydi va update offsetini o‘zgartirmaydi. Chat IDni qo‘lda kiriting yoki alohida bot yarating. Avtomatik ulash dastlabki 100 update ichidan aynan yangi tasodifiy kodingizni qidiradi; bir nechta manzil topilsa o‘zi tanlamaydi. [Telegram getUpdates](https://core.telegram.org/bots/api#getupdates).

## 3. Odatdagidek push qiling

Xabar yubormasdan bot huquqlarini tekshirish: `ds.cmd telegram health`. Guruh supergroupga aylangan bo‘lsa health faqat Telegram API javobidagi migration parametri yoki xizmat xabari orqali tasdiqlangan eski → yangi IDni tuzatadi. Faqat guruh nomi bir xil bo‘lgani yetarli emas. Eski guruh botdan yashirin bo‘lsa yoki migration xabari saqlanmagan bo‘lsa, guruhni `setup` bilan qayta tanlang. Yangi manzil tasdiqlansa mavjud pending xabarlarni `telegram retry` shu guruhga yubora oladi; topic farq qilsa rad etadi.

Loyihangizdagi feature branchda:

```text
devship.cmd
```

Tekshiruvlar va merge tugab, branch remote’da yangilangandan **keyin** guruhga muvaffaqiyat xabari boradi. Bir xil commitdagi branch uchun ortiqcha xabar yuborilmaydi.

**1.3.0 dan konflikt va tekshiruv xatolarida ham alohida xabar boradi.** Unda loyiha, joriy branch, xato bosqichi va sana/soat yoziladi. Konfliktda kiruvchi branch, konfliktli fayllar, topilgan marker qatorlari, har ikki tomondagi oxirgi tegishli Git commit mualliflari ko‘rsatiladi. Bu branch egasi yoki aynan konflikt qatori muallifi haqidagi da’vo emas. Tekshiruv xatosida bajarilgan buyruq va tanlangan compiler/test diagnostikasi yuboriladi; to‘liq log terminalda qoladi. Kod frame’lari, inline dastur argumentlari va ma’lum tokenlar chiqarilmaydi/yashiriladi. Xato diagnostikasini skriptning o‘zi yaratadi; scanner heuristik bo‘lib, barcha mumkin bo‘lgan maxfiy ma’lumotni taniy olish kafolati yo‘q.

Konflikt/check xatosida **push bajarilmaydi**. Push buyrug‘ining o‘zi xato bilan tugasa, xabar “push tasdiqlanmadi” deydi; tarmoq uzilishida remote holatini tekshiring. DevShip xatoni avtomatik tuzatmaydi va pushni qayta urinmaydi. `--dry-run`, protected branch, config yuklash yoki lock xatosida Telegram xabari yuborilmaydi. Keyingi run mavjud hal qilinmagan merge holatida preflight’da to‘xtasa ham takror konflikt xabari yo‘q.

Katta xato hisobotlari `xato-hisobot.txt` bilan biriktiriladi. Xato xabariga Telegram tasdig‘i kelmasa, quyidagi `telegram retry` mexanizmi amal qiladi; asl Git/tekshiruv xatosi saqlanadi. Avvalgi guruh sozlamangiz yangilanishdan keyin ham ishlaydi, qayta `setup` shart emas.

Telegram ishlamasa, bajarilgan Git push muvaffaqiyatli bo‘lib qoladi; terminal ogohlantiradi. Hisobot ishchi nusxaning Git metadata papkasidagi `devship-telegram/` ichida saqlanadi. Oddiy repoda bu `.git/devship-telegram/`. Aynan shu loyiha ichidan qayta yuborish:

```text
devship.cmd telegram retry
```

Avtomatik retry yo‘q. Telegram xabarni qabul qilib, tasdiq javobi yo‘qolgan bo‘lsa, qo‘lda `retry` takror xabar berishi mumkin; terminal buni aytadi. Saqlangan tasdiqli xabarlar qayta yuborilmaydi; katta hisobotdagi tasdiqli qisqa xabar ham takrorlanmaydi. Kutayotgan xabar boshqa guruh/topicga yo‘naltirilmaydi. Sozlama o‘zgargan bo‘lsa, avval eski manzilga mos sozlang.

401 — tokenni tekshiring; 403 — botning guruh a’zoligi/yozish huquqini tekshiring; 429 — keyinroq qo‘lda qayta yuboring. Xatolardagi token/URL yoki maxfiy qiymat terminalga chiqarilmaydi.

## Saqlash va o‘chirish

Token repo configidan alohida saqlanadi: Windows’da odatda `%APPDATA%\DevShip\telegram.json`, boshqa tizimlarda global DevShip configi yonida. `DEVSHIP_GLOBAL_CONFIG` berilgan bo‘lsa, uning papkasi ishlatiladi. Token faylini Git repo ichida saqlash rad etiladi. Windows’da token shu foydalanuvchiga bog‘langan **DPAPI** bilan shifrlanadi. macOS/Linux’da fayl `0600`, yangi papka `0700` ruxsati bilan yaratiladi. Git ichidagi xabar hisobotida bot tokeni saqlanmaydi.

```text
devship.cmd telegram disable
```

Bu barcha loyihalardagi yangi xabarlarni o‘chiradi; `setup` bilan qayta yoqiladi. Faqat bitta loyihada o‘chirish uchun `.devship.json` ga `"telegram": false` qo‘shing. Standart `true`, lekin token/guruh ulanmaguncha xabar yuborilmaydi. Token va guruh manzili loyiha configiga yozilmaydi.

Jonli sinov uchun o‘zingizning bot/guruhingiz kerak. Paket testlari haqiqiy guruhga xabar yubormaydi. Konfliktni sinash uchun haqiqiy loyihada ataylab konflikt yaratish kerak emas; avtomatik testlar vaqtinchalik lokal repolardan foydalanadi.
