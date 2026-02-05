import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEditorStore } from '../../stores/editorStore';

type DragCandidate = {
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startNodeX: number;
  startNodeY: number;
  dragging: boolean;
};

const DRAG_THRESHOLD = 4;

export const EditorNodes: React.FC = () => {
  const map = useMap();
  const dragCandidateRef = useRef<DragCandidate | null>(null);
  const [quickInfoNodeId, setQuickInfoNodeId] = useState<string | null>(null);

  const nodes = useEditorStore((s) => s.getNodesForCurrentFloor());
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const hoveredNodeId = useEditorStore((s) => s.hoveredNodeId);

  const activeTool = useEditorStore((s) => s.activeTool);
  const edgeStartNodeId = useEditorStore((s) => s.edgeStartNodeId);
  const transitionStartNodeId = useEditorStore((s) => s.transitionStartNodeId);
  const transitionType = useEditorStore((s) => s.transitionType);
  const displayFilters = useEditorStore((s) => s.displayFilters);

  // route pick mode
  const routePickMode = useEditorStore((s) => s.routePickMode);
  const routeSimulatorOpen = useEditorStore((s) => s.routeSimulatorOpen);
  const routePickTarget = useEditorStore((s) => s.routePickTarget);
  const pickRouteNode = useEditorStore((s) => s.pickRouteNode);

  const route = useEditorStore((s) => s.routeSimulation);

  const toggleSelectNode = useEditorStore((s) => s.toggleSelectNode);
  const selectSingleNode = useEditorStore((s) => s.selectSingleNode);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const setHoveredNode = useEditorStore((s) => s.setHoveredNode);
  const setEdgeStartNode = useEditorStore((s) => s.setEdgeStartNode);
  const setTransitionStartNode = useEditorStore((s) => s.setTransitionStartNode);

  const addEdge = useEditorStore((s) => s.addEdge);
  const addTransition = useEditorStore((s) => s.addTransition);
  const removeNode = useEditorStore((s) => s.removeNode);

  const getNode = useEditorStore((s) => s.getNode);
  const getNodeAliases = useEditorStore((s) => s.getNodeAliases);
  const moveNode = useEditorStore((s) => s.moveNode);
  const commitMoveNode = useEditorStore((s) => s.commitMoveNode);

  const getOrphanNodes = useEditorStore((s) => s.getOrphanNodes);
  const getNodesWithoutAlias = useEditorStore((s) => s.getNodesWithoutAlias);
  const getNodesWithErrors = useEditorStore((s) => s.getNodesWithErrors);

  const orphanIds = useMemo(
    () => (displayFilters.highlightOrphans ? new Set(getOrphanNodes().map((n) => n.id)) : new Set<string>()),
    [displayFilters.highlightOrphans, getOrphanNodes]
  );
  const noAliasIds = useMemo(
    () => (displayFilters.highlightNoAlias ? new Set(getNodesWithoutAlias().map((n) => n.id)) : new Set<string>()),
    [displayFilters.highlightNoAlias, getNodesWithoutAlias]
  );
  const errorIds = useMemo(
    () => (displayFilters.highlightErrors ? new Set(getNodesWithErrors().map((n) => n.id)) : new Set<string>()),
    [displayFilters.highlightErrors, getNodesWithErrors]
  );

  // current route path for highlighting (selectedPathIndex-aware)
  const routePath = useMemo(() => {
    if (route.alternativePaths && route.alternativePaths.length > 0) {
      return route.alternativePaths[route.selectedPathIndex] ?? route.alternativePaths[0] ?? [];
    }
    return route.path ?? [];
  }, [route.alternativePaths, route.path, route.selectedPathIndex]);

  const finishDrag = useCallback(() => {
    dragCandidateRef.current = null;
    try {
      map.dragging.enable();
    } catch {}
  }, [map]);

  const handleNodeActivateNonSelect = useCallback(
    (nodeId: string) => {
      try {
        switch (activeTool) {
          case 'edge':
            if (!edgeStartNodeId) setEdgeStartNode(nodeId);
            else if (edgeStartNodeId !== nodeId) {
              addEdge(edgeStartNodeId, nodeId);
              setEdgeStartNode(null);
            }
            return;

          case 'transition':
            if (!transitionStartNodeId) setTransitionStartNode(nodeId);
            else if (transitionStartNodeId !== nodeId) {
              addTransition(transitionStartNodeId, nodeId, transitionType);
              setTransitionStartNode(null);
            }
            return;

          case 'delete':
            removeNode(nodeId);
            clearSelection();
            return;

          case 'node':
          case 'line':
          default:
            selectSingleNode(nodeId);
            return;
        }
      } catch (err) {
        console.error('handleNodeActivateNonSelect error:', err);
      }
    },
    [
      activeTool,
      edgeStartNodeId,
      transitionStartNodeId,
      transitionType,
      setEdgeStartNode,
      setTransitionStartNode,
      addEdge,
      addTransition,
      removeNode,
      clearSelection,
      selectSingleNode,
    ]
  );

  const stopDom = (dom: MouseEvent) => {
    dom.preventDefault();
    dom.stopPropagation();
    L.DomEvent.stop(dom);
  };

  const onMarkerMouseDown = useCallback(
    (nodeId: string, e: L.LeafletMouseEvent) => {
      const dom = e.originalEvent as MouseEvent;

      // Ctrl+ПКМ — не перехватываем на узле, чтобы selection box работал даже если старт на точке
      if (activeTool === 'select' && dom.button === 2 && dom.ctrlKey) {
        return;
      }

      // === SELECT TOOL ===
      if (activeTool === 'select') {
        // Shift+ЛКМ — мультивыделение (без открытия свойств)
        if (dom.button === 0 && dom.shiftKey) {
          stopDom(dom);
          toggleSelectNode(nodeId, true);
          return;
        }

        // ЛКМ — quick info, не блокируем pan
        if (dom.button === 0 && !dom.shiftKey) {
          setQuickInfoNodeId(nodeId);
          window.setTimeout(() => setQuickInfoNodeId(null), 1800);
          return;
        }

        // ПКМ — либо pick mode, либо обычные свойства/drag
        if (dom.button === 2) {
          stopDom(dom);

          // pick mode for route panel
          if (routePickMode && routeSimulatorOpen) {
            const picked = pickRouteNode(nodeId);
            if (picked) return;
          }

          const n = getNode(nodeId);
          if (!n) return;

          // открываем свойства
          selectSingleNode(nodeId);

          // готовим drag
          dragCandidateRef.current = {
            nodeId,
            startClientX: dom.clientX,
            startClientY: dom.clientY,
            startNodeX: n.x,
            startNodeY: n.y,
            dragging: false,
          };
          return;
        }

        return;
      }

      // === OTHER TOOLS ===
      if (dom.button === 0) {
        stopDom(dom);
        handleNodeActivateNonSelect(nodeId);
      }

      if (dom.button === 2) {
        stopDom(dom);
      }
    },
    [
      activeTool,
      toggleSelectNode,
      routePickMode,
      routeSimulatorOpen,
      pickRouteNode,
      getNode,
      selectSingleNode,
      handleNodeActivateNonSelect,
    ]
  );

  // drag (ПКМ удержание на точке при select)
  useEffect(() => {
    const container = map.getContainer();

    const onMouseMove = (ev: MouseEvent) => {
      const c = dragCandidateRef.current;
      if (!c) return;

      const dx = ev.clientX - c.startClientX;
      const dy = ev.clientY - c.startClientY;

      if (!c.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        c.dragging = true;
        try {
          map.dragging.disable();
        } catch {}
      }

      if (!c.dragging) return;

      const rect = container.getBoundingClientRect();
      const point = L.point(ev.clientX - rect.left, ev.clientY - rect.top);
      const latlng = map.containerPointToLatLng(point);

      moveNode(c.nodeId, latlng.lng, latlng.lat);
    };

    const onMouseUp = (ev: MouseEvent) => {
      const c = dragCandidateRef.current;
      if (!c) return;
      if (ev.button !== 2) return;

      ev.preventDefault();
      ev.stopPropagation();

      try {
        if (c.dragging) {
          const n = getNode(c.nodeId);
          if (n) commitMoveNode(c.nodeId, c.startNodeX, c.startNodeY, n.x, n.y);
        }
      } finally {
        finishDrag();
      }
    };

    const onBlur = () => {
      if (dragCandidateRef.current) finishDrag();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setQuickInfoNodeId(null);
        if (dragCandidateRef.current) {
          const c = dragCandidateRef.current;
          if (c.dragging) moveNode(c.nodeId, c.startNodeX, c.startNodeY);
          finishDrag();
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [map, moveNode, getNode, commitMoveNode, finishDrag]);

  useEffect(() => {
    return () => {
      dragCandidateRef.current = null;
    };
  }, []);

  useEffect(() => {
    setQuickInfoNodeId(null);
  }, [activeTool]);

  return (
    <>
      {nodes.map((node) => {
        const isSelected = selectedNodeIds.has(node.id);
        const isHovered = hoveredNodeId === node.id;
        const isEdgeStart = edgeStartNodeId === node.id;
        const isTransitionStart = transitionStartNodeId === node.id;
        const showQuickInfo = quickInfoNodeId === node.id && activeTool === 'select';

        // route highlighting (selected path)
        const isRouteFrom = route.fromNodeId === node.id;
        const isRouteTo = route.toNodeId === node.id;
        const isInRoute = routePath.includes(node.id);

        // diagnostics highlighting
        const isOrphan = orphanIds.has(node.id);
        const hasNoAlias = noAliasIds.has(node.id);
        const hasError = errorIds.has(node.id);

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
          fillColor = '#3b82f6';
          strokeColor = '#2563eb';
        }

        // route
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
          fillColor = '#e94560';
          strokeColor = '#dc2626';
        }

        let extraStroke: string | null = null;
        if (hasError) extraStroke = '#ef4444';
        else if (isOrphan) extraStroke = '#f97316';
        else if (hasNoAlias) extraStroke = '#eab308';

        const radius = isHovered || isSelected ? 10 : 8;
        const weight = isSelected || isHovered || isEdgeStart || isTransitionStart ? 3 : 2;

        const aliases = getNodeAliases(node.id);

        const routePickHint =
          routePickMode && routeSimulatorOpen
            ? routePickTarget === 'from' || !route.fromNodeId
              ? 'ПКМ — выбрать как СТАРТ'
              : 'ПКМ — выбрать как ФИНИШ'
            : null;

        return (
          <React.Fragment key={node.id}>
            {/* extra ring */}
            {extraStroke && (
              <CircleMarker
                center={[node.y, node.x]}
                radius={radius + 4}
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
              }}
              eventHandlers={{
                mousedown: (e) => onMarkerMouseDown(node.id, e),
                mouseover: () => setHoveredNode(node.id),
                mouseout: () => setHoveredNode(null),
                contextmenu: (e) => {
                  const dom = e.originalEvent as MouseEvent;
                  dom.preventDefault();
                  dom.stopPropagation();
                },
              }}
            >
              {showQuickInfo && (
                <Tooltip permanent direction="top" offset={[0, -10]} className="quick-info-tooltip">
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#1e1e2e',
                      border: '1px solid #3b3b4f',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '12px',
                      minWidth: '170px',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      {node.isPortal ? '⭐ ' : ''}
                      {aliases[0] || node.id}
                    </div>
                    <div style={{ color: '#a0a0b0', fontSize: 10 }}>
                      {node.building} / этаж {node.floor}
                    </div>
                    <div style={{ color: '#a0a0b0', fontSize: 10 }}>
                      ({node.x}, {node.y}) • {node.neighbors.length} связей
                    </div>

                    {hasNoAlias && <div style={{ color: '#eab308', fontSize: 10, marginTop: 4 }}>⚠️ Нет алиаса</div>}
                    {isOrphan && <div style={{ color: '#f97316', fontSize: 10, marginTop: 2 }}>⚠️ Нет связей</div>}
                    {hasError && <div style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>⚠️ Ошибка neighbors</div>}

                    {routePickHint && <div style={{ color: '#60a5fa', fontSize: 10, marginTop: 4 }}>🧭 {routePickHint}</div>}

                    <div
                      style={{
                        color: '#6b7280',
                        fontSize: 9,
                        marginTop: 6,
                        borderTop: '1px solid #3b3b4f',
                        paddingTop: 4,
                      }}
                    >
                      Shift+ЛКМ — мультивыбор • ПКМ — свойства/drag
                    </div>
                  </div>
                </Tooltip>
              )}
            </CircleMarker>
          </React.Fragment>
        );
      })}
    </>
  );
};