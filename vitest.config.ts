import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    fsModuleCache: false,
    setupFiles: ['./src/shared/test/setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/domain/**/*.ts'],
      exclude: ['src/domain/**/*.test.ts', 'src/domain/**/test/**', 'src/domain/**/index.ts'],
      thresholds: {
        lines: 90,
        'src/domain/matches/scoring/**': { branches: 100 },
        'src/domain/matches/service.ts': { branches: 100 },
      },
    },
  },
});
