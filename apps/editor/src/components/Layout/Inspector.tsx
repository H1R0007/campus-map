import React, { useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { CheckTab } from '../../stores/editor/panelSlice';
import { useValidationReport } from '../../hooks/useValidationReport';
import { useStructureChecks } from '../../hooks/useStructureChecks';
import { Icon } from '../UI/Icon';
import { PropertiesView } from '../UI/PropertiesView';
import { StructureView } from '../UI/PlanOverview';
import { ProblemsView } from '../UI/ProblemsView';
import { RouteView } from '../UI/RouteView';
import { ColumnResizer } from './ColumnResizer';
import { OperationPanel } from '../UI/OperationPanel';
import { useOperationTitle } from '../../hooks/useOperationTitle';

const CHECK_TABS: { id: CheckTab; label: string }[] = [
  { id: 'problems', label: 'Замечания' },
  { id: 'route', label: 'Маршрут' },
];

/**
 * Правая колонка — инспектор. Что в ней, решает режим (запись 60):
 *
 * - «Планы и корпуса» — свойства территории, корпуса, этажа;
 * - «Разметка» — свойства выбранной точки, без выбора — цифры плана;
 * - «Проверка» — замечания и проверка маршрута на двух вкладках.
 *
 * Пока идёт операция — размещение, совмещение, замер, — колонка отдана её
 * пошаговой панели (запись 64) и не сворачивается: в ней «Готово» и «Отмена».
 *
 * Колонка закреплена сбоку: карта сужается, а не прячется под панелью
 * (запись 39).
 */
export const Inspector: React.FC = () => {
  const workspace = useEditorStore((s) => s.workspace);
  const checkTab = useEditorStore((s) => s.checkTab);
  const openCheck = useEditorStore((s) => s.openCheck);
  const collapsed = useEditorStore((s) => s.inspectorCollapsed);
  const setCollapsed = useEditorStore((s) => s.setInspectorCollapsed);
  const width = useEditorStore((s) => s.inspectorWidth);
  const columnRef = useRef<HTMLElement>(null);
  const report = useValidationReport();
  const structure = useStructureChecks();
  const tabRefs = useRef<Record<CheckTab, HTMLButtonElement | null>>({ problems: null, route: null });
  const operation = useOperationTitle();

  if (collapsed && !operation) {
    return (
      <aside aria-label="Инспектор" className="editor-inspector editor-inspector--collapsed">
        <button
          type="button"
          className="editor-icon-button"
          onClick={() => setCollapsed(false)}
          aria-label="Развернуть инспектор"
          aria-expanded={false}
          title="Развернуть правую колонку"
        >
          <Icon name="chevronLeft" size={20} />
        </button>
      </aside>
    );
  }

  // Стрелки переводят между вкладками, как принято у вкладок (WAI-ARIA).
  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const index = CHECK_TABS.findIndex((t) => t.id === checkTab);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const edge = event.key === 'Home' ? 0 : event.key === 'End' ? CHECK_TABS.length - 1 : null;
    if (step === 0 && edge === null) return;
    event.preventDefault();
    event.stopPropagation();
    const next = CHECK_TABS[edge ?? (index + step + CHECK_TABS.length) % CHECK_TABS.length].id;
    openCheck(next);
    tabRefs.current[next]?.focus();
  };

  const problems = report.errors.length + report.warnings.length + structure.length;

  return (
    <aside aria-label="Инспектор" className="editor-inspector" ref={columnRef} style={width ? { width } : undefined}>
      <ColumnResizer column="inspector" edge="left" label="Ширина инспектора" columnRef={columnRef} />
      <div className="editor-tabs">
        {operation ? (
          <h2 className="editor-column-header__title editor-tabs__title">{operation}</h2>
        ) : workspace === 'check' ? (
          <div role="tablist" aria-label="Проверка" className="flex flex-1" onKeyDown={onTabKeyDown}>
            {CHECK_TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`inspector-tab-${t.id}`}
                aria-selected={checkTab === t.id}
                aria-controls="inspector-panel"
                tabIndex={checkTab === t.id ? 0 : -1}
                className="editor-tab"
                onClick={() => openCheck(t.id)}
              >
                {t.label}
                {t.id === 'problems' && problems > 0 && (
                  <span className={`editor-badge ${report.errors.length > 0 ? 'editor-badge--error' : 'editor-badge--warn'}`}>
                    {problems}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="editor-column-header__title editor-tabs__title">Свойства</h2>
        )}
        {!operation && (
        <button
          type="button"
          className="editor-icon-button self-center"
          onClick={() => setCollapsed(true)}
          aria-label="Свернуть инспектор"
          aria-expanded
          title="Свернуть правую колонку — больше места карте"
        >
          <Icon name="chevronRight" size={20} />
        </button>
        )}
      </div>

      <div
        id="inspector-panel"
        role={workspace === 'check' && !operation ? 'tabpanel' : 'region'}
        aria-labelledby={workspace === 'check' && !operation ? `inspector-tab-${checkTab}` : undefined}
        aria-label={operation ?? (workspace === 'check' ? undefined : 'Свойства')}
        className="editor-tabpanel"
      >
        {operation ? (
          <OperationPanel />
        ) : (
          <>
            {workspace === 'plans' && <StructureView />}
            {workspace === 'markup' && <PropertiesView />}
            {workspace === 'check' && (checkTab === 'problems' ? <ProblemsView /> : <RouteView />)}
          </>
        )}
      </div>
    </aside>
  );
};
