import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { campusDataPlugin } from '../../tooling/vite-plugin-campus-data.mjs';

export default defineConfig({
  plugins: [
    react(),

    // Данные живут в корне монорепо в единственном экземпляре и раздаются
    // отсюда же — и в dev, и в прод-сборке.
    campusDataPlugin({ sourceDir: path.resolve(__dirname, '../../data') }),

    VitePWA({
      registerType: 'autoUpdate',

      // Манифест и регистрацию service worker генерирует плагин, поэтому
      // вручную в index.html они не подключаются.
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],

      manifest: {
        name: 'Навигатор по кампусу',
        short_name: 'Кампус',
        description: 'Интерактивная карта корпусов и маршруты между аудиториями',
        lang: 'ru',
        theme_color: '#0063CC',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // В precache попадает только оболочка приложения. Планы этажей и JSON
        // датасета кэшируются на лету: тестовые ассеты весят 2.3 МБ, а
        // официальные планы будут заметно больше, и тянуть их в установочный
        // пакет PWA нецелесообразно.
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        navigateFallback: 'index.html',

        runtimeCaching: [
          {
            // Планы этажей и карта кампуса меняются редко — кэш до перезаписи.
            urlPattern: /\/data\/.*\.(?:png|jpe?g|webp|svg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'campus-maps',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Датасет редактируется, поэтому показываем кэш и обновляем его
            // в фоне: офлайн-работа есть, а устаревшие данные не застревают.
            urlPattern: /\/data\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'campus-data',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],

  server: {
    // Dev-сервер доступен через прокси и туннели预览образования.
    allowedHosts: ['.e2b.app', 'localhost'],
    host: true,
    port: 3000,
    // Не открываем браузер автоматически: корневой `pnpm dev` поднимает оба
    // приложения сразу, и автооткрытие давало бы лишнюю вкладку.
    open: false,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
