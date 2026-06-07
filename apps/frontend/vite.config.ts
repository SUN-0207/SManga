import path from 'node:path';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      // SEO endpoints live at root (not under /api/v1) in prod — Caddy
      // routes them via the @seo matcher. Mirror that locally so dev sees
      // the same shape as production.
      '/sitemap.xml': { target: 'http://localhost:3001', changeOrigin: true },
      '/sitemap-stories.xml': { target: 'http://localhost:3001', changeOrigin: true },
      '/sitemap-chapters.xml': { target: 'http://localhost:3001', changeOrigin: true },
      '/robots.txt': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
