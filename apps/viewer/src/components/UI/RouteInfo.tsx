import React from 'react';
import { useRouteStore } from '../../stores/routeStore';
import { useMapStore } from '../../stores/mapStore';

export const RouteInfo: React.FC = () => {
  const currentRoute = useRouteStore((state) => state.currentRoute);
  const fromQuery = useRouteStore((state) => state.fromQuery);
  const toQuery = useRouteStore((state) => state.toQuery);
  const clearRoute = useRouteStore((state) => state.clearRoute);
  const graph = useMapStore((state) => state.graph);

  // Не показываем, если нет маршрута
  if (!currentRoute) {
    return null;
  }

  // Считаем примерное время (50м/мин = средняя скорость ходьбы в помещении)
  const estimatedMinutes = Math.max(1, Math.round(currentRoute.totalDistance / 50));

  return (
    <div
      className="
        absolute bottom-6 left-1/2 -translate-x-1/2
        w-[calc(100%-2rem)] max-w-md
        bg-white rounded-2xl shadow-xl
        overflow-hidden
        animate-slide-up
      "
      style={{ zIndex: 1000 }}
    >
      {currentRoute.found ? (
        <div className="p-4">
          {/* Заголовок */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-green-600 font-semibold mb-1">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Маршрут готов</span>
              </div>
              <p className="text-sm text-gray-500 truncate">
                {fromQuery} → {toQuery}
              </p>
            </div>
            <button
              onClick={clearRoute}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-600"
              aria-label="Закрыть"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Статистика */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-gray-600">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>~{estimatedMinutes} мин</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-600">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{currentRoute.path.length} точек</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-red-500">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-semibold">Маршрут не найден</span>
            </div>
            <button
              onClick={clearRoute}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {currentRoute.error ?? 'Попробуйте выбрать другие точки'}
          </p>
        </div>
      )}
    </div>
  );
};
