import React from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { useRouteStore } from '../../stores/routeStore';
import { useMapStore } from '../../stores/mapStore';

// SVG иконки маркеров
const createMarkerIcon = (type: 'start' | 'end') => {
  const color = type === 'start' ? '#16a34a' : '#2563eb';
  const svg = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" fill="${color}" stroke="white" stroke-width="3"/>
    </svg>
  `;
  
  return L.divIcon({
    html: svg,
    className: 'custom-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const startIcon = createMarkerIcon('start');
const endIcon = createMarkerIcon('end');

export const MarkerLayer: React.FC = () => {
  const fromNodeId = useRouteStore((state) => state.fromNodeId);
  const toNodeId = useRouteStore((state) => state.toNodeId);
  const graph = useMapStore((state) => state.graph);
  const viewMode = useMapStore((state) => state.viewMode);
  const activeFloor = useMapStore((state) => state.activeFloor);

  if (!graph) {
    return null;
  }

  // ѕроверка видимости узла
  const isVisible = (nodeId: string): boolean => {
    const node = graph.getNode(nodeId);
    if (!node) return false;

    if (viewMode === 'campus') {
      return node.building === 'CAMPUS';
    } else if (activeFloor) {
      return node.building === activeFloor.buildingId && node.floor === activeFloor.floor;
    }
    return false;
  };

  const fromNode = fromNodeId ? graph.getNode(fromNodeId) : null;
  const toNode = toNodeId ? graph.getNode(toNodeId) : null;

  const showFrom = fromNode && isVisible(fromNodeId!);
  const showTo = toNode && isVisible(toNodeId!);

  return (
    <>
      {showFrom && (
        <Marker
          position={[fromNode!.y, fromNode!.x]}
          icon={startIcon}
        />
      )}
      {showTo && (
        <Marker
          position={[toNode!.y, toNode!.x]}
          icon={endIcon}
        />
      )}
    </>
  );
};