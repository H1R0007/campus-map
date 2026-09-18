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
import { mapPalette } from '../../utils/themeColor';

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

  // Цвета темы значением: атрибуты SVG, которые ставит Leaflet, `var()` не понимают.
  const palette = mapPalette();

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
          st.showNotice('Оба узла на одном плане: их соединяет связь, а не переход.', 'warn');
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
      if (st.pickRouteNode(node.id)) return;

      // Выбранное на карте показывает карточку, даже если в инспекторе была
      // открыта проверка или маршрут.
      if (st.inspectorTab !== 'properties') st.setInspectorTab('properties', false);

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

        let fillColor = palette.node;
        let strokeColor = palette.nodeStroke;

        if (node.isPortal) {
          fillColor = palette.portal;
          strokeColor = palette.portalStroke;
        }
        if (isEdgeStart) {
          fillColor = palette.start;
          strokeColor = palette.startStroke;
        }
        if (isTransitionStart) {
          // Узел, от которого строится переход: цвет выбранного типа, как у его
          // кнопки в панели инструментов, и обводка акцентом темы.
          fillColor = TRANSITION_COLORS[transitionType];
          strokeColor = palette.highlight;
        }
        if (isInRoute) {
          fillColor = palette.route;
          strokeColor = palette.routeStroke;
        }
        if (isRouteFrom) {
          fillColor = palette.start;
          strokeColor = palette.startStroke;
        }
        if (isRouteTo) {
          fillColor = palette.finish;
          strokeColor = palette.finishStroke;
        }
        if (isSelected) {
          fillColor = palette.highlight;
          strokeColor = palette.finishStroke;
        }

        let extraStroke: string | null = null;
        if (errorIds.has(node.id)) extraStroke = palette.problemError;
        else if (orphanIds.has(node.id)) extraStroke = palette.problemOrphan;
        else if (noAliasIds.has(node.id)) extraStroke = palette.problemNoName;

        const radius = isHovered || isSelected ? 10 : 8;
        const weight = isSelected || isHovered || isEdgeStart || isTransitionStart ? 3 : 2;

        return (
          <NodeMarker
            key={node.id}
            node={node}
            fill={fillColor}
            stroke={strokeColor}
            radius={radius}
            weight={weight}
            problemStroke={extraStroke}
            onMouseDown={onNodeMouseDown}
            onContextMenu={onNodeContextMenu}
            onHover={setHoveredNode}
          />
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

interface NodeMarkerProps {
  node: MapNode;
  fill: string;
  stroke: string;
  radius: number;
  weight: number;
  /** Пунктирная обводка подсветки проблем или `null`. */
  problemStroke: string | null;
  onMouseDown: (node: MapNode, e: L.LeafletMouseEvent) => void;
  onContextMenu: (node: MapNode, e: L.LeafletMouseEvent) => void;
  onHover: (nodeId: string | null) => void;
}

/**
 * Один узел на карте.
 *
 * Вынесен и запоминается (`React.memo`): на этаже бывает больше двухсот узлов,
 * а наведение мыши и перетаскивание меняют вид одного-двух. Раньше каждое
 * движение мыши перебирало и обновляло все узлы этажа — наведение занимало
 * около 33 мс, шаг перетаскивания около 48 мс, и работа шла рывками.
 */
const NodeMarker = React.memo(function NodeMarker({
  node,
  fill,
  stroke,
  radius,
  weight,
  problemStroke,
  onMouseDown,
  onContextMenu,
  onHover,
}: NodeMarkerProps) {
  const center = useMemo((): [number, number] => [node.y, node.x], [node.y, node.x]);

  const handlers = useMemo(
    () => ({
      // Метка для сценариев в браузере и отладки: какой узел под этим кружком.
      add: (e: L.LeafletEvent) => {
        const element = (e.target as L.Path).getElement();
        element?.setAttribute('data-node-id', node.id);
        element?.classList.add('editor-node');
      },
      mousedown: (e: L.LeafletMouseEvent) => onMouseDown(node, e),
      // Щелчок по узлу — узлу. Leaflet отдаёт событие слою, только если слой на
      // него подписан, а иначе — карте, и та сняла бы выбор, только что
      // поставленный нажатием.
      click: (e: L.LeafletMouseEvent) => L.DomEvent.stopPropagation(e),
      // Двойной щелчок — сразу к названию узла в карточке.
      dblclick: (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (useEditorStore.getState().activeTool === 'select') useEditorStore.getState().editNodeName(node.id);
      },
      mouseover: () => onHover(node.id),
      mouseout: () => onHover(null),
      contextmenu: (e: L.LeafletMouseEvent) => onContextMenu(node, e),
    }),
    [node, onMouseDown, onContextMenu, onHover]
  );

  const pathOptions = useMemo(
    () => ({ fillColor: fill, color: stroke, fillOpacity: 0.9, weight }),
    [fill, stroke, weight]
  );

  const problemOptions = useMemo(
    () => ({ color: problemStroke ?? '', fillColor: 'transparent', fillOpacity: 0, weight: 2, dashArray: '4 4' }),
    [problemStroke]
  );

  return (
    <>
      {problemStroke && <CircleMarker center={center} radius={radius + 4} interactive={false} pathOptions={problemOptions} />}
      <CircleMarker center={center} radius={radius} bubblingMouseEvents={false} pathOptions={pathOptions} eventHandlers={handlers} />
    </>
  );
});
