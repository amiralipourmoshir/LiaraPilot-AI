# بررسی فاز ۲

## اجرای تست

```sh
pnpm test:prepare
pnpm test
pnpm build
```

تست‌ها به PostgreSQL و Redis واقعی محلی نیاز دارند. `test:prepare` فقط روی loopback مجاز است و دیتابیس مستقلی با پسوند `_test` می‌سازد و migration را روی آن اجرا می‌کند؛ credential URL را چاپ نمی‌کند. تست‌ها کاربران fixture با شناسه تصادفی می‌سازند و فقط داده خودشان را پاک می‌کنند. صف آزمون worker نام مستقل دارد و صف برنامه را حذف نمی‌کند.

## نتایج ثبت‌شده در ۲۳ اکتبر ۲۰۲۶

- Vitest: **۳ فایل، ۱۹ تست، همگی موفق**.
- strict TypeScript برای API، worker، بسته‌ها، اسکریپت‌ها و React: موفق.
- Prisma generate و migrate: موفق؛ یک migration واقعی روی دیتابیس برنامه و دیتابیس تست اعمال شده است.
- build رابط، API و worker: موفق؛ routeها به chunkهای مستقل تقسیم شده‌اند.
- اجرای خروجی build API روی پورت موقت 3002 و readiness واقعی PostgreSQL/Redis: HTTP 200، هر دو اتصال برقرار. پردازش موقت پس از آزمایش متوقف شد.
- هر چهار فایل فونت محلی با SHA-256 با فایل‌های ارسالی کاربر تطبیق دارند.
- بازبینی تصویری، تم‌ها در مرورگر، RTL تصویری، responsive واقعی و Playwright: **انجام نشده**. دسترسی ابزار مرورگر رد شد و کاربر صریحاً تحویل بدون بازبینی مرورگر را انتخاب کرد. کد responsive و دو تم وجود دارند، ولی بررسی بصری آن‌ها ادعا نمی‌شود.

## پوشش واقعی

`tests/security.test.ts`: Argon2id salted، اعتبار رمز، token و مقایسه hash، schemaهای strict و normalization ایمیل، اجبار HTTPS production.

`tests/api.test.ts`: HttpOnly/SameSite و ذخیره hash نشست، دسترسی بدون ورود، Origin/CSRF، خطای یکسان رمز/حساب نامعتبر، رد userId تزریقی، جداسازی کاربران، idempotency هم‌زمان و تعارض پارامتر، ثبت outbox، مالکیت عملیات، بقای نشست پس از ساخت API جدید، OpenAPI، شکست readiness بدون افشای متن داخلی، Secure cookie و headerهای امنیتی production، rate limit، انقضای نشست و خروج.

`tests/jobs.test.ts`: ثبت کار در نبود worker، بسته شدن producer و دریافت توسط producer/worker تازه، پردازش واقعی از Redis، نتیجه پایدار PostgreSQL، replay بدون تکرار event/audit، رد مالکیت نامعتبر در FK مرکب.

این تست‌های فاز ۲، deployment، adapter لیارا، مدل هوش مصنوعی یا SSE را پوشش نمی‌دهند.

## فاز ۳ — رابط و داده نمایشی

اجرای تست‌های رابط بدون نیاز به دیتابیس یا Redis:

```sh
pnpm test:ui
python3 scripts/check_design.py
```

مجموع ثبت‌شده در فاز ۳: **۳۶ تست در ۵ فایل**؛ ۱۹ تست backend واقعی پیشین و ۱۷ تست جدید داده و DOM. `apps/web/src/tests/workspace.test.tsx` از React Testing Library، user-event و jsdom استفاده می‌کند؛ درخواست‌های API این فایل mock هستند و تست‌ها تحت React StrictMode اجرا می‌شوند. این فایل مرورگر واقعی باز نمی‌کند.

پوشش: مسیر داشبورد تا پروژه/انتشار/تاریخچه و بازگشت، فیلتر سراسری پروژه و حالت خالی، پاسخ سناریویی و لینک شواهد رخداد، جستجوی صفحات، بستن dialog موبایل و بازگرداندن focus، تغییر/ماندگاری تم، جداسازی حساب شخصی از دمو، اعتبارسنجی فرم و ساخت پروژه با API mock، خطا/retry، رد شناسه رخداد نامعتبر، فیلتر لاگ و export خالی، لینک قدیمی عملیات و پیام اولیه همراه توقف پاسخ در StrictMode.

