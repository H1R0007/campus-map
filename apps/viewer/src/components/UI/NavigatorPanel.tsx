import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { WIDE_LAYOUT_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { useShareRoute } from '../../hooks/useShareRoute';
import { useMessages } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { sheetModeOf, useUiStore } from '../../stores/uiStore';
import { IdleContent } from './IdleContent';
import { PlaceCard } from './PlaceCard';
import { RouteNavigation } from './RouteNavigation';
import { RouteOverview } from './RouteOverview';
import { SearchView } from './SearchView';
import { ShareFeedback } from './ShareFeedback';

const BODY_ID = 'navigator-panel-body';

/** Смещение пальца по ручке, после которого шторка раскрывается или сворачивается, px. */
const DRAG_THRESHOLD_PX = 40;

/** Смещение, до которого движение по ручке считается нажатием, px. */
const TAP_SLOP_PX = 6;

/**
 * Панель навигатора: на телефоне — шторка снизу, на широком экране — панель
 * слева от карты (запись 17).
 *
 * Панель не модальна: карта видна и отвечает на жесты при любом её состоянии.
 * Раньше шаги маршрута открывались модальной шторкой, которая затемняла и
 * закрывала карту, — шаг переключал этаж, которого не было видно.
 *
 * Содержимое выводится из состояния (`sheetModeOf`): выбранное место, шаг
 * пошаговой навигации, обзор маршрута или поиск. На телефоне у шторки два
 * состояния — свёрнутое (главное) и раскрытое (подробности); ручка раскрывает
 * её нажатием, жестом и с клавиатуры. Новое содержимое открывается свёрнутым.
 * Escape сворачивает раскрытую шторку, а свёрнутую карточку места закрывает.
 *
 * Сколько карты закрывает панель, измеряется и уходит в отступы подгонки карты
 * (`mapInsetsOf`) и в `--campus-sheet-height` для колонки этажей.
 */
export const NavigatorPanel: React.FC = () => {
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const messages = useMessages();

  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const selectNode = useMapStore((s) => s.selectNode);
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const stepIndex = useRouteStore((s) => s.stepIndex);
  const searchTarget = useUiStore((s) => s.searchTarget);
  const sheetExpanded = useUiStore((s) => s.sheetExpanded);
  const setSheetExpanded = useUiStore((s) => s.setSheetExpanded);
  const setMapObstruction = useUiStore((s) => s.setMapObstruction);
  const share = useShareRoute();

  const mode = sheetModeOf({ selectedNodeId, currentRoute, stepIndex });
  // Карточке места раскрывать нечего: всё главное в ней и так видно.
  const expandable = mode !== 'place';
  const expanded = isWide || (expandable && sheetExpanded);
  const hasHandle = !isWide && expandable;

  // Новое содержимое — свёрнутым: выбранное место или построенный маршрут
  // важнее подробностей, и карта над шторкой должна остаться видна.
  useEffect(() => {
    setSheetExpanded(false);
  }, [mode, setSheetExpanded]);

  const panelRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const update = () => {
      const rect = panel.getBoundingClientRect();
      const obstruction = isWide
        ? { bottom: 0, left: Math.round(rect.right) }
        : { bottom: Math.max(0, Math.round(window.innerHeight - rect.top)), left: 0 };

      setMapObstruction(obstruction);
      document.documentElement.style.setProperty('--campus-sheet-height', `${obstruction.bottom}px`);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [isWide, setMapObstruction]);

  // --- Ручка шторки ---

  const drag = useRef<{ startY: number; dy: number } | null>(null);
  const dragged = useRef(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);

  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.current = { startY: event.clientY, dy: 0 };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;

    current.dy = event.clientY - current.startY;
    if (Math.abs(current.dy) > TAP_SLOP_PX) dragged.current = true;

    // Раскрытая шторка едет за пальцем вниз. Свёрнутую вверх не тянем: расти
    // ей некуда, пока не раскрыта, — решение принимается при отпускании.
    setDragOffset(expanded ? Math.max(0, current.dy) : 0);
  };

  const onHandlePointerEnd = () => {
    const current = drag.current;
    drag.current = null;
    setDragOffset(null);
    if (!current || !dragged.current) return;

    if (current.dy < -DRAG_THRESHOLD_PX) setSheetExpanded(true);
    else if (current.dy > DRAG_THRESHOLD_PX) setSheetExpanded(false);
  };

  const onHandleClick = () => {
    // После жеста браузер присылает ещё и click — нажатием он не считается.
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setSheetExpanded(!expanded);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;

    if (hasHandle && expanded) {
      event.preventDefault();
      setSheetExpanded(false);
    } else if (mode === 'place') {
      event.preventDefault();
      selectNode(null);
    }
  };

  const content =
    mode === 'place' && selectedNodeId !== null ? (
      <PlaceCard nodeId={selectedNodeId} />
    ) : mode === 'navigate' ? (
      <RouteNavigation expanded={expanded} />
    ) : mode === 'route' ? (
      <RouteOverview expanded={expanded} onExpand={() => setSheetExpanded(true)} share={share} />
    ) : (
      <IdleContent expanded={expanded} />
    );

  return (
    <>
      <ShareFeedback copied={share.copied} manualLink={share.manualLink} onCloseManual={share.closeManual} />

      <section
        ref={panelRef}
        aria-label={messages.sheet.label}
        onKeyDown={onKeyDown}
        style={dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined}
        className={`fixed z-[1000] inset-x-0 bottom-0 flex flex-col bg-surface border border-gray-100 shadow-2xl rounded-t-3xl pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:left-4 sm:bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:w-[26rem] sm:rounded-3xl sm:pb-0 lg:top-4 lg:bottom-auto lg:w-[24rem] lg:max-h-[calc(100%-2rem)] lg:rounded-2xl ${
          dragOffset === null ? 'campus-panel--animated' : ''
        }`}
      >
        {hasHandle && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={BODY_ID}
            aria-label={expanded ? messages.sheet.collapse : messages.sheet.expand}
            onClick={onHandleClick}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerEnd}
            onPointerCancel={onHandlePointerEnd}
            className="w-full h-11 flex-shrink-0 flex justify-center pt-2.5 rounded-t-3xl touch-none"
          >
            <span aria-hidden="true" className="w-10 h-1.5 rounded-full bg-gray-300" />
          </button>
        )}

        <div
          id={BODY_ID}
          className={`min-h-0 flex-auto overflow-y-auto overscroll-contain ${hasHandle ? '' : 'pt-4'} ${
            hasHandle && expanded ? 'campus-panel__body--expanded' : ''
          }`}
        >
          {content}
        </div>
      </section>

      {searchTarget !== null && <SearchView key={searchTarget} target={searchTarget} />}
    </>
  );
};
