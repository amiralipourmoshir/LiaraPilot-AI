import { z } from 'zod';
import { DeploymentError } from './provider.js';
export async function liaraCatalog(
  token: string,
  team: string,
  minimumRam = 0.5,
  transport: typeof fetch = fetch,
) {
  const get = async (path: string) => {
    const u = new URL(path, 'https://api.liara.ir');
    if (team) u.searchParams.set('teamID', team);
    const r = await transport(u, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${token}` },
    });
    if (!r.ok)
      throw new DeploymentError(
        r.status === 401 || r.status === 403
          ? 'CATALOG_AUTH_FAILED'
          : r.status === 402
            ? 'PAYMENT_REQUIRED'
            : 'CATALOG_UNAVAILABLE',
      );
    const data = await r.text();
    if (data.length > 1024 * 1024) throw new DeploymentError('CATALOG_INVALID');
    return JSON.parse(data) as unknown;
  };
  const raw = z
    .object({
      team: z.object({ balance: z.number().finite().optional() }).optional(),
      balance: z.number().finite().optional(),
      plans: z.object({
        projects: z.record(
          z.string(),
          z.object({
            available: z.boolean(),
            region: z.string().optional(),
            RAM: z.object({ amount: z.number().positive() }),
            CPU: z.object({ amount: z.number().positive() }),
            volume: z.number().nonnegative(),
            price: z.number().nonnegative().optional(),
            displayPrice: z.number().nonnegative().optional(),
          }),
        ),
        projectBundlePlans: z.record(
          z.string(),
          z.record(
            z.string(),
            z.object({
              available: z.boolean().optional(),
              price: z.number().nonnegative().optional(),
              displayHourlyPrice: z.number().nonnegative().optional(),
              displayPrice: z.number().nonnegative().optional(),
              maxSourceSize: z.number().positive().optional(),
              buildTimeout: z.number().positive().optional(),
            }),
          ),
        ),
      }),
    })
    .parse(await get('/v1/me'));
  const networks = z
    .object({ networks: z.array(z.object({ _id: z.string(), name: z.string() })) })
    .parse(await get('/v1/networks')).networks;
  const plans = Object.entries(raw.plans.projects)
    .filter(([id, p]) => p.available && p.region === 'iran' && (id === 'free' || id.includes('g2')))
    .flatMap(([id, p]) => {
      const bundle = raw.plans.projectBundlePlans[id];
      if (!bundle) return [];
      return Object.entries(bundle)
        .filter(([, b]) => b.available !== false)
        .map(([bundleId, b]) => ({
          id,
          bundleId,
          name:
            (
              {
                'small-g2': 'زمین',
                'medium-g2': 'مریخ',
                'standard-base-g2': 'مشتری',
                'standard-plus-g2': 'زحل',
                'pro-g2': 'اورانوس',
                'pro-plus-g2': 'نپتون',
                'pro-max-g2': 'پلوتون',
                'express-g2': 'خورشیدی',
                free: 'رایگان',
              } as Record<string, string>
            )[id] ?? id,
          planet:
            (
              {
                'small-g2': 'earth',
                'medium-g2': 'mars',
                'standard-base-g2': 'jupiter',
                'standard-plus-g2': 'saturn',
                'pro-g2': 'uranus',
                'pro-plus-g2': 'neptune',
                'pro-max-g2': 'pluto',
                'express-g2': 'sun',
              } as Record<string, string>
            )[id] ?? null,
          bundleName:
            (
              { basic: 'پایه', standard: 'نقره‌ای', pro: 'طلایی', free: 'رایگان' } as Record<
                string,
                string
              >
            )[bundleId] ?? bundleId,
          estimatedHourlyToman:
            p.price !== undefined && (b.displayHourlyPrice !== undefined || b.price !== undefined)
              ? Math.floor(p.price) + Math.floor(b.displayHourlyPrice ?? b.price!)
              : null,
          ramGb: p.RAM.amount,
          cpu: p.CPU.amount,
          diskGb: p.volume,
          estimatedMonthlyToman:
            p.price !== undefined && b.displayPrice !== undefined
              ? Math.round((p.displayPrice ?? p.price * 720) + b.displayPrice)
              : null,
          recommended: false,
        }));
    })
    .sort(
      (a, b) =>
        a.ramGb - b.ramGb ||
        (a.estimatedMonthlyToman ?? Infinity) - (b.estimatedMonthlyToman ?? Infinity),
    );
  let currentMonthlyToman: number | null = null;
  try {
    currentMonthlyToman = z
      .object({ totalMonthlyPrice: z.number().finite().nonnegative() })
      .parse(await get('/v1/usage-report')).totalMonthlyPrice;
  } catch {}
  const balance = raw.team?.balance ?? raw.balance;
  const recommended = plans.find((p) => p.ramGb >= minimumRam);
  if (recommended) for (const p of plans) p.recommended = p.ramGb === recommended.ramGb;
  return {
    plans,
    billing: {
      hasCredit: balance === undefined ? null : balance > 0,
      balanceToman: balance ?? null,
      currentMonthlyToman,
      paymentUrl: 'https://console.liara.ir/credit' as const,
    },
    networks: networks.map((n) => ({ id: n._id, name: n.name })),
    fetchedAt: new Date().toISOString(),
  };
}
