import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    // Mirror the Cloudflare Pages Function for local real-API testing.
    // Demo mode bypasses this entirely.
    proxy: {
      '/api/capi': {
        target: 'https://companion.orerve.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/capi/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
  },
});
