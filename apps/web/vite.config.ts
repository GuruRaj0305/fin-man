import { defineConfig } from 'vite';
import { env } from 'node:process';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'maskable-512.png'],
      manifest: {
        name: 'Folio · Personal Finance',
        short_name: 'Folio',
        description: 'Your finances, in focus.',
        theme_color: '#173e35',
        background_color: '#f5f6f2',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 5179,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${env.API_PROXY_PORT ?? '8787'}`, changeOrigin: false },
    },
  },
  preview: {
    port: 5179,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${env.API_PROXY_PORT ?? '8787'}`, changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
