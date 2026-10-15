import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Workers AI and Vectorize only run on Cloudflare, so `vite dev` and `vite preview` proxy them to the account, which
 * needs Cloudflare credentials. Without them (CI, Dependabot and fork pull requests) every binding runs locally
 * instead and the Worker falls back: free producer checks only, plain headline fetches for the news.
 * LOCAL_BINDINGS=1 forces this (the browser tests always set it); in CI it is automatic when no API token is set.
 * Deploys are unaffected: `wrangler deploy` always uses the real bindings.
 */
const localBindings = process.env.LOCAL_BINDINGS === '1' || (Boolean(process.env.CI) && !process.env.CLOUDFLARE_API_TOKEN);

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare({ remoteBindings: !localBindings })],
});
