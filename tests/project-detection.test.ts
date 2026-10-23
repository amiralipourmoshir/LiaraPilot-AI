import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { detectProject } from '../packages/github-adapter/src/detect.js';
import { GithubRepository } from '../packages/github-adapter/src/index.js';
import { liaraCatalog } from '../packages/deployment/src/catalog.js';
const detect = (files: Record<string, string>) => detectProject(files, Object.keys(files));
describe('evidence-based multi-stack onboarding', () => {
  it.each([
    [
      'Next.js',
      {
        'package.json': JSON.stringify({
          dependencies: { next: '15' },
          scripts: { build: 'next build', start: 'next start' },
        }),
      },
      'next',
      'next',
    ],
    [
      'React Vite',
      {
        'package.json': JSON.stringify({
          dependencies: { react: '19' },
          devDependencies: { vite: '7' },
          scripts: { build: 'vite build' },
        }),
      },
      'react',
      'react',
    ],
    [
      'Vue',
      {
        'package.json': JSON.stringify({
          dependencies: { vue: '3' },
          scripts: { build: 'vite build' },
        }),
      },
      'vue',
      'vue',
    ],
    [
      'Angular',
      {
        'package.json': JSON.stringify({
          dependencies: { '@angular/core': '20' },
          scripts: { build: 'ng build' },
        }),
      },
      'angular',
      'angular',
    ],
    [
      'Docker',
      { Dockerfile: 'FROM node:24\nEXPOSE 4567\nCMD ["node","server.js"]' },
      'docker',
      'docker',
    ],
    [
      'Flask',
      { 'requirements.txt': 'Flask\ngunicorn', 'app.py': 'app = Flask(__name__)' },
      'flask',
      'flask',
    ],
    [
      'FastAPI',
      { 'requirements.txt': 'fastapi\nuvicorn', 'main.py': 'app=FastAPI()' },
      'fastapi',
      'python',
    ],
    [
      'Django',
      {
        'requirements.txt': 'Django\ngunicorn',
        'mysite/wsgi.py': 'application = get_wsgi_application()',
      },
      'django',
      'django',
    ],
    [
      'Laravel',
      { 'composer.json': '{"require":{"laravel/framework":"^12"}}' },
      'laravel',
      'laravel',
    ],
    ['PHP', { 'composer.json': '{"require":{}}' }, 'php', 'php'],
    ['Go', { 'go.mod': 'module example.test/app' }, 'go', 'go'],
    ['.NET', { 'MyApp.csproj': '<Project/>' }, 'dotnet', 'dotnet'],
    ['Static', { 'index.html': '<html>Hello</html>' }, 'static', 'static'],
  ] as const)('detects %s from repository evidence', (_name, files, framework, platform) => {
    const r = detect(files);
    expect(r.framework).toBe(framework);
    expect(r.platform).toBe(platform);
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.blockers).toEqual([]);
  });
  it('infers start and port without a technical user question and does not require a lockfile', () => {
    const r = detect({
      'package.json': '{"dependencies":{"express":"5"}}',
      'server.js':
        "app.listen(process.env.PORT || 4321); app.get('/health', (req,res)=>res.send('healthy'));",
    });
    expect(r.start).toBe('node server.js');
    expect(r.port).toBe(4321);
    expect(r.healthPath).toBe('/health');
    expect(r.install).toBe('npm install');
    expect(r.blockers).toEqual([]);
  });
  it('extracts environment names without exposing values and detects uncertain/monorepo layouts', () => {
    const r = detect({
      'package.json': '{"scripts":{"start":"node app.js"},"dependencies":{"pg":"8"}}',
      'app.js': 'const secret=process.env.DATABASE_URL; const key=process.env.API_TOKEN;',
    });
    expect(r.environmentNames).toEqual(['API_TOKEN', 'DATABASE_URL']);
    expect(r.databases).not.toEqual([]);
    expect(detect({ 'foo.txt': 'unknown' }).blockers.length).toBeGreaterThan(0);
    expect(
      detect({ 'package.json': '{"workspaces":["packages/*"]}' }).blockers.length,
    ).toBeGreaterThan(0);
  });
  it('lists branches of a public repository without authorization and private ones only with a token', async () => {
    const seen: string[] = [];
    const transport: typeof fetch = async (input, init) => {
      seen.push(new Headers(init?.headers).get('authorization') ?? 'none');
      return Response.json(
        String(input).includes('/branches?')
          ? [{ name: 'main' }, { name: 'develop' }]
          : { private: true, default_branch: 'main' },
      );
    };
    await expect(
      new GithubRepository(transport).branches('https://github.com/a/b'),
    ).rejects.toHaveProperty('code', 'GITHUB_AUTH_REQUIRED');
    const result = await new GithubRepository(transport, 'private-fixture').branches(
      'https://github.com/a/b',
    );
    expect(result.branches).toEqual(['main', 'develop']);
    expect(seen.at(-1)).toBe('Bearer private-fixture');
  });
  it('uses official planet names, exact display prices and only available bundles', async () => {
    const result = await liaraCatalog('fixture', '', 0.5, async (input) =>
      Response.json(
        String(input).includes('/v1/me')
          ? {
              team: { balance: 0 },
              plans: {
                projects: {
                  'small-g2': {
                    available: true,
                    region: 'iran',
                    RAM: { amount: 0.5 },
                    CPU: { amount: 0.5 },
                    volume: 5,
                    price: 659.72,
                    displayPrice: 475000,
                  },
                },
                projectBundlePlans: {
                  'small-g2': {
                    free: { available: false, displayPrice: 0 },
                    basic: { available: true, displayPrice: 0, displayHourlyPrice: 0 },
                    standard: { available: true, displayPrice: 475000, displayHourlyPrice: 659 },
                    pro: { available: true, displayPrice: 950000, displayHourlyPrice: 1319 },
                  },
                },
              },
            }
          : { networks: [] },
      ),
    );
    expect(result.plans).toHaveLength(3);
    expect(result.plans.map((p) => p.bundleName)).toEqual(['پایه', 'نقره‌ای', 'طلایی']);
    expect(result.plans.find((p) => p.bundleId === 'standard')).toMatchObject({
      name: 'زمین',
      planet: 'earth',
      estimatedMonthlyToman: 950000,
      estimatedHourlyToman: 1318,
      ramGb: 0.5,
    });
    expect(result.billing.hasCredit).toBe(false);
  });
  it('recommendations use only current account catalog values and include bundle price', async () => {
    const options = await liaraCatalog('private-key', 'team', 1, async (input) =>
      Response.json(
        String(input).includes('/v1/me')
          ? {
              plans: {
                projects: {
                  'g2-test': {
                    available: true,
                    region: 'iran',
                    RAM: { amount: 1 },
                    CPU: { amount: 1 },
                    volume: 10,
                    price: 100,
                  },
                  'g2-hidden': {
                    available: false,
                    region: 'iran',
                    RAM: { amount: 2 },
                    CPU: { amount: 2 },
                    volume: 20,
                  },
                },
                projectBundlePlans: { 'g2-test': { free: { displayPrice: 5000 } } },
              },
            }
          : { networks: [{ _id: 'network1', name: 'شبکه من' }] },
      ),
    );
    expect(options.plans).toHaveLength(1);
    expect(options.plans[0]).toMatchObject({
      id: 'g2-test',
      recommended: true,
      estimatedMonthlyToman: 77000,
    });
    expect(options.networks[0]?.id).toBe('network1');
  });
});

