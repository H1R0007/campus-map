import React from 'react';
import { Marker } from 'react-leaflet';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { portalTypeOf } from '../../utils/portals';
import { portalIcon } from './markerIcons';

/**
 * Точки перехода между этажами и корпусами: лестницы, лифты, входы.
 *
 * Флаг `isPortal` редактор поддерживал с самого начала, но навигатор его
 * игнорировал — студент видел план без ориентиров, которыми на самом деле
 * пользуются. Слой делает флаг осмысленным: на плане этажа видны все
 * способы попасть на другой этаж или выйти наружу.
 *
 * Тип перехода определяется по соседям узла, поэтому иконка сразу показывает,
 * лестница это, лифт или вход. Название типа — в карточке места, которая
 * открывается нажатием рядом с иконкой (`PlaceLayer`): прежняя подсказка при
 * наведении на неинтерактивном маркере не срабатывала никогда.
 */
export const PortalLayer: React.FC = () => {
  const graph = useMapStore((s) => s.graph);
  const activeFloor = useMapStore((s) => s.activeFloor);

  if (!graph) return null;

  const scope = scopeOf(activeFloor);

  // Выборка через индекс графа: O(1) по этажу, а не перебор всех узлов
  // кампуса. Существенно, когда корпусов и этажей станет много.
  const nodes =
    scope.mode === 'campus'
      ? graph.getCampusNodes()
      : graph.getNodesForFloor(scope.buildingId, scope.floor);

  const portals = nodes.filter((node) => node.isPortal);
  if (portals.length === 0) return null;

  return (
    <>
      {portals.map((node) => (
        <Marker
          key={node.id}
          position={[node.y, node.x]}
          icon={portalIcon(portalTypeOf(graph, node))}
          // Нажатие обрабатывает карта: слой мест выбирает ближайший узел в
          // радиусе касания, и маркер не должен перехватывать событие.
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
};
