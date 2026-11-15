import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    include: ['tests/**/*.test.ts'],
    // The no-model playthroughs are slow; they run on their own (npm run playthrough).
    exclude: ['tests/playthrough/**', '**/node_modules/**'],
    environment: 'node',
    // Full-world runs (all systems, a game day) are CPU heavy under parallel load.
    testTimeout: 30000,
  },
});
