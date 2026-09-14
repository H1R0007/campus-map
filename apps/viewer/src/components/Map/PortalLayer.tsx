import React from 'react';
import { Marker } from 'react-leaflet';
import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import { useMapView } from '../../hooks/useMapView';
import { useMapStore } from '../../stores/mapStore';
import { mapPointOf, shownNodesOf } from '../../utils/mapView';
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
  const view = useMapView();

  if (!graph) return null;

  // Выборка через индексы этажей графа (`shownNodesOf`), а не перебор всех
  // узлов кампуса. Существенно, когда корпусов и этажей станет много.
  const shown = shownNodesOf(graph, view).filter((node) => node.isPortal);
  const shownIds = new Set(shown.map((node) => node.id));

  // На холсте вход в корпус — две точки в паре метров: снаружи на территории и
  // внутри на этаже. Когда этаж виден, значок один — у двери корпуса.
  const portals =
    view.kind === 'canvas'
      ? shown.filter(
          (node) =>
            node.building !== CAMPUS_BUILDING_ID ||
            !graph.getNeighbors(node.id).some((id) => shownIds.has(id) && graph.getTransitionType(node.id, id) !== null)
        )
      : shown;
  if (portals.length === 0) return null;

  return (
    <>
      {portals.map((node) => (
        <Marker
          key={node.id}
          position={mapPointOf(graph, view, node)}
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
