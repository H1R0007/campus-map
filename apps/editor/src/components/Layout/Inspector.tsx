import React, { useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { InspectorTab } from '../../stores/editor/panelSlice';
import { useValidationReport } from '../../hooks/useValidationReport';
import { Icon } from '../UI/Icon';
import { PropertiesView } from '../UI/PropertiesView';
import { ProblemsView } from '../UI/ProblemsView';
import { RouteView } from '../UI/RouteView';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'properties', label: 'Свойства' },
  { id: 'problems', label: 'Проверка' },
  { id: 'route', label: 'Маршрут' },
];

/**
 * Правая колонка — инспектор: свойства выбранного, проверка данных и
 * проверка маршрута на вкладках.
 *
 * Раньше это были три плавающие панели поверх карты: карточка узла закрывала
 * треть плана, «Маршрут» и «Статистика» закрывали друг друга. Колонка
 * закреплена, карта сужается, а не прячется под панелью.
 */
export const Inspector: React.FC = () => {
  const tab = useEditorStore((s) => s.inspectorTab);
  const setTab = useEditorStore((s) => s.setInspectorTab);
  const collapsed = useEditorStore((s) => s.inspectorCollapsed);
  const setCollapsed = useEditorStore((s) => s.setInspectorCollapsed);
  const report = useValidationReport();
  const tabRefs = useRef<Record<InspectorTab, HTMLButtonElement | null>>({ properties: null, problems: null, route: null });

  if (collapsed) {
    return (
      <aside aria-label="Инспектор" className="editor-inspector editor-inspector--collapsed">
        <button
          type="button"
          className="editor-icon-button"
          onClick={() => setCollapsed(false)}
          aria-label="Развернуть инспектор"
          aria-expanded={false}
          title="Развернуть инспектор"
        >
          <Icon name="chevronLeft" size={20} />
        </button>
      </aside>
    );
  }

  // Стрелки переводят между вкладками, как принято у вкладок (WAI-ARIA).
  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const edge = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
    if (step === 0 && edge === null) return;
    event.preventDefault();
    event.stopPropagation();
    const next = TABS[edge ?? (index + step + TABS.length) % TABS.length].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const problems = report.errors.length + report.warnings.length;

  return (
    <aside aria-label="Инспектор" className="editor-inspector">
      <div className="editor-tabs">
        <div role="tablist" aria-label="Разделы инспектора" className="flex flex-1" onKeyDown={onTabKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`inspector-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`inspector-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="editor-tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'problems' && problems > 0 && (
                <span className={`editor-badge ${report.errors.length > 0 ? 'editor-badge--error' : 'editor-badge--warn'}`}>
                  {report.errors.length > 0 ? report.errors.length : report.warnings.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="editor-icon-button self-center"
          onClick={() => setCollapsed(true)}
          aria-label="Свернуть инспектор"
          aria-expanded
          title="Свернуть инспектор — больше места карте"
        >
          <Icon name="chevronRight" size={20} />
        </button>
      </div>

      <div
        role="tabpanel"
        id={`inspector-panel-${tab}`}
        aria-labelledby={`inspector-tab-${tab}`}
        className="editor-tabpanel"
      >
        {tab === 'properties' && <PropertiesView />}
        {tab === 'problems' && <ProblemsView />}
        {tab === 'route' && <RouteView />}
      </div>
    </aside>
  );
};
