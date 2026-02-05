import React from 'react';
import { Polyline } from 'react-leaflet';
import { useRouteStore } from '../../stores/routeStore';
import { useMapStore } from '../../stores/mapStore';

export const PathLayer: React.FC = () => {
  const currentRoute = useRouteStore((state) => state.currentRoute);
  const graph = useMapStore((state) => state.graph);
  const viewMode = useMapStore((state) => state.viewMode);
  const activeFloor = useMapStore((state) => state.activeFloor);

  if (!currentRoute?.found || !graph) {
    return null;
  }

  // Собираем сегменты пути для текущего вида
  const segments: [number, number][][] = [];
  let currentSegment: [number, number][] = [];

  for (let i = 0; i < currentRoute.path.length; i++) {
    const node = graph.getNode(currentRoute.path[i]);
    if (!node) continue;

    // Проверяем видимость узла
    let isVisible = false;
    if (viewMode === 'campus') {
      isVisible = node.building === 'CAMPUS';
    } else if (activeFloor) {
      isVisible = node.building === activeFloor.buildingId && node.floor === activeFloor.floor;
    }

    if (isVisible) {
      currentSegment.push([node.y, node.x]);
    } else {
      // Если текущий сегмент не пустой — сохраняем и начинаем новый
      if (currentSegment.length > 1) {
        segments.push(currentSegment);
      }
      currentSegment = [];
    }
  }

  // Добавляем последний сегмент
  if (currentSegment.length > 1) {
    segments.push(currentSegment);
  }

  if (segments.length === 0) {
    return null;
  }

  return (
    <>
      {segments.map((positions, index) => (
        <Polyline
          key={index}
          positions={positions}
          pathOptions={{
            color: '#2563eb',
            weight: 4,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: undefined,
          }}
        />
      ))}
    </>
  );
};