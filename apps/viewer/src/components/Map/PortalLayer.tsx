import React from 'react';
import { Marker } from 'react-leaflet';
import type { Graph, MapNode, TransitionType } from '@campus-map/core';
import { scopeOf, useMapStore } from '../../stores/mapStore';
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
 * лестница это, лифт или вход.
 *
 * Подсказки с названием типа здесь больше нет: маркер неинтерактивный, и
 * наведение на него никогда не срабатывало — подсказка была мёртвой.
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
          // Маркер справочный: нажатие не должно перехватывать клики по карте.
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
};

/**
 * Тип перехода, обслуживающий узел.
 *
 * У узла может быть несколько переходов (например, лестница и лифт рядом) —
 * берётся первый найденный, этого достаточно для иконки-ориентира.
 */
function portalTypeOf(graph: Graph, node: MapNode): TransitionType | null {
  for (const neighborId of graph.getNeighbors(node.id)) {
    const type = graph.getTransitionType(node.id, neighborId);
    if (type !== null) return type;
  }
  return null;
}
