import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The Workers runtime module does not exist in Node; tests that import the Worker entry get an empty stand-in
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./worker/testing/cloudflare-workers.ts', import.meta.url)) },
  },
  test: {
    include: ['{src,worker,shared}/**/*.test.ts'],
    environment: 'node',
  },
});
