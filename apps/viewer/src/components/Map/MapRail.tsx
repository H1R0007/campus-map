import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
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
 */
export const MapRail: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
  }, []);

  return (
    <div ref={ref} className="campus-map-rail">
      <FloorSelector />
      <ZoomControls />
    </div>
  );
};
