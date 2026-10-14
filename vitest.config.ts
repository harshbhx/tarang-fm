import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{src,worker,shared}/**/*.test.ts'],
    environment: 'node',
  },
});
