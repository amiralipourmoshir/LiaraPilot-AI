import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'apps/web/src/tests/**/*.test.tsx'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
