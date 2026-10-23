export class RepositoryError extends Error {
  constructor(public code: string) {
    super(
      (
        {
          REPOSITORY_FILE_TOO_LARGE:
            'یکی از فایل‌های مخزن بیشتر از سقف ۲ مگابایت است؛ برای انتشار به روش انتقال فایل‌های بزرگ نیاز داریم.',
          REPOSITORY_LIMIT_EXCEEDED:
            'اندازه مخزن از سقف فعلی بررسی (۵۰۰ فایل یا ۵ مگابایت) بیشتر است.',
          GITHUB_AUTH_REQUIRED:
            'مخزن پیدا نشد یا خصوصی است؛ نشانی را بررسی کنید و حساب GitHub دارای دسترسی را متصل کنید.',
          GITHUB_AUTH_EXPIRED: 'دسترسی GitHub منقضی یا لغو شده است؛ دوباره به GitHub متصل شوید.',
          GITHUB_RATE_LIMITED: 'GitHub موقتاً درخواست را محدود کرده است؛ کمی بعد دوباره تلاش کنید.',
          GITHUB_UNAVAILABLE: 'ارتباط سرور با GitHub برقرار نشد؛ دوباره تلاش کنید.',
          REPOSITORY_URL_REJECTED:
            'نشانی اصلی مخزن GitHub را وارد کنید؛ مانند https://github.com/owner/repository',
          GITHUB_RESPONSE_TOO_LARGE: 'پاسخ GitHub از سقف مجاز انتقال بیشتر است.',
        } as Record<string, string>
      )[code] ?? 'بررسی مخزن کامل نشد؛ دوباره تلاش کنید یا کد خطا را برای پشتیبانی بفرستید.',
    );
  }
}
