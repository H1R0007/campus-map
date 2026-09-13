import React from 'react';
import { Marker } from 'react-leaflet';
import { isNodeInScope } from '@campus-map/core';
import { useRouteStore } from '../../stores/routeStore';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { useLanguage } from '../../i18n';
import { endpointIcon } from './markerIcons';

/**
 * Маркеры начала и конца маршрута.
 *
 * Показываются только если точка попадает в текущую область видимости:
 * маршрут может начинаться на другом этаже, и рисовать его маркеры поверх
 * чужого плана нельзя.
 */
export const MarkerLayer: React.FC = () => {
  const fromNodeId = useRouteStore((s) => s.fromNodeId);
  const toNodeId = useRouteStore((s) => s.toNodeId);
  const graph = useMapStore((s) => s.graph);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const language = useLanguage();

  if (!graph) return null;

  const scope = scopeOf(activeFloor);

  const fromNode = fromNodeId ? graph.getNode(fromNodeId) : undefined;
  const toNode = toNodeId ? graph.getNode(toNodeId) : undefined;

  const showFrom = fromNode !== undefined && isNodeInScope(fromNode, scope);
  const showTo = toNode !== undefined && isNodeInScope(toNode, scope);

  return (
    <>
      {showFrom && (
        <Marker position={[fromNode!.y, fromNode!.x]} icon={endpointIcon('start', language)} zIndexOffset={1000} />
      )}
      {showTo && (
        <Marker position={[toNode!.y, toNode!.x]} icon={endpointIcon('end', language)} zIndexOffset={1000} />
      )}
    </>
  );
};
