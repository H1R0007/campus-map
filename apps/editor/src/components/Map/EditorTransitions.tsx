import React, { useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { scopeOfFloor } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import { useEditorStore } from '../../stores/editorStore';
import { splitFloorTransitions } from '../../utils/floorTransitions';

/** Строка отметки — в стиле подписей алиасов (`AliasLabels`), чтобы слои читались одинаково. */
const TARGET_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '1px 6px 1px 2px',
  borderRadius: 9999,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  color: 'white',
  fontSize: 10,
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

/** Кружок со значком типа перехода — как точка перехода в навигаторе. */
const GLYPH_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  borderRadius: 9999,
  color: 'white',
};

/**
 * Переходы на текущем плане.
 *
 * Линия — только между узлами одного плана: её можно навести, удалить
 * инструментом «Удалить» и открыть меню. Переход на другой этаж, в другой
 * корпус или на территорию — отметка под узлом этого плана: значок и цвет типа
 * и план назначения («↑ этаж 3»). Раньше и такой переход рисовался линией к
 * пиксельным координатам узла другого плана — отрезком через весь этаж без
 * смысла (`splitFloorTransitions`). Отметка не интерактивна: удаляется такой
 * переход в панели свойств узла, в списке «Переходы».
 */
export const EditorTransitions: React.FC = () => {
  const transitions = useEditorStore((s) => s.getVisibleTransitions());
  const nodes = useEditorStore((s) => s.nodes);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);

  const hoveredTransition = useEditorStore((s) => s.hoveredTransition);
  const setHoveredTransition = useEditorStore((s) => s.setHoveredTransition);

  const removeTransition = useEditorStore((s) => s.removeTransition);
  const activeTool = useEditorStore((s) => s.activeTool);

  const openContextMenu = useEditorStore((s) => s.openContextMenu);

  const { lines, markers } = useMemo(
    () => splitFloorTransitions(transitions, nodes, scopeOfFloor(currentBuilding, currentFloor), buildingMetas),
    [transitions, nodes, buildingMetas, currentBuilding, currentFloor]
  );

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
      {lines.map((t) => {
        const from = nodes.get(t.fromNode);
        const to = nodes.get(t.toNode);
        if (!from || !to) return null;

        const isHovered = hoveredTransition?.from === t.fromNode && hoveredTransition?.to === t.toNode;

        // Цвет типа перехода — общий с навигатором.
        const color = TRANSITION_COLORS[t.type];

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

      {markers.map(({ node, targets }) => (
        <CircleMarker
          key={`transition-marker-${node.id}`}
          center={[node.y, node.x]}
          radius={0}
          interactive={false}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
        >
          {/* Под узлом: над ним — подпись алиаса. */}
          <Tooltip permanent direction="bottom" offset={[0, 10]} className="transition-target-tooltip">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {targets.map(({ transition, label }) => (
                <div key={`${transition.fromNode}-${transition.toNode}-${transition.type}`} style={TARGET_STYLE}>
                  <span style={{ ...GLYPH_STYLE, backgroundColor: TRANSITION_COLORS[transition.type] }}>
                    <TransitionGlyph type={transition.type} size={10} />
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
};
