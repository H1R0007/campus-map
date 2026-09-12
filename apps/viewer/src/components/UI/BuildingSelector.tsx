import React from 'react';
import { useMapStore } from '../../stores/mapStore';

export const BuildingSelector: React.FC = () => {
  const viewMode = useMapStore((state) => state.viewMode);
  const campusMeta = useMapStore((state) => state.campusMeta);
  const buildingMetas = useMapStore((state) => state.buildingMetas);
  const setActiveFloor = useMapStore((state) => state.setActiveFloor);
  const getFloorsForBuilding = useMapStore((state) => state.getFloorsForBuilding);

  // Показываем только на кампусе
  if (viewMode !== 'campus') {
    return null;
  }

  return (
    <div
      className="absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-auto"
      style={{ zIndex: 1000 }}
    >
      <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
        {campusMeta?.buildings.map((building) => {
          const meta = buildingMetas.get(building.id);
          const floors = getFloorsForBuilding(building.id);
          const firstFloor = floors[floors.length - 1] ?? 1;

          return (
            <button
              key={building.id}
              onClick={() => setActiveFloor(building.id, firstFloor)}
              className="
                flex-shrink-0
                px-4 py-2.5 rounded-xl
                bg-white shadow-md
                text-sm font-medium text-gray-700
                hover:shadow-lg hover:bg-gray-50
                transition-all
                flex items-center gap-2
              "
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              {meta?.name ?? building.id}
            </button>
          );
        })}
      </div>
    </div>
  );
};
