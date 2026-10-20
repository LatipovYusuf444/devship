# Tekshiruv natijalari — DevShip 2.0.0

Sana: 2026-10-19, Asia/Tashkent. Mahalliy muhit: Windows, Node.js v24.20.0, Git 2.55.0.windows.5. Git integratsiya sinovlari faqat vaqtinchalik working repo va bare remote ishlatadi. Haqiqiy foydalanuvchi loyihalarida build/commit/push bajarilmadi. Telegram sinovlari soxta transport bilan; jonli guruhga xabar yuborilmadi.

## Testlar

Dastlabki to‘liq run 105/105 o‘tdi (201.784 soniya). Mustaqil ko‘rik topgan holatlar avval yiqilgan regressiyalarda ko‘rsatilib tuzatildi. Yakuniy to‘liq natija test-results.txt ichida saqlanadi.

Yangi sinovlar: bir nechta lockfile uchun aniq menejer tanlash va fingerprint; loyiha fayllarini o‘zgartirmaslik; terminal prompt redraw va yashirin token; readonly doctor va linked-worktree umumiy lock; faol/noma’lum/chetdagi lockni saqlash va tasdiqlangan o‘lik lockni tiklash; Telegram migratsiyasi va recipient/topicga bog‘langan retry; yangilanish manbasi, SHA256/hajm, xavfli redirect, oversized javob, arxiv traversal/link/alias, ortiqcha global bin/dependency, lokal/npx paketni yangilamaslik, flagga o‘xshash commit matni lockni chetlab o‘tmasligi, rollback holati.

Avvalgi himoyalar ham qamralgan: faqat feature push, main/feature incoming merge, remote divergence, konflikt diagnostikasi, partial staging, index va tarixdagi secret scan, hidden index flags, o‘chirish/rename, checks/hooks rad etishi, clean tree, both/final checks, Telegram outbox/checkpointlar. Diagnostika va secret aniqlash heuristik bo‘lib qoladi.

## Haqiqiy npm sinovi

Updater testida npm alohida vaqtinchalik global prefixga haqiqiy arxiv o‘rnatdi va tasdiqlangan lokal candidate orqali versiyani yangiladi. Tarmoq transporti soxta, npm haqiqiy.

Qo‘shimcha self-update smoke’da haqiqiy o‘rnatilgan ds.cmd shimidan update bajarildi: 2.0.0 → faqat sinov uchun tayyorlangan 2.0.1. npm global prefix o‘z sozlamasi orqali aniqlandi, backup/manifest/arxiv/installer bajarildi; keyingi shim --version 2.0.1 qaytardi. Jonli GitHub/Telegramga chiqilmadi va foydalanuvchining global o‘rnatishi o‘zgarmadi. Log: self-update-smoke.txt.

## Mustaqil ko‘rik

Uchta Important topilma tuzatildi: lokal dependency’ni global deb qabul qilish; raw argv ichidagi commit matni gate’ni chetlab o‘tishi; arxivdagi path aliaslari. Doctor common-dir/installation gate diagnostikasi ham tuzatildi; faqat ikkita bin va dependency’siz paket talabi mustahkamlandi. Rollback muvaffaqiyati eski metadata haqiqatan qaytganidan keyin aytiladi. Tuzatishlar regressiya testlarida tekshirildi.

Chegara: bu ko‘rik OS yoki GitHub akkaunti buzilgan holatdan himoya kafolati emas. SHA256 mustaqil imzo emas. Boshqa OS foydalanuvchilari yoki v1 CLI jarayonlari v2 foydalanuvchi lockida qatnashmaydi. O‘chirilgan laptopda fon bildirishnomasi yo‘q.

## Platformalar

Mahalliy amaliy sinov Windows/Node 24’da bajarildi. CI va reliz workflow Windows/macOS/Linux × Node 22/24 matritsasini tekshiradi. Haqiqiy natijalar: https://github.com/LatipovYusuf444/devship/actions. Ushbu lokal log o‘zi boshqa platformada bajarilganini anglatmaydi. Haqiqiy Java toolchain va har bir yarn/pnpm versiyasining runtime sinovi bu hostda bajarilmagan; task aniqlash/argv sinovlari mavjud. Huquqi yetmaydigan global prefix va OS tomonidan uzilgan npm rollback holati foydalanuvchi tuzatishini talab qilishi mumkin.

