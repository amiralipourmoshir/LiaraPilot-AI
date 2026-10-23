import { pinnedLookup } from './pinned-lookup.js';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';
import { DeploymentError } from './provider.js';
export function publicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}
export async function verifyHttp(name: string, path: string, expected: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name) || !/^\/[A-Za-z0-9_./-]{0,150}$/.test(path))
    throw new DeploymentError('HEALTH_TARGET_REJECTED');
  const hostname = `${name}.liara.run`;
  let lookupTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_resolve, reject) => {
      lookupTimer = setTimeout(() => reject(new DeploymentError('HEALTH_DNS_TIMEOUT')), 8000);
    }),
  ]).finally(() => clearTimeout(lookupTimer));
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new DeploymentError('HEALTH_ADDRESS_REJECTED');
  const address = addresses[0]!;
  return new Promise<{ status: number; matched: boolean }>((resolve, reject) => {
    const timer = setTimeout(() => req.destroy(new DeploymentError('HEALTH_TIMEOUT')), 8000);
    const req = request(
      {
        hostname,
        servername: hostname,
        path,
        method: 'GET',
        port: 443,
        family: address.family,
        lookup: pinnedLookup(address),
        headers: { accept: 'text/plain, application/json', 'user-agent': 'LiaraPilot-health' },
        rejectUnauthorized: true,
      },
      (response) => {
        let data = '';
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 65536) req.destroy(new DeploymentError('HEALTH_RESPONSE_TOO_LARGE'));
          else data += chunk.toString('utf8');
        });
        response.on('end', () => {
          clearTimeout(timer);
          resolve({
            status: response.statusCode ?? 0,
            matched:
              response.statusCode === 200 &&
              (expected ? data.includes(expected) : data.trim().length > 0),
          });
        });
        response.on('error', () => {
          clearTimeout(timer);
          reject(new DeploymentError('HEALTH_UNAVAILABLE'));
        });
      },
    );
    req.on('error', () => {
      clearTimeout(timer);
      reject(new DeploymentError('HEALTH_UNAVAILABLE'));
    });
    req.end();
  });
}
