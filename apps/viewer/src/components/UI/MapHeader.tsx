import React, { useRef } from 'react';
import type { WheelEvent } from 'react';
import { buildingName } from '@campus-map/core';
import { PHONE_HEADER_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { useScrollEdges } from '../../hooks/useScrollEdges';
import { shownFloorOf, useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { formatFloor, messagesFor, useLanguage } from '../../i18n';
import { buildingLabel } from '../../utils/placeLabels';
import { BuildingMenu } from './BuildingMenu';
import { Icon } from './Icon';
import { LanguageSwitch, LanguageToggle } from './LanguageSwitch';
import { TripBar } from './TripBar';

/** Шаг колеса, заданный строками (так прокручивает Firefox), — в пикселях. */
const WHEEL_LINE_PX = 16;

/**
 * Колесо мыши над лентой корпусов листает её вбок. Полосы прокрутки у ленты
 * нет, и без этого мышью до корпусов за краем было не добраться.
 */
function scrollStripByWheel(event: WheelEvent<HTMLDivElement>): void {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

  const step = event.deltaMode === 1 ? event.deltaY * WHEEL_LINE_PX : event.deltaY;
  event.currentTarget.scrollLeft += step;
}

/**
 * Шапка карты: где я и куда можно перейти.
 *
 * На территории — корпуса лентой: при пяти и более корпусах она
 * прокручивается, а выбор корпуса ведёт на этаж, открытый в нём последним, а
 * впервые — на входной (`shownFloorOf`).
 * Край ленты, за которым есть ещё корпуса, гаснет (`useScrollEdges`): раньше
 * обрезанный чип упирался в переключатель языка, выглядел концом списка, и что
 * ленту можно прокрутить, было не понять. Длинное название корпуса обрезается
 * многоточием, а экранный диктор читает его целиком.
 *
 * В корпусе — возврат на территорию и плашка с корпусом и этажом: она же
 * открывает список корпусов (`BuildingMenu`). Плашка не растягивается на всю
 * ширину: на широком экране растянутая читалась как отдельная панель, а на
 * телефоне закрывала карту под шапкой.
 *
 * На шаге пошаговой навигации вместо этого — ход маршрута и выход из навигации
 * (`TripBar`, запись 23).
 *
 * Переключатель языка — всегда в правом углу, на первом экране: иностранный
 * студент не должен искать его в интерфейсе, который не может прочитать.
 *
 * На телефоне стоя лента корпусов и пара кнопок языка закрывали верх карты
 * целой полосой: там корпуса — кнопкой со списком (`BuildingMenu`), язык —
 * одной кнопкой (`LanguageToggle`). И везде нажатия ловят только сами кнопки:
 * между ними карта видна и отвечает на жесты.
 */
export const MapHeader: React.FC = () => {
  const activeFloor = useMapStore((s) => s.activeFloor);
  const campusMeta = useMapStore((s) => s.campusMeta);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const clearActiveFloor = useMapStore((s) => s.clearActiveFloor);
  const buildingFloors = useMapStore((s) => s.buildingFloors);
  const navigating = useRouteStore((s) => s.stepIndex !== null && s.currentRoute?.found === true);
  const isPhone = useMediaQuery(PHONE_HEADER_QUERY);
  const language = useLanguage();
  const messages = messagesFor(language);

  const stripRef = useRef<HTMLDivElement>(null);
  const hasData = campusMeta !== null && buildingMetas !== null;
  const edges = useScrollEdges(stripRef, hasData && activeFloor === null && !navigating && !isPhone);

  if (!campusMeta || !buildingMetas) return null;

  const stripClassName = [
    'campus-building-strip flex-1 min-w-0 overflow-x-auto campus-no-scrollbar campus-scroll-fade',
    edges.start ? 'campus-scroll-fade--start' : '',
    edges.end ? 'campus-scroll-fade--end' : '',
  ].join(' ');

  return (
    <header className="campus-map-header">
      {navigating ? (
        <TripBar />
      ) : activeFloor === null && isPhone ? (
        <BuildingMenu />
      ) : activeFloor === null ? (
        <div ref={stripRef} onWheel={scrollStripByWheel} className={stripClassName}>
          <div className="flex gap-2 w-max py-1">
            {campusMeta.buildings.map((building) => {
              const meta = buildingMetas.get(building.id);

              return (
                <button
                  key={building.id}
                  type="button"
                  onClick={() => setActiveFloor(building.id, shownFloorOf(buildingFloors, meta, building.id))}
                  className="h-11 max-w-[14rem] px-4 rounded-xl bg-surface shadow-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <Icon name="building" size={16} className="flex-shrink-0 text-gray-500" />
                  <span className="min-w-0 truncate">{meta ? buildingName(meta, language) : building.name ?? building.id}</span>
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
            className="w-11 h-11 flex-shrink-0 rounded-xl bg-surface shadow-md flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors"
            title={messages.map.backToCampus}
            aria-label={messages.map.backToCampus}
          >
            <Icon name="back" />
          </button>

          <BuildingMenu
            current={{
              title: buildingLabel(buildingMetas, activeFloor.buildingId, language),
              subtitle: messages.map.floor(formatFloor(activeFloor.floor)),
            }}
          />
        </>
      )}

      {/* Уже 300 px переключателю нет места рядом с именем корпуса и ходом
          маршрута — он в раскрытой панели (`IdleContent`, запись 28). */}
      <div className="ml-auto flex-shrink-0 compact:hidden">
        {isPhone ? (
          <LanguageToggle />
        ) : (
          <div className="rounded-xl bg-surface shadow-md p-1">
            <LanguageSwitch />
          </div>
        )}
      </div>
    </header>
  );
};
