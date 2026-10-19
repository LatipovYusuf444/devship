DevShip 2.0.0

- Bir marta global o‘rnatish; Windows’da `ds.cmd`, macOS/Linux’da `ds`.
- GitHub Releases yangilanish xabari va `ds update`: alohida tgz yuklab olish shart emas.
- `ds setup`: bir nechta lockfile bo‘lsa paket menejerini aniq tanlash; loyiha fayllari o‘zgarmaydi.
- `ds doctor`: loyiha tayyorligini Git amallarisiz tekshirish.
- Telegram tokenini yashirin kiritish, saqlangan tokenni qayta ishlatish, `ds telegram health` va tasdiqlangan guruh ko‘chishini tuzatish.
- Yangi formatdagi o‘lik locklarni ehtiyotkor tiklash; faol/noma’lum locklar saqlanadi.

Xatoda push to‘xtaydi. Konfliktlar avtomatik hal qilinmaydi. Faqat joriy feature branch push qilinadi; main joriy branchga olib kelinadi. Force push/reset/clean/stash qo‘llanmaydi.

Node.js 22+, npm va Git 2.30+ kerak. Loyihaning build/test vositalari va bog‘liqliklari oldindan o‘rnatilgan bo‘lsin. Boshqa kompyuterda Telegram bir marta alohida sozlanadi; token release ichiga kirmaydi.
