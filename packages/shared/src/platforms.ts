export const platforms = [
  { id: 'node', name: 'Node.js', description: 'سرور و برنامه‌های JavaScript', color: '#25c983' },
  {
    id: 'next',
    name: 'Next.js',
    description: 'وب‌سایت و برنامه‌های React با رندر سرور',
    color: '#49dacb',
  },
  {
    id: 'laravel',
    name: 'Laravel',
    description: 'بک‌اند PHP همراه با ابزارهای فرانت‌اند',
    color: '#ff586b',
  },
  { id: 'php', name: 'PHP', description: 'وب‌سایت و برنامه‌های PHP', color: '#32c7cf' },
  { id: 'python', name: 'Python', description: 'برنامه‌ها و وب‌سرورهای Python', color: '#efbd4e' },
  { id: 'django', name: 'Django', description: 'وب‌سایت و API بر پایه Python', color: '#24c6bc' },
  { id: 'flask', name: 'Flask', description: 'وب‌سرور سبک Python', color: '#5ce1d1' },
  { id: 'dotnet', name: '.NET', description: 'برنامه‌ها و وب‌سرورهای C# و .NET', color: '#c16cff' },
  {
    id: 'react',
    name: 'React',
    description: 'رابط وب با Vite یا Create React App',
    color: '#7e8cff',
  },
  { id: 'angular', name: 'Angular', description: 'برنامه‌های وب با Angular CLI', color: '#ff5b7c' },
  { id: 'vue', name: 'Vue', description: 'رابط وب با Vite یا Vue CLI', color: '#26d89b' },
  {
    id: 'static',
    name: 'Static',
    description: 'صفحه‌های HTML، CSS و JavaScript',
    color: '#ff8554',
  },
  { id: 'go', name: 'Go', description: 'وب‌سرور و برنامه‌های کامپایل‌شده Go', color: '#36d2d8' },
  {
    id: 'docker',
    name: 'Docker',
    description: 'ساخت و اجرا طبق Dockerfile پروژه',
    color: '#5b9cff',
  },
] as const;
export type PlatformId = (typeof platforms)[number]['id'];
const aliases: Record<string, PlatformId> = {
  nodejs: 'node',
  express: 'node',
  fastify: 'node',
  nestjs: 'node',
  nuxt: 'node',
  nextjs: 'next',
  vuejs: 'vue',
  golang: 'go',
  net: 'dotnet',
  aspnet: 'dotnet',
  aspnetcore: 'dotnet',
  fastapi: 'python',
  symfony: 'php',
};
export function getPlatform(value?: string | null) {
  const normalized = (value ?? '').toLowerCase().replace(/[.\s_-]/g, '');
  const id = aliases[normalized] ?? normalized;
  return platforms.find((p) => p.id === id);
}
