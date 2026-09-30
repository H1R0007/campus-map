import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { SPLIT_LIMITS, activeTabOf, planOfTab, planTitle } from '../../stores/editor/windowSlice';
import type { MapTab } from '../../stores/editor/windowSlice';
import { EditorMap } from '../Map/EditorMap';
import { PlanViewContext, usePlanView } from '../Map/planView';
import { CrossMapLink } from '../Map/CrossMapLink';
import { MapHeader } from './MapHeader';
import { PlanStatus } from '../UI/PlanStatus';
import { Notice } from '../UI/Notice';
import { Icon } from '../UI/Icon';

/** Вкладка, которую сейчас тащат мышью: откуда и какая. */
interface DraggedTab {
  group: number;
  tabId: string;
}

/** Пустой список вкладок — у карты, которая закрывается прямо сейчас. */
const NO_TABS: MapTab[] = [];

const TabDragContext = createContext<{
  dragged: DraggedTab | null;
  setDragged: (tab: DraggedTab | null) => void;
}>({ dragged: null, setDragged: () => {} });

/** Шаг клавиш-стрелок на границе карт — доля ширины. */
const SPLIT_KEY_STEP = 0.02;

/**
 * Окна карт (запись 66): одна карта или две рядом, у каждой — свои вкладки.
 *
 * Вторую карту открывают кнопкой «Открыть рядом», переносом вкладки вправо
 * или из пункта меню вкладки. Её можно свернуть в полоску у правого края — она
 * остаётся открытой со своими вкладками — и развернуть щелчком. Щелчок по
 * карте делает её активной: туда идут инструменты, клавиши и правая панель.
 */
export const MapWindows: React.FC = () => {
  const groups = useEditorStore((s) => s.mapGroups);
  const collapsed = useEditorStore((s) => s.sideCollapsed);
  const ratio = useEditorStore((s) => s.splitRatio);
  const [dragged, setDragged] = useState<DraggedTab | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useMemo(() => ({ dragged, setDragged }), [dragged]);
  const split = groups.length > 1;
  const sideOpen = split && !collapsed;

  return (
    <TabDragContext.Provider value={drag}>
      <div
        ref={rowRef}
        className={sideOpen ? 'editor-mapwindows editor-mapwindows--split' : 'editor-mapwindows'}
        style={sideOpen ? ({ '--editor-split': `${ratio * 100}%` } as React.CSSProperties) : undefined}
      >
        <MapGroupView key={groups[0].id} group={0} />
        {sideOpen && <SplitDivider rowRef={rowRef} />}
        {sideOpen && <MapGroupView key={groups[1].id} group={1} />}
        {split && collapsed && <CollapsedSide />}
        {!split && dragged && <SideDropZone />}
        <CrossMapLink />
      </div>
    </TabDragContext.Provider>
  );
};

