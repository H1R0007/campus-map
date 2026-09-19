import React, { useDeferredValue, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';

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

  // Счётчики считаются от самих данных и догоняют перетаскивание: через
  // стор это были три обхода плана на каждое движение мыши.
  const allNodes = useDeferredValue(useEditorStore((s) => s.nodes));
  const aliases = useDeferredValue(useEditorStore((s) => s.aliases));
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);

  const { orphanCount, noAliasCount, errorCount } = useMemo(() => {
    const planNodes = floorNodesOf(allNodes, currentBuilding, currentFloor, displayFilters.showPortals);
    return {
      orphanCount: planNodes.filter((n) => n.neighbors.length === 0).length,
      noAliasCount: planNodes.filter((n) => (aliases.get(n.id)?.length ?? 0) === 0).length,
      errorCount: planNodes.filter((n) => n.neighbors.some((id) => !allNodes.has(id))).length,
    };
  }, [allNodes, aliases, currentBuilding, currentFloor, displayFilters.showPortals]);

  return (
    <>
      <section className="editor-section" aria-labelledby="display-title">
        <h2 id="display-title" className="editor-section__title">
          Показывать на карте
        </h2>
        <Check
          label="Названия узлов"
          hint="видны, когда план приближен"
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
        <Check
          label="Соседний этаж бледно"
          hint="чтобы лестницы и туалеты вставали друг над другом"
          checked={displayFilters.showNeighbourFloor}
          onChange={(v) => setDisplayFilters({ showNeighbourFloor: v })}
        />
        {displayFilters.showNeighbourFloor && (
          <label className="editor-check">
            <span className="editor-check__text">Какой этаж показывать</span>
            <select
              value={displayFilters.neighbourFloorBelow ? 'below' : 'above'}
              onChange={(e) => setDisplayFilters({ neighbourFloorBelow: e.target.value === 'below' })}
              aria-label="Какой этаж показывать бледно"
              className="editor-input editor-input--narrow"
            >
              <option value="below">ниже</option>
              <option value="above">выше</option>
            </select>
          </label>
        )}
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
          Точность
        </h2>
        <Check
          label="Выравнивать по соседним точкам"
          hint="новая точка встаёт в один ряд с соседней; Alt при щелчке — без выравнивания"
          checked={gridSettings.alignToNeighbours}
          onChange={(v) => setGridSettings({ alignToNeighbours: v })}
        />
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
