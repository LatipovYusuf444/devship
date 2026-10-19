# DevShip

Git loyihangizda **bitta `devship` buyrug‘i**: tekshiruv → xavfsiz stage → commit → fetch → feature branch va `origin/main` bilan merge → qayta tekshiruv → faqat joriy branchga push.

Windows, macOS va Linux uchun Node.js CLI. Runtime kutubxonalar yo‘q. AI yoki API kalit kerak emas. Tarqatish: [GitHub Releases](https://github.com/LatipovYusuf444/devship/releases).

## Bir marta o‘rnatish

Talablar: **Node.js 22+**, npm, **Git 2.30+**. Java loyihalari uchun mos JDK va wrapper yoki Maven/Gradle; pnpm/yarn loyihalari uchun tegishli manager oldindan o‘rnatilgan bo‘lsin. Bog‘liqliklarni loyihangizda odatdagidek o‘rnating; DevShip ularni o‘zi yuklamaydi.

Windows PowerShell’da bir marta:

```powershell
npm.cmd install --global --ignore-scripts "https://github.com/LatipovYusuf444/devship/releases/latest/download/devship-cli-local.tgz"
ds.cmd --version
```

macOS/Linux’da `npm.cmd` o‘rniga `npm`, `ds.cmd` o‘rniga `ds` yoziladi. `.tgz` faylni WinRAR’da ochish kerak emas. Havola oxirgi chiqarilgan barqaror versiyani o‘rnatadi.

Source arxivdan o‘rnatish ham mumkin:

```text
cd "DEVSHIP_PAPKASI"
npm install --global --ignore-scripts .
devship --version
```

`DEVSHIP_PAPKASI` — zipdan chiqarilgan `devship` papkasining haqiqiy manzili. Yoki `.tgz` turgan papkada:

```text
npm install --global --ignore-scripts ./devship-cli-local-2.0.1.tgz
```

Windows PowerShell `npm.ps1` ni bloklasa, xuddi shu buyruqda `npm.cmd` ishlating. `devship.ps1` bloklansa `devship.cmd` ishlating; execution policy’ni o‘zgartirish shart emas. `devship` topilmasa terminalni qayta oching va npm global bin papkasi PATH ichida ekanini tekshiring. macOS/Linux’da ruxsat muammosi bo‘lsa Node version manager ishlatish qulay.

O‘rnatmasdan ishlatish ham mumkin:

```text
node "DEVSHIP_PAPKASI/bin/devship.mjs" --help
```

## Qisqa buyruq: ds

1.4.1 dan `ds` va `devship` aynan bir CLI’ni ishga tushiradi. Windows PowerShell’da:

```powershell
ds.cmd
ds.cmd --dry-run
ds.cmd telegram setup
ds.cmd telegram status
```

macOS/Linux’da `ds` ishlatiladi. Windows’da `ds.ps1` execution policy sabab bloklansa, `ds.cmd` ishlating. Eski `devship` buyruqlari, loyiha va Telegram sozlamalari o‘z kuchida qoladi. Boshqa noutbukda qisqa buyruq paydo bo‘lishi uchun 1.4.1 yoki yangiroq paketni o‘rnating.

## Har loyihada ishlatish

Feature branchga o‘ting; remote autentifikatsiyangiz va Git `user.name`/`user.email` oldindan sozlangan bo‘lsin:

```text
cd "LOYIHA_PAPKASI"
git switch -c feature/mening-ishim
devship --dry-run
devship
```

Mavjud feature branchda ishlayotgan bo‘lsangiz `git switch -c` kerak emas. Keyingi safarlar faqat `devship` yetadi. Repo ichidagi pastki papkadan ham ishlaydi. Global Git template, hook yoki har bir loyihaga npm dependency qo‘shish talab qilinmaydi.

Masalan, mavjud `Yusuf` branchida Windows’da:

```powershell
git switch Yusuf
ds.cmd doctor
ds.cmd --dry-run
ds.cmd
```

Bir nechta lockfile bo‘lsa `ds.cmd setup` buyrug‘ini bajaring va loyiha uchun `yarn`, `npm` yoki `pnpm` ni yozing. Interaktiv oddiy run ham tanlovni so‘raydi. Tanlov shu foydalanuvchi kompyuterida loyiha yo‘liga bog‘lab saqlanadi. Loyiha fayllari/lockfilelar o‘zgarmaydi. Boshqa odam o‘z kompyuterida bir marta tanlaydi. PackageManager yoki qaysi lockfilelar borligi o‘zgarsa qayta tanlash so‘raladi. `--dry-run` tanlov saqlamaydi.

## Yangilash

Oddiy interaktiv `ds` ishga tushganda kuniga bir marta GitHub’dagi yangi versiya tekshiriladi. Yangisi bo‘lsa terminalda `DevShip X.Y.Z chiqdi. Yangilash: ds update` yoziladi. Oflayn tekshiruv Git ishini to‘xtatmaydi. Fon xizmati yo‘q; yangilashni shu buyruq bilan qo‘llaysiz:

```powershell
ds.cmd update check
ds.cmd update
```

Tgz faylni qo‘lda yuklab olish shart emas. Updater faqat `LatipovYusuf444/devship` barqaror relizidan oladi, SHA256/hajm/arxivni tekshiradi va npm lifecycle scriptlarisiz o‘rnatadi. Avval eski paket zaxiralanadi; xatoda tiklashga uriniladi. Zaxira global DevShip papkasidagi `updates` ichida qoladi. Sozlamalar va Telegram tokeni o‘zgarmaydi. Shu foydalanuvchidagi v2 CLI ishlayotganida yangilash lock bilan bloklanadi. Eski v1 jarayonlari va boshqa OS foydalanuvchilari bu lockda qatnashmaydi; yangilashdan oldin ularning DevShip jarayonlari tugagan bo‘lsin.

Source/lokal o‘rnatish `ds update` bilan almashtirilmaydi; avval global o‘rnatish buyrug‘ini ishlating. `DEVSHIP_UPDATES=off` avtomatik xabar tekshiruvini o‘chiradi. `--help`, `--version` va `--dry-run` yangilanish uchun internetga chiqmaydi. Laptop yopiq turganda bildirishnoma chiqmaydi. [Reliz chiqarish](docs/RELEASING.md).

```text
devship -m "feat: foydalanuvchi qidiruvini qo‘shish"
devship --init
devship --config .devship.custom.json
devship --help
```

`--dry-run` faqat lokal fayllar va rejalashtirilgan tasklarni tekshiradi. Task, fetch, merge, commit va push bajarmaydi; internetga chiqmaydi. Masofadagi branch mavjudligi va push ruxsatini kafolatlamaydi. `--init` mavjud `.devship.json` ustidan yozmaydi. Parametrlar noto‘g‘ri bo‘lsa exit code 2; bajarish yoki xavfsizlik xatosida 1; muvaffaqiyatda 0.

## Telegram guruhiga xabar

Muvaffaqiyatli yangi pushdan keyin guruhga loyiha, branch, commitlar, fayllar va Toshkent sanasi/soati yuboriladi. Konflikt yoki tekshiruv xatosida alohida xato xabari boradi: branchlar, fayllar/qatorlar mavjud bo‘lsa va diagnostika ko‘rsatiladi; push davom etmaydi. Uzun ro‘yxat matn fayli bilan biriktiriladi. Takror pushda muvaffaqiyat xabari bormaydi. Telegram xatosi Git amalini takrorlamaydi va asl xatoni almashtirmaydi.

Bot yarating, guruhga qo‘shing va bir marta ulang:

```text
devship.cmd telegram setup
devship.cmd telegram test
```

Keyin har loyihada odatdagidek `devship.cmd` ishlating. Tokenni faqat terminal so‘raganda kiriting; chatga yoki loyiha fayliga yozmang. **[Bot yaratish va guruhni ulash bo‘yicha to‘liq yo‘riqnoma](docs/TELEGRAM.md)**. Unda `status`, `retry`, `disable`, xavfsiz saqlash va topic sozlamalari ham tushuntirilgan. macOS/Linux’da `.cmd` yozilmaydi.

Faqat bitta loyihada xabarni o‘chirish uchun `.devship.json` ga `"telegram": false` qo‘shing. Token/guruh global sozlanadi; loyiha configi orqali boshqa manzilga yo‘naltirilmaydi.

## Tekshiruvlarni tezroq bajarish

Standart `checksMode: "both"` avvalgi xatti-harakatni saqlaydi: commitdan oldin va merge’dan keyin ikkita to‘liq tekshiruv davrasi.

`.devship.json` ga `"checksMode": "final"` qo‘shsangiz, barcha typecheck/test/build buyruqlari **yakuniy merge’dan keyin, pushdan oldin bir marta** bajariladi. Bir xil og‘ir buyruqlar ikki marta bajarilmaydi. Konflikt bo‘lsa, build boshlanmasdan to‘xtaydi. Bu rejimda tekshiruvdan oldin lokal commit va merge yaratilishi mumkin; xato chiqsa ular saqlanadi, **push bajarilmaydi**. Tekshiruv fayl/index/HEAD’ni o‘zgartirsa ham to‘xtaydi. Secret scan, branch himoyasi, oddiy merge va faqat joriy branch push qoidalari o‘z kuchida qoladi.

```json
{
  "checksMode": "final",
  "checks": [
    ["yarn", "run", "check:types"],
    ["yarn", "run", "test:unit"],
    ["yarn", "run", "build"]
  ]
}
```

Bu misol aynan shu Yarn scriptlari mavjud loyiha uchun. O‘zingizdagi boshqa sozlamalarni saqlab, `checksMode` ni qo‘shing. Bir davra kam bajarilishi tekshiruv ishini kamaytiradi; umumiy vaqt loyiha, disk/CPU va tarmoqqa bog‘liq. Tekshiruv natijalari keyingi ishga tushirish uchun “o‘tdi” deb keshlanmaydi: har safar yakuniy kod tekshiriladi. Faqat shu run davomida allaqachon muvaffaqiyatli scan qilingan o‘zgarmas Git bloblari qayta o‘qilmaydi; fayl yo‘li/symlink qoidalari har safar tekshiriladi. Har bir tugagan buyruqning davomiyligi terminalda ko‘rsatiladi.

## Nimalar avtomatik topiladi?

| Repo rootdagi belgi | Tekshiruv |
| --- | --- |
| `pom.xml` | `./mvnw --batch-mode verify`, Windows’da `mvnw.cmd`; wrapper bo‘lmasa `mvn` |
| Gradle build/settings fayli | `./gradlew --no-daemon build`, Windows’da `gradlew.bat`; wrapper bo‘lmasa `gradle` |
| `package.json` | E’lon qilingan `test` va `build` scriptlari, shu tartibda |
| `pnpm-lock.yaml` | `pnpm run test` / `pnpm run build` |
| `yarn.lock` | `yarn run test` / `yarn run build` |
| npm lockfile yoki lockfilesiz Node loyiha | `npm run test` / `npm run build` |

`packageManager` va lockfile mos bo‘lishi kerak. Qarama-qarshi lockfilelar bo‘lsa `ds setup` bilan bir marta aniq tanlang; manager o‘zboshimchalik bilan tanlanmaydi. Node uchun mavjud birinchi typecheck scripti (`check:types`, `typecheck`, `type-check`), `test` yoki uning o‘rniga `test:unit`, va `build` bajariladi. Boshqa nomdagi checks uchun aniq konfiguratsiya yozing. `packageManager` versiyasini DevShip o‘rnatmaydi yoki tekshirmaydi: kerakli versiyani o‘zingiz tayyorlang. Java va Node bir rootda bo‘lsa hammasi bajariladi. Maven `verify` va Gradle `build` testlarni tegishli lifecycle orqali bajaradi; loyihangiz testlarni skip qilgan bo‘lsa DevShip ularni qayta yoqmaydi. Npm’ning standart “no test specified” scripti xato bilan tugasa DevShip ham to‘xtaydi.

Tasklar repo rootda aniqlanadi; barcha ichki papkalarni avtomatik qidirib taxminiy buyruqlar bajarilmaydi. Maven/Gradle ko‘p modulli root buildi odatdagi modullarni bajaradi. Monorepo, lint, typecheck yoki maxsus test uchun `checks` yozing. Hech qanday task bo‘lmasa to‘xtaydi.

## Sozlamalar

Repo rootdagi `.devship.json` va global JSON qo‘llanadi. Repo sozlamasi globalni almashtiradi; `protectedBranches` qo‘shiladi. Noma’lum kalit, yaroqsiz qiymat va noto‘g‘ri JSON xato hisoblanadi. `--config` repo fayli o‘rniga boshqa JSON tanlaydi; nisbiy manzil repo rootdan hisoblanadi.

Global manzil:

- Windows: `%APPDATA%\DevShip\config.json`
- macOS/Linux: `$XDG_CONFIG_HOME/devship/config.json` yoki `~/.config/devship/config.json`
- `DEVSHIP_GLOBAL_CONFIG` muhit o‘zgaruvchisi bilan boshqa faylni tanlash mumkin.

Oddiy loyiha configsiz ishlaydi. Maxsus loyiha uchun:

```json
{
  "remote": "origin",
  "base": "main",
  "protectedBranches": ["hotfix/*", "team/stable"],
  "checks": [
    ["npm", "run", "test"],
    ["npm", "run", "build"],
    { "argv": ["npm", "run", "typecheck"], "cwd": "apps/web" }
  ],
  "exclude": ["scratch/**", "**/*.log"],
  "allowSecretPaths": [],
  "allowNoChecks": false,
  "maxScanBytes": 1048576,
  "timeoutMs": 600000
}
```

`checks` avtomatik tasklar ro‘yxatini **to‘liq almashtiradi**. Har bir buyruq argumentlar ro‘yxati bo‘lsin; `"npm test && npm run build"` kabi shell matni qabul qilinmaydi. `cwd` haqiqiy repo ichida bo‘lishi shart, symlink orqali tashqariga chiqish ham rad etiladi. Windows `.cmd/.bat` argumentlarida `" % ! ^ & | < >` belgilariga ruxsat yo‘q; murakkab mantiqni loyiha scriptiga yozing yoki `node script.mjs` ishlating. Oddiy `.exe` va Node argumentlari shell orqali o‘tmaydi.

`exclude` fayllari jim tashlab ketilmaydi: pending faylga mos kelsa DevShip to‘xtaydi. Bu tekshirilgan kodning faqat bir qismini tasodifan commit qilishni oldini oladi. `.gitignore` bilan ignor qilingan **untracked** fayllar umuman nomzodga kirmaydi. Allaqachon tracked fayl `.gitignore` qo‘shilishi bilan tracked bo‘lishdan chiqmaydi. Patternlarda `*`, `**`, `?` ishlaydi; Gitignore negation (`!`) yoki murakkab glob sintaksisi yo‘q.

`allowSecretPaths` faqat tekshirilgan ommaviy fixture faylining **aniq yo‘li** uchun filename blokini olib tashlaydi; kontent tekshiruvi qoladi. Wildcard ruxsat etilmaydi. `.env.example`, `.env.sample`, `.env.template` nomlari mumkin, lekin ichidagi haqiqiy tokenlar bloklanadi. `maxScanBytes` 1 KiB–10 MiB; standart 1 MiB, har bir yangi/o‘zgargan blob uchun. `timeoutMs` har bir jarayon uchun 1 soniya–1 soat; standart 10 daqiqa.

Tekshiruvsiz hujjatlar loyihasi uchun ongli ravishda `{"allowNoChecks": true}` yozish mumkin. `checks: []` o‘zi yetmaydi. Asosiy dastur loyihalarida haqiqiy tekshiruvlarni ko‘rsating.

## Git xavfsizligi va ish oqimi

1. Joriy branch, Git operatsiyalari, index, remote va fayllar tekshiriladi. `main`, `master`, `develop`, `development`, `production`, `staging`, `release`, `release/**`, tanlangan base va qo‘shimcha protected patternlarda ishlamaydi. Ichma-ich release branchlar ham himoyalangan. Himoya katta/kichik harfga sezgir emas va config bilan o‘chirib tashlanmaydi.
2. Maxfiy yo‘llar va ma’lum token/private-key belgilariga scan qilinadi. Faqat aniq nomzod fayllar stage qilinadi. O‘chirilgan fayllar va rename’lar ham qamrab olinadi. Qisman staged fayl bloklanadi; mavjud stage chegarasi o‘zgartirilmaydi.
3. `both` rejimida build/test avval bajariladi; fayl/index/branch/HEAD o‘zgarsa commitdan oldin to‘xtaydi. `final` rejimida barcha checks 7-bosqichda bajariladi. Xavfsiz o‘zgarishlar `git add -- <aniq yo‘llar>` bilan stage qilinadi va commit yaratiladi. Git hooklari odatdagidek ishlaydi.
4. Remote headlar fetch qilinadi. Eskirgan **remote-tracking** refs yangilanadi/prune qilinadi; lokal branch, tag va fayllar o‘chirilmaydi. Sozlamadagi boshqa fetch mapping va tag-pruning o‘chiriladi; faqat aniq remote-tracking namespace yangilanadi. Local feature branch hali e’lon qilinmagan bo‘lishi mumkin.
5. Base yoki remote feature tarixida allaqachon mavjud bo‘lmagan lokal commitlar kontenti scan qilinadi. Oldingi lokal commitda token qo‘shilib keyin o‘chirilgan bo‘lsa ham to‘xtaydi.
6. Masofadagi shu feature branch, keyin base branch joriy branchga oddiy merge qilinadi. Ikki tomonlama divergent tarix saqlanadi; rebase va force push yo‘q. Konflikt avtomatik hal qilinmaydi.
7. Yangi `package.json`/build fayllardan tasklar qayta aniqlanadi va yana bajariladi. Run boshlangandagi config amal qiladi; merge bilan kelgan yangi `.devship.json` keyingi ishga tushirishda yuklanadi.
8. Toza working tree, o‘zgarmagan branch/HEAD va qayta scan’dan keyin faqat `refs/heads/JORIY:refs/heads/JORIY` push qilinadi. Taglar va boshqa branchlar yuborilmaydi; remote mirror/follow-tags sozlamalari bekor qilinadi. Birinchi push upstream qo‘yadi. Remote yangilanib ketgan bo‘lsa oddiy push rad etiladi.

Working tree toza bo‘lsa bo‘sh commit yaratilmaydi, ammo sync va tekshiruvlar bajariladi. Remote aynan shu commitda bo‘lsa push kerak emas. Fetch/push URL bitta va bir xil bo‘lishi shart; alohida push URL yoki bir nechta destination qo‘llanmaydi. Upstream boshqa branchga qaragan bo‘lsa to‘xtaydi. Detached HEAD, commitsiz repo, shallow clone va submodule avtomatik boshqarilmaydi.

## Xatodan keyin nima qilish kerak?

| Xato kodi | Amal |
| --- | --- |
| `PROTECTED` / `BRANCH` | Feature branchga o‘ting. Commitsiz repo uchun dastlabki commit/base’ni qo‘lda tayyorlang. |
| `SECRET` | Fayl, index va push qilinmagan tarixni tekshiring. Haqiqiy kalit oshkor bo‘lgan bo‘lsa almashtiring. Tarixni DevShip o‘zi o‘zgartirmaydi. |
| `PARTIAL` | `git diff` va `git diff --cached` bilan stage chegarasini ko‘ring; butun faylni commit qilish yoki partial commitni qo‘lda tugatishni o‘zingiz tanlang. |
| `INDEX_FLAGS` | `git ls-files -v` bilan `assume-unchanged`/`skip-worktree` belgilarini tekshiring. Oddiy faylda kerak bo‘lmasa `git update-index --no-assume-unchanged --no-skip-worktree -- "FAYL"` bilan o‘zingiz olib tashlang; sparse checkoutni o‘zboshimchalik bilan o‘zgartirmang. |
| `EXCLUDED` | Generatsiya qilingan untracked faylni `.gitignore` ga kiriting. Tracked chiqindi fayllarni qo‘lda boshqaring. |
| `CHANGED` / `DIRTY` | Formatter/test yoki boshqa jarayon o‘zgartirgan fayllarni tekshiring, so‘ng qayta bajaring. |
| `COMMAND` | Build/test, wrapper, timeout, Git identity, signing yoki autentifikatsiya xatosini tuzating. Lokal ish saqlanadi. |
| `BASE` / `REMOTE` / `UPSTREAM` | Remote/base nomi, URL va upstreamni to‘g‘rilang. |
| `MERGE` / `IN_PROGRESS` | Quyidagi konflikt yo‘riqnomasiga amal qiling. |
| `PUSH` | Autentifikatsiya/server qoidalarini tekshiring. Remote yangilangan bo‘lsa `devship` ni qayta bajaring; yangi o‘zgarishlar merge qilinadi. |
| `LOCK` | `ds doctor` bilan tekshiring va boshqa DevShip tugashini kuting. V2 o‘z hostidagi tasdiqlangan o‘lik lockni tiklaydi. Faol, legacy yoki egasi noma’lum lockni jarayon/PIDni tekshirmasdan o‘chirmang. |
| `TASKS_SETUP` | `ds setup` bilan shu loyiha uchun npm/pnpm/yarn tanlang. Lockfilelar o‘chirilmaydi. |
| `UPDATE` | Global npm prefix, internet va public GitHub Release assetlarini tekshiring. Tiklash tasdiqlanmasa xabar ko‘rsatgan zaxirani o‘rnating. |

Konfliktda DevShip **push qilmasdan to‘xtaydi** va quyidagilarni chiqaradi:

- joriy, qabul qiluvchi branch va kirib kelayotgan branch (`origin/main` yoki masofadagi feature branch);
- har ikki tomonning commit IDsi;
- barcha konfliktli fayllar va konflikt turi: ikki tomonda o‘zgargan, qo‘shilgan, o‘chirilgan va boshqalar;
- matnli faylda markerlar bo‘lsa, konflikt bloklarining qatorlari;
- shu faylga har bir tomon tarixida oxirgi tegishli commit muallifi, emaili, sana va commit IDsi.

Muallif Git commit metadatasidan olinadi. Bu branch egasini yoki aynan konflikt qatorini yozgan odamni alohida tasdiqlamaydi. Qaysi muallifni ko‘rsatayotgani xabarda aniq yoziladi. Binary, rename/o‘chirish yoki marker yo‘q holatda qator raqami taxmin qilinmaydi.

To‘liq strukturali nusxa `.git/devship-conflicts/<vaqt>-<id>.json` ichida saqlanadi; terminal aniq manzilni ko‘rsatadi. Hisobotda fayl mazmuni bo‘lmaydi. Hisobotni diskka yozish xato bersa ham ma’lumot terminalda chiqadi va push bloklanadi. Avvalgi Git chiqishining stdout/stderr ma’lumoti ham ko‘rsatiladi. Hisobotlar har bir working tree’ning Git metadata papkasida saqlanadi, odatiy ish papkasida stage qilinmaydi.

Konfliktni ko‘rib chiqish uchun:

```text
git status
```

Fayllardagi konfliktlarni muharrirda hal qiling, keyin faqat tuzatilgan fayllarni aniq nom bilan stage qiling:

```text
git add -- "TUZATILGAN_FAYL"
git commit
devship
```

Merge’ni bekor qilishni xohlasangiz `git merge --abort` ni **o‘zingiz** bajaring. DevShip buning uchun avtomatik rollback qilmaydi. Oxirgi tekshiruv yoki fetch/push xatosida lokal commitlar saqlanadi; keyingi ishga tushirishda bo‘sh takror commit yaratilmaydi. Ayrim fayllar stage bo‘lib ulgurib `git add`/commit xato qilsa stage ham saqlanadi — avval `git status` ni ko‘ring.

## Chegaralar

Faqat o‘zingiz ishonadigan loyihada ishlating. Build/test, Maven/Gradle wrapperlari, package scriptlari, Git hooklari va custom merge/filter driverlari kod bajaradi; DevShip ularni sandbox qilmaydi. Ular tashqi xizmatga murojaat qilishi yoki o‘z side effectlariga ega bo‘lishi mumkin. Timeout child jarayonni to‘xtatishga urinadi; uning mustaqil davom etadigan barcha child jarayonlarini boshqarish kafolatlanmaydi.

Secret scanner keng tarqalgan formatlar uchun qo‘shimcha himoya; barcha sirlarni aniqlash kafolati yo‘q. Base va remote feature tarixida oldindan bor kontent to‘liq audit qilinmaydi. Ignore qilingan fayllar commitga olinmaydi. Binary fayllar ham limit doirasida bayt/matn belgilariga tekshiriladi, shifrlangan/arxivlangan kontent ochilmaydi. Symlink va katta yangi bloblar uchun qo‘lda tekshiruv kerak. Noaniq topilmalar ham bloklashi mumkin.

`assume-unchanged` yoki `skip-worktree` belgilari mavjud repo avtomatik yuborilmaydi: ular diskdagi va commitdagi nusxaning farqini yashiradi. Shu sababli odatiy sparse checkout ham qo‘lda boshqariladi.

DevShip lock’i boshqa DevShip ishga tushishlarini to‘xtatadi. Oddiy muharrir yoki boshqa Git jarayonlarini qulflamaydi; asosiy bosqichlarda snapshot/HEAD tekshiruvlari bor, ammo hamkor jarayonlar bilan atomar tranzaksiya emas. Server branch protection qoidalarini oldindan hammasini bilib bo‘lmaydi; server yakuniy pushni rad etishi mumkin. Git autentifikatsiyasi terminal promptisiz oldindan ishlaydigan bo‘lsin. Commit signing/hook uchun interaktiv dastur talab qilinsa mos vaqt limitida xato bilan to‘xtashi mumkin.

## Testlar va paketlash

Manba papkasida:

```text
npm test
npm run check
npm pack
```

Testlar haqiqiy vaqtinchalik repo va lokal bare remote yaratadi; internet talab qilmaydi. Har bir fixture alohida papkada, test fayllari parallel bajariladi. Test fixture’lari o‘chiriladi. `DEVSHIP_TEST_TMP` bilan mavjud vaqtinchalik papkani tanlash mumkin. Windows sandbox Git/MSYS jarayonini bloklasa testlarni oddiy terminalda ishlating. CI `.github/workflows/ci.yml` da Windows/macOS/Linux va Node 22/24 matritsasini beradi; CI bajarilgani avtomatik da’vo qilinmaydi. Tekshiruvning haqiqiy natijasi [docs/VERIFICATION.md](docs/VERIFICATION.md) da.

Paket nomi `devship-cli-local`, terminal buyrug‘i `devship`. `private: true` tasodifiy registry publishni bloklaydi; lokal install/pack ishlaydi.

Texnik asos: [Git push](https://git-scm.com/docs/git-push), [Git merge](https://git-scm.com/docs/git-merge), [Git fetch](https://git-scm.com/docs/git-fetch), [Node child_process](https://nodejs.org/api/child_process.html). MIT litsenziya.
