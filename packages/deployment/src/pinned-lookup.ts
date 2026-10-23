import type { LookupFunction } from 'node:net';
/** Node's autoSelectFamily requests all addresses; preserve the lookup callback contract. */
export function pinnedLookup(address: { address: string; family: number }): LookupFunction {
  return (_host, options, callback) => {
    if (options.all) callback(null, [{ address: address.address, family: address.family }]);
    else callback(null, address.address, address.family);
  };
}
