import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMapBearing } from '@campus-map/mapkit';
import { WIDE_LAYOUT_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { floorsOfBuilding, useMapStore } from '../../stores/mapStore';
import { useUiStore } from '../../stores/uiStore';
import { railContentFor } from '../../utils/railLayout';
import { Compass } from '../UI/Compass';
import { FloorSelector } from '../UI/FloorSelector';
import { ZoomControls } from '../UI/ZoomControls';

/**
 * Правая колонка управления картой: этажи сверху, масштаб снизу.
 *
 * Одна flex-колонка между шапкой и нижней карточкой, а не два независимо
 * позиционированных блока. Раньше панель этажей стояла по центру экрана без
 * ограничения высоты и на корпусе в 11 этажей наезжала на кнопки масштаба и
 * уходила за край телефона. Теперь этажи занимают остаток высоты и
 * прокручиваются, а масштаб виден всегда.
 *
 * Колонка живёт внутри карты — кнопкам масштаба нужен её экземпляр, — поэтому
 * нажатия и прокрутка на ней не должны доходить до Leaflet: иначе прокрутка
 * списка этажей масштабировала бы карту, а перетаскивание по кнопкам двигало
 * план. Событие `click` Leaflet при этом не останавливает, и обработчики
 * React работают.
 *
 * Пока шторка на телефоне раскрыта, кнопок масштаба нет: между шапкой и шторкой
 * остаётся полоса в пару кнопок, и масштаб забирал её у этажей целиком. Этажи
 * нужнее — по шагам маршрута переключаются именно они, а масштабировать можно
 * жестом.
 *
 * По той же причине кнопки уступают место, когда колонка низкая — маленький
 * телефон или текст, увеличенный в настройках: сначала уходит «Показать
 * целиком», потом «+» и «−». Кнопки не сжимаются, и раньше нижние уходили под
 * шторку. Колонку ниже одной кнопки оставляют и этажи (`railContentFor`).
 */
export const MapRail: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const sheetExpanded = useUiStore((s) => s.sheetExpanded);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const floorCount =
    activeFloor && buildingMetas ? floorsOfBuilding(buildingMetas.get(activeFloor.buildingId)).length : 0;

  // Высота колонки в rem: её задают шапка и шторка, а не содержимое, — замер не
  // зацикливается на кнопках, которые от него зависят.
  const [heightRem, setHeightRem] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () =>
      setHeightRem(element.clientHeight / Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
  }, []);

  // Компас — пока карта заметно повёрнута: доли градуса после доводки не в счёт.
  const bearing = useMapBearing();
  const content = railContentFor(heightRem, floorCount, Math.abs(bearing) >= 0.5);
  const zoom = !isWide && sheetExpanded ? 'none' : content.zoom;

  return (
    <div ref={ref} className="campus-map-rail">
      {content.compass && <Compass bearing={bearing} />}
      {content.floors && <FloorSelector />}
      {zoom !== 'none' && <ZoomControls withFit={zoom === 'full'} />}
    </div>
  );
};
