import React from 'react';
import { floorsOfBuilding, useMapStore } from '../../stores/mapStore';

/**
 * Панель этажей внутри корпуса.
 *
 * Этажи перечислены сверху вниз, как в реальном здании, поэтому список
 * отсортирован по убыванию. Кнопка «назад» возвращает к карте кампуса.
 */
export const FloorSelector: React.FC = () => {
  const activeFloor = useMapStore((s) => s.activeFloor);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const clearActiveFloor = useMapStore((s) => s.clearActiveFloor);

  if (activeFloor === null || !buildingMetas) return null;

  const meta = buildingMetas.get(activeFloor.buildingId);
  const floors = floorsOfBuilding(meta);

  return (
    <div
      className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2"
      style={{ zIndex: 1000 }}
    >
      <button
        type="button"
        onClick={clearActiveFloor}
        className="w-10 h-10 rounded-xl bg-white shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700 hover:shadow-lg transition-all mb-2"
        title="Вернуться к кампусу"
        aria-label="Вернуться к карте кампуса"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </button>

      <div className="bg-white rounded-xl shadow-md px-3 py-1.5 mb-1">
        <span className="text-xs font-medium text-gray-600">
          {meta?.name ?? activeFloor.buildingId}
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {floors.map((floor) => {
          const isActive = floor === activeFloor.floor;

          return (
            <button
              key={floor}
              type="button"
              onClick={() => setActiveFloor(activeFloor.buildingId, floor)}
              aria-current={isActive ? 'true' : undefined}
              className={`w-10 h-10 flex items-center justify-center text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {floor}
            </button>
          );
        })}
      </div>
    </div>
  );
};
