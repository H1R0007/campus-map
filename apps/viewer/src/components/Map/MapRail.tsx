import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMapBearing } from '@campus-map/mapkit';
import { floorsOfBuilding, useMapStore } from '../../stores/mapStore';
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
 * Кнопки масштаба уступают место, когда колонка низкая — раскрытая шторка,
 * маленький телефон или текст, увеличенный в настройках: сначала уходит
 * «Показать целиком», потом «+» и «−». Этажи нужнее — по шагам маршрута
 * переключаются именно они, а масштабировать можно жестом. Кнопки не
 * сжимаются, и раньше нижние уходили под шторку. Колонку ниже одной кнопки
 * оставляют и этажи (`railContentFor`).
 *
 * Прежде раскрытая шторка убирала кнопки масштаба всегда. Но раскрытая шторка
 * бывает и низкой — на общем виде в ней только быстрые кнопки, — и над ней
 * оставалось полэкрана пустой карты, а кнопки пропадали ровно там, где
 * поднялась шторка: со стороны казалось, что они уехали под неё. Теперь
 * решает высота колонки.
 */
export const MapRail: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
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

  return (
    <div ref={ref} className="campus-map-rail">
      {content.compass && <Compass bearing={bearing} />}
      {content.floors && <FloorSelector />}
      {content.zoom !== 'none' && <ZoomControls withFit={content.zoom === 'full'} />}
    </div>
  );
};
