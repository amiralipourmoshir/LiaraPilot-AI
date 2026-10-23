# ردیابی معیارهای مسابقه

امتیاز تضمین نمی‌شود. جدول ابتدایی وضعیت برنامه‌ریزی فاز ۱ است؛ بخش‌های اجرایی در انتهای سند وضعیت جاری را ثبت می‌کنند. وضعیت «طراحی‌شده» معادل پیاده‌سازی یا عبور تست نیست. جزئیات هر معیار با پیشرفت کار به مسیر فایل و نام تست واقعی وصل می‌شود.

| محور | معیار | سند/فایل فعلی | تست پذیرش برنامه‌ریزی‌شده | بخش دمو | وضعیت |
|---|---|---|---|---|---|
| اتصال لیارا، ۱۰۰ | قابلیت رسمی و قراردادها | API_CAPABILITIES.md/.json، references/*.yaml | inventory قابل بازتولید؛ سپس contract/error tests | اتصال | کشف مستند انجام شد؛ Live تأیید نشده |
| اتصال لیارا | اعتبار اتصال، سرویس، لاگ، metrics | ARCHITECTURE.md | معتبر/نامعتبر، timeout، 401، 429، malformed، unsupported | داشبورد | فقط طراحی |
| اتصال لیارا | تحلیل GitHub و انتشار | ARCHITECTURE.md | missing env، build failure، duplicate، cancellation، expiration، verification failure | دقیقه ۰:۳۰ تا ۲:۴۵ | فقط طراحی |
| هوشمندی، ۱۰۰ | provider، ابزار و گفتگو | ARCHITECTURE.md | schema، محدودیت گام، حفظ گفتگو، failure recovery | تحلیل پروژه | فقط طراحی |
| هوشمندی | تشخیص مبتنی بر شواهد | UX_BLUEPRINT.md | DB/HTTP500، OOM، env، port، insufficient evidence | دقیقه ۲:۴۵ تا ۴:۳۰ | فقط طراحی |
| هوشمندی | اصلاح و بازیابی | SECURITY.md | اصلاح موفق/ناموفق و مقایسه شواهد | دقیقه ۴:۳۰ تا ۵ | فقط طراحی |
| تجربه کاربری، ۵۰ | فارسی، RTL، تم و واکنش‌گرایی | UX_BLUEPRINT.md | ۳۶۰/۷۶۸/۱۴۴۰، ترکیب زبان، dark/light | تمام مسیر | فقط طراحی |
| تجربه کاربری | approval، state، navigation، streaming | UX_BLUEPRINT.md | keyboard، empty/loading/error، refresh/reconnect | انتشار و رخداد | فقط طراحی |
| امنیت و پایداری، ۵۰ | ownership، secrets، approval و audit | SECURITY.md، DATA_MODEL.md | IDOR، replay، parameter change، secret exposure | تأیید عملیات | فقط طراحی |
| امنیت و پایداری | SSRF، repo و injection | SECURITY.md | private IP، redirects/rebinding، unsafe archive، malicious README/log | سناریوی منفی | فقط طراحی |
| امنیت و پایداری | worker و پایش ماندگار | ARCHITECTURE.md | crash/reconcile، outbox retry، dedup، health thresholds | بازیابی | فقط طراحی |

## ردیابی افزوده‌شده در فاز ۲

| معیار پایه | فایل اجرایی | تست واقعی | وضعیت |
|---|---|---|---|
| احراز هویت و نشست | apps/api/src/app.ts، packages/security/src/auth.ts | tests/api.test.ts و tests/security.test.ts | اجرا و تست شده |
| مالکیت پروژه و عملیات | apps/api/src/app.ts، prisma/schema.prisma | API جداسازی کاربر و FK مرکب در tests/jobs.test.ts | اجرا و تست شده |
| دوام کار و idempotency | packages/jobs/src/index.ts، apps/worker/src/main.ts | tests/jobs.test.ts و تست هم‌زمانی API | اجرا و تست شده برای بررسی محلی |
| RTL، فونت و دو تم | apps/web/src/styles.css، lib/theme.ts، components/common.tsx | typecheck/build و تطبیق SHA فونت؛ بازبینی مرورگر انجام نشده | پیاده‌شده؛ تأیید بصری در انتظار |
| API مستند و راه‌اندازی | API_FOUNDATION.md، DEPLOYMENT.md، OpenAPI | تست OpenAPI و readiness از build | بررسی شده؛ Compose اجرا نشده |

مسیر محلی زیرساخت هیچ امتیازی برای deployment زنده یا تشخیص هوشمند محسوب نمی‌شود؛ آن‌ها هنوز پیاده نشده‌اند.

## ردیابی افزوده‌شده در فاز ۳

| معیار | فایل‌ها | بررسی انجام‌شده | وضعیت |
|---|---|---|---|
| هویت ایجنت و انسجام بصری | public/brand، components/mascot.tsx، design/BRAND.md | مشاهده خروجی تصویر، alpha/hash، استفاده مشترک در UI | پیاده‌شده |
| RTL، فونت و تم | workspace.css، styles.css، lib/theme.ts | تغییر و ماندگاری تم در DOM، typecheck، کنتراست توکن | پیاده‌شده؛ بازبینی تصویری انجام نشده |
| داشبورد و پروژه | overview.tsx، projects.tsx، project-card.tsx | جریان رفت‌وبرگشت و فیلتر پروژه در workspace.test.tsx | UI دمو پیاده‌شده |
| دستیار و شواهد | assistant.tsx، demo/assistant.ts، monitoring.tsx | پاسخ ثابت، ارجاع evidence، StrictMode/stop | پیش‌نمایش؛ مدل واقعی نیست |
| حالت‌ها و ناوبری | workspace-shell.tsx، primitives.tsx | جستجو، dialog/focus، empty/error/retry، جداسازی محیط | رفتار DOM بررسی شده |
| پایش/لاگ/تاریخچه | monitoring.tsx، operations.tsx، demo/data.ts | fixture integrity، فیلتر لاگ، سناریوی شکست | UI نمایشی؛ داده زنده نیست |

این فاز امتیاز اتصال یا اجرای زیرساخت زنده را کامل نمی‌کند. نمایش نمودار نمونه و تشخیص سناریویی جای تست adapter، LLM یا remediation واقعی نیست.

## وضعیت اجرایی فاز ۴

خواندن‌های لیارا و ذخیره رمز‌شده credential در فاز ۴ پیاده و با fixture تست شده‌اند؛ تأیید زنده و عملیات deployment باقی‌اند. شواهد: reports/PHASE_4.md و LIARA_INTEGRATION.md.

## وضعیت اجرایی فاز ۵

ماندگاری گفتگو، abstraction مدل، رجیستری ابزار، برنامه‌ریزی، تأیید متصل به پارامتر/اتصال/مقصد مدل و تحلیل مبتنی بر evidence ID پیاده و fixture-tested هستند. صحت تشخیص زنده بدون کلید مدل/لیارا تأیید نشده است. شواهد در reports/PHASE_5.md و AI_ASSISTANT.md.

## وضعیت اجرایی فاز ۶

معیارهای provider/گفتگو/ابزار و UI اکنون پیاده و تست شده‌اند؛ Sol/Luna پاسخ واقعی ثبت کردند، Astra 402 دارد. تحلیل GitHub و مسیر انتشار Node/Express با تأیید، صف واقعی و verification fixture پیاده شده‌اند؛ انتشار احراز‌شده PaaS هنوز تأیید نشده و امتیاز آن ادعا نمی‌شود. SSE انتشار و refresh بررسی شده‌اند؛ پایش مداوم/incident/remediation در فاز ۷ باقی‌اند. گزارش جاری reports/PHASE_6.md و TESTING.md مرجع وضعیت است.
