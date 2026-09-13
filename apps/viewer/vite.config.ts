import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { DATA_ROOT } from '@campus-map/core';
import { campusDataPlugin } from '../../tooling/vite-plugin-campus-data.mjs';

/**
 * Базовый путь развёртывания.
 *
 * Куда именно вуз поставит сервис — в корень домена или в подкаталог вида
 * `/map/` — на момент разработки неизвестно, а от этого зависят все URL
 * датасета, `start_url` манифеста и регистрация service worker. Поэтому путь
 * задаётся снаружи, а в коде используется `import.meta.env.BASE_URL`, который
 * Vite выводит отсюда же.
 *
 *   CAMPUS_BASE_PATH=/map/ pnpm build
 */
const base = normalizeBase(process.env.CAMPUS_BASE_PATH);

function normalizeBase(value?: string): string {
  if (!value) return '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * Каталог датасета. Переопределяется, чтобы прогнать приложение на
 * синтетическом наборе (5 корпусов × 11 этажей) и увидеть поведение на
 * целевом объёме, не трогая канонический `data/`.
 */
const dataDir = process.env.CAMPUS_DATA_DIR
  ? path.resolve(process.cwd(), process.env.CAMPUS_DATA_DIR)
  : path.resolve(__dirname, '../../data');

/**
 * Правило кэширования для файлов датасета с учётом базового пути.
 *
 * Шаблон намеренно не якорится на `^`: workbox сопоставляет регулярное
 * выражение с полным URL, включая схему и хост, и якорь просто никогда бы не
 * совпал. Достаточно, что префикс с базовым путём встречается в URL.
 */
function dataAssetPattern(suffix: RegExp): RegExp {
  const prefix = `${base}${DATA_ROOT}/`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${prefix}.*${suffix.source}`);
}

export default defineConfig({
  base,

  plugins: [
    react(),

    // Данные живут в корне монорепо в единственном экземпляре и раздаются
    // отсюда же — и в dev, и в прод-сборке.
    campusDataPlugin({ sourceDir: dataDir }),

    VitePWA({
      registerType: 'autoUpdate',

      // Манифест и регистрацию service worker генерирует плагин, поэтому
      // вручную в index.html они не подключаются.
      //
      // Иконки PWA перечислены здесь намеренно: `globPatterns` их не
      // захватывает (png туда добавлять нельзя — под шаблон попали бы все
      // планы этажей), а объявления в `manifest.icons` плагин в precache сам
      // не кладёт. Без этой строки установленное приложение офлайн получало
      // 404 на собственную иконку.
      includeAssets: [
        'favicon.svg',
        'robots.txt',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
      ],

      manifest: {
        name: 'Навигатор по кампусу',
        short_name: 'Кампус',
        description: 'Интерактивная карта корпусов и маршруты между аудиториями',
        lang: 'ru',
        theme_color: '#0063CC',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',

        // Относительные значения, а не '/': при развёртывании в подкаталоге
        // абсолютный путь увёл бы установленное приложение в корень домена.
        start_url: './',
        scope: './',
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

        // Датасет не попадает в precache ни при каких шаблонах: планы этажей
        // качаются по требованию, а не установочным пакетом.
        globIgnores: [`**/${DATA_ROOT}/**`],

        navigateFallback: `${base}index.html`,

        runtimeCaching: [
          {
            // Планы этажей и карта кампуса меняются редко — кэш до перезаписи.
            urlPattern: dataAssetPattern(/\.(?:png|jpe?g|webp|svg)$/),
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
            urlPattern: dataAssetPattern(/\.json$/),
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