describe('repository binary asset limits', () => {
  it('analyzes and retrieves a large image without treating it as source text', async () => {
    const image = Buffer.alloc(1303228, 42);
    const pkg = Buffer.from('{"dependencies":{"express":"5"},"scripts":{"start":"node app.js"}}');
    const hash = (b: Buffer) =>
      createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
    const imageSha = hash(image),
      pkgSha = hash(pkg),
      commit = 'a'.repeat(40);
    const transport: typeof fetch = async (input) => {
      const u = String(input);
      if (u.includes('/git/blobs/')) {
        const data = u.endsWith(imageSha) ? image : pkg;
        return Response.json({
          sha: hash(data),
          encoding: 'base64',
          size: data.length,
          content: data.toString('base64'),
        });
      }
      if (u.includes('/git/trees/'))
        return Response.json({
          truncated: false,
          tree: [
            { path: 'package.json', type: 'blob', mode: '100644', sha: pkgSha, size: pkg.length },
            {
              path: 'assets/icon.png',
              type: 'blob',
              mode: '100644',
              sha: imageSha,
              size: image.length,
            },
          ],
        });
      if (u.includes('/commits/'))
        return Response.json({ sha: commit, commit: { tree: { sha: commit } } });
      return Response.json({ private: false, default_branch: 'main' });
    };
    const client = new GithubRepository(transport, undefined, { archive: false });
    const manifest = await client.analyze('https://github.com/test/project');
    expect(manifest.files).toHaveLength(2);
    expect((await client.files(manifest))[1]!.data).toEqual(image);
  });
});

