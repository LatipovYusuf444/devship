# 2.2.0 — push xulosasi, MR matni va hisobot tahriri

Foydalanuvchi uchta imkoniyatni qo‘shishni tanladi. Mavjud main→feature merge, checks, feature-only push va 18:00 hisoboti saqlanadi.

## Push oldidagi xulosa

Fetchdan keyin, mergetan oldin Git ref OIDlari snapshot qilinadi. Own qism base va remote feature’da yo‘q yangi lokal commitlaridagi noyob fayl yo‘llari; oldin main’dan olingan commitlar own hisoblanmaydi. Merge commitlarining combined diffi faqat ikki parentdan ham farqlanadigan qo‘lda yechim yo‘llarini qo‘shadi; toza kiruvchi fayllarni lokal ish deb olmaydi. Incoming main va remote feature qismlari tegishli merge-base’dan kelayotgan diffdir. Yo‘llar bir nechta qismda bo‘lishi mumkin, shuning uchun sonlar umumiy total sifatida qo‘shilmaydi; overlap alohida ko‘rsatiladi va konflikt deb va’da qilinmaydi. Criss-cross/no common ancestor holatida aniq son yo‘q deb aytiladi, merge odatdagi Git qaroriga qoladi.

Sahifa xulosalari konservativ o‘zbekcha; aniq vazifa uchun mavjud --work ishlatiladi. Dry-run faqat cached ref va pending yo‘llarni ishlatadi, fetch/commit/lock/write qilmaydi va remote yangiligi noma’lumligini bildiradi. Terminal maxfiy qiymatlarni redakt qiladi.

## MR draft

Faqat yangi muvaffaqiyatli pushdan keyin oxirgi merged base va published HEAD orasidagi butun branch diffidan title/description tayyorlanadi. Oldingi feature pushlar ham MR scope’da qoladi; main-only diff qo‘shilmaydi. Tekshiruv natijalari faqat shu muvaffaqiyatli run’dan yoziladi. Lokal draft global user storage’da canonical repo+remote hash+branchga bog‘lanadi. `ds mr` oxirgi draftni ko‘rsatadi; local HEAD boshqa bo‘lsa stale deb aytadi.

GitLab HTTPS/SSH remotedan credentialsiz brauzer manzili va URL-encoded new-MR form havolasi olinadi. MR serverda avtomatik yaratilmaydi, token talab qilinmaydi. Boshqa remote uchun ham lokal matn tayyorlanadi, GitLab havolasi taxmin qilinmaydi. Draft saqlash xatosi confirmed pushni qayta push qildirmaydi.

## Hisobot tahriri

`ds reports edit [YYYY-MM-DD]` yuborish muddati kelmagan yozuvlarni loyiha va branch bilan raqamlaydi. Bitta raqam matnni o‘zgartiradi, `1,2` kabi tanlov bir loyihadagi bandlarni bitta matnga birlashtiradi. Turli loyiha/branch/recipientlarni birlashtirish rad etiladi. Asl eventlar o‘zgarmaydi; alohida edit overlay atomic saqlanadi.

Overlay source IDs har bir event+itemga tegishli: keyingi pushdagi o‘sha umumiy sahifa matni eski aniq vazifa nomiga noto‘g‘ri aylantirilmaydi. Prompt davomida global lock ushlanmaydi; saqlashda delivery lock, revision va cutoff tekshiriladi. Parallel yangi push yoki scheduler sabab snapshot eskirsa saqlash rad etilib qayta ko‘rish so‘raladi. Prepared/sent/uncertain delivery batch hech qachon jim o‘zgartirilmaydi. Preview va delivery bir xil projectiondan foydalanadi.

## Sinov/release

Avval uch modulning regressiyalari RED, keyin implementatsiya. Fixture Git tarixlarida main attribution, remote divergence, overlap, dry-run va postpush MR scope tekshiriladi. Editlarda same-name repo, cross-project merge, cutoff, stale revision, frozen receipt, secrets/API, future push va actual fake delivery tekshiriladi. Full suite, mustaqil ko‘rik va Windows/macOS/Linux×Node22/24 CI’dan keyin 2.2.0 release o‘rnatiladi; mavjud token, hisobot journal va scheduler sozlamalari saqlanadi. Jonli loyiha pushi yoki MR yaratish sinov uchun bajarilmaydi.