/** Одна карта: вкладки, строка пути и сама карта. */
const MapGroupView: React.FC<{ group: number }> = ({ group }) => {
  const active = useEditorStore((s) => s.activeGroup === group);
  const split = useEditorStore((s) => s.mapGroups.length > 1);
  // Карта может закрываться прямо сейчас: выборка не падает, карта просто не рисуется.
  const tab = useEditorStore((s) => (s.mapGroups[group] ? activeTabOf(s.mapGroups[group]) : null));
  const storeBuilding = useEditorStore((s) => s.currentBuilding);
  const storeFloor = useEditorStore((s) => s.currentFloor);
  const focusGroup = useEditorStore((s) => s.focusGroup);
  // В «Планах и корпусах» точки бледные и не ловят щелчки — кроме
  // совмещения точек с новым планом: там их и выбирают (запись 60).
  const quiet = useEditorStore((s) => s.workspace === 'plans' && s.alignment === null);
  const { dragged } = useContext(TabDragContext);

  const view = useMemo(
    () => ({
      group,
      active,
      building: active ? storeBuilding : (tab?.building ?? null),
      floor: active ? storeFloor : (tab?.floor ?? null),
    }),
    [group, active, storeBuilding, storeFloor, tab?.building, tab?.floor]
  );
  if (!tab) return null;

  const className = active ? 'editor-mapgroup editor-mapgroup--active' : 'editor-mapgroup';

  return (
    <section
      className={className}
      aria-label={split ? `Карта ${group + 1}` : 'Карта'}
      data-map-group={group}
      // Нажатие на неактивную карту делает её активной до того, как нажатие
      // увидят слои: щелчок инструмента попадает уже в её план.
      onPointerDownCapture={(event) => {
        // Окно, открытое отсюда, лежит в слое окон, но его нажатия всплывают
        // сюда по дереву React: они карту не переключают.
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (!active) focusGroup(group);
      }}
    >
      <PlanViewContext.Provider value={view}>
        <MapTabs />
        <MapHeader />
        <div
          className={quiet ? 'editor-map-area editor-map-area--quiet' : 'editor-map-area'}
          // Нажатие на карту забирает клавиатуру у вкладок и полей: стрелки,
          // Delete и буквы инструментов — этой карте. Нажатие на точку фокус
          // само не переносит: оно отменено, чтобы не мешать перетаскиванию.
          onPointerDownCapture={(event) => {
            if (!event.currentTarget.contains(event.target as Node)) return;
            const container = event.currentTarget.querySelector<HTMLElement>('.leaflet-container');
            if (container && !container.contains(document.activeElement)) container.focus({ preventScroll: true });
          }}
        >
          <EditorMap tabId={tab.id} />
          <PlanStatus />
          {active && <Notice />}
          {split && dragged && dragged.group !== group && <GroupDropZone group={group} />}
        </div>
      </PlanViewContext.Provider>
    </section>
  );
};

/**
 * Вкладки карты — как в браузере: щелчок открывает, крестик или средняя
 * кнопка закрывают, перетаскивание переставляет или переносит на другую карту.
 */
