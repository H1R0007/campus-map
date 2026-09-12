import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOverlay, MapContainer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useEditorStore } from '../../stores/editorStore';
import { EditorNodes } from './EditorNodes';
import { EditorEdges } from './EditorEdges';
import { EditorTransitions } from './EditorTransitions';
import { LineToolPreview } from './LineToolPreview';
import { SelectionBox } from './SelectionBox';
import { GridOverlay } from './GridOverlay';
import { RouteOverlay } from '../UI/RouteSimulator';
import { AliasLabels } from './AliasLabels';

const FALLBACK = { width: 1200, height: 800 };

function useImageSize(url: string, fallback: { width: number; height: number }) {
  const [size, setSize] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.width > 0 && img.height > 0) setSize({ width: img.width, height: img.height });
      else setSize(fallback);
    };
    img.onerror = () => {
      if (!cancelled) setSize(fallback);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, fallback.width, fallback.height]);

  return size;
}

const FitToBounds: React.FC<{ bounds: L.LatLngBoundsExpression }> = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    try {
      map.fitBounds(bounds, { padding: [20, 20] });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(bounds)]);
  return null;
};

const CameraController: React.FC = () => {
  const map = useMap();
  const cameraCenterRequest = useEditorStore((s) => s.cameraCenterRequest);
  const clearCameraCenter = useEditorStore((s) => s.clearCameraCenter);

  useEffect(() => {
    if (!cameraCenterRequest) return;
    const zoom = cameraCenterRequest.zoom ?? map.getZoom();
    map.setView([cameraCenterRequest.y, cameraCenterRequest.x], zoom, { animate: true, duration: 0.35 });
    clearCameraCenter();
  }, [map, cameraCenterRequest, clearCameraCenter]);

  return null;
};

const KeyboardHandler: React.FC = () => {
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);

  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const selectAll = useEditorStore((s) => s.selectAll);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const copySelected = useEditorStore((s) => s.copySelected);
  const paste = useEditorStore((s) => s.paste);
  const moveSelectedBy = useEditorStore((s) => s.moveSelectedBy);

  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const clearSelection = useEditorStore((s) => s.clearSelection);
  const setEdgeStartNode = useEditorStore((s) => s.setEdgeStartNode);
  const setTransitionStartNode = useEditorStore((s) => s.setTransitionStartNode);
  const lineReset = useEditorStore((s) => s.lineReset);
  const cancelSelectionBox = useEditorStore((s) => s.cancelSelectionBox);

  const setSearchOpen = useEditorStore((s) => s.setSearchOpen);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+F
      if (ctrl && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
        return;
      }

      if (isInput) return;

      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        redo();
        return;
      }

      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        e.stopPropagation();
        selectAll();
        return;
      }

      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        e.stopPropagation();
        duplicateSelected();
        return;
      }

      if (ctrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        e.stopPropagation();
        copySelected();
        return;
      }

      if (ctrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        e.stopPropagation();
        paste();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.size > 0) {
        e.preventDefault();
        deleteSelected();
        return;
      }

      if (e.key === 'Escape') {
        clearSelection();
        setEdgeStartNode(null);
        setTransitionStartNode(null);
        lineReset();
        cancelSelectionBox();
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      if (selectedNodeIds.size > 0) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveSelectedBy(-step, 0);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveSelectedBy(step, 0);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveSelectedBy(0, -step);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveSelectedBy(0, step);
          return;
        }
      }

      const toolKeys: Record<string, string> = { v: 'select', n: 'node', e: 'edge', t: 'transition', l: 'line', d: 'delete' };
      if (!ctrl && toolKeys[e.key.toLowerCase()]) {
        setActiveTool(toolKeys[e.key.toLowerCase()] as any);
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    selectedNodeIds.size,
    deleteSelected,
    selectAll,
    duplicateSelected,
    copySelected,
    paste,
    moveSelectedBy,
    undo,
    redo,
    clearSelection,
    setEdgeStartNode,
    setTransitionStartNode,
    lineReset,
    cancelSelectionBox,
    setSearchOpen,
    setActiveTool,
  ]);

  return null;
};

