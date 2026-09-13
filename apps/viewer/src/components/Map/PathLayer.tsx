import React, { useEffect, useMemo, useRef } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fitPaddingOf, usePixelMapGeometry } from '@campus-map/mapkit';
import { useRouteStore } from '../../stores/routeStore';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { visiblePolylines } from '../../utils/routeGeometry';
import { MAP_CHROME_INSETS } from './mapChrome';

/**
 * Оформление линии маршрута. Цвет задаёт класс `ROUTE_CLASS` из токенов темы
 * (`index.css`): атрибут SVG `stroke` не понимает CSS-переменных.
 */
const ROUTE_STYLE = {
  weight: 4,
  opacity: 0.85,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
};

/** Класс линии маршрута в `index.css`. */
const ROUTE_CLASS = 'campus-route-line';

/**
 * Запас вокруг маршрута сверх места под интерфейс, пиксели экрана: начало и
 * конец линии не должны прилипать к шапке и карточке.
 */
const ROUTE_MARGIN = 32;

/**
 * Линия маршрута на текущем плане.
 *
 * Помимо отрисовки слой подгоняет вид под маршрут. Без этого построенный
 * маршрут можно было не разглядеть: `PixelMap` при смене плана центрируется
 * на всём изображении, и на плане большого корпуса линия занимала несколько
 * пикселей.
 */
export const PathLayer: React.FC = () => {
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const graph = useMapStore((s) => s.graph);
  const activeFloor = useMapStore((s) => s.activeFloor);

  const map = useMap();
  const geometry = usePixelMapGeometry();

  const segments = useMemo(() => {
    if (!currentRoute?.found || !graph) return [];
    return visiblePolylines(currentRoute.path, graph, scopeOf(activeFloor));
  }, [currentRoute, graph, activeFloor]);

  // Вид подгоняется, когда видимая линия действительно изменилась, а не на
  // каждый новый объект маршрута. Смена ограничения, не изменившая путь,
  // пересчитывает маршрут с теми же точками — без ключа карта отъезжала бы из
  // приближения, в котором человек рассматривал этаж.
  const geometryKey = segments.map((line) => line.join(';')).join('|');
  const latestSegments = useRef(segments);
  latestSegments.current = segments;

  useEffect(() => {
    const visible = latestSegments.current;
    if (visible.length === 0) return;

    const bounds = L.latLngBounds(visible.flat());
    if (!bounds.isValid()) return;

    map.fitBounds(bounds, { ...fitPaddingOf(MAP_CHROME_INSETS, ROUTE_MARGIN), maxZoom: map.getMaxZoom() });
    // `geometry.bounds` в зависимостях не случайно: реальный размер плана
    // определяется асинхронно, и при его появлении `PixelMap` заново
    // центрируется на всём изображении. Без повторной подгонки маршрут
    // «уезжал» ровно в тот момент, когда картинка догружалась.
  }, [geometryKey, map, geometry.bounds]);

  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((positions, index) => (
        // Ключ по индексу допустим: список пересоздаётся целиком при каждом
        // изменении маршрута или этажа, порядок отрезков стабилен.
        // Класс — отдельным пропом, а не в `pathOptions`: react-leaflet применяет
        // `pathOptions` через `setStyle`, а Leaflet ставит класс только при
        // создании пути, и из `pathOptions` он молча не доходил до SVG.
        <Polyline key={index} positions={positions} pathOptions={ROUTE_STYLE} className={ROUTE_CLASS} />
      ))}
    </>
  );
};
