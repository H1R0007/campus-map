import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { campusDataPlugin } from '../../tooling/vite-plugin-campus-data.mjs';

export default defineConfig({
  plugins: [
    react(),

    // Редактор читает тот же датасет из корня монорепо, что и навигатор.
    campusDataPlugin({ sourceDir: path.resolve(__dirname, '../../data') }),
  ],

  server: {
    // Dev-сервер доступен через прокси и туннели预览образования.
    allowedHosts: ['.e2b.app', 'localhost'],
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
