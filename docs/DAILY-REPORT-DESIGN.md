# Kundalik ishlar hisoboti — 2.1.0

Foydalanuvchi tanlovi: DevShip ishlatilgan barcha loyihalar alohida bo‘limlarda; Asia/Tashkent 18:00; noutbuk o‘chiq bo‘lsa keyingi kirishda yetkazish. Mavjud push, konflikt va Telegram xabarlari saqlanadi.

## Oqim

- Hisobot foydalanuvchi global katalogida, loyiha tashqarisida saqlanadi. Repo identifikatori canonical Git common directory + remote hashidan olinadi; bir xil nomli loyihalar aralashmaydi.
- Faqat yangi muvaffaqiyatli pushlar yoziladi. Hisoblash uchun pushdan oldingi local HEAD olinadi, yangi remote base va remote feature tarixida bor commitlar chiqariladi; merge commitlar hisoblanmaydi. Bu main yangiliklarini shaxsiy bajarilgan ishga qo‘shmaydi.
- Avtomatik matn foydalanuvchi ko‘radigan sahifa/oyna fayllaridan olinadi. Test/build/API/lock/config-only o‘zgarishlar chiqarilmaydi. Mazmun noma’lum bo‘lsa faqat “X sahifasi yangilandi” deyiladi; aniqlanmagan xususiyat bajarildi deb taxmin qilinmaydi. `--work` bilan aniq qisqa ish nomini kiritish mumkin. Ixtiyoriy Git subject til/mazmun kafolati bo‘lmagani uchun xom holida yuborilmaydi.
- Push oldidan durable intent saqlanadi, muvaffaqiyat tasdiqlangach completion vaqti intentda yakunlanadi va shu recipient snapshotdan journal yoziladi; bir xil repo/branch/commit takror yozilmaydi. Yozish muvaffaqiyatsiz bo‘lsa pushni qayta qilmasdan aniq ogohlantirish beriladi; scheduler tasdiqlangan remote commitdan tiklaydi. Aniq rad etilgan intent retired bo‘ladi. Tasdiqsiz intent uchun tarixiy push vaqti taxmin qilinmaydi va remote descendantning o‘zi yetarli tasdiq deb olinmaydi.
- Hisobot oynasi oldingi 18:00 dan hozirgi 18:00 gacha. 18:00 dan keyingi push keyingi hisobotga tushadi. Kechikkan kunlar o‘z sanasi bilan alohida yuboriladi; ish bo‘lmagan kun uchun bo‘sh xabar yuborilmaydi.
- Matn: `20.10.2026  #Qilingan-ishlar`, keyin loyiha/branch sarlavhalari va umumiy raqamlangan qisqa ishlar. Takror matnlar loyiha ichida yig‘iladi. API yo‘li, source diff, credentials, checks yoki loglar yuborilmaydi.
- Xabar Telegram recipient/topicga bog‘lanadi, yuborish global lock va har bir bo‘lak uchun disk checkpoint bilan himoyalanadi. Yetkazilish noaniq bo‘lsa avtomatik qayta yuborilmaydi; qo‘lda tasdiqlangan retry kerak. Aniq rad etilgan xabar keyingi urinishda qayta yuborilishi mumkin. Telegram to‘liq exactly-once kafolat bermaydi.

## Jadval

Codex chatiga bog‘liq bo‘lmasligi va boshqa noutbuklarda ham ishlashi uchun native user scheduler ishlatiladi. Windows Task Scheduler, macOS LaunchAgent va Linux systemd user timer har daqiqada yengil `reports run-due` ishga tushiradi; haqiqiy 18:00 qarori IANA vaqt zonasida CLI tomonidan hisoblanadi. User login/wake catch-up yoqiladi. Administrator yoki server talab qilinmaydi; OS scheduler ruxsati bo‘lmasa setup buni aniq bildiradi. O‘chiq noutbukdan xabar yuborilmaydi.

## Buyruqlar

`ds reports setup`, `status`, `preview`, `run-due`, `disable`; `ds --work "Monitoring: foydalanuvchi kirish huquqlari tartiblandi"`. Setup faqat jadval va global report sozlamasini o‘zgartiradi; loyiha fayllari o‘zgarmaydi. Preview yubormaydi. Sinovlar soxta Telegram transportida bajariladi; ishga tushirishda soxta “qilingan ish” jonli guruhga yuborilmaydi.

## Tekshirish rejasi

Vaqt chegaralari, catch-up, bir xil nomli repo, main-only o‘zgarishlar, dry-run/failure/no-op push, dedup, restart/parallel run, Telegram rad etishi/noaniq yuborish, guruh/topic almashishi, uzun Unicode xabarlar, secret/API/technical-only filtrlari, scheduler argv/XML/plist/unit escaping va setup xatosi alohida regressiyalarda tekshiriladi. Mavjud to‘liq suite ham bajariladi.
