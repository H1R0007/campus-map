import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { TRANSITION_COLORS } from '@campus-map/mapkit';
import type { MapNode } from '@campus-map/core';
import { selectedRoute, useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import type { NodePosition } from '../../stores/historyStore';
import { suppressNextMapClick } from '../../utils/clickGuard';
import { TRANSITION_LABELS, nodeTitle } from '../../utils/labels';
import { themeColor } from '../../utils/themeColor';

/** С какого сдвига курсора, в пикселях экрана, нажатие становится перетаскиванием. */
const DRAG_THRESHOLD = 4;

interface DragState {
  anchorId: string;
  startClientX: number;
  startClientY: number;
  /** Точка плана под курсором в момент нажатия. */
  startPlan: L.LatLng;
  /** Узлы, которые едут вместе, и где они стояли. */
  before: NodePosition[];
  dragging: boolean;
  /** Последние поставленные позиции — они и попадут в историю. */
  last: NodePosition[] | null;
  frame: number | null;
  pendingEvent: MouseEvent | null;
}

/**
 * Узлы текущего плана.
 *
 * Мышь — как в графических редакторах:
 * - щелчок по узлу выбирает его, выбор держится, пока не выбран другой узел
 *   или не нажат пустой участок карты;
 * - перетаскивание узла двигает его, а если он в выделении — всё выделение;
 * - Shift или Ctrl со щелчком добавляют узел к выделению или убирают из него;
 * - правая кнопка открывает меню узла (или выделения).
 *
 * Прежде выбор и перетаскивание были на правой кнопке, а левая показывала
 * подсказку, которая гасла через 1,8 секунды, — со стороны это выглядело как
 * карточка узла, исчезающая сама по себе.
 */
export const EditorNodes: React.FC = () => {
  const map = useMap();
  const dragRef = useRef<DragState | null>(null);

  // Акцент темы значением: атрибуты SVG, которые ставит Leaflet, `var()` не понимают.
  const highlightColor = useMemo(() => themeColor('--editor-highlight'), []);

  const allNodes = useEditorStore((s) => s.nodes);
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const hoveredNodeId = useEditorStore((s) => s.hoveredNodeId);
  const aliases = useEditorStore((s) => s.aliases);

  const edgeStartNodeId = useEditorStore((s) => s.edgeStartNodeId);
  const transitionStartNodeId = useEditorStore((s) => s.transitionStartNodeId);
  const transitionType = useEditorStore((s) => s.transitionType);
  const displayFilters = useEditorStore((s) => s.displayFilters);
  const route = useEditorStore((s) => s.routeSimulation);

  const setHoveredNode = useEditorStore((s) => s.setHoveredNode);

  const nodes = useMemo(
    () => floorNodesOf(allNodes, currentBuilding, currentFloor, displayFilters.showPortals),
    [allNodes, currentBuilding, currentFloor, displayFilters.showPortals]
  );

  // Подсветка проблем считается от самих данных. Прежде наборы зависели только
  // от неизменных функций стора и не обновлялись после правок.
  const { highlightOrphans, highlightNoAlias, highlightErrors } = displayFilters;
  const orphanIds = useMemo(
    () => new Set(highlightOrphans ? nodes.filter((n) => n.neighbors.length === 0).map((n) => n.id) : []),
    [highlightOrphans, nodes]
  );
  const noAliasIds = useMemo(
    () => new Set(highlightNoAlias ? nodes.filter((n) => !(aliases.get(n.id)?.length ?? 0)).map((n) => n.id) : []),
    [highlightNoAlias, nodes, aliases]
  );
  const errorIds = useMemo(
    () =>
      new Set(highlightErrors ? nodes.filter((n) => n.neighbors.some((nb) => !allNodes.has(nb))).map((n) => n.id) : []),
    [highlightErrors, nodes, allNodes]
  );

  // Узлы выбранного маршрута — для подсветки. Зависимости — сами маршруты и
  // индекс, а не весь `route`: он меняется на каждом шаге анимации.
  const simulatedRoutes = route.routes;
  const selectedPathIndex = route.selectedPathIndex;
  const routePath = useMemo(
    () => new Set(selectedRoute({ routes: simulatedRoutes, selectedPathIndex })?.path ?? []),
    [simulatedRoutes, selectedPathIndex]
  );

  /** Позиции узлов под курсором для текущего кадра перетаскивания. */
  const applyDragFrame = useCallback(
    (drag: DragState, ev: MouseEvent) => {
      const st = useEditorStore.getState();
      const plan = map.mouseEventToLatLng(ev);
      const anchor = drag.before.find((p) => p.nodeId === drag.anchorId) ?? drag.before[0];

      // Сетка притягивает узел под курсором; остальные едут на тот же сдвиг и
      // сохраняют взаимное расположение.
      const rawX = anchor.x + (plan.lng - drag.startPlan.lng);
      const rawY = anchor.y + (plan.lat - drag.startPlan.lat);
      const dx = st.snapToGrid(rawX) - anchor.x;
      const dy = st.snapToGrid(rawY) - anchor.y;

      const next = drag.before.map((p) => ({ nodeId: p.nodeId, x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
      drag.last = next;
      st.setNodePositions(next);
    },
    [map]
  );

  const finishDrag = useCallback(
    (mode: 'commit' | 'revert') => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;

      if (drag.frame !== null) cancelAnimationFrame(drag.frame);
      const st = useEditorStore.getState();

      if (drag.dragging && drag.last) {
        if (mode === 'commit') {
          st.commitNodePositions(drag.before, drag.last);
        } else {
          st.setNodePositions(drag.before);
        }
        suppressNextMapClick();
      }

      try {
        map.dragging.enable();
      } catch {
        // Карта могла быть уже размонтирована (смена плана во время
        // перетаскивания) — включать нечего.
      }
    },
    [map]
  );

  useEffect(() => {
    const onMouseMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (!drag.dragging) {
        const moved = Math.hypot(ev.clientX - drag.startClientX, ev.clientY - drag.startClientY);
        if (moved < DRAG_THRESHOLD) return;
        drag.dragging = true;
      }

      // Не чаще кадра: каждое движение перерисовывает слой узлов.
      drag.pendingEvent = ev;
      if (drag.frame === null) {
        drag.frame = requestAnimationFrame(() => {
          drag.frame = null;
          if (dragRef.current === drag && drag.pendingEvent) applyDragFrame(drag, drag.pendingEvent);
        });
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || ev.button !== 0) return;
      // Последнее положение курсора — до записи в историю.
      if (drag.dragging) applyDragFrame(drag, ev);
      finishDrag('commit');
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && dragRef.current) {
        ev.stopPropagation();
        finishDrag('revert');
      }
    };

    const onBlur = () => finishDrag('commit');

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
      finishDrag('commit');
    };
  }, [applyDragFrame, finishDrag]);

  /** Действие инструмента, отличного от «Выбора», по узлу. */
  const activateWithTool = useCallback((nodeId: string) => {
    const st = useEditorStore.getState();
    switch (st.activeTool) {
      case 'edge':
        if (!st.edgeStartNodeId) st.setEdgeStartNode(nodeId);
        else if (st.edgeStartNodeId !== nodeId) {
          st.addEdge(st.edgeStartNodeId, nodeId);
          st.setEdgeStartNode(null);
        }
        return;

      case 'transition': {
        const type = st.transitionType;
        const startId = st.transitionStartNodeId;

        if (!startId) {
          st.setTransitionStartNode(nodeId);
          st.showNotice(
            `${TRANSITION_LABELS[type]} от «${nodeTitle(nodeId, st.aliases)}». Выберите второй узел — этаж или корпус можно переключить.`
          );
          return;
        }
        if (startId === nodeId) return;

        const result = st.addTransition(startId, nodeId, type);
        if (result === 'created') {
          st.setTransitionStartNode(null);
          st.showNotice(
            `${TRANSITION_LABELS[type]}: «${nodeTitle(startId, st.aliases)}» — «${nodeTitle(nodeId, st.aliases)}»`
          );
        } else if (result === 'samePlan') {
          st.showNotice('Оба узла на одном плане: между ними нужна связь (ребро), а не переход.', 'warn');
        } else if (result === 'exists') {
          st.showNotice('Переход между этими узлами уже есть.', 'warn');
        }
        return;
      }

      default:
        st.selectSingleNode(nodeId);
    }
  }, []);

  const onNodeMouseDown = useCallback(
    (node: MapNode, e: L.LeafletMouseEvent) => {
      const dom = e.originalEvent;
      // Карте событие не отдаётся: иначе нажатие на узел считалось бы
      // нажатием на пустое место (рамка выделения, снятие выбора).
      L.DomEvent.stopPropagation(e);
      if (dom.button !== 0) return;
      dom.preventDefault();

      const st = useEditorStore.getState();

      if (st.activeTool !== 'select') {
        activateWithTool(node.id);
        return;
      }

      // Симулятор маршрута ждёт точку — щелчок выбирает её.
      if (st.routeSimulatorOpen && st.routePickMode && st.pickRouteNode(node.id)) return;

      if (dom.shiftKey || dom.ctrlKey || dom.metaKey) {
        st.toggleSelectNode(node.id, true);
        return;
      }

      if (!st.selectedNodeIds.has(node.id)) st.selectSingleNode(node.id);

      // Перетаскивание: едет выделение, если узел в нём, иначе сам узел.
      const ids = useEditorStore.getState().selectedNodeIds;
      const before: NodePosition[] = [];
      for (const id of ids) {
        const n = st.nodes.get(id);
        if (n) before.push({ nodeId: id, x: n.x, y: n.y });
      }

      // Перетаскивание карты выключается до того, как его обработчик увидит
      // это нажатие: он подписан на контейнер после обработчика слоёв.
      map.dragging.disable();
      dragRef.current = {
        anchorId: node.id,
        startClientX: dom.clientX,
        startClientY: dom.clientY,
        startPlan: map.mouseEventToLatLng(dom),
        before,
        dragging: false,
        last: null,
        frame: null,
        pendingEvent: null,
      };
    },
    [map, activateWithTool]
  );

  const onNodeContextMenu = useCallback((node: MapNode, e: L.LeafletMouseEvent) => {
    const dom = e.originalEvent;
    L.DomEvent.stopPropagation(e);
    dom.preventDefault();

    const st = useEditorStore.getState();
    const selection = st.selectedNodeIds;

    if (selection.size > 1 && selection.has(node.id)) {
      st.openContextMenu(dom.clientX, dom.clientY, { kind: 'selection', nodeIds: [...selection] });
      return;
    }

    st.selectSingleNode(node.id);
    st.openContextMenu(dom.clientX, dom.clientY, { kind: 'node', nodeId: node.id });
  }, []);

  const hoveredNode = hoveredNodeId ? nodes.find((n) => n.id === hoveredNodeId) : undefined;

  return (
    <>
      {nodes.map((node) => {
        const isSelected = selectedNodeIds.has(node.id);
        const isHovered = hoveredNodeId === node.id;
        const isEdgeStart = edgeStartNodeId === node.id;
        const isTransitionStart = transitionStartNodeId === node.id;

        const isRouteFrom = route.fromNodeId === node.id;
        const isRouteTo = route.toNodeId === node.id;
        const isInRoute = routePath.has(node.id);

        let fillColor = '#6366f1';
        let strokeColor = '#4f46e5';

        if (node.isPortal) {
          fillColor = '#f59e0b';
          strokeColor = '#d97706';
        }
        if (isEdgeStart) {
          fillColor = '#22c55e';
          strokeColor = '#16a34a';
        }
        if (isTransitionStart) {
          // Узел, от которого строится переход: цвет выбранного типа, как у его
          // кнопки в панели инструментов, и обводка акцентом темы.
          fillColor = TRANSITION_COLORS[transitionType];
          strokeColor = highlightColor;
        }
        if (isInRoute) {
          fillColor = '#8b5cf6';
          strokeColor = '#7c3aed';
        }
        if (isRouteFrom) {
          fillColor = '#22c55e';
          strokeColor = '#16a34a';
        }
        if (isRouteTo) {
          fillColor = '#ef4444';
          strokeColor = '#dc2626';
        }
        if (isSelected) {
          fillColor = highlightColor;
          strokeColor = '#dc2626';
        }

        let extraStroke: string | null = null;
        if (errorIds.has(node.id)) extraStroke = '#ef4444';
        else if (orphanIds.has(node.id)) extraStroke = '#f97316';
        else if (noAliasIds.has(node.id)) extraStroke = '#eab308';

        const radius = isHovered || isSelected ? 10 : 8;
        const weight = isSelected || isHovered || isEdgeStart || isTransitionStart ? 3 : 2;

        return (
          <React.Fragment key={node.id}>
            {extraStroke && (
              <CircleMarker
                center={[node.y, node.x]}
                radius={radius + 4}
                interactive={false}
                pathOptions={{
                  color: extraStroke,
                  fillColor: 'transparent',
                  fillOpacity: 0,
                  weight: 2,
                  dashArray: '4 4',
                }}
              />
            )}

            <CircleMarker
              center={[node.y, node.x]}
              radius={radius}
              bubblingMouseEvents={false}
              pathOptions={{
                fillColor,
                color: strokeColor,
                fillOpacity: 0.9,
                weight,
                className: 'editor-node',
              }}
              eventHandlers={{
                // Метка для сценариев в браузере и отладки: какой узел под этим кружком.
                add: (e) => (e.target as L.Path).getElement()?.setAttribute('data-node-id', node.id),
                mousedown: (e) => onNodeMouseDown(node, e),
                // Щелчок по узлу — узлу. Leaflet отдаёт событие слою, только если
                // слой на него подписан, а иначе — карте, и та сняла бы выбор,
                // только что поставленный нажатием.
                click: (e) => L.DomEvent.stopPropagation(e),
                mouseover: () => setHoveredNode(node.id),
                mouseout: () => setHoveredNode(null),
                contextmenu: (e) => onNodeContextMenu(node, e),
              }}
            />
          </React.Fragment>
        );
      })}

      {hoveredNode && (
        <CircleMarker
          key={`hover-${hoveredNode.id}`}
          center={[hoveredNode.y, hoveredNode.x]}
          radius={0}
          interactive={false}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
        >
          <Tooltip permanent direction="top" offset={[0, -12]} className="node-hover-tooltip">
            <div className="node-hover-label">
              <span className="node-hover-label__name">{aliases.get(hoveredNode.id)?.[0] ?? 'Без названия'}</span>
              <span className="node-hover-label__id">{hoveredNode.id}</span>
            </div>
          </Tooltip>
        </CircleMarker>
      )}
    </>
  );
};
