import React, { useCallback } from 'react';
import { Polyline } from 'react-leaflet';
import L from 'leaflet';
import { useEditorStore } from '../../stores/editorStore';

export const EditorEdges: React.FC = () => {
  const edges = useEditorStore((s) => s.getEdgesForCurrentFloor());
  const getNode = useEditorStore((s) => s.getNode);

  const activeTool = useEditorStore((s) => s.activeTool);
  const removeEdge = useEditorStore((s) => s.removeEdge);

  const hoveredEdge = useEditorStore((s) => s.hoveredEdge);
  const setHoveredEdge = useEditorStore((s) => s.setHoveredEdge);

  const openContextMenu = useEditorStore((s) => s.openContextMenu);

  const stop = (dom: MouseEvent) => {
    dom.preventDefault();
    dom.stopPropagation();
    L.DomEvent.stop(dom);
  };

  const onClick = useCallback(
    (from: string, to: string, e: L.LeafletMouseEvent) => {
      const dom = e.originalEvent as MouseEvent;
      stop(dom);

      if (dom.button === 0 && activeTool === 'delete') {
        removeEdge(from, to);
      }
    },
    [activeTool, removeEdge]
  );

  const onContextMenu = useCallback(
    (from: string, to: string, e: L.LeafletMouseEvent) => {
      const dom = e.originalEvent as MouseEvent;
      stop(dom);
      openContextMenu(dom.clientX, dom.clientY, null, from, to);
    },
    [openContextMenu]
  );

  return (
    <>
      {edges.map(({ from, to }) => {
        const a = getNode(from);
        const b = getNode(to);
        if (!a || !b) return null;

        const isHovered =
          (hoveredEdge?.from === from && hoveredEdge?.to === to) || (hoveredEdge?.from === to && hoveredEdge?.to === from);

        return (
          <Polyline
            key={`edge-${from}-${to}`}
            positions={[
              [a.y, a.x],
              [b.y, b.x],
            ]}
            pathOptions={{
              color: isHovered ? (activeTool === 'delete' ? '#ef4444' : '#60a5fa') : '#4b5563',
              weight: isHovered ? 7 : 4, // толще для клика
              opacity: isHovered ? 0.95 : 0.6,
            }}
            eventHandlers={{
              mouseover: () => setHoveredEdge({ from, to }),
              mouseout: () => setHoveredEdge(null),
              click: (e) => onClick(from, to, e),
              contextmenu: (e) => onContextMenu(from, to, e),
            }}
          />
        );
      })}
    </>
  );
};