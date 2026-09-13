import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { campusDataPlugin } from '../../tooling/vite-plugin-campus-data.mjs';

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

export default defineConfig({
  base,

  // Собственных статических файлов у редактора нет, и заводить их не нужно:
  // датасет раздаёт плагин. Явный `false` вместо отсутствующего каталога
  // закрывает единственный способ снова получить второго писателя в
  // `dist/data/**` — положить туда копию данных.
  publicDir: false,

  plugins: [
    react(),

    // Редактор читает тот же датасет из корня монорепо, что и навигатор.
    campusDataPlugin({ sourceDir: dataDir }),
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
