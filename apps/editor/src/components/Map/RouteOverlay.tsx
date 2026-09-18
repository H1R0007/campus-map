import React, { useEffect, useMemo } from 'react';
import { CircleMarker, Polyline } from 'react-leaflet';
import { isNodeInScope, scopeOfFloor } from '@campus-map/core';
import { selectedRoute, useEditorStore } from '../../stores/editorStore';

/**
 * Линия маршрута и метка, идущая по нему.
 *
 * Метка движется, только пока открыта вкладка «Маршрут» инспектора: прежде
 * она шла всегда и на каждом шаге переключала план — работать на другом
 * этаже было невозможно даже со скрытой панелью. План она открывает сама
 * только с включённым «вести карту за меткой».
 */
export const RouteOverlay: React.FC = () => {
  const route = useEditorStore((s) => s.routeSimulation);
  const getNode = useEditorStore((s) => s.getNode);
  // Метка идёт, только пока вкладка маршрута видна.
  const simulatorOpen = useEditorStore((s) => s.inspectorTab === 'route' && !s.inspectorCollapsed);

  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);

  // Часть маршрута, относящаяся к текущему срезу. Правило принадлежности
  // узла виду берётся из ядра: оно же используется слоями карты навигатора.
  const scope = useMemo(
    () => scopeOfFloor(currentBuilding, currentFloor),
    [currentBuilding, currentFloor]
  );

  const simulatedRoutes = route.routes;
  const selectedPathIndex = route.selectedPathIndex;
  const path = useMemo(
    () => selectedRoute({ routes: simulatedRoutes, selectedPathIndex })?.path ?? [],
    [simulatedRoutes, selectedPathIndex]
  );

  // Шаг метки по маршруту.
  useEffect(() => {
    if (!simulatorOpen || !route.active || !route.playing || path.length < 2) return;

    const timer = window.setInterval(() => {
      const state = useEditorStore.getState();
      const nodes = selectedRoute(state.routeSimulation)?.path ?? [];
      if (!state.routeSimulation.active || nodes.length < 2) return;

      const next = (state.routeSimulation.animationIndex + 1) % nodes.length;
      useEditorStore.setState((s) => {
        s.routeSimulation.animationIndex = next;
      });

      // План под меткой открывается, только если об этом попросили.
      if (state.routeSimulation.follow && nodes[next]) state.navigateToNode(nodes[next]);
    }, route.animationSpeed);

    return () => window.clearInterval(timer);
  }, [simulatorOpen, route.active, route.playing, route.animationSpeed, route.selectedPathIndex, path.length]);

  if (!route.active || path.length === 0) return null;

  const visiblePositions: [number, number][] = [];
  for (const id of path) {
    const n = getNode(id);
    if (!n) continue;

    if (isNodeInScope(n, scope)) visiblePositions.push([n.y, n.x]);
  }

  if (visiblePositions.length === 0) return null;

  const animNodeId = path[route.animationIndex];
  const animNode = getNode(animNodeId);

  const animVisible =
    animNode &&
    isNodeInScope(animNode, scope);

  const startNode = getNode(path[0]);
  const endNode = getNode(path[path.length - 1]);

  const startVisible =
    startNode &&
    isNodeInScope(startNode, scope);

  const endVisible =
    endNode && isNodeInScope(endNode, scope);

  return (
    <>
      {/* Route polyline */}
      {visiblePositions.length > 1 && (
        <Polyline
          positions={visiblePositions}
          pathOptions={{ color: '#8b5cf6', weight: 5, opacity: 0.85, dashArray: '10 6' }}
        />
      )}

      {/* Animated marker */}
      {animVisible && animNode && (
        <>
          <CircleMarker
            center={[animNode.y, animNode.x]}
            radius={18}
            pathOptions={{ color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.18, weight: 2 }}
          />
          <CircleMarker
            center={[animNode.y, animNode.x]}
            radius={10}
            pathOptions={{ color: '#ffffff', fillColor: '#8b5cf6', fillOpacity: 1, weight: 3 }}
          />
        </>
      )}

      {/* Start */}
      {startVisible && startNode && (
        <CircleMarker
          center={[startNode.y, startNode.x]}
          radius={12}
          pathOptions={{ color: '#ffffff', fillColor: '#22c55e', fillOpacity: 1, weight: 3 }}
        />
      )}

      {/* End */}
      {endVisible && endNode && (
        <CircleMarker
          center={[endNode.y, endNode.x]}
          radius={12}
          pathOptions={{ color: '#ffffff', fillColor: '#ef4444', fillOpacity: 1, weight: 3 }}
        />
      )}
    </>
  );
};
