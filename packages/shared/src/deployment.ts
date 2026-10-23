import { z } from 'zod';
export const deploymentInputSchema = z.strictObject({
  repositoryUrl: z.url().max(300),
  ref: z
    .string()
    .regex(/^[A-Za-z0-9_.\/-]{1,120}$/)
    .optional(),
  applicationId: z.uuid(),
  port: z.number().int().min(1).max(65535),
  healthPath: z.string().regex(/^\/[A-Za-z0-9_./-]{0,150}$/),
  expectedText: z.string().trim().min(2).max(100),
});
export const deploymentDecisionSchema = z.strictObject({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(['approve', 'cancel']),
});
export const deploymentRecoverySchema = z.object({
  checkedAt: z.string(),
  status: z.enum([
    'NOT_STARTED',
    'IN_PROGRESS',
    'RELEASE_FAILED',
    'HEALTH_FAILED',
    'VERIFIED',
    'SUPERSEDED',
    'UNKNOWN',
  ]),
  message: z.string(),
  canRetry: z.boolean(),
  applicationExists: z.boolean().nullable(),
  releaseState: z.string().nullable(),
});
export const deploymentSchema = z.object({
  id: z.uuid(),
  phase: z.string().default('PLANNED'),
  recovery: deploymentRecoverySchema.nullable().default(null),
  retryOf: z.uuid().nullable().default(null),
  retryId: z.uuid().nullable().default(null),
  state: z.enum([
    'PLANNED',
    'QUEUED',
    'RUNNING',
    'VERIFYING',
    'SUCCEEDED',
    'NEEDS_ATTENTION',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
  ]),
  hash: z.string(),
  snapshot: z.unknown(),
  errorCode: z.string().nullable(),
  sourceId: z.string().nullable(),
  releaseId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  events: z.array(
    z.object({ sequence: z.number(), message: z.string(), createdAt: z.iso.datetime() }),
  ),
});
export const deploymentsSchema = z.object({ deployments: z.array(deploymentSchema) });

export function deploymentFailureMessage(code: string) {
  return (
    (
      {
        CREATION_CREDIT_REQUIRED:
          'برای ساخت سرویس جدید، لیارا اعتبار معادل هزینه یک هفته همه سرویس‌ها را لازم دارد. داشتن مقداری موجودی کافی نیست؛ حساب را شارژ و وضعیت را دوباره بررسی کنید.',
        DEPLOYMENT_RATE_LIMITED:
          'لیارا به محدودیت موقت درخواست رسیده است. پاسخ ۴۲۹ با زمان انتظار دوباره بررسی می‌شود؛ اگر ادامه پیدا کرد، پس از بررسی وضعیت مقصد طرح تلاش تازه آماده کنید. ساخت پروژه با آماده‌بودن سرویس مقصد دو مرحله جدا هستند.',
        GITHUB_RATE_LIMITED:
          'دریافت سورس به محدودیت GitHub رسیده است. مسیر جدید دریافت آرشیو این مشکل را برطرف می‌کند؛ وضعیت را بررسی و طرح تلاش تازه بسازید.',
        GITHUB_ARCHIVE_UNAVAILABLE:
          'ارتباط دریافت سورس موقتاً قطع شد. می‌توانید بدون ساخت سرویس تکراری، بررسی و تلاش تازه را انجام دهید.',
        DEPLOYMENT_INCOMPLETE:
          'تلاش قبلی پیش از ثبت نتیجه نهایی متوقف شده است. با بررسی مجدد، مرحله و وضعیت واقعی را روشن می‌کنیم.',
        PAYMENT_REQUIRED:
          'اعتبار حساب لیارا کافی نیست؛ حساب را در کنسول رسمی شارژ کنید و وضعیت را دوباره بررسی کنید.',
        RELEASE_FAILED:
          'لیارا ساخت این نسخه را ناموفق گزارش کرده است؛ تنظیمات و وابستگی‌های پروژه باید بررسی شوند.',
        HEALTH_CHECK_FAILED:
          'نسخه ساخته شده، اما پاسخ وب هنوز مطابق انتظار نیست؛ بررسی مجدد یا اصلاح تنظیمات را انجام دهید.',
        RELEASE_VERIFICATION_INCOMPLETE:
          'ساخت پروژه در زمان بررسی تمام نشده است؛ ابتدا وضعیت همان نسخه را دوباره دریافت کنید.',
        WORKER_INTERRUPTED:
          'ارتباط پردازش انتشار قطع شده است؛ بررسی مجدد نتیجه واقعی را بازیابی می‌کند.',
        UPSTREAM_RESPONSE_INVALID:
          'پاسخ یکی از سرویس‌ها با قرارداد مورد انتظار سازگار نبود؛ وضعیت واقعی باید دوباره خوانده شود.',
      } as Record<string, string>
    )[code] ??
    'این مرحله به بررسی نیاز دارد. نتیجه واقعی سرویس را دوباره بخوانید و در صورت نیاز، تنظیمات را اصلاح کنید.'
  );
}