`tests/demo.test.ts` صحت روابط fixtureها، منابع شواهد، سناریوی build شکست‌خورده، درصدهای منابع و محدودیت پاسخ‌های نمایشی را بررسی می‌کند. پاسخ‌های ناشناخته هرگز به ادعای اجرای زیرساخت تبدیل نمی‌شوند.

نمودار در تست DOM mock است؛ هیچ ادعایی درباره صحت رندر بصری Recharts در مرورگر وجود ندارد. فونت‌ها، RTL تصویری، فاصله‌ها و breakpoints به بازبینی انسانی نیاز دارند که طبق انتخاب کاربر فعلاً انجام نشده است. منوی موبایل از لحاظ رفتار DOM تست شده، نه اندازه واقعی صفحه.

`check_design.py` هویت فایل‌های برند، مشخصات PNG و کنتراست ده جفت‌رنگ متن/سطح را بررسی می‌کند. حداقل نسبت مشاهده‌شده ۴٫۶۲:۱ است. آلفای رندر به‌صورت جداگانه هنگام تولید با بازه ۰ تا ۲۵۵ بررسی شد. این محاسبات جای QA کامل بصری را نمی‌گیرند.

## فاز ۴ — نتیجه نهایی

۶۴ تست در ۷ فایل موفق‌اند؛ typecheck و build نیز موفق‌اند. ۱۹ تست adapter و رمزنگاری در `tests/liara-adapter.test.ts`، ۸ تست API با PostgreSQL واقعی در `tests/liara-api.test.ts` و یک جریان DOM اتصال امن به پوشش قبلی اضافه شده‌اند.

پوشش جدید: AES-GCM و AAD مالک/اتصال/نسخه، عدم ذخیره توکن آشکار، CSRF و IDOR، جایگزینی ناموفق credential، قطع اتصال هم‌زمان با sync، اتصال مجدد، حفظ زمان آخرین موفقیت، حذف فیلدهای حساس، خطا/timeout/پاسخ حجیم، لاگ v2 و fallback v1 فقط روی 404، صفحه‌بندی انتشار و واحد نامشخص متریک. رابط، پاک شدن فیلد توکن پس از خطا/ارسال، عدم نگهداری آن در mutation cache یا localStorage، نمایش سرویس و قطع اتصال را بررسی می‌کند.

درخواست لیارا در این تست‌ها fetch fixture است و تأیید شبکه با حساب واقعی محسوب نمی‌شود. بررسی مرورگر انجام نشده است. سر مستقل تولیدشده با مشاهده فایل تصویر بررسی شد؛ hash دارایی‌ها و کنتراست با `python3 scripts/check_design.py` تأیید شدند.

## فاز ۵ — نتیجه نهایی

در ۲۳ اکتبر ۲۰۲۶، `pnpm test` با **۸۸ تست در ۱۰ فایل** موفق شد. `pnpm build` شامل generate، strict typecheck، Vite و bundle API/worker موفق است. هر سه migration روی دیتابیس توسعه و تست اعمال شده‌اند؛ `prisma migrate status` وضعیت up to date دارد. readiness API جاری HTTP 200 و PostgreSQL/Redis آماده‌اند. هویت دارایی‌ها و ده جفت‌رنگ کنتراست نیز دوباره تأیید شدند.

۲۴ تست جدید: ۸ تست transport مدل، ۱۴ تست API دستیار با PostgreSQL واقعی و ۲ تست رابط jsdom. transportها Responses و Chat، strict function schemas، tool_choice، store:false، redirect:error، timeout، پاسخ ناقص/حجیم و خطاهای بدون افشای راز را بررسی می‌کنند. شبکه مدل و لیارا fixture است.

API: پیام پاکسازی‌شده و ماندگار، idempotency/replay، دسترسی بدون نشست، CSRF، مالکیت، طرح بدون خواندن provider، hash/پارامتر اضافه، اجرای خواندنی یک‌باره، شواهد و شناسه ارجاع، لغو/انقضا، تغییر credential، ابزار ناشناخته، حداکثر دو فراخوانی مدل، ارجاع جعلی، تغییر مقصد مدل و snapshot، شکست upstream، پیام هم‌زمان، بازیابی اجرای قطع‌شده، rate limit پیش از مدل و بسته بودن مسیر در نبود تنظیمات. IPهای fixture تست‌های مستقل متفاوت‌اند تا محدودیت نرخ هر سناریو مستقل باشد؛ یک تست اختصاصی محدودیت واقعی ۱۰ درخواست را بررسی می‌کند.

