import React from 'react';
import { useEditorStore } from '../../stores/editorStore';

/**
 * Что показывать на карте: подписи, точки переходов, связи, подсветка
 * проблем и сетка.
 *
 * Раньше это была плавающая панель «Фильтры» поверх плана; теперь — раздел
 * левой колонки, который виден всегда и ничего на карте не закрывает.
 */
export const DisplayOptions: React.FC = () => {
  const displayFilters = useEditorStore((s) => s.displayFilters);
  const setDisplayFilters = useEditorStore((s) => s.setDisplayFilters);
  const gridSettings = useEditorStore((s) => s.gridSettings);
  const setGridSettings = useEditorStore((s) => s.setGridSettings);

  const orphanCount = useEditorStore((s) => s.getOrphanNodes().length);
  const noAliasCount = useEditorStore((s) => s.getNodesWithoutAlias().length);
  const errorCount = useEditorStore((s) => s.getNodesWithErrors().length);

  return (
    <>
      <section className="editor-section" aria-labelledby="display-title">
        <h2 id="display-title" className="editor-section__title">
          Показывать на карте
        </h2>
        <Check
          label="Названия узлов"
          checked={displayFilters.showAliasLabels}
          onChange={(v) => setDisplayFilters({ showAliasLabels: v })}
        />
        <Check
          label="Точки переходов"
          hint="лестницы, лифты, входы"
          checked={displayFilters.showPortals}
          onChange={(v) => setDisplayFilters({ showPortals: v })}
        />
        <Check label="Связи" checked={displayFilters.showEdges} onChange={(v) => setDisplayFilters({ showEdges: v })} />
        <Check
          label="Переходы"
          hint="между этажами и корпусами"
          checked={displayFilters.showTransitions}
          onChange={(v) => setDisplayFilters({ showTransitions: v })}
        />
      </section>

      <section className="editor-section" aria-labelledby="highlight-title">
        <h2 id="highlight-title" className="editor-section__title">
          Подсветить на плане
        </h2>
        <Check
          label="Без связей"
          count={orphanCount}
          checked={displayFilters.highlightOrphans}
          onChange={(v) => setDisplayFilters({ highlightOrphans: v })}
        />
        <Check
          label="Без названия"
          count={noAliasCount}
          checked={displayFilters.highlightNoAlias}
          onChange={(v) => setDisplayFilters({ highlightNoAlias: v })}
        />
        <Check
          label="С ошибками"
          count={errorCount}
          checked={displayFilters.highlightErrors}
          onChange={(v) => setDisplayFilters({ highlightErrors: v })}
        />
      </section>

      <section className="editor-section" aria-labelledby="grid-title">
        <h2 id="grid-title" className="editor-section__title">
          Сетка
        </h2>
        <Check label="Включить сетку" checked={gridSettings.enabled} onChange={(v) => setGridSettings({ enabled: v })} />
        {gridSettings.enabled && (
          <>
            <Check label="Показывать сетку" checked={gridSettings.visible} onChange={(v) => setGridSettings({ visible: v })} />
            <Check
              label="Притягивать узлы к сетке"
              checked={gridSettings.snap}
              onChange={(v) => setGridSettings({ snap: v })}
            />
            <label className="editor-check">
              <span className="editor-check__text">Клетка, пикселей плана</span>
              <input
                type="number"
                min={5}
                max={200}
                step={5}
                value={gridSettings.size}
                onChange={(e) => {
                  const size = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(size) && size >= 5) setGridSettings({ size });
                }}
                className="editor-input editor-input--narrow"
              />
            </label>
          </>
        )}
      </section>
    </>
  );
};

const Check: React.FC<{
  label: string;
  hint?: string;
  count?: number;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, hint, count, checked, onChange }) => (
  <label className="editor-check">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="editor-check__text">
      {label}
      {hint && <span className="editor-check__hint">{hint}</span>}
    </span>
    {count !== undefined && <span className="editor-check__count">{count}</span>}
  </label>
);