it('distinguishes Expo mobile projects from deployable React websites', () => {
  const result = detect({
    'package.json': JSON.stringify({
      dependencies: { expo: '54', react: '19', 'react-native': '0.81' },
      scripts: { start: 'expo start', web: 'expo start --web' },
    }),
  });
  expect(result.framework).toBe('expo');
  expect(result.start).toBeNull();
  expect(result.blockers.join(' ')).toContain('خروجی وب');
});

it('inspects more than 500 files and more than 5MB without downloading binary assets', async () => {
  const pkg = Buffer.from(JSON.stringify({ scripts: { start: 'node app.js' } }));
  const hash = createHash('sha1').update(`blob ${pkg.length}\0`).update(pkg).digest('hex');
  let blobs = 0;
  const client = new GithubRepository(async (input) => {
    const u = String(input);
    if (u.includes('/git/blobs/')) {
      blobs++;
      return Response.json({
        sha: hash,
        encoding: 'base64',
        content: pkg.toString('base64'),
        size: pkg.length,
      });
    }
    if (u.includes('/git/trees/'))
      return Response.json({
        truncated: false,
        tree: [
          { path: 'package.json', type: 'blob', mode: '100644', size: pkg.length, sha: hash },
          ...Array.from({ length: 1200 }, (_, i) => ({
            path: `assets/${i}.png`,
            type: 'blob',
            mode: '100644',
            size: 3500000,
            sha: 'b'.repeat(40),
          })),
        ],
      });
    if (u.includes('/commits/'))
      return Response.json({ sha: 'a'.repeat(40), commit: { tree: { sha: 'a'.repeat(40) } } });
    return Response.json({ private: false, default_branch: 'main' });
  });
  const manifest = await client.analyze('https://github.com/owner/large');
  expect(manifest.files).toHaveLength(1201);
  expect(blobs).toBe(1);
});
it('recovers a truncated recursive GitHub tree by traversing directories', async () => {
  const hash = 'a'.repeat(40),
    sub = 'b'.repeat(40);
  const client = new GithubRepository(async (input) => {
    const u = String(input);
    if (u.includes('?recursive=1')) return Response.json({ truncated: true, tree: [] });
    if (u.includes('/git/trees/' + hash))
      return Response.json({
        truncated: false,
        tree: [{ path: 'public', type: 'tree', mode: '040000', sha: sub }],
      });
    if (u.includes('/git/trees/' + sub))
      return Response.json({
        truncated: false,
        tree: [{ path: 'index.html', type: 'blob', mode: '100644', sha: hash, size: 20 }],
      });
    if (u.includes('/commits/'))
      return Response.json({ sha: hash, commit: { tree: { sha: hash } } });
    return Response.json({ private: false, default_branch: 'main' });
  });
  const manifest = await client.analyze('https://github.com/owner/large');
  expect(manifest.files[0]!.path).toBe('public/index.html');
});

