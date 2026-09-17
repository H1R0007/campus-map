import React, { useEffect, useMemo, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { DEFAULT_INSETS, PixelMap, fitPaddingOf, flyToBounds, useMapFrame } from '@campus-map/mapkit';
import { campusMapUrl, floorMapUrl, planFormatOf } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import type { EditorTool } from '../../stores/editorStore';
import { DATA_BASE_URL } from '../../config/dataBase';
import { isMapClickSuppressed, suppressNextMapClick } from '../../utils/clickGuard';
import { EditorNodes } from './EditorNodes';
import { EditorEdges } from './EditorEdges';
import { EditorTransitions } from './EditorTransitions';
import { LineToolPreview } from './LineToolPreview';
import { SelectionBox } from './SelectionBox';
import { GridOverlay } from './GridOverlay';
import { RouteOverlay } from '../UI/RouteSimulator';
import { AliasLabels } from './AliasLabels';

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

  // «Показать план целиком» из меню карты.
  const { bounds } = useMapFrame();
  const fitPlanRequest = useEditorStore((s) => s.fitPlanRequest);
  const fittedRequest = useRef(fitPlanRequest);
  useEffect(() => {
    if (fitPlanRequest === fittedRequest.current) return;
    fittedRequest.current = fitPlanRequest;
    flyToBounds(map, bounds, fitPaddingOf(DEFAULT_INSETS));
  }, [map, bounds, fitPlanRequest]);

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

      // Открытое меню управляется своими клавишами: стрелки выбирают пункт, а не
      // двигают узлы, Delete не удаляет выделение за спиной у меню.
      if (useEditorStore.getState().contextMenu.open || target.closest?.('[role="menu"]')) return;

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

      // Соответствие клавиш инструментам. Для клавиш, которые инструмент не
      // переключают, значения нет — проверка на `undefined` и есть фильтр.
      const toolByShortcut: Record<string, EditorTool> = {
        v: 'select',
        n: 'node',
        e: 'edge',
        t: 'transition',
        l: 'line',
        d: 'delete',
      };
      const tool = toolByShortcut[e.key.toLowerCase()];

      if (!ctrl && tool) {
        setActiveTool(tool);
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

/**
 * Нажатия на пустое место карты.
 *
 * - щелчок: инструмент «Узел» ставит узел, «Линия» — её концы, «Выбор»
 *   снимает выделение;
 * - перетаскивание двигает карту (Leaflet), Shift + перетаскивание — рамка
 *   выделения, которая добавляет узлы к выбору;
 * - правая кнопка — меню карты.
 *
 * Нажатия на узлы, рёбра и переходы сюда не доходят: их слои останавливают
 * событие.
 */
const MapEventHandler: React.FC = () => {
  const map = useMap();
  const boxRef = useRef(false);

  // Shift + перетаскивание у Leaflet приближает карту рамкой; здесь это рамка
  // выделения.
  useEffect(() => {
    map.boxZoom.disable();
  }, [map]);

  useEffect(() => {
    const endBox = (commit: boolean) => {
      if (!boxRef.current) return;
      boxRef.current = false;
      const st = useEditorStore.getState();
      if (commit) st.finishSelectionBox(true);
      else st.cancelSelectionBox();
      suppressNextMapClick();
      map.dragging.enable();
    };

    // Кнопку могут отпустить и за пределами карты.
    const onMouseUp = (ev: MouseEvent) => {
      if (ev.button === 0) endBox(true);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') endBox(false);
    };
    // Меню у точки карты теряет смысл, как только карта сдвинулась.
    const closeMenu = () => {
      if (useEditorStore.getState().contextMenu.open) useEditorStore.getState().closeContextMenu();
    };

    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    map.on('movestart zoomstart', closeMenu);
    return () => {
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      map.off('movestart zoomstart', closeMenu);
    };
  }, [map]);

  useMapEvents({
    click: (e) => {
      const dom = e.originalEvent;
      if (dom.button !== 0 || isMapClickSuppressed()) return;

      const st = useEditorStore.getState();
      const { lng: x, lat: y } = e.latlng;

      if (st.activeTool === 'node') {
        st.addNode(x, y);
        return;
      }

      if (st.activeTool === 'line') {
        if (!st.lineTool.start) st.lineSetStart(x, y);
        else if (!st.lineTool.end) st.lineSetEnd(x, y);
        else {
          st.lineReset();
          st.lineSetStart(x, y);
        }
        return;
      }

      if (st.activeTool === 'select' && !dom.shiftKey) st.clearSelection();
    },

    mousedown: (e) => {
      const dom = e.originalEvent;
      const st = useEditorStore.getState();
      if (st.activeTool !== 'select' || dom.button !== 0 || !dom.shiftKey) return;

      dom.preventDefault();
      boxRef.current = true;
      map.dragging.disable();
      st.startSelectionBox(e.latlng.lng, e.latlng.lat);
    },

    mousemove: (e) => {
      if (boxRef.current) useEditorStore.getState().updateSelectionBox(e.latlng.lng, e.latlng.lat);
    },

    contextmenu: (e) => {
      const dom = e.originalEvent;
      dom.preventDefault();
      useEditorStore.getState().openContextMenu(dom.clientX, dom.clientY, {
        kind: 'map',
        x: Math.round(e.latlng.lng),
        y: Math.round(e.latlng.lat),
      });
    },
  });

  return null;
};

/**
 * Карта редактора.
 *
 * Обвязка подложки (определение размера плана, границы, подгонка viewport,
 * смена плана на живой карте) приходит из
 * `PixelMap` пакета `@campus-map/mapkit`. Раньше здесь жили собственные копии
 * `useImageSize` и `FitToBounds`, разошедшиеся с навигатором: например,
 * зависимость эффекта подгонки строилась через `JSON.stringify(bounds)`.
 *
 * Пропсы отличаются от навигатора осознанно: редактору нужен больший
 * максимальный зум, штатные кнопки Leaflet, отключённый зум двойным кликом
 * (мешает выделению) и приглушённая подложка, чтобы узлы читались.
 * Ограничение панорамирования пределами плана не включается — разметчик
 * должен иметь возможность работать за краями изображения.
 */
export const EditorMap: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const campusMeta = useEditorStore((s) => s.campusMeta);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);

  // Формат плана — из метаданных: PNG или SVG (запись 29).
  const mapUrl = useMemo(() => {
    if (currentBuilding === null || currentFloor === null) {
      return campusMapUrl(DATA_BASE_URL, planFormatOf(campusMeta ?? undefined));
    }
    const floorMeta = buildingMetas.get(currentBuilding)?.floors.find((meta) => meta.floor === currentFloor);
    return floorMapUrl(currentBuilding, currentFloor, DATA_BASE_URL, planFormatOf(floorMeta));
  }, [currentBuilding, currentFloor, campusMeta, buildingMetas]);

  return (
    <PixelMap
      url={mapUrl}
      maxZoom={6}
      zoomControl
      doubleClickZoom={false}
      overlayOpacity={0.6}
    >
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
    </PixelMap>
  );
};
