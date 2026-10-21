import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['spotter.svg'],
      manifest: {
        name: 'Spotter Workout Tracker',
        short_name: 'Spotter',
        description: 'Offline-first workout tracking',
        theme_color: '#07100d',
        background_color: '#07100d',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/spotter.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
