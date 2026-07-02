import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'dist-electron'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['electron/ai/web-tools.ts', 'electron/ai/code-tools.ts', 'electron/safety/classifier.ts'],
      exclude: ['node_modules', 'dist', 'tests'],
      thresholds: {
        statements: 35,
        branches: 25,
        functions: 25,
        lines: 35,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@electron': resolve(__dirname, './electron'),
    },
  },
});
