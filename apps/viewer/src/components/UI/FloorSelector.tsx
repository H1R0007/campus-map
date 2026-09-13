import React, { useEffect, useMemo, useRef } from 'react';
import { floorsOfBuilding, useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { formatFloor, messagesFor, useLanguage } from '../../i18n';
import { routeFloorsIn } from '../../utils/routeFloors';

const NO_FLOORS: ReadonlySet<number> = new Set();

/**
 * Этажи открытого корпуса — сверху вниз, как в здании.
 *
 * Список занимает свободную высоту колонки (`MapRail`) и прокручивается: у
 * корпуса в 11 этажей с подвалом кнопки на телефоне не помещаются. Активный
 * этаж прокручивается в видимую часть. Этажи, через которые идёт маршрут,
 * отмечены точкой — видно, куда переключаться, не открывая шаги.
 *
 * Возврат на территорию и имя корпуса — в шапке карты (`MapHeader`).
 */
export const FloorSelector: React.FC = () => {
  const activeFloor = useMapStore((s) => s.activeFloor);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const graph = useMapStore((s) => s.graph);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const language = useLanguage();
  const messages = messagesFor(language);

  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const buildingId = activeFloor?.buildingId ?? null;

  const routeFloors = useMemo(
    () =>
      graph && buildingId !== null && currentRoute?.found
        ? routeFloorsIn(graph, currentRoute.path, buildingId)
        : NO_FLOORS,
    [graph, buildingId, currentRoute]
  );

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeFloor]);

  if (activeFloor === null || !buildingMetas) return null;

  const floors = floorsOfBuilding(buildingMetas.get(activeFloor.buildingId));

  return (
    <nav aria-label={messages.map.floors} className="campus-floor-list">
      {floors.map((floor) => {
        const isActive = floor === activeFloor.floor;
        const isOnRoute = routeFloors.has(floor);
        const label = messages.map.floor(formatFloor(floor));

        return (
          <button
            key={floor}
            ref={isActive ? activeButtonRef : undefined}
            type="button"
            onClick={() => setActiveFloor(activeFloor.buildingId, floor)}
            aria-current={isActive ? 'true' : undefined}
            aria-label={isOnRoute ? messages.map.floorOnRoute(label) : label}
            className={`relative w-11 h-11 flex-shrink-0 flex items-center justify-center text-sm font-semibold transition-colors ${
              isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {formatFloor(floor)}
            {isOnRoute && (
              <span
                aria-hidden="true"
                className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                  isActive ? 'bg-white' : 'bg-blue-600'
                }`}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};
