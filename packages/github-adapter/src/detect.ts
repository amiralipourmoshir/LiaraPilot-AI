import type { RepositoryManifest } from '../../shared/src/repository.js';
export function detectProject(
  texts: Record<string, string>,
  paths: string[],
  preferredRoot?: string,
  preferredRuntime?: string,
) {
  const evidence: RepositoryManifest['evidence'] = [];
  const blockers: string[] = [];
  const env = new Set<string>();
  const databases = new Set<string>();
  let scriptsFound: Record<string, string> = {};
  let platformConfig: Record<string, string | boolean | number> = {};
  let framework = 'unsupported';
  let platform = 'docker';
  let start: string | null = null;
  let install: string | null = null;
  let build: string | null = null;
  let port = 3000;
  let healthPath = '/';
  let expectedText = '';
  let outputDir: string | null = null;
  let minRamGb = 0.5;
  let root = '';
  const has = (f: string) => paths.includes(f);
  const note = (path: string, finding: string) => evidence.push({ path, finding });
  const roots = [
    ...new Set(
      paths
        .filter((p) =>
          /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|composer\.json|go\.mod|Dockerfile|manage\.py|artisan|Pipfile|index\.php|main\.py|index\.html)$|\.csproj$/.test(
            p,
          ),
        )
        .map((p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')),
    ),
  ];
  if (
    !has('package.json') &&
    !has('Dockerfile') &&
    !has('requirements.txt') &&
    !has('pyproject.toml') &&
    !has('composer.json') &&
    !has('go.mod') &&
    !paths.some((p) => !p.includes('/') && p.endsWith('.csproj')) &&
    !has('index.html')
  ) {
    if (roots.length === 1) root = roots[0]!;
    else if (roots.length > 1)
      blockers.push('این مخزن چند برنامه دارد؛ پوشه برنامه باید مشخص شود.');
  }
  if (preferredRoot !== undefined) {
    if (!roots.includes(preferredRoot)) throw new Error('INVALID_PROJECT_ROOT');
    root = preferredRoot;
    for (let i = blockers.length - 1; i >= 0; i--)
      if (blockers[i]!.includes('چند برنامه')) blockers.splice(i, 1);
  }
  const at = (p: string) => texts[root + p] ?? '';
  const exists = (p: string) => has(root + p);
  const found = (p: string, s: string) => note(root + p, s);
  const parse = (
    path: string,
  ): {
    require?: Record<string, string>;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } => {
    try {
      const value = JSON.parse(at(path));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };
  const composer = parse('composer.json');
  const packageData = parse('package.json');
  const packageDeps = { ...packageData.dependencies, ...packageData.devDependencies };
  const localPaths = paths.filter(
    (p) => p.startsWith(root) && !p.slice(root.length).includes('/node_modules/'),
  );
  const pythonFiles = Object.entries(texts).filter(
    ([p]) =>
      p.startsWith(root) &&
      /(?:requirements[^/]*\.txt|pyproject\.toml|Pipfile|manage\.py|settings\.py)$/.test(p),
  );
  const pythonEvidence = pythonFiles.map(([, text]) => text).join('\n');
  const hasPhp =
    exists('index.php') ||
    (exists('composer.json') &&
      (!!composer.require?.['laravel/framework'] ||
        !!composer.require?.php ||
        localPaths.some((p) => p.endsWith('.php')) ||
        !exists('package.json')));
  const hasPython =
    exists('main.py') ||
    exists('manage.py') ||
    ((exists('requirements.txt') || exists('pyproject.toml') || exists('Pipfile')) &&
      (!exists('package.json') ||
        localPaths.some((p) => /(?:^|\/)(?:main|app|wsgi|asgi)\.py$/.test(p)) ||
        /django|flask|fastapi/i.test(pythonEvidence)));
  const hasGo = exists('go.mod');
  const hasDotnet = localPaths.some(
    (p) => !p.slice(root.length).includes('/') && p.endsWith('.csproj'),
  );
  const hasNodeServer = !!(
    packageDeps.express ||
    packageDeps.fastify ||
    packageDeps['@nestjs/core'] ||
    packageDeps.next ||
    packageDeps.nuxt
  );
  const runtimeCandidates = [
    ...(hasPhp ? ['php'] : []),
    ...(hasPython ? ['python'] : []),
    ...(hasGo ? ['go'] : []),
    ...(hasDotnet ? ['dotnet'] : []),
    ...(hasNodeServer ? ['node'] : []),
  ];
  const selectedRuntime =
    preferredRuntime && runtimeCandidates.includes(preferredRuntime)
      ? preferredRuntime
      : (runtimeCandidates[0] ??
        (exists('package.json') ? 'node' : exists('Dockerfile') ? 'docker' : null));
  if (
    preferredRuntime &&
    !runtimeCandidates.includes(preferredRuntime) &&
    preferredRuntime !== selectedRuntime
  )
    blockers.push('نوع اجرای انتخاب‌شده با شواهد پروژه سازگار نیست.');
  if (runtimeCandidates.length > 1 && !preferredRuntime)
    blockers.push(
      'چند محیط اجرای مستقل در یک پوشه شناسایی شد؛ بخش موردنظر برای انتشار را انتخاب کنید.',
    );
  if (exists('package.json') && (hasPhp || hasPython || hasGo || hasDotnet))
    found(
      'package.json',
      'این فایل ابزارها و وابستگی‌های JavaScript را تعریف می‌کند؛ به‌تنهایی نشان‌دهنده Node.js بودن بک‌اند نیست.',
    );
  if (
    exists('package.json') &&
    !runtimeCandidates.length &&
    roots.some(
      (r) =>
        r &&
        paths.some((p) => p === r + 'manage.py' || p === r + 'composer.json' || p === r + 'go.mod'),
    )
  )
    blockers.push('این مخزن چند برنامه دارد؛ پوشه برنامه باید مشخص شود.');
  if (selectedRuntime === 'php') {
    framework =
      composer.require?.['laravel/framework'] || exists('artisan')
        ? 'laravel'
        : composer.require?.['symfony/framework-bundle']
          ? 'symfony'
          : 'php';
    platform = framework === 'laravel' ? 'laravel' : 'php';
    port = 80;
    install = exists('composer.json') ? 'composer install --no-dev --optimize-autoloader' : null;
    start = 'وب‌سرور مدیریت‌شده لیارا';
    if (framework === 'laravel') {
      const packageScriptData = parse('package.json').scripts ?? {};
      build =
        typeof packageScriptData.production === 'string'
          ? packageScriptData.production
          : typeof packageScriptData.build === 'string'
            ? packageScriptData.build
            : null;
      platformConfig.buildAssets = !!build;
      if (build) {
        install += ' && npm install';
        found(
          'package.json',
          'فرمان ساخت فایل‌های فرانت‌اند در کنار بک‌اند Laravel شناسایی شد؛ نوع سرویس همچنان Laravel است.',
        );
      }
    }
    found(
      exists('composer.json') ? 'composer.json' : 'index.php',
      exists('composer.json')
        ? `پروژه ${framework} و وابستگی‌های Composer شناسایی شد.`
        : 'وب‌سایت PHP از فایل ورودی آن شناسایی شد.',
    );
  } else if (selectedRuntime === 'python') {
    framework = 'python';
    platform = 'python';
    port = 8000;
    install = exists('requirements.txt')
      ? 'pip install -r requirements.txt'
      : exists('pyproject.toml')
        ? 'pip install .'
        : null;
    const req = pythonEvidence;
    if (exists('manage.py') || /(?:^|[\s"'])django(?:[\s"'<>=~!\[]|$)|from django\./im.test(req)) {
      framework = 'django';
      platform = 'django';
      const wsgiFiles = paths.filter((p) => p.startsWith(root) && /(?:^|\/)wsgi\.py$/.test(p));
      const wsgi = wsgiFiles.length === 1 ? wsgiFiles[0] : undefined;
      start = wsgi
        ? `gunicorn ${wsgi.slice(root.length, -3).replaceAll('/', '.')}:application --bind 0.0.0.0:8000`
        : null;
    } else if (/flask/i.test(req)) {
      framework = 'flask';
      platform = 'flask';
      start = exists('app.py') ? 'gunicorn app:app --bind 0.0.0.0:8000' : null;
    } else if (/fastapi/i.test(req)) {
      framework = 'fastapi';
      start = exists('main.py') ? 'uvicorn main:app --host 0.0.0.0 --port 8000' : null;
    }
    if (!start && exists('main.py') && framework === 'python') start = 'python3 main.py';
    if (!start) blockers.push('فایل ورودی Python برای اجرا مشخص نیست.');
    found(
      exists('requirements.txt')
        ? 'requirements.txt'
        : exists('pyproject.toml')
          ? 'pyproject.toml'
          : exists('Pipfile')
            ? 'Pipfile'
            : 'main.py',
      `پروژه ${framework} و فهرست وابستگی‌های Python شناسایی شد.`,
    );
    if (/psycopg/i.test(req)) databases.add('PostgreSQL');
    if (/pymongo/i.test(req)) databases.add('MongoDB');
  } else if (selectedRuntime === 'go') {
    framework = 'go';
    platform = 'go';
    install = 'go mod download';
    build = 'go build';
    start = 'فایل اجرایی Go';
    port = 8080;
    found('go.mod', 'ماژول Go شناسایی شد.');
  } else if (selectedRuntime === 'dotnet') {
    framework = 'dotnet';
    platform = 'dotnet';
    install = 'dotnet restore';
    build = 'dotnet publish';
    const projectPath = localPaths.find(
      (p) => !p.slice(root.length).includes('/') && p.endsWith('.csproj'),
    )!;
    const assembly =
      /<AssemblyName>([A-Za-z0-9_.-]+)<\/AssemblyName>/.exec(texts[projectPath] ?? '')?.[1] ??
      projectPath.slice(root.length, -7);
    start = `dotnet ${assembly}.dll`;
    port = 80;
    note(
      paths.find((p) => p.endsWith('.csproj'))!,
      '.NET از فایل پروژه شناسایی شد.',
    );
  } else if (selectedRuntime === 'node') {
    try {
      const pkg = JSON.parse(at('package.json')) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        workspaces?: unknown;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const scripts = pkg.scripts ?? {};
      scriptsFound = Object.fromEntries(
        Object.entries(scripts).filter(
          ([k, v]) => /^[A-Za-z0-9_:-]{1,80}$/.test(k) && typeof v === 'string' && v.length <= 2000,
        ),
      );
      start =
        scripts.start ??
        scripts['start:prod'] ??
        scripts['start:production'] ??
        scripts.serve ??
        null;
      build = scripts.build ?? null;
      platform = 'node';
      framework = deps.express
        ? 'express'
        : deps.fastify
          ? 'fastify'
          : deps['@nestjs/core']
            ? 'nestjs'
            : 'node';
      if (deps.expo || deps['react-native']) {
        framework = deps.expo ? 'expo' : 'react-native';
        platform = 'static';
        start = null;
        build = null;
        outputDir = 'dist';
        blockers.push(
          'این پروژه اپلیکیشن موبایل است. برای انتشار روی وب باید خروجی وب سازگار ساخته و بررسی شود؛ فایل نصب Android/iOS روی سرویس وب لیارا اجرا نمی‌شود.',
        );
        found(
          'package.json',
          'وابستگی‌های موبایل شناسایی شد؛ فرمان توسعه موبایل به‌عنوان سرور وب منتشر نمی‌شود.',
        );
      } else if (deps.next) {
        framework = 'next';
        platform = 'next';
        minRamGb = 1;
      } else if (deps.nuxt) {
        framework = 'nuxt';
        platform = 'node';
        minRamGb = 1;
      } else if (deps['@angular/core']) {
        framework = 'angular';
        platform = 'angular';
        outputDir = 'dist';
      } else if (deps.vue) {
        framework = 'vue';
        platform = 'vue';
        outputDir = 'dist';
      } else if (deps.react) {
        framework = 'react';
        platform = 'react';
        outputDir = 'build';
        if (deps.vite && build && /vite build/.test(build)) build += ' --outDir build';
      }
      if (outputDir) port = 80;
      install = exists('pnpm-lock.yaml')
        ? 'pnpm install --frozen-lockfile'
        : exists('yarn.lock')
          ? 'yarn install --frozen-lockfile'
          : exists('package-lock.json')
            ? 'npm ci'
            : 'npm install';
      if (pkg.workspaces)
        blockers.push('مخزن چندپکیجی است؛ انتخاب برنامه و تنظیمات workspace به بررسی نیاز دارد.');
      if (!start && !outputDir) {
        const entry = ['server.js', 'app.js', 'index.js'].find((f) => exists(f));
        if (entry) start = `node ${entry}`;
        else blockers.push('فرمان اجرای برنامه از فایل‌ها مشخص نشد؛ تنظیم اجرا لازم است.');
      }
      found('package.json', `فریم‌ورک ${framework} از وابستگی‌ها و scripts شناسایی شد.`);
      if (deps.pg || deps.prisma || deps['@prisma/client'])
        databases.add('PostgreSQL/SQL (نیازمند بررسی تنظیمات)');
      if (deps.mongoose || deps.mongodb) databases.add('MongoDB');
      if (deps.redis || deps.ioredis) databases.add('Redis');
      if (!exists('package-lock.json') && !exists('pnpm-lock.yaml') && !exists('yarn.lock'))
        found(
          'package.json',
          'lockfile موجود نیست؛ نسخه وابستگی‌ها ممکن است در ساخت‌های بعدی تغییر کند.',
        );
    } catch {
      blockers.push('package.json قابل خواندن نیست.');
    }
  } else if (selectedRuntime === 'docker') {
    framework = 'docker';
    platform = 'docker';
    port = Number(/\bEXPOSE\s+(\d+)/i.exec(at('Dockerfile'))?.[1] ?? 3000);
    found('Dockerfile', 'دستور ساخت Docker شناسایی شد؛ وابستگی‌ها طبق همین فایل نصب می‌شوند.');
    install = 'طبق Dockerfile';
    build = 'Docker build';
    start = 'طبق CMD/ENTRYPOINT در Dockerfile';
    if (!/\b(?:CMD|ENTRYPOINT)\b/i.test(at('Dockerfile')))
      blockers.push('Dockerfile فرمان اجرای نهایی ندارد.');
  } else if (exists('index.html')) {
    framework = 'static';
    platform = 'static';
    port = 80;
    start = 'وب‌سرور فایل‌های ایستا';
    found('index.html', 'وب‌سایت ایستا شناسایی شد؛ نصب وابستگی نیاز ندارد.');
  } else
    blockers.push(
      'روش ساخت این پروژه هنوز از فایل‌ها مشخص نیست؛ Dockerfile یا تنظیم اجرای معتبر لازم است.',
    );
  if (exists('Dockerfile') && selectedRuntime !== 'docker') {
    platform = 'docker';
    install = 'طبق Dockerfile';
    build = 'Docker build';
    outputDir = null;
    const exposed = /\bEXPOSE\s+(\d+)/i.exec(at('Dockerfile'));
    if (exposed) port = Number(exposed[1]);
    if (/^\s*(?:CMD|ENTRYPOINT)\s+/im.test(at('Dockerfile'))) {
      start = 'طبق CMD/ENTRYPOINT در Dockerfile';
      for (let i = blockers.length - 1; i >= 0; i--)
        if (
          blockers[i]!.includes('فرمان اجرای برنامه') ||
          blockers[i]!.includes('فایل ورودی Python')
        )
          blockers.splice(i, 1);
    } else blockers.push('Dockerfile فرمان اجرای نهایی ندارد.');
    found(
      'Dockerfile',
      'فریم‌ورک از کد شناسایی شد؛ بسته‌بندی و اجرای نهایی طبق Dockerfile پروژه انجام می‌شود.',
    );
  }
  try {
    const config = JSON.parse(at('liara.json'));
    const source = config[platform];
    if (source && typeof source === 'object')
      for (const key of [
        'version',
        'phpVersion',
        'pythonVersion',
        'buildAssets',
        'collectStatic',
        'mirror',
        'composerMirror',
        'npmMirror',
        'timezone',
      ]) {
        const value = source[key];
        if (typeof value === 'boolean' || (typeof value === 'string' && value.length <= 80))
          platformConfig[key] = value;
      }
  } catch {}
  if (
    platform !== 'docker' &&
    [
      'node',
      'express',
      'fastify',
      'nestjs',
      'next',
      'python',
      'django',
      'flask',
      'fastapi',
    ].includes(framework)
  ) {
    const procfile = /^web:\s*(.+)$/m.exec(at('Procfile'))?.[1]?.trim();
    let args: string[] = [];
    try {
      const config = JSON.parse(at('liara.json'));
      if (
        Array.isArray(config.args) &&
        config.args.length &&
        config.args.every(
          (a: unknown) => typeof a === 'string' && a.length < 1000 && !/[\x00\r\n]/.test(a),
        )
      )
        args = config.args;
    } catch {}
    const declared = args.length ? args.join(' && ') : procfile;
    if (declared) {
      start = declared;
      for (let i = blockers.length - 1; i >= 0; i--)
        if (
          blockers[i]!.includes('فرمان اجرای برنامه') ||
          blockers[i]!.includes('فایل ورودی Python')
        )
          blockers.splice(i, 1);
      found(
        args.length ? 'liara.json' : 'Procfile',
        'فرمان اجرای صریح پروژه از تنظیمات مخزن خوانده شد.',
      );
    }
  }
  if (framework === 'node' && !start && !['server.js', 'app.js', 'index.js'].some(exists)) {
    framework = 'javascript-tooling';
    found(
      'package.json',
      'فایل ابزارهای JavaScript پیدا شد، اما شواهد کافی برای سرور Node.js وجود ندارد.',
    );
  }
  for (const [path, text] of Object.entries(texts)) {
    if (!path.startsWith(root)) continue;
    for (const m of text.matchAll(
      /(?:process\.env\.|os\.(?:environ\.get|getenv)\(['"]|env\(['"])([A-Z][A-Z0-9_]{1,79})/g,
    ))
      if (!['PORT', 'NODE_ENV', 'HOST', 'HOME', 'PATH'].includes(m[1]!)) {
        const rest = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 120);
        const hasDefault =
          /^['"]\s*,\s*(?:['"][^'"]+['"]|true|false|\d+)/.test(rest) ||
          /^\s*(?:\?\?|\|\|)\s*(?:['"][^'"]+['"]|true|false|\d+)/.test(rest);
        if (!hasDefault) env.add(m[1]!);
      }
    if (
      !outputDir &&
      platform !== 'docker' &&
      ['node', 'express', 'fastify', 'nestjs', 'go', 'python', 'fastapi'].includes(framework)
    ) {
      const p =
        /\.listen\(\s*(?:process\.env\.PORT\s*\|\|\s*)?(\d{2,5})|PORT\s*(?:\|\||=|:)\s*(\d{2,5})/.exec(
          text,
        );
      if (p) {
        port = Number(p[1] ?? p[2]);
        note(path, `پورت ${port} از کد شناسایی شد.`);
      }
    }
    const h = /\.(?:get|route)\(\s*['"](\/(?:health|healthz|ready))['"][^\n]{0,140}/.exec(text);
    if (h) {
      healthPath = h[1]!;
      const marker = /['"]([A-Za-z][A-Za-z0-9 -]{1,80})['"]/.exec(
        h[0].slice(h[0].indexOf(healthPath) + healthPath.length + 1),
      );
      if (marker) expectedText = marker[1]!;
      note(path, `مسیر بررسی ${healthPath} از کد شناسایی شد.`);
    }
  }
  return {
    roots,
    platformConfig,
    runtimes: runtimeCandidates,
    scripts: scriptsFound,
    framework,
    platform,
    start,
    install,
    build,
    port,
    healthPath,
    expectedText,
    outputDir,
    root,
    environmentNames: [...env].sort(),
    databases: [...databases],
    minRamGb,
    blockers,
    evidence,
    confidence:
      framework === 'unsupported' ||
      blockers.some((b) => b.includes('چند محیط') || b.includes('چند برنامه'))
        ? 'low'
        : start && framework !== 'node'
          ? 'high'
          : 'medium',
  };
}
