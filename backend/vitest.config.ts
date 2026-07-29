import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // The workspace package resolves through node_modules at runtime; pointing
      // Vitest straight at the source keeps tests honest against uncompiled code.
      '@vig/shared': path.resolve(here, '../shared/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // These are pure-function tests over the locked business rules — no database,
    // no network, so they stay fast enough to run on every save.
    testTimeout: 10_000,
  },
});
