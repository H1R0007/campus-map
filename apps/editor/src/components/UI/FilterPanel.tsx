import React from 'react';
import { useEditorStore } from '../../stores/editorStore';

export const FilterPanel: React.FC = () => {
  const filtersOpen = useEditorStore((s) => s.filtersOpen);
  const setFiltersOpen = useEditorStore((s) => s.setFiltersOpen);
  const displayFilters = useEditorStore((s) => s.displayFilters);
  const setDisplayFilters = useEditorStore((s) => s.setDisplayFilters);
  const gridSettings = useEditorStore((s) => s.gridSettings);
  const setGridSettings = useEditorStore((s) => s.setGridSettings);

  const orphanCount = useEditorStore((s) => s.getOrphanNodes().length);
  const noAliasCount = useEditorStore((s) => s.getNodesWithoutAlias().length);
  const errorCount = useEditorStore((s) => s.getNodesWithErrors().length);

  if (!filtersOpen) {
    return (
      <button
        onClick={() => setFiltersOpen(true)}
        // Сдвинута правее чтобы не перекрывать zoom controls
        className="absolute top-3 left-16 z-[1600] px-3 py-2 rounded-xl text-sm font-medium shadow-lg transition-colors hover:opacity-90"
        style={{
          backgroundColor: 'var(--editor-panel)',
          border: '1px solid var(--editor-border)',
          color: 'white',
        }}
        title="Фильтры отображения (F)"
      >
        🎛️ Фильтры
      </button>
    );
  }

  return (
    <div
      className="absolute top-3 left-16 w-72 z-[1600] rounded-2xl shadow-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--editor-panel)',
        border: '1px solid var(--editor-border)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--editor-border)' }}>
        <div className="text-white font-semibold">🎛️ Фильтры</div>
        <button
          onClick={() => setFiltersOpen(false)}
          className="p-1 rounded hover:bg-white/10"
          style={{ color: 'var(--editor-text-muted)' }}
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {/* Отображение элементов */}
        <section>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--editor-text-muted)' }}>
            Отображение
          </div>
          
          <FilterToggle
            label="Порталы"
            icon="⭐"
            checked={displayFilters.showPortals}
            onChange={(v) => setDisplayFilters({ showPortals: v })}
          />
          <FilterToggle
            label="Рёбра (связи)"
            icon="🔗"
            checked={displayFilters.showEdges}
            onChange={(v) => setDisplayFilters({ showEdges: v })}
          />
          <FilterToggle
            label="Переходы"
            icon="🚪"
            checked={displayFilters.showTransitions}
            onChange={(v) => setDisplayFilters({ showTransitions: v })}
          />
        </section>

        {/* Подсветка проблем */}
        <section>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--editor-text-muted)' }}>
            Подсветка проблем
          </div>
          
          <FilterToggle
            label={`Сироты без связей (${orphanCount})`}
            icon="🚫"
            checked={displayFilters.highlightOrphans}
            onChange={(v) => setDisplayFilters({ highlightOrphans: v })}
            color="#f97316"
            hint="Оранжевая пунктирная обводка"
          />
          <FilterToggle
            label={`Без алиаса (${noAliasCount})`}
            icon="📝"
            checked={displayFilters.highlightNoAlias}
            onChange={(v) => setDisplayFilters({ highlightNoAlias: v })}
            color="#eab308"
            hint="Жёлтая пунктирная обводка"
          />
          <FilterToggle
            label={`С ошибками (${errorCount})`}
            icon="⚠️"
            checked={displayFilters.highlightErrors}
            onChange={(v) => setDisplayFilters({ highlightErrors: v })}
            color="#ef4444"
            hint="Красная пунктирная обводка"
          />
        </section>

        {/* Сетка */}
        <section>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--editor-text-muted)' }}>
            Сетка
          </div>
          
          <FilterToggle
            label="Включить сетку"
            icon="📐"
            checked={gridSettings.enabled}
            onChange={(v) => setGridSettings({ enabled: v })}
          />
          
          {gridSettings.enabled && (
            <>
              <FilterToggle
                label="Показывать сетку"
                icon="👁️"
                checked={gridSettings.visible}
                onChange={(v) => setGridSettings({ visible: v })}
              />
              <FilterToggle
                label="Привязка к пересечениям"
                icon="🧲"
                checked={gridSettings.snap}
                onChange={(v) => setGridSettings({ snap: v })}
                hint="Узлы будут привязываться к пересечениям линий сетки"
              />
              
              <div className="mt-3">
                <label className="text-xs flex justify-between" style={{ color: 'var(--editor-text-muted)' }}>
                  <span>Размер ячейки</span>
                  <span className="font-mono">{gridSettings.size}px</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={gridSettings.size}
                  onChange={(e) => setGridSettings({ size: parseInt(e.target.value) })}
                  className="w-full mt-1"
                  style={{ accentColor: 'var(--editor-highlight)' }}
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--editor-text-muted)' }}>
                  <span>10px</span>
                  <span>100px</span>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

const FilterToggle: React.FC<{
  label: string;
  icon: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
  hint?: string;
}> = ({ label, icon, checked, onChange, color, hint }) => (
  <label className="flex items-start gap-2 py-1.5 cursor-pointer select-none group">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 rounded mt-0.5"
      style={{ accentColor: color || 'var(--editor-highlight)' }}
    />
    <div className="flex-1">
      <div className="flex items-center gap-1">
        <span className="text-sm">{icon}</span>
        <span 
          className="text-sm group-hover:text-white transition-colors"
          style={{ color: checked && color ? color : (checked ? 'white' : 'var(--editor-text-muted)') }}
        >
          {label}
        </span>
      </div>
      {hint && (
        <div className="text-xs mt-0.5" style={{ color: 'var(--editor-text-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  </label>
);