describe('backend identity in mixed-language repositories', () => {
  it('recognizes Laravel with Vite/React assets instead of calling it Node.js', () => {
    const result = detect({
      'composer.json': JSON.stringify({ require: { php: '^8.3', 'laravel/framework': '^12' } }),
      artisan: '<?php',
      'routes/web.php': '<?php',
      'package.json': JSON.stringify({
        dependencies: { react: '19' },
        devDependencies: { vite: '7', 'laravel-vite-plugin': '2' },
        scripts: { dev: 'vite', build: 'vite build' },
      }),
    });
    expect(result.framework).toBe('laravel');
    expect(result.platform).toBe('laravel');
    expect(result.install).toContain('composer');
    expect(result.start).not.toBe('vite');
    expect(result.blockers).toEqual([]);
    expect(
      result.evidence.some((e) => e.path === 'package.json' && e.finding.includes('به‌تنهایی')),
    ).toBe(true);
  });
  it('recognizes Django with a package.json and infers the actual WSGI module', () => {
    const result = detect({
      'manage.py': 'from django.core.management import execute_from_command_line',
      'requirements.txt': 'Django==5.2\ngunicorn==23',
      'core/wsgi.py': 'application=get_wsgi_application()',
      'package.json': JSON.stringify({
        devDependencies: { tailwindcss: '4', vite: '7' },
        scripts: { build: 'vite build' },
      }),
    });
    expect(result.framework).toBe('django');
    expect(result.platform).toBe('django');
    expect(result.start).toBe('gunicorn core.wsgi:application --bind 0.0.0.0:8000');
    expect(result.blockers).toEqual([]);
  });
  it('recognizes Go and .NET despite JavaScript build tools', () => {
    const pkg = JSON.stringify({
      devDependencies: { webpack: '5' },
      scripts: { build: 'webpack' },
    });
    expect(
      detect({
        'go.mod': 'module example.test/app',
        'main.go': 'package main\nfunc main() {}',
        'package.json': pkg,
      }).framework,
    ).toBe('go');
    const dotnet = detect({
      'Backend.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"/>',
      'Program.cs': 'var app=WebApplication.CreateBuilder(args);',
      'package.json': pkg,
    });
    expect(dotnet.framework).toBe('dotnet');
    expect(dotnet.start).toBe('dotnet Backend.dll');
  });
  it('keeps framework identity while using a repository Dockerfile', () => {
    const r = detect({
      'composer.json': '{"require":{"laravel/framework":"12"}}',
      artisan: '<?php',
      Dockerfile: 'FROM php:8.3\nEXPOSE 8080\nCMD ["php","artisan","serve"]',
      'package.json': '{"scripts":{"build":"vite build"}}',
    });
    expect(r.framework).toBe('laravel');
    expect(r.platform).toBe('docker');
    expect(r.port).toBe(8080);
    expect(r.blockers).toEqual([]);
  });
  it('requests a choice for two independent server runtimes in the same directory', () => {
    const files = {
      'composer.json': '{"require":{"laravel/framework":"12"}}',
      'requirements.txt': 'Django==5.2',
      'manage.py': 'from django.core.management import execute_from_command_line',
      'core/wsgi.py': 'application=get_wsgi_application()',
    };
    const initial = detect(files);
    expect(initial.runtimes).toEqual(['php', 'python']);
    expect(initial.confidence).toBe('low');
    expect(initial.blockers.join(' ')).toContain('چند محیط');
    const selected = detectProject(files, Object.keys(files), '', 'python');
    expect(selected.framework).toBe('django');
    expect(selected.blockers).toEqual([]);
  });
  it('does not treat a pyproject used solely for tooling as the website backend', () => {
    const r = detect({
      'package.json':
        '{"dependencies":{"next":"16"},"scripts":{"start":"next start","build":"next build"}}',
      'pyproject.toml': '[tool.ruff]\nline-length=100',
    });
    expect(r.framework).toBe('next');
    expect(r.blockers).toEqual([]);
  });
});
