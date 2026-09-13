import React from 'react';
import { buildingName } from '@campus-map/core';
import { entranceFloorOf, useMapStore } from '../../stores/mapStore';
import { formatFloor, messagesFor, useLanguage } from '../../i18n';
import { buildingLabel } from '../../utils/placeLabels';
import { LanguageSwitch } from './LanguageSwitch';

/**
 * Шапка карты: где я и куда можно перейти.
 *
 * На территории — корпуса лентой: при пяти и более корпусах она
 * прокручивается, а выбор корпуса ведёт на входной этаж (`entranceFloorOf`).
 * В корпусе — возврат на территорию, имя корпуса и этаж. Раньше имя корпуса и
 * «назад» стояли в колонке этажей: заслоняли план и отнимали у списка этажей
 * высоту.
 *
 * Переключатель языка — всегда в правом углу, на первом экране: иностранный
 * студент не должен искать его в интерфейсе, который не может прочитать.
 * Раньше он делил поисковую карточку с подсказкой, и та обрезалась.
 */
export const MapHeader: React.FC = () => {
  const activeFloor = useMapStore((s) => s.activeFloor);
  const campusMeta = useMapStore((s) => s.campusMeta);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const clearActiveFloor = useMapStore((s) => s.clearActiveFloor);
  const language = useLanguage();
  const messages = messagesFor(language);

  if (!campusMeta || !buildingMetas) return null;

  return (
    <header className="campus-map-header">
      {activeFloor === null ? (
        <div className="flex-1 min-w-0 overflow-x-auto campus-no-scrollbar">
          <div className="flex gap-2 w-max py-1">
            {campusMeta.buildings.map((building) => {
              const meta = buildingMetas.get(building.id);

              return (
                <button
                  key={building.id}
                  type="button"
                  onClick={() => setActiveFloor(building.id, entranceFloorOf(meta))}
                  className="h-11 px-4 rounded-xl bg-white shadow-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {meta ? buildingName(meta, language) : building.name ?? building.id}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={clearActiveFloor}
            className="w-11 h-11 flex-shrink-0 rounded-xl bg-white shadow-md flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors"
            title={messages.map.backToCampus}
            aria-label={messages.map.backToCampus}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-white shadow-md flex flex-col justify-center">
            <div className="text-sm font-semibold text-gray-800 truncate">
              {buildingLabel(buildingMetas, activeFloor.buildingId, language)}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {messages.map.floor(formatFloor(activeFloor.floor))}
            </div>
          </div>
        </>
      )}

      <div className="flex-shrink-0 rounded-xl bg-white shadow-md p-1">
        <LanguageSwitch />
      </div>
    </header>
  );
};
