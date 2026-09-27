import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import App from './App';
import { SPACE } from './config/space';
import './index.css';

/**
 * Точка входа редактора.
 *
 * Стили Leaflet импортируются из npm-пакета, а не подключаются с CDN в
 * `index.html`: редактор должен открываться в локальной сети вуза без
 * доступа к внешним сервисам.
 */

// Вкладка с учебной копией подписана иначе: две вкладки редактора рядом
// не должны путаться (запись 55).
if (SPACE === 'sandbox') document.title = `Учебная копия — ${document.title}`;

const container = document.getElementById('root');
if (!container) {
  throw new Error('Не найден контейнер #root — проверьте index.html');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
