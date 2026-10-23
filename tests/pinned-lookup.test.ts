import { expect, it } from 'vitest';
import { pinnedLookup } from '../packages/deployment/src/pinned-lookup.js';
it('returns an address array when Node autoSelectFamily requests lookup.all', async () => {
  const lookup = pinnedLookup({ address: '185.208.181.133', family: 4 });
  await new Promise<void>((resolve, reject) =>
    lookup('example.test', { all: true }, (error, addresses, family) => {
      try {
        expect(error).toBeNull();
        expect(addresses).toEqual([{ address: '185.208.181.133', family: 4 }]);
        expect(family).toBeUndefined();
        resolve();
      } catch (e) {
        reject(e);
      }
    }),
  );
  await new Promise<void>((resolve, reject) =>
    lookup('example.test', { all: false }, (error, address, family) => {
      try {
        expect(error).toBeNull();
        expect(address).toBe('185.208.181.133');
        expect(family).toBe(4);
        resolve();
      } catch (e) {
        reject(e);
      }
    }),
  );
});