const MapTabs: React.FC = () => {
  const view = usePlanView();
  const { group } = view;
  const tabs = useEditorStore((s) => s.mapGroups[group]?.tabs ?? NO_TABS);
  const activeTab = useEditorStore((s) => s.mapGroups[group]?.activeTab ?? '');
  const groupCount = useEditorStore((s) => s.mapGroups.length);
  const metas = useEditorStore((s) => s.buildingMetas);
  const activateTab = useEditorStore((s) => s.activateTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const moveTab = useEditorStore((s) => s.moveTab);
  const openSide = useEditorStore((s) => s.openSide);
  const closeSide = useEditorStore((s) => s.closeSide);
  const setSideCollapsed = useEditorStore((s) => s.setSideCollapsed);
  const openContextMenu = useEditorStore((s) => s.openContextMenu);
  const { dragged, setDragged } = useContext(TabDragContext);
  const listRef = useRef<HTMLDivElement>(null);
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);

  const lonely = groupCount === 1 && tabs.length === 1;

  // Открытая вкладка всегда на виду, даже когда вкладок больше, чем места.
  useEffect(() => {
    listRef.current?.querySelector(`[data-tab-id="${activeTab}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTab]);
  const titleOf = (tab: MapTab) =>
    planTitle(metas, tab.id === activeTab ? { building: view.building, floor: view.floor } : tab);

  const drop = (before: string | null) => {
    if (dragged) moveTab(dragged.group, dragged.tabId, group, before);
    setDragged(null);
    setDropBefore(undefined);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: MapTab) => {
    const index = tabs.findIndex((item) => item.id === tab.id);
    let next: MapTab | undefined;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === 'Home') next = tabs[0];
    else if (event.key === 'End') next = tabs[tabs.length - 1];
    else if (event.key === 'Delete' && !lonely) {
      event.preventDefault();
      closeTab(group, tab.id);
      return;
    }
    if (!next) return;
    event.preventDefault();
    activateTab(group, next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
  };

  return (
    <div className="editor-maptabs">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Открытые планы"
        className="editor-maptabs__list"
        // Колесо листает вкладки вбок, как в браузере.
        onWheel={(event) => {
          if (event.deltaY !== 0) event.currentTarget.scrollLeft += event.deltaY;
        }}
        onDragOver={(event) => {
          if (!dragged) return;
          event.preventDefault();
          if (event.target === event.currentTarget) setDropBefore(null);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropBefore(undefined);
        }}
        onDrop={(event) => {
          event.preventDefault();
          drop(dropBefore ?? null);
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeTab;
          const title = titleOf(tab);
          const classes = [
            'editor-maptab',
            selected ? 'editor-maptab--selected' : '',
            dragged?.tabId === tab.id ? 'editor-maptab--dragged' : '',
            dropBefore === tab.id ? 'editor-maptab--drop-before' : '',
          ];
          return (
            <div
              key={tab.id}
              className={classes.filter(Boolean).join(' ')}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', title);
                setDragged({ group, tabId: tab.id });
              }}
              onDragEnd={() => {
                setDragged(null);
                setDropBefore(undefined);
              }}
              onDragOver={(event) => {
                if (!dragged) return;
                event.preventDefault();
                event.stopPropagation();
                const box = event.currentTarget.getBoundingClientRect();
                const after = event.clientX > box.left + box.width / 2;
                const index = tabs.indexOf(tab);
                setDropBefore(after ? (tabs[index + 1]?.id ?? null) : tab.id);
              }}
              onMouseDown={(event) => {
                // Средняя кнопка закрывает вкладку и не включает прокрутку браузера.
                if (event.button === 1) event.preventDefault();
              }}
              onAuxClick={(event) => {
                if (event.button === 1 && !lonely) closeTab(group, tab.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                openContextMenu(event.clientX, event.clientY, { kind: 'tab', group, tabId: tab.id });
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                data-tab-id={tab.id}
                className="editor-maptab__label"
                title={title}
                onClick={() => activateTab(group, tab.id)}
                onKeyDown={(event) => onKeyDown(event, tab)}
              >
                <Icon name={planIcon(tab, view, activeTab)} size={14} />
                <span className="editor-maptab__text">{title}</span>
              </button>
              {!lonely && (
                <button
                  type="button"
                  tabIndex={-1}
                  className="editor-maptab__close"
                  aria-label={`Закрыть вкладку «${title}»`}
                  title="Закрыть вкладку (средняя кнопка мыши)"
                  onClick={() => closeTab(group, tab.id)}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="editor-maptabs__actions">
        {groupCount === 1 && (
          <button
            type="button"
            className="editor-button editor-button--ghost editor-button--compact"
            title="Вторая карта справа — например, этаж выше или территория"
            onClick={() => openSide()}
          >
            <Icon name="split" />
            Открыть рядом
          </button>
        )}
        {group === 1 && (
          <>
            <button
              type="button"
              className="editor-button editor-button--ghost editor-button--compact"
              title="Свернуть в полоску справа — карта и её вкладки останутся открытыми"
              onClick={() => setSideCollapsed(true)}
            >
              <Icon name="collapseRight" />
              Свернуть
            </button>
            <button
              type="button"
              className="editor-icon-button"
              aria-label="Закрыть карту"
              title="Закрыть карту со всеми её вкладками"
              onClick={closeSide}
            >
              <Icon name="close" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/** Значок вкладки: территория — карта, этаж — здание. */
function planIcon(tab: MapTab, view: { building: string | null }, activeTab: string): 'map' | 'building' {
  const building = tab.id === activeTab ? view.building : tab.building;
  return building === null ? 'map' : 'building';
}

/** Граница между картами — тянется мышью, стрелками и возвращается двойным щелчком. */
const SplitDivider: React.FC<{ rowRef: React.RefObject<HTMLDivElement | null> }> = ({ rowRef }) => {
  const ratio = useEditorStore((s) => s.splitRatio);
  const setSplitRatio = useEditorStore((s) => s.setSplitRatio);
  const dragging = useRef(false);

  const ratioAt = (clientX: number) => {
    const box = rowRef.current?.getBoundingClientRect();
    return box && box.width > 0 ? (clientX - box.left) / box.width : ratio;
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Граница между картами"
      aria-valuemin={SPLIT_LIMITS.min * 100}
      aria-valuemax={SPLIT_LIMITS.max * 100}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      title="Граница между картами: тяните, двойной щелчок — поровну"
      className="editor-splitter"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
      }}
      onPointerMove={(event) => {
        if (dragging.current) setSplitRatio(ratioAt(event.clientX), false);
      }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setSplitRatio(useEditorStore.getState().splitRatio);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onDoubleClick={() => setSplitRatio(SPLIT_LIMITS.initial)}
      onKeyDown={(event) => {
        const step = event.key === 'ArrowRight' ? SPLIT_KEY_STEP : event.key === 'ArrowLeft' ? -SPLIT_KEY_STEP : 0;
        const next =
          event.key === 'Home' ? SPLIT_LIMITS.min : event.key === 'End' ? SPLIT_LIMITS.max : step !== 0 ? ratio + step : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        setSplitRatio(next);
      }}
    />
  );
};

/** Свёрнутая вторая карта — полоска у правого края; щелчок разворачивает. */
const CollapsedSide: React.FC = () => {
  const title = useEditorStore((s) => {
    const group = s.mapGroups[1];
    return group ? planTitle(s.buildingMetas, planOfTab(s, 1, activeTabOf(group))) : '';
  });
  const count = useEditorStore((s) => s.mapGroups[1]?.tabs.length ?? 0);
  const setSideCollapsed = useEditorStore((s) => s.setSideCollapsed);
  const more = count > 1 ? ` и ещё ${count - 1}` : '';

  return (
    <button
      type="button"
      className="editor-mapstrip"
      aria-label={`Развернуть карту: ${title}${more}`}
      title="Развернуть вторую карту"
      onClick={() => setSideCollapsed(false)}
    >
      <Icon name="chevronLeft" />
      <span className="editor-mapstrip__label">
        {title}
        {more}
      </span>
    </button>
  );
};

/** Пока тащат вкладку единственной карты — правая половина: «Открыть рядом». */
const SideDropZone: React.FC = () => {
  const { dragged, setDragged } = useContext(TabDragContext);
  const moveTab = useEditorStore((s) => s.moveTab);
  const lonely = useEditorStore((s) => s.mapGroups[0].tabs.length === 1);
  const [over, setOver] = useState(false);
  if (!dragged || lonely) return null;

  return (
    <div
      className={over ? 'editor-dropzone editor-dropzone--side editor-dropzone--over' : 'editor-dropzone editor-dropzone--side'}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        moveTab(dragged.group, dragged.tabId, 1);
        setDragged(null);
      }}
    >
      <span className="editor-dropzone__label">
        <Icon name="split" />
        Открыть рядом
      </span>
    </div>
  );
};

/** Пока тащат вкладку с другой карты — вся эта карта: «Перенести сюда». */
const GroupDropZone: React.FC<{ group: number }> = ({ group }) => {
  const { dragged, setDragged } = useContext(TabDragContext);
  const moveTab = useEditorStore((s) => s.moveTab);
  const [over, setOver] = useState(false);
  if (!dragged) return null;

  return (
    <div
      className={over ? 'editor-dropzone editor-dropzone--over' : 'editor-dropzone'}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        moveTab(dragged.group, dragged.tabId, group, null);
        setDragged(null);
      }}
    >
      <span className="editor-dropzone__label">Перенести на эту карту</span>
    </div>
  );
};
