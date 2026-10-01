import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { Connect, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { campusDataPlugin } from '../../tooling/vite-plugin-campus-data.mjs';

/**
 * Прототип экскурсий 360° (запись 90). Не развёртывается: проверка формата
 * привязки панорам к графу и того, как это выглядит для студента.
 */

const repoRoot = path.resolve(__dirname, '../..');

/** Каталог датасета — как у навигатора: канонический `data/` или `CAMPUS_DATA_DIR`. */
const dataDir = process.env.CAMPUS_DATA_DIR
  ? path.resolve(process.cwd(), process.env.CAMPUS_DATA_DIR)
  : path.join(repoRoot, 'data');

/**
 * Каталог снимков. Снимки — вне git и вне `data/`: тяжёлые, а на настоящих
 * может быть то, что публиковать нельзя. По умолчанию — `.local/panoramas`,
 * куда кладёт открытые снимки `pnpm --filter @campus-map/tour-lab samples`.
 */
const panoramasDir = process.env.CAMPUS_PANORAMAS_DIR
  ? path.resolve(process.cwd(), process.env.CAMPUS_PANORAMAS_DIR)
  : path.join(repoRoot, '.local', 'panoramas');

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

/**
 * Раздаёт снимки по `/panoramas/*` в dev и preview. В сборку они не попадают:
 * у развёрнутой экскурсии своё хранилище (`CAMPUS_PANORAMA_BASE`).
 */
function panoramasPlugin(): Plugin {
  const mount = '/panoramas/';

  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split('?')[0] ?? '';
    if (!url.startsWith(mount)) return next();

    let relative: string;
    try {
      relative = decodeURIComponent(url.slice(mount.length));
    } catch {
      res.statusCode = 400;
      res.end('Bad request');
      return;
    }

    const file = path.resolve(panoramasDir, relative);
    if (relative.includes('\\') || !file.startsWith(`${panoramasDir}${path.sep}`)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    const type = MIME[path.extname(file).toLowerCase()];
    if (!type || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', String(statSync(file).size));
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  };

  return {
    name: 'campus-map:panoramas',
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}

export default defineConfig({
  plugins: [react(), campusDataPlugin({ sourceDir: dataDir }), panoramasPlugin()],

  define: {
    // Адрес хранилища снимков развёрнутой экскурсии; пусто — `/panoramas/` этого сервера.
    __PANORAMA_BASE__: JSON.stringify(process.env.CAMPUS_PANORAMA_BASE ?? ''),
  },

  server: { port: 3002 },

  build: {
    // Просмотрщик панорам с three.js — одна большая часть; прототипу её не делить.
    chunkSizeWarningLimit: 1500,
  },
});
