# Push xulosasi, MR matni va hisobot tahriri

## Oddiy push

```powershell
ds.cmd
```

Fetchdan keyin, merge boshlanishidan oldin uchta alohida manba chiqadi:

```text
Pushdan oldingi xulosa
Sizning yangi lokal ishlaringiz: 5 fayl
  • Monitoring sahifasi yangilandi.
origin/Yusuf dan keladigan: 0 fayl
origin/main dan keladigan: 12 fayl
  • Ombor sahifasi yangilandi.
```

Bu namuna; haqiqiy son Git tarixidan hisoblanadi. Lokal qism remote feature va main’da mavjud commitlarni chiqarib tashlaydi. Kiruvchi qism umumiy ajdoddan kiruvchi branchgacha o‘zgargan fayllarni sanaydi. Bir fayl ikki tomonda o‘zgarsa alohida belgilanadi; bu hali konflikt degani emas. Bo‘limlar sonini qo‘shib jami deb olmang. `--dry-run` faqat lokal keshdan hisoblaydi, fetch bajarmaydi va shu cheklovni yozadi.

Sahifa nomidan aniq biznes vazifa taxmin qilinmaydi. Aniqroq qisqa nomni o‘zingiz bersangiz, kundalik hisobot va MR tavsifiga kiradi:

```powershell
ds.cmd --work "Monitoring: foydalanuvchi kirish huquqlari tartiblandi"
```

## GitLab Merge Request matni

Muvaffaqiyatli yangi pushdan keyin sarlavha va tavsif avtomatik saqlanadi. Ularni shu loyiha va branch ichida ko‘ring:

```powershell
ds.cmd mr
```

Matn `main` bilan feature branchning jami farqini qamraydi; faqat oxirgi push emas. Qisqa sahifa tavsifi, fayllar soni, source/target branch va muvaffaqiyatli tugagan tekshiruvlar soni chiqadi. Keyin lokal HEAD o‘zgarsa, matn oldingi pushga tegishli ekani aytiladi. Matnni ko‘rib, aniq vazifa bilan to‘ldiring.

Manzili GitLab ekanini bildiradigan hostlarda (`gitlab.com`, `gitlab.company.uz` kabi) oldindan to‘ldirilgan MR havolasi ham beriladi. Boshqa nomli self-hosted GitLab yoki boshqa Git serverida sarlavha/tavsifni qo‘lda nusxalang. SSH port veb port deb olinmaydi; HTTPS remote’dagi port saqlanadi. Remote login/paroli havola yoki saqlangan matnga kiritilmaydi.

Buyruq MRni serverda avtomatik yaratmaydi va main’ga push qilmaydi. Havolada matnni tekshirib, yaratishni GitLab’da o‘zingiz yakunlaysiz. Xato yoki no-op pushdan yangi MR matni yaratilmaydi. Matnni saqlashdagi disk xatosi tasdiqlangan pushni takrorlamaydi.

## Soat 18:00 gacha hisobotni tahrirlash

```powershell
ds.cmd reports preview
ds.cmd reports edit
```

`edit` yaqinlashayotgan hisobot kunini ochadi. Ro‘yxatdagi `1` raqamini yozib, o‘sha band matnini almashtiring. `1,2` yozib, bir loyiha/branch/guruhdagi ikki bandni bitta matnga birlashtiring. Yangi qisqa matnni kiriting; tugatish uchun raqam so‘ralganda Enter bosing.

Aniq kun kerak bo‘lsa:

```powershell
ds.cmd reports edit 2026-10-20
```

Faqat yig‘ilgan ishlarni tahrirlash mumkin. API yo‘li, buyruq, maxfiy qiymat va tekshiruv logi qabul qilinmaydi. Tahrir global foydalanuvchi katalogida alohida saqlanadi; asl push hodisalari va loyiha fayllari o‘zgarmaydi. Keyingi pushdagi shu sahifaga oid yangi ish avvalgi aniq matnga jim qo‘shib yuborilmaydi.

Soat 18:00 kelgan, yuborishga tayyorlangan yoki yuborilgan hisobot muzlatiladi. Tahrir paytida yangi push qo‘shilsa, eskirgan ro‘yxat ustidan saqlash rad etiladi: buyruqni qayta oching. Matn yozayotgan paytingizda yetkazish xizmati bloklanmaydi. `preview` va Telegram bir xil tahrirlangan matndan foydalanadi.

Mavjud Telegram guruhi, 18:00 jadvali va noutbuk yoqilganda qolgan hisobotlarni yuborish tartibi saqlanadi. Yangilash uchun boshqa noutbuklarda `ds.cmd update` ishlatiladi.
