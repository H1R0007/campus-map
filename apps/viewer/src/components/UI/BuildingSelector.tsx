import React from 'react';
import { entranceFloorOf, useMapStore } from '../../stores/mapStore';

/**
 * Выбор корпуса на карте кампуса.
 *
 * Показывается только в режиме кампуса и ведёт на входной этаж: заданный в
 * метаданных корпуса, а без него — низший **надземный**, а не низший вообще.
 * В корпусе с подвалом студент должен попадать во входную группу, а не в
 * цокольный этаж (см. `entranceFloorOf`).
 */
export const BuildingSelector: React.FC = () => {
  const activeFloor = useMapStore((s) => s.activeFloor);
  const campusMeta = useMapStore((s) => s.campusMeta);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);

  if (activeFloor !== null || !campusMeta || !buildingMetas) return null;

  return (
    <div
      className="absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-auto"
      style={{ zIndex: 1000 }}
    >
      <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
        {campusMeta.buildings.map((building) => {
          const meta = buildingMetas.get(building.id);

          return (
            <button
              key={building.id}
              type="button"
              onClick={() => setActiveFloor(building.id, entranceFloorOf(meta))}
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
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              {meta?.name ?? building.name ?? building.id}
            </button>
          );
        })}
      </div>
    </div>
  );
};
