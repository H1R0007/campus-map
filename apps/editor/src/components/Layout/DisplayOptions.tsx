import { QUIET_COUNTS_MS, useQuiet } from '../../hooks/useQuiet';
import React, { useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import { FieldLabel, InfoTip } from '../UI/Field';

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
  const workspace = useEditorStore((s) => s.workspace);

  // Счётчики считаются от самих данных и догоняют перетаскивание: через
  // стор это были три обхода плана на каждое движение мыши.
  const allNodes = useQuiet(useEditorStore((s) => s.nodes), QUIET_COUNTS_MS);
  const aliases = useEditorStore((s) => s.aliases);
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
          label="Названия точек"
          info="Подписи видны, когда план приближен настолько, что они не слипаются."
          checked={displayFilters.showAliasLabels}
          onChange={(v) => setDisplayFilters({ showAliasLabels: v })}
        />
        <Check
          label="Точки переходов"
          info="Лестницы, лифты и входы на этом плане."
          checked={displayFilters.showPortals}
          onChange={(v) => setDisplayFilters({ showPortals: v })}
        />
        <Check label="Связи" checked={displayFilters.showEdges} onChange={(v) => setDisplayFilters({ showEdges: v })} />
        <Check
          label="Переходы"
          info="Отметки переходов на другие этажи и корпуса."
          checked={displayFilters.showTransitions}
          onChange={(v) => setDisplayFilters({ showTransitions: v })}
        />
        <div className="editor-field editor-field--inline">
          <FieldLabel
            label="Сравнить с этажом"
            htmlFor="compare-floor"
            info="Стены соседнего этажа — красным поверх открытого, его точки — бледно: видно, стоят ли лестницы и туалеты друг над другом."
          />
          <select
            id="compare-floor"
            value={!displayFilters.showNeighbourFloor ? 'none' : displayFilters.neighbourFloorBelow ? 'below' : 'above'}
            onChange={(e) =>
              setDisplayFilters(
                e.target.value === 'none' ? { showNeighbourFloor: false } : { showNeighbourFloor: true, neighbourFloorBelow: e.target.value === 'below' }
              )
            }
            aria-label="Сравнить с этажом"
            className="editor-input editor-input--narrow"
          >
            <option value="none">нет</option>
            <option value="below">ниже</option>
            <option value="above">выше</option>
          </select>
        </div>
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

      {workspace === 'markup' && (
      <section className="editor-section" aria-labelledby="grid-title">
        <h2 id="grid-title" className="editor-section__title">
          Точность
        </h2>
        <Check
          label="Выравнивать по соседним точкам"
          info="Новая точка встаёт в один ряд с соседней. Alt при щелчке — без выравнивания."
          checked={gridSettings.alignToNeighbours}
          onChange={(v) => setGridSettings({ alignToNeighbours: v })}
        />
        <Check label="Включить сетку" checked={gridSettings.enabled} onChange={(v) => setGridSettings({ enabled: v })} />
        {gridSettings.enabled && (
          <>
            <Check label="Показывать сетку" checked={gridSettings.visible} onChange={(v) => setGridSettings({ visible: v })} />
            <Check
              label="Притягивать точки к сетке"
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
      )}
    </>
  );
};

/** Флажок; пояснение — за ⓘ рядом, а не строкой под подписью (запись 58). */
const Check: React.FC<{
  label: string;
  info?: string;
  count?: number;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, info, count, checked, onChange }) => {
  const box = (
    <label className="editor-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="editor-check__text">{label}</span>
      {count !== undefined && <span className="editor-check__count">{count}</span>}
    </label>
  );
  if (!info) return box;
  return (
    <div className="editor-check-row">
      {box}
      <InfoTip about={label}>{info}</InfoTip>
    </div>
  );
};
