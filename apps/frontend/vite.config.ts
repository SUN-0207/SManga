import path from 'node:path';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // autoCodeSplitting: each route's component/loader is emitted as its own
  // lazy chunk, so admin routes (and every non-landing reader route) load only
  // when navigated to — they no longer sit in the entry bundle.
  plugins: [TanStackRouterVite({ autoCodeSplitting: true }), react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived framework deps in one cacheable vendor chunk so they're
        // not re-downloaded when app code changes.
        manualChunks: {
          vendor: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/sitemap.xml': { target: 'http://localhost:3001', changeOrigin: true },
      '/sitemap-stories.xml': { target: 'http://localhost:3001', changeOrigin: true },
      '/sitemap-chapters.xml': { target: 'http://localhost:3001', changeOrigin: true },
      '/robots.txt': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
