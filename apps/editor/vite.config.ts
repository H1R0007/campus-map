import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { campusDataPlugin } from '../../tooling/vite-plugin-campus-data.mjs';
import { tablerIconsPlugin } from '../../tooling/vite-plugin-tabler-icons.mjs';

/**
 * Базовый путь развёртывания — как в навигаторе.
 *
 * Редактор внутренний, но разворачивается он тем же способом и там же, что и
 * навигатор, поэтому расходиться в правилах сборки этим двум приложениям
 * незачем.
 *
 *   CAMPUS_BASE_PATH=/map-editor/ pnpm build
 */
const base = normalizeBase(process.env.CAMPUS_BASE_PATH);

function normalizeBase(value?: string): string {
  if (!value) return '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * Каталог датасета. Переопределяется, чтобы поработать на синтетическом
 * наборе целевого объёма, не трогая канонический `data/`.
 */
const dataDir = process.env.CAMPUS_DATA_DIR
  ? path.resolve(process.cwd(), process.env.CAMPUS_DATA_DIR)
  : path.resolve(__dirname, '../../data');

/**
 * Исходники планов — присланные файлы как есть (запись 46). В навигатор не
 * попадают; в проверках подменяются вместе с каталогом данных.
 */
const sourcesDir = process.env.CAMPUS_SOURCES_DIR
  ? path.resolve(process.cwd(), process.env.CAMPUS_SOURCES_DIR)
  : path.resolve(__dirname, '../../data-sources');

/** Загрузки до сохранения; без переменной — во временном каталоге системы. */
const uploadsDir = process.env.CAMPUS_UPLOADS_DIR
  ? path.resolve(process.cwd(), process.env.CAMPUS_UPLOADS_DIR)
  : undefined;

/**
 * Учебная копия данных (запись 55): пробовать правки без риска. Лежит в
 * `.local/`, вне git; в проверках подменяется, как и каталог данных.
 */
const sandboxDir = process.env.CAMPUS_SANDBOX_DIR
  ? path.resolve(process.cwd(), process.env.CAMPUS_SANDBOX_DIR)
  : path.resolve(__dirname, '../../.local/sandbox');

export default defineConfig({
  base,

  // Собственных статических файлов у редактора нет, и заводить их не нужно:
  // датасет раздаёт плагин. Явный `false` вместо отсутствующего каталога
  // закрывает единственный способ снова получить второго писателя в
  // `dist/data/**` — положить туда копию данных.
  publicDir: false,

  plugins: [
    react(),

    // Редактор читает тот же датасет из корня монорепо, что и навигатор, и —
    // в режиме разработки — сохраняет правки прямо в него: команда разметки
    // запускает редактор из репозитория, а результат забирает git.
    campusDataPlugin({ sourceDir: dataDir, sourcesDir, uploadsDir, sandboxDir, writable: true }),

    // Библиотека значков для окна «Все виды» — только в редакторе и только
    // при открытии выбора значка (запись 44).
    tablerIconsPlugin({ packageDir: path.resolve(__dirname, 'node_modules/@tabler/icons') }),
  ],

  server: {
    host: true,
    port: 3001,
    // Не открываем браузер автоматически: корневой `pnpm dev` поднимает оба
    // приложения сразу, и автооткрытие давало бы лишнюю вкладку.
    open: false,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
