# Har kuni 18:00 da qilingan ishlar hisoboti

Bir marta yangilang va yoqing:

```powershell
ds.cmd update
ds.cmd reports setup
ds.cmd reports status
```

Telegram guruhi avval `ds.cmd telegram setup` bilan ulangan bo‘lishi kerak. Keyin istalgan loyihangiz ichida odatdagidek `ds.cmd` ishlating. Faqat muvaffaqiyatli pushdan keyin yangi ish yoziladi; har bir loyiha va branch alohida saqlanadi. Loyiha yoki backend fayllari hisobot sozlash uchun o‘zgartirilmaydi.

## Hisobot matni

```text
20.10.2026  #Qilingan-ishlar

Navoiyazot frontend — Yusuf
1. Monitoring sahifasi yangilandi.
2. Yuklash: qop tanlash oynasi tartiblandi.

Kimyosanoat frontend — Yusuf
3. Savdo sahifasi yangilandi.
```

Bu faqat namuna. Avtomatik matn o‘zgargan sahifadan olinadi. Dastur sahifada qanday xususiyat yaratilganini ishonchli bilmasa taxmin qilmaydi. Aniqroq ish nomini pushga qo‘shishingiz mumkin:

```powershell
ds.cmd --work "Monitoring: foydalanuvchi kirish huquqlari tartiblandi" --work "Savdo: mahsulot tanlash oynasi yaxshilandi"
```

`--work` ixtiyoriy. Umumiy commit matnlari yoki inglizcha texnik commitlar avtomatik ravishda ish hisobotiga ko‘chirilmaydi. Test, build, tekshiruv, lockfile/config-only va API xizmatlari/endpointlari hisobga olinmaydi. Source kod, maxfiy kalit, API yo‘li yoki tekshiruv logi yuborilmaydi. `main` va allaqachon remote feature’da mavjud commitlar siz bajargan yangi ish sifatida olinmaydi.

## Vaqt va noutbuk o‘chishi

- Vaqt: **18:00, Asia/Tashkent**. OS vazifasi har daqiqada muddatni tekshiradi; ishlayotgan OS va internet kerak, bu real-time yetkazish kafolati emas.
- Hisobot davri oldingi 18:00 dan bugungi 18:00 gacha. 18:00 dan keyingi push keyingi kun hisobotiga tushadi.
- Noutbuk o‘chiq yoki foydalanuvchi chiqib ketgan bo‘lsa keyingi kirishda o‘tgan kunlar o‘z sanasi bilan yuboriladi. Uyqudan qaytishdagi keyingi scheduler tekshiruvi ham qolgan ishni yuboradi.
- Ish bo‘lmagan kunda bo‘sh xabar yuborilmaydi. Faqat shu noutbukdagi shu foydalanuvchi orqali DevShip bilan qilingan pushlar yig‘iladi.
- Kam uchraydigan kech yozuv avvalgi hisobotni takrorlamasdan o‘sha sanaga qo‘shimcha xabar sifatida yetkaziladi.

## Ko‘rish, to‘xtatish, xatodan tiklash

```powershell
ds.cmd reports preview
ds.cmd reports status
ds.cmd reports disable
```

Preview guruhga yubormaydi. Sozlama global foydalanuvchi katalogidagi `reports/` ichida saqlanadi; Git loyihalariga qo‘shilmaydi. Disable saqlangan ishlarni o‘chirmaydi.

18:00 gacha `ds.cmd reports edit` bilan band matnini o‘zgartirish yoki bir loyiha/branchdagi takror bandlarni birlashtirish mumkin. `1` bandni tanlaydi, `1,2` birlashtiradi, Enter tugatadi. Asl push yozuvlari saqlanadi; yuborishga tayyorlangan hisobot tahrirlanmaydi. [Batafsil yo‘riqnoma](REVIEW-TOOLS.md).

Aniq Telegram rad javobidan keyin keyingi urinish mumkin. Tarmoq uzilishi sababli xabar yetib borgani noaniq bo‘lsa avtomatik takror yuborish to‘xtatiladi. Guruhni tekshirib, kerak bo‘lsa takror ehtimolini aniq tasdiqlang:

```powershell
ds.cmd reports retry 2026-10-20 --allow-duplicate
```

`--allow-duplicate` xabar ikki marta chiqishi mumkinligini qabul qiladi. Mavjud tasdiqlangan bo‘laklar qayta yuborilmaydi. Eski guruh/topikka tayyorlangan hisobot boshqa guruhga jim yo‘naltirilmaydi.

Push oldidan lokal checkpoint yoziladi. Push tasdiqlanib, yakuniy journalga yozish xato bersa keyingi tekshiruv tasdiqlangan remote holatidan uni tiklaydi. Push umuman rad etilgan bo‘lsa ish hisoboti yuborilmaydi. Agar push tasdig‘i ham diskka yozilmagan bo‘lsa uning tarixiy vaqtini taxmin qilmaydi: remote’da aynan shu commit tasdiqlangan vaqtdan hisoblaydi; remote oldinga ketgan bo‘lsa avtomatik tarixiy muvaffaqiyat aytmaydi.

## Boshqa noutbuklar

Har bir foydalanuvchi `ds update`, Telegram setup va `ds reports setup`ni o‘z profilida bir marta bajaradi. Jadval va token joriy OS foydalanuvchisiga tegishli. Administrator yoki alohida server odatda kerak emas; korporativ OS jadval siyosati bloklasa setup aniq xato beradi va hisobot yoqilgan deb aytmaydi. macOS uchun LaunchAgent, Linux uchun ishlayotgan systemd user manager kerak.

Platforma ma’lumotlari: [Microsoft Task Scheduler](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-schema), [Apple launchd](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html), [systemd timer](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html).
