import React, { useCallback, useMemo } from 'react';
import { Polyline } from 'react-leaflet';
import L from 'leaflet';
import { mapPalette } from '../../utils/themeColor';
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
 * Связи текущего плана.
 *
 * Правая кнопка открывает меню связи. Событие связи дальше карты не идёт:
 * иначе вслед за меню связи открывалось бы меню пустого места.
 */
export const EditorEdges: React.FC = () => {
  const allNodes = useEditorStore((s) => s.nodes);
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const showEdges = useEditorStore((s) => s.displayFilters.showEdges);
  const showPortals = useEditorStore((s) => s.displayFilters.showPortals);
  const hoveredEdge = useEditorStore((s) => s.hoveredEdge);
  const setHoveredEdge = useEditorStore((s) => s.setHoveredEdge);
  const palette = mapPalette();

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

  const onHover = useCallback(
    (edge: { from: string; to: string } | null) => setHoveredEdge(edge),
    [setHoveredEdge]
  );

  return (
    <>
      {edges.map(({ from, to, key }) => {
        const a = allNodes.get(from);
        const b = allNodes.get(to);
        if (!a || !b) return null;

        return (
          <EdgeLine
            key={key}
            edgeId={key}
            from={from}
            to={to}
            ax={a.x}
            ay={a.y}
            bx={b.x}
            by={b.y}
            hovered={hoveredKey === key}
            color={hoveredKey === key ? palette.edgeHover : palette.edge}
            onHover={onHover}
          />
        );
      })}
    </>
  );
};

interface EdgeLineProps {
  edgeId: string;
  from: string;
  to: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  hovered: boolean;
  color: string;
  onHover: (edge: { from: string; to: string } | null) => void;
}

/**
 * Одна связь на карте.
 *
 * Запоминается по координатам концов: при перетаскивании узла меняются
 * только связи этого узла, а не все связи этажа. На большом этаже связей
 * больше четырёхсот, и пересборка их всех на каждом кадре роняла
 * перетаскивание до двух десятков кадров в секунду.
 */
const EdgeLine = React.memo(function EdgeLine({
  edgeId,
  from,
  to,
  ax,
  ay,
  bx,
  by,
  hovered,
  color,
  onHover,
}: EdgeLineProps) {
  const positions = useMemo((): [number, number][] => [
    [ay, ax],
    [by, bx],
  ], [ax, ay, bx, by]);

  const pathOptions = useMemo(
    () => ({
      color,
      // Наведённая связь толще: по ней целятся правой кнопкой.
      weight: hovered ? 7 : 4,
      opacity: hovered ? 0.95 : 0.6,
      className: 'editor-edge',
    }),
    [color, hovered]
  );

  const handlers = useMemo(
    () => ({
      add: (e: L.LeafletEvent) => (e.target as L.Path).getElement()?.setAttribute('data-edge', edgeId),
      mouseover: () => onHover({ from, to }),
      mouseout: () => onHover(null),
      click: (e: L.LeafletMouseEvent) => L.DomEvent.stopPropagation(e),
      contextmenu: (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        const dom = e.originalEvent;
        dom.preventDefault();
        useEditorStore.getState().openContextMenu(dom.clientX, dom.clientY, { kind: 'edge', from, to });
      },
    }),
    [edgeId, from, to, onHover]
  );

  return <Polyline positions={positions} pathOptions={pathOptions} eventHandlers={handlers} />;
});
