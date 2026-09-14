import React from 'react';
import { Marker } from 'react-leaflet';
import { useMapView } from '../../hooks/useMapView';
import { useRouteStore } from '../../stores/routeStore';
import { useMapStore } from '../../stores/mapStore';
import { useLanguage } from '../../i18n';
import { isNodeShown, mapPointOf } from '../../utils/mapView';
import { endpointIcon } from './markerIcons';

/**
 * Маркеры начала и конца маршрута.
 *
 * Показываются только если точка видна на карте: маршрут может начинаться на
 * другом этаже, и рисовать его маркеры поверх чужого плана нельзя.
 */
export const MarkerLayer: React.FC = () => {
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const graph = useMapStore((s) => s.graph);
  const view = useMapView();
  const language = useLanguage();

  if (!graph) return null;

  const fromNode = fromNodeId ? graph.getNode(fromNodeId) : undefined;
  const toNode = toNodeId ? graph.getNode(toNodeId) : undefined;

  return (
    <>
      {fromNode && isNodeShown(view, fromNode) && (
        <Marker position={mapPointOf(graph, view, fromNode)} icon={endpointIcon('start', language)} zIndexOffset={1000} />
      )}
      {toNode && isNodeShown(view, toNode) && (
        <Marker position={mapPointOf(graph, view, toNode)} icon={endpointIcon('end', language)} zIndexOffset={1000} />
      )}
    </>
  );
};
