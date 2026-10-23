# LiaraPilot AI

«از کد تا کلاد، فقط با یک گفتگو»

دستیار فارسی استقرار و نگهداری سرویس روی لیارا؛ در حال ساخت مرحله‌به‌مرحله با تأیید کاربر.

## وضعیت فعلی

قابلیت‌های استقرار، پایش چندصفحه‌ای، تحلیل عملکرد و پچ مستقیم سرور پیاده‌سازی شده‌اند؛ حدود اجرا و تأییدها در [راهنمای پایش و اصلاح](docs/RELIABILITY.md) آمده‌اند.

[مشاهده دموی عمومی بدون ثبت‌نام](http://127.0.0.1:5173/demo) · [فضای حساب شخصی](http://127.0.0.1:5173/workspace)

پت «پایلوت» با رندر سه‌بعدی بر اساس لوگوی ارسالی لیارا ساخته شده است. پوسته RTL، داشبورد، فضای دستیار، پروژه/جزئیات، انتشار، پایش، رخداد/شواهد، لاگ، تاریخچه و تنظیمات با فونت کلمه و هر دو تم روشن/تاریک پیاده شده‌اند.

**مرز قابلیت‌ها:** اتصال امن GitHub و لیارا، بررسی مرحله‌ای مخزن، تشخیص ۱۴ پلتفرم، فرم‌های پویای سؤال، پیشنهاد پلن واقعی، ساخت سرویس جدید پس از تأیید و انتشار با تایم‌لاین در همان چت پیاده شده‌اند. وجود package.json به‌تنهایی به‌معنی بک‌اند Node.js نیست. آیکون‌های رسمی پلتفرم‌ها در پروژه ذخیره شده‌اند. دریافت کاتالوگ و تحلیل مخزن واقعی بررسی شده‌اند؛ ساخت سرویس هزینه‌دار فقط با تأیید طرح داخل برنامه انجام می‌شود. جزئیات حدود و بررسی‌ها در [محدودیت‌ها](docs/LIMITATIONS.md) و [جریان انتشار](docs/DEPLOYMENT_WORKFLOW.md) آمده است. پایش شامل کشف صفحات و منابع، نمودارهای عملکرد، امتیاز هوشمند و پچ موضعی با پیش‌نمایش، تأیید مستقل و آندو است.

برای دیدن دمو بدون دیتابیس: `pnpm dev:web`. برای مسیرهای واقعی حساب شخصی، راه‌اندازی کامل زیر را انجام دهید.

سر ربات فایل مستقل `apps/web/public/brand/pilot-head.png` دارد و با CSS بریده نمی‌شود. اتصال واقعی از `/workspace/connections` و سرویس‌ها از `/workspace/applications` در دسترس‌اند.

## راه‌اندازی

Node 24، pnpm 11.25.0 و Docker با daemon فعال:

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm secrets:init
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

[باز کردن رابط محلی](http://127.0.0.1:5173) · [راهنمای کامل و مسیر بدون Docker](docs/DEPLOYMENT.md)

در محیط فعلی بدون Docker daemon، سرویس‌های PostgreSQL/Redis مستقل راه‌اندازی شده‌اند؛ برای شروع مجدد از `pnpm infra:local` استفاده کنید. `.env` موجود را با فایل نمونه جایگزین نکنید.

## تست و build

```sh
pnpm test:prepare
pnpm test
pnpm build
```

نتیجه فعلی: **۲۳۹ تست موفق در ۳۵ فایل**، typecheck/build موفق؛ migration و readiness واقعی PostgreSQL/Redis در فاز ۲ تأیید شدند. تست‌ها دیتابیس مستقل `_test` و صف اختصاصی دارند. ۲۳ تست داده و رابط در jsdom اجرا می‌شوند (`pnpm test:ui`)؛ بازبینی بصری و E2E مرورگر با انتخاب کاربر انجام نشده است؛ [گزارش تست](docs/TESTING.md).

## ساختار

```text
apps/web                 React / Vite / RTL / local fonts
apps/api                 Fastify / sessions / ownership / OpenAPI
apps/worker              outbox dispatcher / BullMQ consumer
packages/shared          Zod schemas and environment validation
packages/database        Prisma client and PostgreSQL adapter
packages/security        Argon2id / tokens / digests
packages/jobs            queue and idempotent local check
packages/ai-agent        bounded model transport and strict tool registry
packages/liara-adapter   verified read contracts and provider error handling
packages/github-adapter  public commit/tree/blob analysis and integrity checks
packages/deployment      approved queue runner, upload/release and HTTP verification
prisma/migrations        versioned database migration
tests                    real API / security / queue integration tests
scripts                  discovery / test DB / local infrastructure
docs                     architecture, UX, integration research and reports
```

## مستندات

- [تحویل فاز ۶ و تغییرات مدل/چت](docs/reports/PHASE_6.md) و [راهنمای انتشار](docs/DEPLOYMENT_WORKFLOW.md)
- [تحویل فاز ۵](docs/reports/PHASE_5.md) و [پیکربندی مدل و مسیر گفتگو](docs/AI_ASSISTANT.md)
- [تحویل فاز ۴](docs/reports/PHASE_4.md) و [قرارداد اتصال لیارا](docs/LIARA_INTEGRATION.md)
- [تحویل فاز ۳ و مسیر بررسی](docs/reports/PHASE_3.md)
- [هویت بصری و پت پایلوت](docs/design/BRAND.md)
- [تحویل فاز ۲ و محدودیت‌های آن](docs/reports/PHASE_2.md)
- [برنامه مرحله‌ای](docs/BUILD_PLAN.md)
- [طراحی UI و UX](docs/UX_BLUEPRINT.md)
- [معماری](docs/ARCHITECTURE.md) و [مدل داده](docs/DATA_MODEL.md)
- [API اجرایی این بخش](docs/API_FOUNDATION.md)
- [قابلیت‌های مستند رسمی لیارا](docs/API_CAPABILITIES.md)
- [امنیت](docs/SECURITY.md)، [آزمون‌ها](docs/TESTING.md) و [محدودیت‌ها](docs/LIMITATIONS.md)
- [ردیابی معیارهای مسابقه](docs/SCORING_MATRIX.md)

فاز بعد فقط پس از تأیید کاربر آغاز می‌شود. هیچ عملیات هزینه‌زا یا انتشار زیرساختی در بخش فعلی اجرا نمی‌شود.
