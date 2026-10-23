import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      useCredentials: true,
      includeAssets: [
        'spotter-runner-192.png',
        'spotter-runner-512.png',
        'spotter-runner-maskable-512.png',
      ],
      manifest: {
        name: 'Spotter Workout Tracker',
        short_name: 'Spotter',
        description: 'Offline-first workout tracking',
        id: '/',
        theme_color: '#07100d',
        background_color: '#07100d',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        prefer_related_applications: false,
        icons: [
          {
            src: '/spotter-runner-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/spotter-runner-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/spotter-runner-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/media/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'spotter-exercise-media-v1',
              expiration: { maxEntries: 200, maxAgeSeconds: 31_536_000 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