const MapEventHandler: React.FC = () => {
  const map = useMap();

  const activeTool = useEditorStore((s) => s.activeTool);
  const addNode = useEditorStore((s) => s.addNode);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const lineTool = useEditorStore((s) => s.lineTool);
  const lineSetStart = useEditorStore((s) => s.lineSetStart);
  const lineSetEnd = useEditorStore((s) => s.lineSetEnd);
  const lineReset = useEditorStore((s) => s.lineReset);

  const selectionBox = useEditorStore((s) => s.selectionBox);
  const startSelectionBox = useEditorStore((s) => s.startSelectionBox);
  const updateSelectionBox = useEditorStore((s) => s.updateSelectionBox);
  const finishSelectionBox = useEditorStore((s) => s.finishSelectionBox);
  const cancelSelectionBox = useEditorStore((s) => s.cancelSelectionBox);

  const selectingRef = useRef(false);

  // safety: если mouseup произошёл вне карты — вернуть dragging
  useEffect(() => {
    const onWindowMouseUp = (e: MouseEvent) => {
      if (!selectingRef.current) return;
      if (e.button !== 2) return;
      selectingRef.current = false;
      try {
        finishSelectionBox();
      } finally {
        map.dragging.enable();
      }
    };
    window.addEventListener('mouseup', onWindowMouseUp, true);
    return () => window.removeEventListener('mouseup', onWindowMouseUp, true);
  }, [finishSelectionBox, map]);

  useMapEvents({
    click: (e) => {
      const dom = e.originalEvent as MouseEvent;
      if (dom.button !== 0) return;
      if (dom.defaultPrevented) return;

      if (activeTool === 'node') {
        addNode(e.latlng.lng, e.latlng.lat);
        return;
      }

      if (activeTool === 'line') {
        if (!lineTool.start) lineSetStart(e.latlng.lng, e.latlng.lat);
        else if (!lineTool.end) lineSetEnd(e.latlng.lng, e.latlng.lat);
        else {
          lineReset();
          lineSetStart(e.latlng.lng, e.latlng.lat);
        }
        return;
      }

      if (activeTool === 'select' && !dom.shiftKey) {
        // клик по пустому месту — сброс выделения
        clearSelection();
      }
    },

    // Ctrl+ПКМ selection box
    mousedown: (e) => {
      const dom = e.originalEvent as MouseEvent;
      if (activeTool === 'select' && dom.ctrlKey && dom.button === 2) {
        dom.preventDefault();
        dom.stopPropagation();
        selectingRef.current = true;
        map.dragging.disable();
        startSelectionBox(e.latlng.lng, e.latlng.lat);
      }
    },

    mousemove: (e) => {
      if (selectionBox?.active && selectingRef.current) {
        updateSelectionBox(e.latlng.lng, e.latlng.lat);
      }
    },

    mouseup: (e) => {
      const dom = e.originalEvent as MouseEvent;
      if (selectingRef.current && dom.button === 2) {
        dom.preventDefault();
        dom.stopPropagation();
        selectingRef.current = false;
        try {
          finishSelectionBox();
        } finally {
          map.dragging.enable();
        }
      }
    },

    contextmenu: (e) => {
      // отключаем браузерное меню на карте
      e.originalEvent.preventDefault();
    },
  });

  // на случай Esc — отмена selection box
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && selectingRef.current) {
        selectingRef.current = false;
        cancelSelectionBox();
        map.dragging.enable();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [cancelSelectionBox, map]);

  return null;
};

export const EditorMap: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);

  const mapUrl = useMemo(() => {
    if (!currentBuilding) return '/data/campus/map.png';
    return `/data/buildings/${currentBuilding}/floors/${currentFloor}/map.png`;
  }, [currentBuilding, currentFloor]);

  const size = useImageSize(mapUrl, FALLBACK);

  const bounds: L.LatLngBoundsExpression = useMemo(() => {
    return [
      [0, 0],
      [size.height, size.width],
    ];
  }, [size.height, size.width]);

  const center: [number, number] = useMemo(() => [size.height / 2, size.width / 2], [size.height, size.width]);

  return (
    <MapContainer
      key={mapUrl}
      center={center}
      zoom={0}
      minZoom={-2}
      maxZoom={6}
      crs={L.CRS.Simple}
      zoomControl={true}
      attributionControl={false}
      doubleClickZoom={false}
      className="w-full h-full"
    >
      <ImageOverlay url={mapUrl} bounds={bounds} opacity={0.6} />
      <FitToBounds bounds={bounds} />
      <CameraController />
      <KeyboardHandler />

      {/* overlays order */}
      <GridOverlay />
      <EditorEdges />
      <EditorTransitions />
      <RouteOverlay />
      <LineToolPreview />
      <SelectionBox />
      <EditorNodes />
      <AliasLabels />

      <MapEventHandler />
    </MapContainer>
  );
};