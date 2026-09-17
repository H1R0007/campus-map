import React, { useMemo } from 'react';
import { Polyline } from 'react-leaflet';
import L from 'leaflet';
import { edgeKey } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';

/** Ребро открытого плана — пара узлов, которые знают друг о друге. */
interface FloorEdge {
  from: string;
  to: string;
  key: string;
}

/**
 * Рёбра текущего плана.
 *
 * Правая кнопка открывает меню ребра, инструмент «Удалить» удаляет ребро
 * щелчком. Событие ребра дальше карты не идёт: иначе вслед за меню ребра
 * открывалось бы меню пустого места.
 */
export const EditorEdges: React.FC = () => {
  const allNodes = useEditorStore((s) => s.nodes);
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const showEdges = useEditorStore((s) => s.displayFilters.showEdges);
  const showPortals = useEditorStore((s) => s.displayFilters.showPortals);
  const activeTool = useEditorStore((s) => s.activeTool);
  const hoveredEdge = useEditorStore((s) => s.hoveredEdge);
  const setHoveredEdge = useEditorStore((s) => s.setHoveredEdge);

  const edges = useMemo(() => {
    if (!showEdges) return [];
    const result: FloorEdge[] = [];
    const seen = new Set<string>();
    for (const node of floorNodesOf(allNodes, currentBuilding, currentFloor, showPortals)) {
      for (const neighborId of node.neighbors) {
        const key = edgeKey(node.id, neighborId);
        if (seen.has(key) || !allNodes.has(neighborId)) continue;
        seen.add(key);
        result.push({ from: node.id, to: neighborId, key });
      }
    }
    return result;
  }, [allNodes, currentBuilding, currentFloor, showEdges, showPortals]);

  const hoveredKey = hoveredEdge ? edgeKey(hoveredEdge.from, hoveredEdge.to) : null;

  return (
    <>
      {edges.map(({ from, to, key }) => {
        const a = allNodes.get(from);
        const b = allNodes.get(to);
        if (!a || !b) return null;

        const isHovered = hoveredKey === key;

        return (
          <Polyline
            key={`edge-${key}`}
            positions={[
              [a.y, a.x],
              [b.y, b.x],
            ]}
            pathOptions={{
              color: isHovered ? (activeTool === 'delete' ? '#ef4444' : '#60a5fa') : '#4b5563',
              weight: isHovered ? 7 : 4, // толще для щелчка
              opacity: isHovered ? 0.95 : 0.6,
              className: 'editor-edge',
            }}
            eventHandlers={{
              add: (e) => (e.target as L.Path).getElement()?.setAttribute('data-edge', key),
              mouseover: () => setHoveredEdge({ from, to }),
              mouseout: () => setHoveredEdge(null),
              mousedown: (e) => {
                if (e.originalEvent.button === 0 && useEditorStore.getState().activeTool === 'delete') {
                  L.DomEvent.stopPropagation(e);
                }
              },
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                const st = useEditorStore.getState();
                if (st.activeTool === 'delete') st.removeEdge(from, to);
              },
              contextmenu: (e) => {
                L.DomEvent.stopPropagation(e);
                e.originalEvent.preventDefault();
                const dom = e.originalEvent;
                useEditorStore.getState().openContextMenu(dom.clientX, dom.clientY, { kind: 'edge', from, to });
              },
            }}
          />
        );
      })}
    </>
  );
};
