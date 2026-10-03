/// <reference types="vite/client" />

interface Window {
  /** Просмотрщик для проверок в браузере (`scripts/check-browser.mjs`). */
  tourLab?: {
    viewer: import('@photo-sphere-viewer/core').Viewer;
    plugin: import('@photo-sphere-viewer/virtual-tour-plugin').VirtualTourPlugin;
  };
}
