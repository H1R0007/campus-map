import React, { useId } from 'react';
import { messagesFor, useLanguage } from '../../i18n';
import { pluralize } from '../../i18n/plural';
import { floorsOfBuilding, shownFloorOf, useMapStore } from '../../stores/mapStore';
import { buildingLabel } from '../../utils/placeLabels';
import { Icon } from './Icon';

interface BuildingListProps {
  /** Вызывается перед переходом в корпус — например, чтобы закрыть поиск. */
  onChoose?: () => void;
  /** Только эти корпуса — например, найденные по запросу; по умолчанию все. */
  buildingIds?: readonly string[];
}

/**
 * Корпуса кампуса списком; выбор открывает этаж, открытый в корпусе последним,
 * а впервые — входной.
 *
 * Лента корпусов в шапке есть только на карте территории. Из корпуса в соседний
 * этим списком попадают без возврата на территорию, а при пяти и более корпусах
 * список читается легче ленты.
 */
export const BuildingList: React.FC<BuildingListProps> = ({ onChoose, buildingIds }) => {
  const campusMeta = useMapStore((s) => s.campusMeta);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const buildingFloors = useMapStore((s) => s.buildingFloors);
  const language = useLanguage();
  const messages = messagesFor(language);
  // Список бывает на экране дважды — в панели и в поиске на её месте.
  const titleId = useId();

  const buildings = campusMeta
    ? campusMeta.buildings.filter((building) => !buildingIds || buildingIds.includes(building.id))
    : [];
  if (!buildingMetas || buildings.length === 0) return null;

  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className="px-1 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {messages.search.buildings}
      </h3>

      <ul className="space-y-1">
        {buildings.map((building) => {
          const meta = buildingMetas.get(building.id);
          const floors = floorsOfBuilding(meta).length;
          const isCurrent = activeFloor?.buildingId === building.id;

          return (
            <li key={building.id}>
              <button
                type="button"
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => {
                  onChoose?.();
                  setActiveFloor(building.id, shownFloorOf(buildingFloors, meta, building.id));
                }}
                className={`w-full min-h-[3.5rem] px-3 py-2 rounded-xl flex items-center gap-3 text-left transition-colors ${
                  isCurrent ? 'bg-selected' : 'hover:bg-gray-50'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="w-9 h-9 flex-shrink-0 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"
                >
                  <Icon name="building" size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base text-gray-900 truncate">
                    {buildingLabel(buildingMetas, building.id, language)}
                  </span>
                  {floors > 0 && (
                    <span className="block text-sm text-gray-600">
                      {floors} {pluralize(language, floors, messages.route.floorsWord)}
                    </span>
                  )}
                </span>
                <Icon name="forward" size={18} className="flex-shrink-0 text-gray-400" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