رابط: نبود مدل با composer غیرفعال؛ پیام تا طرح، checkbox رضایت اجباری، ارسال دقیق hash، نمایش تحلیل/شواهد و بازسازی گفتگو پس از remount بدون اجرای دوباره. تست مرورگر یا تشخیص واقعی LLM نیست. محدودیت قبلی بازبینی مرورگر با انتخاب کاربر حفظ شده است.

## تغییرات مدل/رابط و فاز ۶ — نتیجه نهایی

`pnpm test`: **۱۲۲ تست در ۱۳ فایل، همگی موفق**. `pnpm build`: generate، strict typecheck، build رابط و API/worker موفق. ۶ migration روی توسعه و دیتابیس مستقل تست اعمال شده‌اند. مثال Node بدون وابستگی نیز با node --check بررسی شد.

پوشش جدید: انتخاب سه مدل در DOM، ارسال و ذخیره مدل انتخابی، رد مدل خارج از allowlist، خطای 402 و regression schema بدون format=uri؛ تحلیل GitHub با SHA ثابت و blob integrity، فیلتر credential/path، رد tree ناقص و traversal، بستن نشانی‌های غیرGitHub، ساخت gzip، قرارداد multipart/upload/release و عدم retry POST مبهم؛ مالکیت/CSRF/hash/انقضا/لغو، قفل هم‌زمان سرویس، ساخت طرح از tool call بدون mutation، outbox و اجرای واقعی Redis/BullMQ، replay بی‌اثر، READY بدون health ناموفق، release غیرنهایی، رویدادهای پایدار و SSE از Last-Event-ID؛ UI فرم تا بازبینی، رضایت اجباری، صف و blockers.

آزمون‌های خودکار AI_API_KEY واقعی را از testEnv حذف می‌کنند؛ شبکه provider مدل، GitHub و deployment در suite fixture است. دیتابیس و Redis واقعی‌اند و صف deployment تست نام مستقل دارد. دامنه سلامت با ده آدرس خصوصی/loopback/link-local/multicast/mapped-private بررسی شده است؛ آزمون واحد IP جای بررسی احراز‌شده سرویس زنده را نمی‌گیرد.

بررسی‌های زنده جداگانه: GET models در Liara AI 200؛ Responses در همان درگاه 404؛ forced tool call در Chat برای Sol/Luna 200 و Astra 402؛ ثبت پاسخ کوتاه در مسیر واقعی API/گفتگو برای Sol/Luna با حساب آزمایشی موقت و پاک‌سازی آن. تحلیل readonly مخزن رسمی liara-cloud/nodejs-getting-started، commit ca453167e498d381d50678d16e37180696b41de6: Express، ۹ فایل و blocker نبود package-lock.json. هیچ cloud POST احراز‌شده واقعی و هیچ release واقعی انجام نشده است.

بازبینی بصری مرورگر طبق انتخاب قبلی کاربر انجام نشده؛ تست‌های جدید UI نیز jsdom هستند. دارایی‌ها و کنتراست مطابق check_design.py حفظ شده‌اند. گزارش fixture را به تأیید انتشار واقعی یا سازگاری همه حساب‌ها تعمیم نمی‌دهیم.

## اصلاح رابط چت پس از فاز ۶

۲۹ تست رابط/داده در ۵ فایل با `pnpm test:ui` موفق‌اند؛ build کامل و strict typecheck موفق‌اند. Markdown semantic/GFM، کد رنگی و کپی بدون markup، خطای clipboard، XSS و لینک اجرایی/تصویر رهگیر، مدل‌های آیکون‌دار، اسکرول خودکار فقط در log و قفل/آزاد شدن viewport در خروج از مسیر تست شدند. این نوبت backend تغییر نکرد و suite یکپارچه backend مجدداً اجرا نشد. جزئیات در reports/CHAT_UI_FIXES.md؛ فاز بعد شروع نشده است.
