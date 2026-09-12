import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@campus-map/core': path.resolve(__dirname, '../../packages/core/src'),
    },
  },
  server: {
    allowedHosts: ['.e2b.app', 'localhost'],
    port: 3001,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
