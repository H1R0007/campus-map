import React, { useEffect, useMemo, useRef } from 'react';
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { edgeKey, scopeOfFloor } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import { useEditorStore } from '../../stores/editorStore';
import { splitFloorTransitions } from '../../utils/floorTransitions';
import type { FloorTransitions, TransitionTarget } from '../../utils/floorTransitions';
import { TRANSITION_LABELS } from '../../utils/labels';

const NO_TRANSITIONS: FloorTransitions = { lines: [], markers: [] };

/**
 * Строка отметки перехода на другой план: щелчок ведёт к другому концу,
 * правая кнопка открывает меню перехода.
 *
 * Обработчики — родные, на самой строке: строка живёт в подсказке Leaflet
 * внутри контейнера карты, и событие, отданное дальше, карта приняла бы за
 * нажатие на пустое место (снятие выбора, меню карты).
 */
const TargetRow: React.FC<{ target: TransitionTarget; hereId: string }> = ({ target, hereId }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const { transition, label } = target;
  const otherId = transition.fromNode === hereId ? transition.toNode : transition.fromNode;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const stop = (ev: Event) => ev.stopPropagation();
    const onClick = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      useEditorStore.getState().centerOnNode(otherId);
    };
    const onContextMenu = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      useEditorStore.getState().openContextMenu(ev.clientX, ev.clientY, {
        kind: 'transition',
        from: transition.fromNode,
        to: transition.toNode,
      });
    };

    el.addEventListener('mousedown', stop);
    el.addEventListener('dblclick', stop);
    el.addEventListener('click', onClick);
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('mousedown', stop);
      el.removeEventListener('dblclick', stop);
      el.removeEventListener('click', onClick);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [otherId, transition.fromNode, transition.toNode]);

  return (
    <button
      ref={ref}
      type="button"
      className="transition-target"
      data-transition={edgeKey(transition.fromNode, transition.toNode)}
      title={`${TRANSITION_LABELS[transition.type]}: перейти к другому концу. Правая кнопка — меню перехода`}
    >
      <span className="transition-target__glyph" style={{ backgroundColor: TRANSITION_COLORS[transition.type] }}>
        <TransitionGlyph type={transition.type} size={10} />
      </span>
      {label}
    </button>
  );
};

/**
 * Переходы на текущем плане.
 *
 * Линия — только между узлами одного плана: её можно навести, удалить
 * инструментом «Удалить» и открыть меню. Переход на другой этаж, в другой
 * корпус или на территорию — отметка под узлом этого плана: значок и цвет типа
 * и план назначения («↑ этаж 3»). Раньше и такой переход рисовался линией к
 * пиксельным координатам узла другого плана — отрезком через весь этаж без
 * смысла (`splitFloorTransitions`).
 */
export const EditorTransitions: React.FC = () => {
  const transitions = useEditorStore((s) => s.transitions);
  const nodes = useEditorStore((s) => s.nodes);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const showTransitions = useEditorStore((s) => s.displayFilters.showTransitions);
  const hoveredTransition = useEditorStore((s) => s.hoveredTransition);
  const setHoveredTransition = useEditorStore((s) => s.setHoveredTransition);
  const activeTool = useEditorStore((s) => s.activeTool);

  const { lines, markers } = useMemo(() => {
    if (!showTransitions) return NO_TRANSITIONS;
    return splitFloorTransitions(transitions, nodes, scopeOfFloor(currentBuilding, currentFloor), buildingMetas);
  }, [showTransitions, transitions, nodes, buildingMetas, currentBuilding, currentFloor]);

  const hoveredKey = hoveredTransition ? edgeKey(hoveredTransition.from, hoveredTransition.to) : null;

  return (
    <>
      {lines.map((t) => {
        const from = nodes.get(t.fromNode);
        const to = nodes.get(t.toNode);
        if (!from || !to) return null;

        const key = edgeKey(t.fromNode, t.toNode);
        const isHovered = hoveredKey === key;
        const color = TRANSITION_COLORS[t.type];

        return (
          <Polyline
            key={`transition-${key}-${t.type}`}
            positions={[
              [from.y, from.x],
              [to.y, to.x],
            ]}
            pathOptions={{
              color: isHovered ? (activeTool === 'delete' ? '#ef4444' : '#ffffff') : color,
              weight: isHovered ? 6 : 4,
              opacity: isHovered ? 1 : 0.85,
              dashArray: '8 8',
              className: 'editor-transition',
            }}
            eventHandlers={{
              add: (e) => (e.target as L.Path).getElement()?.setAttribute('data-transition', key),
              mouseover: () => setHoveredTransition({ from: t.fromNode, to: t.toNode }),
              mouseout: () => setHoveredTransition(null),
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                const st = useEditorStore.getState();
                if (st.activeTool === 'delete') st.removeTransition(t.fromNode, t.toNode);
              },
              contextmenu: (e) => {
                L.DomEvent.stopPropagation(e);
                const dom = e.originalEvent;
                dom.preventDefault();
                useEditorStore
                  .getState()
                  .openContextMenu(dom.clientX, dom.clientY, { kind: 'transition', from: t.fromNode, to: t.toNode });
              },
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
          <Tooltip permanent interactive direction="bottom" offset={[0, 10]} className="transition-target-tooltip">
            <div className="transition-targets">
              {targets.map((target) => (
                <TargetRow
                  key={`${target.transition.fromNode}-${target.transition.toNode}-${target.transition.type}`}
                  target={target}
                  hereId={node.id}
                />
              ))}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
};
