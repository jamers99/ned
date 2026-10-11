import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Kennedy',
        short_name: 'Kennedy',
        description: 'Sleep-first baby tracker',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        background_color: '#F4EEE3',
        theme_color: '#F4EEE3',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  build: {
    outDir: '../server/Kennedy.API/wwwroot',
    emptyOutDir: true
  },
  server: {
    proxy: { '/api': 'http://localhost:5205' }
  },
  test: {
    environment: 'node'
  }
});