Reliz assetlari va public o‘rnatish alohida chiqarish bosqichida tekshiriladi. Secrets/global sozlamalar, foydalanuvchi loyiha fayllari va Telegram outbox source/release tarkibiga kiritilmaydi.

Yakuniy to‘liq suite: 114/114 PASS, fail 0, skip 0, exit 0, 220.210 soniya.

## 2.0.1 — published-blob regression

Merge commitni har bir parentga nisbatan skanlash oldindan base’da bor kontentni ham yangi deb qayta tekshirayotgani real holatda aniqlandi. Bir xil path+mode+blob uchun nashr qilingan baseline istisnosi qo‘shildi. Symlink/path tekshiruvi undan oldin ishlaydi, istisno verifiedBlobs keshiga yozilmaydi va baseline OIDlari har bir scan boshida qotiriladi.

Ijobiy regressiya oldin SECRET bilan yiqildi, tuzatishdan keyin feature push bilan o‘tdi. Yangi manzilga ko‘chirilgan bir xil blob va o‘sha manzildagi boshqa kalit bloklanishi ham tekshirildi. Mavjud performance/cache testlari bilan maqsadli 10/10 test o‘tdi. Main merge va xatoda pushni to‘xtatish tartibi saqlangan.

Mustaqil read-only ko‘rikda Important/Critical nuqson topilmadi. Kichik tavsiya: remote-feature baseline, fayl mode o‘zgarishi va oldindan nashr qilingan taqiqlangan path uchun alohida regressiyalar qamrovni oshirishi mumkin; ushbu qo‘shimcha qamrov keyinga qoldirildi, aniqlangan funksional nuqson yo‘q.

2.0.1 yakuniy to‘liq suite: 117/117 PASS, fail 0, skip 0, exit 0, 300.429 soniya.

## 2.1.0 — daily work reports

Final local suite: 141/141 PASS, fail 0, skip 0. Exact output: test-results.txt. Added daily time/window, missing-day catch-up, technical/API/secret filtering, root/unknown pages, own-vs-main commits, failed/no-op/dry-run push, durable journal recovery, rejected intent retirement, completion-day and recipient snapshot consistency, same-name repo isolation, event batch dedup, concurrent delivery, long Unicode chunks, retry date scoping and command exit status regressions.

Independent focused reviewers found Important lifecycle/summary/command issues; each was fixed and covered by regressions. Final re-review found no remaining Important/Critical issue. The normal-vs-recovered snapshot test now verifies a fresh normal write as well.

Actual Windows hidden runner smoke: exact argv/config preserved with spaces, apostrophe, dollar, percent and ampersand in paths; child exit7 propagated. Windows Task Scheduler service accepted TASK_VALIDATE_ONLY; no test task registered. Native Windows live activation is a separate install-time verification. macOS/Linux manifests are tested; their native service execution is not claimed on this host.

OS schedulers are user-scoped, optional and server-free. Credentials remain in existing external Telegram storage; package/source contain no Telegram settings, report journals or private application files. Network delivery tests use fake transport. No fabricated live work report was sent.

## 2.2.0 — summaries, MR drafts and report editing

Final local suite: 157/157 PASS, 0 failures, 0 skips; exact output in test-results.txt. Added real-Git coverage for separate incoming main/remote feature changes, previously pulled main exclusions, overlap semantics, unpublished manual merge resolutions, dry-run immutability, full-branch MR diff and repository isolation. MR draft disk failure never repeats a successful push; no-op and failing checks create no draft. GitLab HTTPS/SCP/SSH URLs preserve encoded fields without credentials.

Report regressions verify immutable original events, edit/merge projection consistency between preview and delivery, scope boundaries, stale revisions, forbidden technical text, cutoff expiry during typing, frozen prepared batches, source-bound future pushes and late event supplementary delivery. Interactive prompts hold no delivery lock. Network tests use fake Telegram transports; no fabricated report or actual app MR was created.

Independent review found one Important issue: manual resolution-only merge work was omitted. An observed failing regression preceded the combined-diff fix, the regression passed, and independent re-review found no remaining Important/Critical issues. Main application source repositories were not changed for these features. Native scheduled reporting continues to use the existing user task and external store.
