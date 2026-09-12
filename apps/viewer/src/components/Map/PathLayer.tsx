import React from 'react';
import { Polyline } from 'react-leaflet';
import { isNodeInScope } from '@campus-map/core';
import { useRouteStore } from '../../stores/routeStore';
import { scopeOf, useMapStore } from '../../stores/mapStore';

/** Оформление линии маршрута. */
const ROUTE_STYLE = {
  color: '#2563eb',
  weight: 4,
  opacity: 0.85,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
};

/**
 * Линия маршрута на текущем плане.
 *
 * Маршрут проходит через несколько этажей и корпусов, а показывается один
 * план, поэтому путь разбивается на непрерывные видимые отрезки: узлы чужого
 * этажа разрывают линию, и каждый отрезок рисуется отдельно.
 *
 * Отрезок короче двух точек не рисуется — одиночная точка линией не является.
 */
export const PathLayer: React.FC = () => {
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const graph = useMapStore((s) => s.graph);
  const activeFloor = useMapStore((s) => s.activeFloor);

  if (!currentRoute?.found || !graph) return null;

  const scope = scopeOf(activeFloor);

  const segments: [number, number][][] = [];
  let current: [number, number][] = [];

  for (const nodeId of currentRoute.path) {
    const node = graph.getNode(nodeId);
    if (!node) continue;

    if (isNodeInScope(node, scope)) {
      // Leaflet в CRS.Simple принимает координаты как [y, x]: вертикальная
      // ось карты соответствует y узла в пикселях плана.
      current.push([node.y, node.x]);
      continue;
    }

    if (current.length > 1) segments.push(current);
    current = [];
  }

  if (current.length > 1) segments.push(current);

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
