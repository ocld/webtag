import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://ocld.github.io',
  base: process.env.ASTRO_BASE ?? '/',
  integrations: [react()],
  output: 'static',
  vite: {
    optimizeDeps: {
      exclude: ['taglib-wasm'],
    },
    assetsInclude: ['**/*.wasm'],
  },
});
