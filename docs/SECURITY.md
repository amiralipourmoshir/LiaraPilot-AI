# سیاست اجرای امن

وضعیت: سیاست هدف. در فاز ۲، احراز هویت، ownership پروژه/عملیات، hash نشست و رمز، Origin/CSRF، rate limit تک‌پردازشی، security headers و audit پایه پیاده و تست شده‌اند. رمزگذاری credential در فاز ۴ و approval بررسی خواندنی در فاز ۵ پیاده شده‌اند. SSRF مقصد دلخواه، approval انتشار و کنترل‌های worker هدف مراحل بعد هستند.

- هر request احراز هویت، ownership، mode و Zod validation دارد. session با cookie امن، CSRF برای mutationهای cookie-based، محدودیت نرخ و security headers محافظت می‌شود.
- خواندن سرویس/لاگ، تحلیل مخزن و health check روی مقصد مجاز، پس از احراز دسترسی مجازند. restart، deploy و تغییر تنظیمات نیازمند تأیید محدود به عملیات‌اند. ایجاد/تغییر منبع پولی، secrets و DNS نیازمند خلاصه هزینه/اثر و تأیید صریح‌اند. حذف مخرب و shell عمومی در MVP غیرفعال است.
- Approval به user، operation، mode، paramsHash، نسخه سیاست و نسخه secrets متصل، دارای مهلت پیشنهادی ۱۰ دقیقه و مصرف اتمیک است. وضعیت provider پیش از اجرا بازبینی می‌شود؛ تغییر اثر عملیات به طرح تازه نیاز دارد.
- credential با AES-256-GCM و nonce یکتا رمزگذاری می‌شود؛ AAD شامل مالک و اتصال است. کلید سرور از env/secret manager و مستقل از DB؛ keyVersion برای rotation. توکن در URL، پیام، telemetry، SSE یا argv عمومی قرار نمی‌گیرد.
- تمام پاسخ‌های provider به‌صورت allowlist به DTO عمومی تبدیل می‌شوند؛ env values در پاسخ جزئیات سرویس نباید وارد مدل، لاگ یا مرورگر شوند.
- SSRF: فقط HTTPS و دامنه سرویس اثبات‌شده؛ منع loopback/private/link-local/metadata در IPv4/IPv6، بررسی تمام DNS answers، اتصال به IP بررسی‌شده با SNI/Host درست، بررسی مجدد هر redirect و سقف redirect/زمان/حجم. DNS rebinding، IPv4-mapped IPv6 و دامنه عمومی اشاره‌کننده به IP خصوصی تست می‌شوند.
- مخزن با API رسمی GitHub و commit ثابت به‌صورت static بررسی می‌شود؛ سقف اولیه ۱۰۰ فایل منتخب، هر فایل ۲۵۶ KiB و مجموع ۵ MiB. symlink، path traversal، archive bomb، submodule و URL دلخواه رد/نادیده گرفته می‌شوند. build در worker ایزوله با سقف منابع؛ بدون secret میزبان یا Docker socket.
- متن مخزن، README و لاگ فقط داده غیرقابل‌اعتماد است. ابزارها allowlist، ورودی‌ها strict، خروجی‌ها محدود؛ دستور مخزن نمی‌تواند سیاست، مقصد یا مجوز را عوض کند.
- سقف اولیه orchestrator: ۸ گام، ۱۲ tool call، ۹۰ ثانیه و بودجه توکن قابل تنظیم؛ retry خواندن حداکثر ۲ بار با backoff. mutation مبهم ابتدا reconcile، سپس تصمیم؛ retry کور ممنوع.
- worker قفل per-application و lease دارد؛ CLI فقط در صورت نیاز واقعی، با executable/version ثابت، args معتبر و shell:false اجرا می‌شود. روش امن انتقال توکن باید از سورس CLI تأیید شود؛ تا آن زمان fallback فعال نیست.
- پیام خطا فارسی همراه requestId؛ جزئیات داخلی فقط در لاگ پاکسازی‌شده. خطای provider و خطای verification مستقل ثبت می‌شوند.

## کنترل‌های افزوده‌شده در فاز ۴

AES-256-GCM برای credential، کلید مستقل سرور، AAD مالک/اتصال/نسخه، nonce تازه، جلوگیری از بازگرداندن توکن در DTO یا log، پاکسازی شناخته‌شده secrets، response allowlist، مالکیت مرکب Application، guard credentialVersion برای پاسخ دیررس و حذف credential هنگام قطع اتصال اکنون پیاده و با fixture تست شده‌اند. مسیر upstream فقط GET به origin رسمی ثابت با redirect:error و سقف زمان/حجم است. این کنترل، SSRF health check دلخواه فاز پایش را پیاده نمی‌کند.

فرم اتصال توکن را در TanStack mutation cache یا storage مرورگر نمی‌گذارد و بعد از ارسال پاک می‌کند. خطای جایگزینی token، credential قبلی را دست‌نخورده نگه می‌دارد. همگام‌سازی در نبود کلید یا پس از قطع اتصال بسته است. قطع اتصال token را در خود Liara revoke نمی‌کند؛ فقط نسخه ذخیره‌شده در برنامه حذف می‌شود.

## وضعیت اجرایی فاز ۵

تأیید بررسی خواندنی اکنون ۱۰ دقیقه اعتبار دارد و hash شامل پارامتر، مالک از رابطه گفتگو، mode، نسخه سیاست، credentialVersion و مقصد/مدل است. CAS مصرف تأیید و lease گفتگو در PostgreSQL بین پردازش‌ها اعمال می‌شوند. schema آرگومان strict، ابزار ناشناخته مردود، شواهد ورودی غیرقابل‌اعتماد و حلقه اجرا محدود است. مقصد مدل تنها از env مدیر سرور تعیین می‌شود؛ redirect ممنوع و کلید فقط سمت سرور است. حذف رازها best effort و IDهای شاهد کنترل می‌شوند؛ تطبیق معنایی و مقاومت کامل در برابر prompt injection تضمین نمی‌شود. سیاست‌های worker/SSRF عمومی هدف فازهای بعدند.

## وضعیت اجرایی فاز ۶

طرح انتشار user-owned با hash/انقضا/نسخه credential و snapshot ثابت تأیید می‌شود؛ مدل فقط plan_deployment دارد و تأیید در UI جداست. کد مخزن روی میزبان اجرا نمی‌شود. سورس با safe path، سقف حجم و Git blob SHA کنترل می‌شود؛ .env*/کلیدها کنار گذاشته می‌شوند. قفل PostgreSQL، CAS QUEUED، attempts=1 و maxStalledCount=0 مانع replay کورند؛ timeout مبهم نیازمند بررسی است. health فقط دامنه محدود، DNS تماماً public و IP pinned با TLS و بدون redirect دارد. این کنترل برای health URL دلخواه نیست. کلید AI فقط در env سرور است؛ testEnv کلید واقعی را کنار می‌گذارد و هیچ کلید PaaS از آن مشتق نمی‌شود.
