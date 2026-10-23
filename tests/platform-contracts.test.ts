import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { platforms, getPlatform } from '../packages/shared/src/platforms.js';
import { LiaraDeploymentProvider } from '../packages/deployment/src/provider.js';
import { detectProject } from '../packages/github-adapter/src/detect.js';
describe('all fourteen Liara platform contracts', () => {
  it('keeps every original icon locally without replacing it with an unrelated logo', () => {
    expect(platforms).toHaveLength(14);
    expect(new Set(platforms.map((p) => p.id)).size).toBe(14);
    for (const p of platforms) {
      const bytes = readFileSync(
        new URL(`../apps/web/public/platforms/${p.id}.png`, import.meta.url),
      );
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBe(275);
    }
    expect(getPlatform('Laravel')?.id).toBe('laravel');
    expect(getPlatform('Next.js')?.id).toBe('next');
    expect(getPlatform('Express')?.id).toBe('node');
    expect(getPlatform('unrecognized')).toBeUndefined();
  });
  it.each(platforms)(
    'uses the correct provider platform for $name rather than forcing Node.js',
    async (platform) => {
      const bodies: { path: string; body: any }[] = [];
      const client = new LiaraDeploymentProvider('fixture-token', '', async (input, init) => {
        const path = new URL(String(input)).pathname;
        const body = JSON.parse(String(init?.body));
        bodies.push({ path, body });
        return Response.json(path.includes('/releases') ? { releaseID: 'fixture-release' } : {});
      });
      await client.create({
        name: 'sample-app',
        platform: platform.id,
        planId: 'fixture-plan',
        bundleId: 'free',
        networkId: 'fixture-network',
      });
      await client.release(
        'sample-app',
        'fixture-source',
        platform.id === 'node' ? 3000 : 80,
        platform.id,
        null,
        undefined,
        { version: 'test' },
      );
      expect(bodies[0]!.body.platform).toBe(platform.id);
      expect(bodies[1]!.body.type).toBe(platform.id);
      expect(bodies[1]!.body.platformConfig).toEqual({ version: 'test' });
    },
  );
  it('recognizes a plain PHP website and a standard-library Python entry without package.json', () => {
    const php = detectProject({ 'index.php': '<?php echo "hello";' }, ['index.php']);
    expect(php.framework).toBe('php');
    expect(php.install).toBeNull();
    const python = detectProject({ 'main.py': 'from http.server import HTTPServer' }, ['main.py']);
    expect(python.framework).toBe('python');
    expect(python.start).toBe('python3 main.py');
  });
});
