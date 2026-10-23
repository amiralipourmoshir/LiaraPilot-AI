import { expect, it } from 'vitest';
import { LiaraDeploymentProvider } from '../packages/deployment/src/provider.js';
import { creationCredit } from '../packages/deployment/src/billing.js';
const input = {
  name: 'sample',
  platform: 'laravel',
  planId: 'small-g2',
  bundleId: 'basic',
  networkId: 'network',
};
it('treats a creation 429 without Retry-After as the official weekly-credit requirement and never retries it', async () => {
  let posts = 0,
    waits = 0;
  const provider = new LiaraDeploymentProvider(
    'fixture',
    '',
    async () => {
      posts++;
      return Response.json({ message: 'week_cost_required' }, { status: 429 });
    },
    async () => {
      waits++;
    },
  );
  await expect(provider.create(input)).rejects.toHaveProperty('code', 'CREATION_CREDIT_REQUIRED');
  expect(posts).toBe(1);
  expect(waits).toBe(0);
});
it('honors an explicit Retry-After for a real transient throttle', async () => {
  let posts = 0;
  const waits: number[] = [];
  const provider = new LiaraDeploymentProvider(
    'fixture',
    '',
    async () =>
      ++posts === 1
        ? new Response(null, { status: 429, headers: { 'retry-after': '2' } })
        : Response.json({}),
    async (ms) => {
      waits.push(ms);
    },
  );
  await provider.create(input);
  expect(posts).toBe(2);
  expect(waits).toEqual([2000]);
});
it('checks the combined weekly cost rather than considering any positive balance sufficient', () => {
  expect(creationCredit({ balanceToman: 100000, currentMonthlyToman: 600000 }, 300000)).toEqual({
    requiredToman: 210000,
    shortfallToman: 110000,
    includesExisting: true,
  });
  expect(
    creationCredit({ balanceToman: 250000, currentMonthlyToman: 600000 }, 300000)?.shortfallToman,
  ).toBe(0);
  expect(creationCredit({ balanceToman: null }, 300000)).toBeNull();
});
