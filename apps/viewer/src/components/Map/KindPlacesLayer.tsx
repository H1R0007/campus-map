import React from 'react';
import { Marker } from 'react-leaflet';
import { useMapView } from '../../hooks/useMapView';
import { messagesFor, useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { isNodeShown, mapPointOf } from '../../utils/mapView';
import { nodeName } from '../../utils/placeLabels';
import { EXIT_TARGET, findPlaceKind, placeIdsOfKind } from '../../utils/placeKinds';
import { kindPlaceIcon } from './markerIcons';

/**
 * Все места вида на карте, пока человек выбирает среди них, — после быстрой
 * кнопки «Столовая» (запись 45).
 *
 * Маршрут уже ведёт к ближайшей, а остальные столовые отмечены значком вида:
 * нажатие на отметку ведёт туда. Владелец: «человек не всегда хочет в
 * ближайшую». Выбранное сейчас место отмечено концом маршрута — его отметки
 * здесь нет.
 */
export const KindPlacesLayer: React.FC = () => {
  const graph = useMapStore((s) => s.graph);
  const aliasManager = useMapStore((s) => s.aliasManager);
  const placeKinds = useMapStore((s) => s.placeKinds);
  const nearestKind = useRouteStore((s) => s.nearestKind);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const setPoint = useRouteStore((s) => s.setPoint);
  const view = useMapView();
  const language = useLanguage();

  if (!graph || !aliasManager || nearestKind === null) return null;

  const image = nearestKind === EXIT_TARGET ? null : (findPlaceKind(placeKinds, nearestKind)?.iconImage ?? null);
  const icon = kindPlaceIcon(nearestKind, image);
  const messages = messagesFor(language);

  return (
    <>
      {placeIdsOfKind(graph, aliasManager, nearestKind)
        .filter((id) => id !== toNodeId)
        .map((id) => {
          const node = graph.getNode(id);
          if (!node || !isNodeShown(view, node)) return null;
          const name = nodeName(aliasManager, id, language) ?? id;
          return (
            <Marker
              key={id}
              position={mapPointOf(graph, view, node)}
              icon={icon}
              title={messages.route.kindPlaces.marker(name)}
              zIndexOffset={500}
              eventHandlers={{ click: () => setPoint('to', id) }}
            />
          );
        })}
    </>
  );
};
