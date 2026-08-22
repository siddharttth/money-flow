import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Aggregation tests share one database; running files in parallel would
    // let one suite's seed data leak into another's totals.
    fileParallelism: false,
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
