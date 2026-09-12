import React, { useCallback } from 'react';
import { Polyline } from 'react-leaflet';
import L from 'leaflet';
import { transitionTypeColor } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';

export const EditorTransitions: React.FC = () => {
  const transitions = useEditorStore((s) => s.getVisibleTransitions());
  const getNode = useEditorStore((s) => s.getNode);

  const hoveredTransition = useEditorStore((s) => s.hoveredTransition);
  const setHoveredTransition = useEditorStore((s) => s.setHoveredTransition);

  const removeTransition = useEditorStore((s) => s.removeTransition);
  const activeTool = useEditorStore((s) => s.activeTool);

  const openContextMenu = useEditorStore((s) => s.openContextMenu);

  const stop = (dom: MouseEvent) => {
    dom.preventDefault();
    dom.stopPropagation();
    L.DomEvent.stop(dom);
  };

  const handleClick = useCallback(
    (fromNode: string, toNode: string, e: L.LeafletMouseEvent) => {
      const dom = e.originalEvent as MouseEvent;
      stop(dom);

      if (dom.button === 0 && activeTool === 'delete') {
        removeTransition(fromNode, toNode);
      }
    },
    [activeTool, removeTransition]
  );

  const handleContextMenu = useCallback(
    (fromNode: string, toNode: string, e: L.LeafletMouseEvent) => {
      const dom = e.originalEvent as MouseEvent;
      stop(dom);
      openContextMenu(dom.clientX, dom.clientY, null, fromNode, toNode);
    },
    [openContextMenu]
  );

  return (
    <>
      {transitions.map((t) => {
        const from = getNode(t.fromNode);
        const to = getNode(t.toNode);
        if (!from || !to) return null;

        const isHovered = hoveredTransition?.from === t.fromNode && hoveredTransition?.to === t.toNode;

        // Используем цвет из core
        const color = transitionTypeColor(t.type);

        return (
          <Polyline
            key={`transition-${t.fromNode}-${t.toNode}-${t.type}`}
            positions={[
              [from.y, from.x],
              [to.y, to.x],
            ]}
            pathOptions={{
              color: isHovered ? (activeTool === 'delete' ? '#ef4444' : '#ffffff') : color,
              weight: isHovered ? 6 : 4,
              opacity: isHovered ? 1 : 0.85,
              dashArray: '8 8',
            }}
            eventHandlers={{
              mouseover: () => setHoveredTransition({ from: t.fromNode, to: t.toNode }),
              mouseout: () => setHoveredTransition(null),
              click: (e) => handleClick(t.fromNode, t.toNode, e),
              contextmenu: (e) => handleContextMenu(t.fromNode, t.toNode, e),
            }}
          />
        );
      })}
    </>
  );
};