import { redactSecrets } from '../../security/src/redact.js';
export function scanError(error: unknown) {
  const detail = redactSecrets(error instanceof Error ? error.message : String(error)).slice(
    0,
    2400,
  );
  if (/Executable doesn't exist|executable.*does not exist|ENOENT.*chrom/i.test(detail))
    return {
      code: 'BROWSER_MISSING',
      message: 'مرورگر لازم برای اجرای تست روی worker نصب نیست.',
      hint: 'مدیر سرویس باید Chromium را نصب کند یا مسیر مرورگر نصب‌شده را تنظیم کند. این خطا مربوط به سایت شما نیست.',
      detail,
    };
  if (/sandbox|namespace|Operation not permitted/i.test(detail))
    return {
      code: 'BROWSER_SANDBOX_UNAVAILABLE',
      message: 'محیط worker اجازه راه‌اندازی امن مرورگر را نمی‌دهد.',
      hint: 'قابلیت sandbox و تنظیمات میزبان worker باید بررسی شود. تست قبل از بررسی صفحات متوقف شده است.',
      detail,
    };
  if (/shared libraries|Host system is missing dependencies|lib.*\.so/i.test(detail))
    return {
      code: 'BROWSER_DEPENDENCIES_MISSING',
      message: 'کتابخانه‌های سیستمی موردنیاز مرورگر روی worker موجود نیست.',
      hint: 'وابستگی‌های Chromium باید روی میزبان worker نصب شوند؛ مشکل از پاسخ سایت نیست.',
      detail,
    };
  if (/TARGET_CHANGED/.test(detail))
    return {
      code: 'TARGET_CHANGED',
      message: 'اتصال یا هویت سرویس پس از تأیید تغییر کرده است.',
      hint: 'سرویس‌ها را همگام‌سازی کنید و برنامه تست تازه‌ای بسازید.',
      detail,
    };
  if (
    /browserType.launch|Target page, context or browser has been closed|Failed to launch/i.test(
      detail,
    )
  )
    return {
      code: 'BROWSER_LAUNCH_FAILED',
      message: 'راه‌اندازی مرورگر تست کامل نشد.',
      hint: 'جزئیات فنی را باز کنید؛ نسخه مرورگر، وابستگی‌ها و دسترسی worker را بررسی کنید.',
      detail,
    };
  return {
    code: 'SCAN_FAILED',
    message: 'اسکن در جریان اجرا متوقف شد.',
    hint: 'جزئیات خطا و آخرین مرحله را بررسی کنید. این وضعیت به‌تنهایی به معنی خرابی سایت نیست.',
    detail,
  };
}
