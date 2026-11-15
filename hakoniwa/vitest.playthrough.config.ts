import { defineConfig } from 'vitest/config';

// The D-010 acceptance: the autoplayer walks the no-model build from the prologue to an
// ending on the real engine (src/game/autoplay). Each route is its own file so the
// routes run in parallel workers.
export default defineConfig({
  root: __dirname,
  test: {
    include: ['tests/playthrough/**/*.playthrough.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 30 * 60 * 1000,
  },
});
