import type { z } from 'zod';
import type { taskSchema } from '../../../../packages/shared/src/reliability';
export function demoTelemetryTasks(projectId: string): z.infer<typeof taskSchema>[] {
  const paths = ['/', '/products', '/products/details', '/blog', '/about', '/contact'];
  return [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const pages = paths.map((path, p) => {
        const assets = [
          { url: '/assets/app.js', type: 'script', status: 200, bytes: 312000 + p * 6000 },
          { url: '/assets/vendor.js', type: 'script', status: 200, bytes: 154000 },
          { url: '/assets/main.css', type: 'stylesheet', status: 200, bytes: 61000 },
          {
            url: '/images/hero.webp',
            type: 'image',
            status: 200,
            bytes: p === 1 ? 426000 : 145000,
          },
          { url: '/fonts/kalameh.woff2', type: 'font', status: 200, bytes: 48000 },
          { url: path, type: 'document', status: 200, bytes: 19000 },
          { url: '/api/catalog', type: 'fetch', status: p === 2 ? 500 : 200, bytes: 9000 },
        ];
        const loadMs = 780 + p * 280 + (p === 1 ? 1700 : 0) + (5 - i) * 120;
        return {
          path,
          status: 200,
          durationMs: loadMs + 200,
          requests: 17 + p * 3,
          bytes: assets.reduce((s, a) => s + a.bytes, 0),
          domMs: Math.round(loadMs * 0.65),
          loadMs,
          errors: p === 2 ? ['HTTP 500 /api/catalog'] : [],
          assets,
        };
      });
      return {
        id: `00000000-0000-4000-8000-00000000000${i}`,
        applicationId: projectId,
        kind: 'SCAN' as const,
        state: 'SUCCEEDED',
        hash: '0'.repeat(64),
        snapshot: { paths, discover: true },
        expiresAt: new Date('2026-10-23T10:00:00Z').toISOString(),
        createdAt: new Date(Date.UTC(2026, 9, 23, 8, i * 30)).toISOString(),
        result: {
          pages,
          discovered: 6,
          truncated: false,
          blocked: 2,
          scope: 'داده ثابت نمایشی؛ هیچ اسکن یا تماس زنده با سرویس انجام نشده است.',
          ...(i === 5
            ? {
                analysis: {
                  score: 78,
                  confidence: 'MEDIUM',
                  summary:
                    'بیشتر صفحات پاسخ مناسبی دارند؛ صفحه محصولات به‌دلیل بار بیشتر فایل‌ها نیازمند بررسی است. خطای API در جزئیات محصول، اولویت بالاتری از بهینه‌سازی ظاهری دارد.',
                  strengths: [
                    'تمام ۶ مسیر نمونه، پاسخ HTTP موفق دارند.',
                    'میانه زمان بارگذاری در اسکن‌های نمونه کاهش یافته است.',
                  ],
                  findings: [
                    {
                      path: '/products/details',
                      severity: 'HIGH',
                      title: 'خطای API در صفحه جزئیات',
                      evidence: 'درخواست /api/catalog در گزارش نمونه با وضعیت ۵۰۰ ثبت شده است.',
                      recommendation:
                        'لاگ همان درخواست را بررسی کنید و مسیر مدیریت خطا را پیش از تغییر کد بازبینی کنید.',
                    },
                    {
                      path: '/products',
                      severity: 'MEDIUM',
                      title: 'تصویر سنگین، بارگذاری کندتر',
                      evidence:
                        'حجم تصویر hero در این صفحه ۴۲۶ هزار بایت و زمان load بیش از ۲٫۵ ثانیه است.',
                      recommendation:
                        'اندازه تصویر و بارگذاری تنبل تصاویر خارج از دید را بررسی کنید.',
                    },
                  ],
                  limitations: [
                    'این گزارش و امتیاز صرفاً نمایشی‌اند و خروجی اجرای مدل نیستند.',
                    'زمان load با LCP یکسان نیست؛ ارتباط علّی کندی با یک فایل نیازمند بررسی بیشتر است.',
                  ],
                  analyzedAt: '2026-10-23T10:30:00Z',
                  model: 'DEMO',
                },
              }
            : {}),
        },
      };
    })
    .reverse();
}
export const demoTelemetryMetrics = {
  source: 'LIARA' as const,
  fetchedAt: '2026-10-23T10:30:00Z',
  unitsVerified: false as const,
  cpuUsage: [
    { applet: 'demo-replica-1', value: [1792751400, '0.34'] },
    { applet: 'demo-replica-2', value: [1792751400, '0.19'] },
  ],
  memoryUsage: [
    { applet: 'demo-replica-1', value: [1792751400, '142'] },
    { applet: 'demo-replica-2', value: [1792751400, '96'] },
  ],
};
