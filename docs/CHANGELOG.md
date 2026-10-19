# O‘zgarishlar

## 2.0.1

Main/feature merge commitlarining barcha parentlariga nisbatan diffida oldindan remote’da bo‘lgan fayllar ham chiqishi hisobga olindi. Tarix skaneri faqat nashr qilingan refdagi aynan bir xil path+mode+blob uchun kontentni qayta yangi sir sifatida skanlamaydi. Yo‘l/symlink himoyasi qoladi; yangi yo‘lga ko‘chirilgan yoki boshqa blobga o‘zgartirilgan kalit bloklanadi. Bu istisno blob skan keshiga qo‘shilmaydi. Remote baseline commit OIDlari scan boshida qotiriladi.

Main joriy feature branchga merge qilinishi va faqat o‘sha branch push qilinishi saqlangan. Umumiy avtomatik konflikt yechish qo‘shilmadi.

## 2.0.0

GitHub Releases tarqatishi, kunlik terminal yangilanish xabari, `ds update check` va checksum/arxiv tekshiradigan `ds update` qo‘shildi. Global paket zaxiralanadi, install xatosida eski versiyani qayta o‘rnatishga uriniladi. Tekshiruv va o‘rnatish davomida boshqa shu foydalanuvchining v2 runlari installation lock orqali cheklanadi. Hech qanday fon xizmati yoki repo ichidagi yangilanish sozlamasi yo‘q.

`ds setup` bir nechta lockfile mavjud loyihada paket menejerini aniq tanlashni tashqi global sozlamaga saqlaydi. Hech bir lockfile o‘chirilmaydi. Typecheck va `test:unit` scriptlari avtomatik aniqlanadi, explicit checks avvalgi kabi ustun. `ds doctor` lokal holatni Git mutatsiyalarisiz chiqaradi.

Terminal prompt redraw xatosi tuzatildi, yashirin token kiritish saqlandi, mavjud tokenni Enter bilan qayta ishlatish mumkin. `ds telegram health` bot a’zoligi/huquqlarini tekshiradi va faqat Telegram tasdiqlagan guruh migratsiyasini tuzatadi. Pending xabar retry’i shu tasdiqlangan ko‘chishni tan oladi; boshqa guruh/topicga yo‘naltirmaydi.

V2 locklar host/PID/ownership token bilan yoziladi; faqat tasdiqlangan o‘lik bir hostdagi lock tiklanadi. Faol, boshqa host yoki legacy lock avtomatik o‘chirilmaydi. Git shipping xavfsizlik tartibi saqlangan.

## 1.4.1

`ds` qisqa buyrug‘i qo‘shildi; Windows’da `ds.cmd`. U `devship` bilan aynan bir entry point va sozlamalardan foydalanadi. Eski buyruq saqlangan; Git, tekshiruv va Telegram ishlash tartibi o‘zgarmagan.

## 1.4.0

`checksMode: "final"` barcha tekshiruvlarni yakuniy merge’dan keyin, pushdan oldin bir marta bajaradi. `both` standart rejimi avvalgi ikkita davrani saqlaydi. Final rejimida check xatosi lokal commitni saqlaydi va pushni to‘xtatadi; konflikt builddan oldin aniqlanadi. Barcha branch, secret, state va push himoyalari saqlangan.

Shu run ichidagi qayta tarix scanida oldin tekshirilgan o‘zgarmas bloblar qayta o‘qilmaydi; path/symlink tekshiruvi keshlanmaydi. Har bir tugagan tekshiruv davomiyligi ko‘rsatiladi. Yetti yangi regressiya testi va nazoratli fixture benchmarki qo‘shildi.

## 1.3.0

Konflikt va operatsion xatolar ham Telegram guruhiga yuboriladi. Xabarda loyiha, branch, vaqt, bosqich, tekshiruv buyrug‘i va tanlangan diagnostika qatorlari mavjud. Konflikt uchun ikkala branch, fayllar, marker qatorlari va Git tarixidagi mualliflar beriladi. Uzun xabar `xato-hisobot.txt` bilan yuboriladi va avvalgi guruh/topicga bog‘langan retry mexanizmi ishlaydi.

Asl xato/exit holati saqlanadi, lock bo‘shatiladi, push davom etmaydi. Dry-run, protected branch yoki lock xatosi xabar yubormaydi. Kod frame’lari va inline dastur argumentlari diagnostikadan chiqariladi; tokenlar yashiriladi. Tekshiruv xatosi stdout va stderr diagnostikasini birga hisobga oladi, shuning uchun oddiy stderr warning haqiqiy stdout xatosini yashirmaydi.

## 1.2.0

Muvaffaqiyatli yangi pushdan keyin Telegram guruhiga loyiha, branch, commitlar, fayllar ro‘yxati va Toshkent vaqti bilan xabar yuborish. Uzun ro‘yxat matn ilovasi bilan yuboriladi. Bir marta yashirin token bilan sozlash, aniq guruh/topicni tasdiqlash, sinov, holat, o‘chirish va qo‘lda qayta yuborish buyruqlari qo‘shildi.

Windows tokeni DPAPI bilan shifrlanadi. Repo ichida credential saqlash rad etiladi; Telegram tokenlari, jumladan API URL ichidagilari ham scan/redaction orqali himoyalanadi. Push natijasidagi aniq branch yangilanishi tekshiriladi: takror push, dry-run, konflikt yoki xatoda xabar yuborilmaydi. Telegram xatosi bajarilgan Git pushni qaytarmaydi va takrorlamaydi.

## 1.1.0

Konfliktda joriy/kiruvchi branchlar, commitlar, konfliktli fayllar, konflikt turi va mavjud matn markerlarining qatorlari chiqariladi. Har ikki tomondagi faylga tegishli oxirgi commit muallifi, emaili va sanasi ko‘rsatiladi. Muallif ma’lumoti Git tarixiga asoslanadi; branch egasi yoki aniq konflikt qatori muallifi deb talqin qilinmaydi.

JSON nusxa `.git/devship-conflicts/` ichida saqlanadi. Hisobot yozilmasa ham terminaldagi ma’lumot chiqadi. Merge xatosi yoki konfliktida DevShip to‘xtaydi va push qilmaydi. Fayllardagi konfliktlarni avtomatik hal qilmaydi.

Yetti regressiya testi qo‘shildi; test fayllari alohida fixture’larda parallel ishlaydi.

## 1.0.0

Bir buyruq orqali build/test aniqlash, tekshirish, xavfsiz stage/commit, main va feature branchlarni merge qilish va faqat joriy branchga push. Protected branchlar, secret scan, partial staging va yashirilgan index flag himoyalari, konfiguratsiya va o‘zbekcha qo‘llanma.
