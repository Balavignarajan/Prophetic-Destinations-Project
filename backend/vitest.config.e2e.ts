import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Neon may be waking from scale-to-zero on the first connection.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
