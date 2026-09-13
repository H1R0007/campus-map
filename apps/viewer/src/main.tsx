import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import App from './App';
import { ErrorBoundary } from './components/UI/ErrorBoundary';
import './index.css';

/**
 * Точка входа навигатора.
 *
 * Стили Leaflet импортируются из npm-пакета, а не подключаются с CDN в
 * `index.html`: внешний ресурс не должен быть точкой отказа сервиса,
 * развёрнутого у вуза, и только так работает офлайн-режим PWA.
 *
 * Регистрация service worker здесь не нужна — её выполняет
 * `vite-plugin-pwa` (`registerType: 'autoUpdate'`). Ручная регистрация
 * `/sw.js` дублировала её и в dev-режиме всегда падала, потому что по этому
 * пути отдаётся `index.html`.
 *
 * `ErrorBoundary` — снаружи приложения: ошибка отрисовки в любом его месте
 * показывает понятный экран, а не белую страницу.
 */

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
