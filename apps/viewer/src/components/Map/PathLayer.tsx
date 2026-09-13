import React, { useEffect, useMemo } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { usePixelMapGeometry } from '@campus-map/mapkit';
import { useRouteStore } from '../../stores/routeStore';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { visiblePolylines } from '../../utils/routeGeometry';

/** Оформление линии маршрута. */
const ROUTE_STYLE = {
  color: '#2563eb',
  weight: 4,
  opacity: 0.85,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
};

/** Отступ вокруг маршрута при подгонке вида, пиксели экрана. */
const FIT_PADDING: [number, number] = [56, 56];

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

  useEffect(() => {
    if (segments.length === 0) return;

    const bounds = L.latLngBounds(segments.flat());
    if (!bounds.isValid()) return;

    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: map.getMaxZoom() });
    // `geometry.bounds` в зависимостях не случайно: реальный размер плана
    // определяется асинхронно, и при его появлении `PixelMap` заново
    // центрируется на всём изображении. Без повторной подгонки маршрут
    // «уезжал» ровно в тот момент, когда картинка догружалась.
  }, [segments, map, geometry.bounds]);

  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((positions, index) => (
        // Ключ по индексу допустим: список пересоздаётся целиком при каждом
        // изменении маршрута или этажа, порядок отрезков стабилен.
        <Polyline key={index} positions={positions} pathOptions={ROUTE_STYLE} />
      ))}
    </>
  );
};
