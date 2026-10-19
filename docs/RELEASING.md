# GitHub orqali tarqatish va yangilash

Repo: https://github.com/LatipovYusuf444/devship. Foydalanuvchilar GitHub akkaunt/tokenisiz public barqaror relizni o‘rnatishi mumkin. Paket npm registryga publish qilinmaydi.

## Yangi kompyuter

Node.js 22+ (npm bilan) va Git 2.30+ o‘rnating. Oddiy PowerShell’da:

```powershell
npm.cmd install --global --ignore-scripts "https://github.com/LatipovYusuf444/devship/releases/latest/download/devship-cli-local.tgz"
ds.cmd --version
```

So‘ng loyiha papkasiga kiring. Mavjud o‘z branchingizga o‘ting, masalan `git switch Yusuf`. `ds.cmd doctor` holatni tushuntiradi. Bir nechta lockfile bo‘lsa `ds.cmd setup`, keyin `ds.cmd --dry-run` va `ds.cmd`.

Loyiha bog‘liqliklarini jamoa odatidagi npm/pnpm/yarn buyrug‘i bilan oldindan o‘rnating. DevShip ularni almashtirmaydi. Telegram kerak bo‘lsa `ds.cmd telegram setup` ni **alohida** ishga tushiring. Shu jarayon tugamaguncha boshqa buyruqlarni birga paste qilmang. Tokenni faqat yashirin terminal maydoniga kiriting. Keyin `ds.cmd telegram health`; sinov xabari yuborishni istasangiz `ds.cmd telegram test`.

## Yangilanish

Yangi reliz borligini tekshirish: `ds.cmd update check`. Qo‘llash: `ds.cmd update`. Oddiy interaktiv run ham kuniga bir marta terminalda yangilanish borligini ko‘rsatadi. Oflayn tekshiruv Gitni to‘xtatmaydi. Versiya va checksum tekshirilmaguncha npm ishga tushmaydi. Lifecycle scriptlar o‘chirilgan. Bu repo egasiga bo‘lgan ishonchni almashtirmaydi; SHA256 buzilgan faylni aniqlaydi, mustaqil raqamli imzo emas.

Source’dan ishlayotgan developer yangilash uchun o‘z Git checkoutini odatdagidek yangilaydi. Global updater faqat `node_modules/devship-cli-local` ko‘rinishidagi paketni almashtiradi. Ruxsat yetmasa updater xato beradi va zaxirani ko‘rsatadi. Execution policy’ni pasaytirmang: Windows’da `.cmd` ishlating.

## Egasi yangi versiyani chiqarishi

1. Kod, test va hujjatlarni yangilang. `package.json` versiyasi va `docs/RELEASE-NOTES.md` ni moslang.
2. `npm test` va `npm run check` bajaring. Source commitlarini GitHub’ga yuboring.
3. `vX.Y.Z` tagini push qiling yoki Actions → DevShip Release → Run workflow ni bosing.
4. Workflow Windows/macOS/Linux va Node 22/24 testlari o‘tgandan keyin reliz chiqaradi. Test yiqilsa publish bo‘lmaydi. Oldingi reliz assetlari ustidan yozilmaydi.
5. Release ichida `devship-cli-local.tgz`, `release.json`, `devship-source.zip`, `SHA256SUMS.txt` bo‘lishi kerak. `ds update check` bilan tekshiring.

GitHub Actions faqat shu run uchun GitHub bergan vaqtinchalik token bilan reliz yozadi. Qo‘lda shaxsiy tokenni kodga yoki Secrets’ga qo‘shish kerak emas. Repo’da Actions o‘chirilgan yoki limit tugagan bo‘lsa workflow bajarilmaydi; Actions sahifasi sababni ko‘rsatadi.

## Ko‘p uchraydigan holatlar

| Holat | Amal |
| --- | --- |
| `ENOENT ...System32...tgz` | Fayl manzili xato. Yuqoridagi HTTPS o‘rnatish buyrug‘ini ishlating. |
| `ds.cmd` topilmadi | O‘rnatish muvaffaqiyatini tekshiring, terminalni qayta oching, npm global bin PATH’da bo‘lsin. |
| `TASKS_SETUP` | `ds.cmd setup` bilan menejerni tanlang; lockfile o‘chirmang. |
| `COMMAND` | Loyiha vositasi/bog‘liqliklari va build/test xatosini tekshiring. Tekshiruvni o‘chirmang. |
| `LOCK` | Boshqa run tugashini kuting. V2 faqat o‘z hostidagi tasdiqlangan o‘lik lockni tiklaydi. Eski/noma’lum lockni PID/host tekshiruvisiz o‘chirmang. |
| Telegram 400 yoki guruh ko‘chishi | `ds.cmd telegram health`. Kerakli guruhda botga xabar va fayl huquqini bering. |
| Telegram timeout | Push natijasini terminaldan tekshiring. `telegram retry` faqat hisobotni qaytaradi, Git pushni qaytarmaydi; noaniq javobda takror xabar bo‘lishi mumkin. |
| Yangilanish HTTP 404 | Public barqaror release va assetlar borligini tekshiring. Loyiha uchun odatiy `ds` ishlashda davom etadi. |

DevShip har qanday loyiha xatosini oldindan yo‘q qila olmaydi. Ishonchli tekshiruvlar va Git ruxsatlari zarur; konflikt/build xatosi bo‘lsa lokal ishni saqlab, pushni to‘xtatadi.
