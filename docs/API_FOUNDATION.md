# API اجرایی فاز ۲

همه مسیرها زیر `/api/v1` هستند. احراز هویت با cookie به نام `lp_session` و CSRF با header `x-csrf-token` انجام می‌شود. تمام mutationها به `Origin` دقیق برابر APP_ORIGIN نیاز دارند؛ ثبت‌نام/ورود هنوز session ندارند و تنها Origin روی آن‌ها اعمال می‌شود. پس از ثبت‌نام/ورود یا دریافت نشست، csrfToken از پاسخ JSON برای mutationهای همان نشست استفاده می‌شود.

| روش | مسیر | رفتار |
|---|---|---|
| GET | /health/live | حیات API |
| GET | /health/ready | دسترسی PostgreSQL و Redis؛ خرابی 503 |
| POST | /auth/register | name/email/password؛ 201 و نشست تازه |
| POST | /auth/login | email/password؛ چرخش نشست فعلی مرورگر |
| GET | /auth/session | user و csrfToken؛ نیازمند ورود |
| POST | /auth/logout | لغو نشست و پاک کردن cookie؛ 204 |
| GET | /projects | حداکثر ۱۰۰ پروژه متعلق به کاربر |
| POST | /projects | name؛ ایجاد پروژه DEMO محلی؛ 201 |
| GET | /projects/:id | پروژه خود کاربر؛ برای دیگری 404 |
| POST | /foundation/checks | projectId و header Idempotency-Key از نوع UUID؛ 202 با operationId |
| GET | /operations/:id | وضعیت و رویدادهای عملیات خود کاربر |
| GET | /openapi.json | قرارداد OpenAPI؛ نیازمند ورود |

خطاها `{error:{code,message,requestId}}` هستند؛ پیام فارسی و شناسه پیگیری دارند. ورود نامعتبر 401، CSRF/Origin نامعتبر 403، اعتبارسنجی 400، تعارض 409 و محدودیت نرخ 429. پاسخ‌های حساس cache نمی‌شوند. فعلاً polling هر ثانیه برای عملیات محلی استفاده می‌شود؛ SSE مربوط به مراحل بعد است.

هیچ endpoint تغییردهنده سرویس واقعی یا token لیارا در این فاز فعال نیست. فهرست قابلیت‌های مستند لیارا در API_CAPABILITIES.md مستقل از این API اجرایی است.

## API افزوده‌شده در فاز ۴

| روش | مسیر زیر /api/v1 | رفتار |
|---|---|---|
| GET | /connections/liara | اتصال‌های خود کاربر و وضعیت پیکربندی کلید؛ بدون توکن |
| POST | /connections/liara | label/token/teamId؛ اعتبارسنجی رسمی و ذخیره رمزگذاری‌شده؛ 201 |
| POST | /connections/liara/:id/sync | همگام‌سازی سرویس‌های اتصال خود کاربر |
| POST | /connections/liara/:id/disconnect | حذف credential و قطع اتصال محلی؛ بدون تغییر سرویس ابری |
| GET | /applications | snapshot سرویس‌های اتصال‌های فعال کاربر؛ connectionId اختیاری |
| GET | /applications/:id | دریافت تازه جزئیات سرویس خود کاربر |
| GET | /applications/:id/logs?since=ISO | لاگ پاکسازی‌شده؛ contract و منبع/زمان در پاسخ |
| GET | /applications/:id/releases?page=1&count=10 | تاریخچه نسخه‌ها؛ فقط خواندن |
| GET | /applications/:id/metrics | داده خام summary؛ unitsVerified=false |
| GET | /providers/liara/capabilities | وضعیت پیاده‌سازی و policy عملیات؛ نه تضمین permission هر توکن |

تمام مسیرها احراز هویت و مالکیت دارند؛ mutationها علاوه بر Origin به CSRF نیاز دارند. خطای credential provider با 422 و کد LIARA_AUTH_FAILED/LIARA_FORBIDDEN از خطای نشست خود برنامه تفکیک می‌شود. 429 می‌تواند retry-after معتبر provider داشته باشد. timeout برابر 504، malformed/network برابر 502 و کلید رمزگذاری ناموجود یا ناسازگار برابر 503 است. تغییر هم‌زمان اتصال 409 برمی‌گرداند.

## مسیرهای افزوده فاز ۵

GET `/api/v1/assistant/config`، GET/POST `/api/v1/conversations`، GET `/api/v1/conversations/:id`، POST `/api/v1/conversations/:id/messages` و POST `/api/v1/conversations/:id/plans/:planId/decision`. همه خصوصی و POSTها دارای Origin/CSRF هستند. پیام UUID idempotency-key می‌خواهد؛ تصمیم فقط hash و approve/cancel می‌پذیرد. جزئیات در AI_ASSISTANT.md.

## وضعیت اجرایی فاز ۶

GET/POST /api/v1/deployments، GET /api/v1/deployments/:id، POST /api/v1/deployments/:id/decision و GET /api/v1/deployments/:id/events افزوده شدند. نشست/مالکیت، Origin/CSRF و hash تصمیم کنترل می‌شوند؛ SSE از Last-Event-ID معتبر replay می‌کند. schema ورودی و پاسخ در OpenAPI خصوصی موجود است.
