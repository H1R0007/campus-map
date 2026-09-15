import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import App from './App';
import { ErrorBoundary } from './components/UI/ErrorBoundary';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import { warmCacheWhenControlled } from './pwa/warmCache';
import { startThemeSync } from './theme/themeSync';
import './index.css';

/**
 * Точка входа навигатора.
 *
 * Стили Leaflet импортируются из npm-пакета, а не подключаются с CDN в
 * `index.html`: внешний ресурс не должен быть точкой отказа сервиса,
 * развёрнутого у вуза, и только так работает офлайн-режим PWA.
 *
 * Service worker регистрирует `registerServiceWorker`, а не `vite-plugin-pwa`
 * (`injectRegister: false`): новая версия ждёт согласия человека, а не
 * перезагружает страницу посреди маршрута (запись 27). В dev-режиме регистрации
 * нет: файла service worker там нет, и по его пути отдаётся `index.html`.
 *
 * `ErrorBoundary` — снаружи приложения: ошибка отрисовки в любом его месте
 * показывает понятный экран, а не белую страницу.
 */

// Тема — до отрисовки приложения (запись 34).
startThemeSync();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Не найден контейнер #root — проверьте index.html');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

registerServiceWorker();

// Данные и планы, загруженные до того, как service worker взял страницу под
// управление, — в его кэш (запись 26).
warmCacheWhenControlled();
