import React, { useEffect, useMemo, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { DEFAULT_INSETS, PixelMap, fitPaddingOf, flyToBounds, useMapFrame } from '@campus-map/mapkit';
import { campusMapUrl, floorMapUrl, planFormatOf } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { useCursorStore } from '../../stores/cursorStore';
import type { EditorStore, EditorTool } from '../../stores/editorStore';
import { DATA_BASE_URL } from '../../config/dataBase';
import { isMapClickSuppressed, suppressNextMapClick } from '../../utils/clickGuard';
import { visibleKinds } from '../../utils/placeKinds';
import { EditorNodes } from './EditorNodes';
import { EditorEdges } from './EditorEdges';
import { EditorTransitions } from './EditorTransitions';
import { ChainPreview } from './ChainPreview';
import { SnapPreview } from './SnapPreview';
import { LineToolPreview } from './LineToolPreview';
import { SelectionBox } from './SelectionBox';
import { GridOverlay } from './GridOverlay';
import { NeighbourFloor } from './NeighbourFloor';
import { RouteOverlay } from './RouteOverlay';
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

/** Клавиши инструментов — по физической клавише, а не по букве раскладки. */
const TOOL_BY_CODE: Record<string, EditorTool> = {
  KeyV: 'select',
  KeyN: 'node',
  KeyE: 'edge',
  KeyT: 'transition',
  KeyL: 'line',
};

/** Стрелки: куда сдвигать узлы или карту. */
const ARROW_STEPS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** На сколько стрелка двигает карту, когда ничего не выбрано, — пиксели экрана. */
const PAN_STEP = 120;

/** Соседний этаж открытого корпуса: PageUp — выше, PageDown — ниже. */
function stepFloor(st: EditorStore, direction: 1 | -1): void {
  if (st.currentBuilding === null || st.currentFloor === null) return;

  const floors = (st.buildingMetas.get(st.currentBuilding)?.floors ?? [])
    .map((meta) => meta.floor)
    .sort((a, b) => a - b);
  const index = floors.indexOf(st.currentFloor);
  const next = index < 0 ? undefined : floors[index + direction];
  if (next === undefined) return;

  st.setCurrentFloor(next);
}

/**
 * Клавиатура редактора.
 *
 * Клавиши читаются по коду физической клавиши (`event.code`): в русской
 * раскладке Ctrl+Z приходит как «я», и отмена, копирование и переключение
 * инструментов не работали вовсе.
 *
 * Стрелки двигают выделенные узлы, а без выделения — карту; PageUp и
 * PageDown листают этажи открытого корпуса. Штатная клавиатура Leaflet
 * выключена: иначе стрелка и двигала узел, и прокручивала карту под ним.
 */
const KeyboardHandler: React.FC = () => {
  const map = useMap();

  useEffect(() => {
    map.keyboard.disable();
    return () => {
      map.keyboard.enable();
    };
  }, [map]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const st = useEditorStore.getState();

      // Открытое меню и окна управляются своими клавишами: стрелки выбирают
      // пункт, а не двигают узлы, Delete не удаляет выделение за спиной у
      // меню, Escape закрывает окно, а не снимает выбор.
      if (
        st.contextMenu.open ||
        st.helpOpen ||
        st.searchOpen ||
        st.kindsOpen ||
        target?.closest?.('[role="menu"], [role="dialog"]')
      ) {
        return;
      }

      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable === true;
      const ctrl = e.ctrlKey || e.metaKey;
      const { code } = e;

      // Стрелки во вкладках инспектора и списках переключают их, а не
      // двигают выбранный узел за спиной у человека.
      if (
        (ARROW_STEPS[code] || code === 'Home' || code === 'End') &&
        target?.closest?.('[role="tablist"], [role="listbox"], [role="radiogroup"]')
      ) {
        return;
      }

      if (code === 'F1' || (e.key === '?' && !isInput)) {
        e.preventDefault();
        st.setHelpOpen(true);
        return;
      }

      if (ctrl && code === 'KeyF') {
        e.preventDefault();
        e.stopPropagation();
        st.setSearchOpen(true);
        return;
      }

      // Сохранение — отовсюду, в том числе из поля названия: у Ctrl+S в поле
      // ввода своего смысла нет, а курсор уводить ради сохранения незачем.
      if (ctrl && code === 'KeyS') {
        e.preventDefault();
        e.stopPropagation();
        st.requestSave();
        return;
      }

      if (isInput) return;

      if (ctrl) {
        switch (code) {
          case 'KeyZ':
            e.preventDefault();
            if (e.shiftKey) st.redo();
            else st.undo();
            return;
          case 'KeyY':
            e.preventDefault();
            st.redo();
            return;
          case 'KeyA':
            e.preventDefault();
            e.stopPropagation();
            st.selectAll();
            return;
          case 'KeyD':
            e.preventDefault();
            e.stopPropagation();
            st.duplicateSelected();
            return;
          case 'KeyC':
            e.preventDefault();
            e.stopPropagation();
            st.copySelected();
            return;
          case 'KeyV':
            e.preventDefault();
            e.stopPropagation();
            st.paste();
            return;
          default:
            // Остальные сочетания с Ctrl принадлежат браузеру.
            return;
        }
      }

      if ((code === 'Delete' || code === 'Backspace') && st.selectedNodeIds.size > 0) {
        e.preventDefault();
        st.deleteSelected();
        return;
      }

      if (code === 'Enter' && st.chainLastNodeId !== null) {
        e.preventDefault();
        st.endChain();
        return;
      }

      if (code === 'Escape') {
        st.clearSelection();
        st.setEdgeStartNode(null);
        st.setTransitionStartNode(null);
        st.endChain();
        st.lineReset();
        st.cancelSelectionBox();
        st.hideNotice();
        return;
      }

      const arrow = ARROW_STEPS[code];
      if (arrow) {
        e.preventDefault();

        if (st.selectedNodeIds.size === 0) {
          map.panBy([arrow.x * PAN_STEP, arrow.y * PAN_STEP]);
          return;
        }

        // Со включённой привязкой шаг — клетка сетки: сдвиг на пиксель
        // притянулся бы обратно, и узел не двигался бы вовсе.
        const { enabled, snap, size } = st.gridSettings;
        const cell = enabled && snap ? size : 1;
        const step = cell * (e.shiftKey ? (cell === 1 ? 10 : 5) : 1);
        st.moveSelectedBy(arrow.x * step, arrow.y * step);
        return;
      }

      if (code === 'PageUp' || code === 'PageDown') {
        e.preventDefault();
        stepFloor(st, code === 'PageUp' ? 1 : -1);
        return;
      }

      // Цифра выбирает вид точки и сразу берёт инструмент, которым его ставят:
      // рука не уходит с карты к строке над ней.
      const digit = /^Digit([1-8])$/.exec(code);
      if (digit) {
        const kind = visibleKinds(st.placeKinds)[Number(digit[1]) - 1];
        if (kind) {
          e.preventDefault();
          st.setActiveKind(kind.id);
          st.setActiveTool('node');
        }
        return;
      }

      const tool = TOOL_BY_CODE[code];
      if (tool) st.setActiveTool(tool);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [map]);

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
        // Щелчок ставит точку выбранного вида: вид сам даёт название, цепляет
        // к ближайшей точке и, если нужно, повторяет себя на всех этажах.
        // Alt — поставить ровно там, куда щёлкнули, без выравнивания.
        st.placeKindNode(x, y, { align: !dom.altKey });
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
      useCursorStore.getState().setPoint({ x: Math.round(e.latlng.lng), y: Math.round(e.latlng.lat) });
    },

    mouseout: () => useCursorStore.getState().setPoint(null),

    zoomend: () => useCursorStore.getState().setZoom(map.getZoom()),

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
 * Карта подстраивается под размер своего места на экране.
 *
 * Leaflet сам следит только за размером окна, а место карты меняется и без
 * него: свернули колонку структуры или инспектора — карта шире. Без
 * пересчёта щелчки попадали бы не в те точки плана.
 */
const MapResizeWatcher: React.FC = () => {
  const map = useMap();

  useEffect(() => {
    useCursorStore.getState().setZoom(map.getZoom());
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

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
      <MapResizeWatcher />
      <KeyboardHandler />

      {/* overlays order */}
      <NeighbourFloor />
      <GridOverlay />
      <EditorEdges />
      <EditorTransitions />
      <RouteOverlay />
      <ChainPreview />
      <SnapPreview />
      <LineToolPreview />
      <SelectionBox />
      <EditorNodes />
      <AliasLabels />

      <MapEventHandler />
    </PixelMap>
  );
};
