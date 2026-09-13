import React, { useMemo, useState } from 'react';
import { createCampusProjection } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { validateDataset } from '../../utils/validateData';

export const DiagnosticsPanel: React.FC = () => {
  const open = useEditorStore((s) => s.diagnosticsOpen);
  const setOpen = useEditorStore((s) => s.setDiagnosticsOpen);
  const autoFix = useEditorStore((s) => s.autoFix);

  const nodes = useEditorStore((s) => s.nodes);
  const transitions = useEditorStore((s) => s.transitions);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);

  /**
   * Замечания загрузчика ядра к исходным файлам.
   *
   * Держатся отдельно от структурных предупреждений: эти найдены при чтении
   * датасета и описывают файлы, а не текущее состояние разметки, поэтому не
   * исчезают по мере правок и не лечатся автоисправлением.
   */
  const loadWarnings = useEditorStore((s) => s.loadWarnings);

  /**
   * Режим датасета: метрический или пиксельный.
   *
   * Не хранится, а выводится из метаданных тем же вызовом ядра, что у
   * загрузчика и графа. Чего именно не хватает этажам, перечисляют замечания
   * загрузчика ниже.
   */
  const campusMeta = useEditorStore((s) => s.campusMeta);
  const metricMode = useMemo(
    () =>
      campusMeta === null
        ? 'pixel'
        : createCampusProjection(campusMeta, buildingMetas.values()).mode,
    [campusMeta, buildingMetas]
  );

  const [lastFixReport, setLastFixReport] = useState<string | null>(null);

  const report = useMemo(() => {
    return validateDataset({ nodes, transitions, buildingMetas });
  }, [nodes, transitions, buildingMetas]);

  const handleAutoFix = () => {
    try {
      const r = autoFix();
      const message =
        `Auto-fix выполнен:\n` +
        `• Удалено битых neighbors: ${r.removedMissingNeighbors}\n` +
        `• Добавлено симметричных рёбер: ${r.addedSymmetricEdges}\n` +
        `• Удалено битых transitions: ${r.removedInvalidTransitions}\n` +
        `• Удалено дублей transitions: ${r.removedDuplicateTransitions}`;

      setLastFixReport(message);

      if (r.removedMissingNeighbors + r.addedSymmetricEdges + r.removedInvalidTransitions + r.removedDuplicateTransitions === 0) {
        setLastFixReport('Проблем для исправления не найдено!');
      }
    } catch (err) {
      console.error('AutoFix error:', err);
      setLastFixReport('Ошибка при выполнении auto-fix');
    }
  };

  if (!open) {
    const warningCount = report.warnings.length + loadWarnings.length;
    const hasIssues = report.errors.length > 0 || warningCount > 0;

    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute left-3 bottom-10 z-[1600] px-3 py-2 rounded-xl text-sm font-medium shadow-lg transition-colors hover:opacity-90"
        style={{
          backgroundColor: hasIssues
            ? (report.errors.length > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(251, 191, 36, 0.2)')
            : 'var(--editor-panel)',
          border: '1px solid var(--editor-border)',
          color: 'white',
        }}
        title="Диагностика данных"
      >
        🔍 Диагностика
        {hasIssues && (
          <span
            className="ml-2 px-1.5 py-0.5 rounded text-xs font-bold"
            style={{
              backgroundColor: report.errors.length > 0 ? '#ef4444' : '#f59e0b',
              color: 'white',
            }}
          >
            {report.errors.length > 0 ? report.errors.length : warningCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="absolute left-3 bottom-10 w-[420px] max-h-[60%] z-[1600] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      style={{
        backgroundColor: 'var(--editor-panel)',
        border: '1px solid var(--editor-border)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--editor-border)' }}
      >
        <div className="text-white font-semibold">🔍 Диагностика</div>
        <button
          onClick={() => setOpen(false)}
          className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          style={{ color: 'var(--editor-text-muted)' }}
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto">
        {/* Summary */}
        <div className="flex gap-2">
          <div
            className="flex-1 rounded-xl p-3"
            style={{
              backgroundColor: report.errors.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--editor-bg)',
              border: '1px solid var(--editor-border)'
            }}
          >
            <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>Ошибки</div>
            <div
              className="text-lg font-semibold"
              style={{ color: report.errors.length ? '#fca5a5' : '#22c55e' }}
            >
              {report.errors.length}
            </div>
          </div>
          <div
            className="flex-1 rounded-xl p-3"
            style={{
              backgroundColor: report.warnings.length > 0 ? 'rgba(251, 191, 36, 0.1)' : 'var(--editor-bg)',
              border: '1px solid var(--editor-border)'
            }}
          >
            <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>Предупреждения</div>
            <div
              className="text-lg font-semibold"
              style={{ color: report.warnings.length ? '#fbbf24' : '#22c55e' }}
            >
              {report.warnings.length}
            </div>
          </div>
        </div>

        {/* Режим датасета: от него зависит, покажет ли навигатор время в пути */}
        <div
          className="rounded-xl p-3 text-xs"
          style={{
            backgroundColor: 'var(--editor-bg)',
            border: '1px solid var(--editor-border)',
            color: 'var(--editor-text-muted)',
          }}
        >
          {metricMode === 'metric'
            ? 'Метрика кампуса: планы привязаны к территории, навигатор показывает время в пути.'
            : 'Пиксельный режим: планы не привязаны к метрике кампуса, навигатор не показывает время в пути.'}
        </div>

        {/* Auto-fix button */}
        <button
          onClick={handleAutoFix}
          disabled={report.errors.length === 0 && report.warnings.length === 0}
          className="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            backgroundColor: 'var(--editor-highlight)',
            color: 'white',
          }}
        >
          🔧 Auto-fix (можно отменить Ctrl+Z)
        </button>

        {/* Last fix report */}
        {lastFixReport && (
          <div
            className="rounded-xl p-3 text-sm whitespace-pre-line"
            style={{
              backgroundColor: 'var(--editor-bg)',
              border: '1px solid var(--editor-border)',
              color: 'var(--editor-text-muted)',
            }}
          >
            {lastFixReport}
          </div>
        )}

        {/* Errors */}
        {report.errors.length > 0 && (
          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
          >
            <div className="text-sm font-semibold flex items-center gap-2" style={{ color: '#fca5a5' }}>
              ❌ Ошибки
            </div>
            <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
              {report.errors.slice(0, 50).map((e, i) => (
                <li key={i} className="break-words">• {e}</li>
              ))}
              {report.errors.length > 50 && (
                <li className="text-yellow-500">... и ещё {report.errors.length - 50}</li>
              )}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {report.warnings.length > 0 && (
          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
          >
            <div className="text-sm font-semibold flex items-center gap-2" style={{ color: '#fbbf24' }}>
              ⚠️ Предупреждения
            </div>
            <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
              {report.warnings.slice(0, 50).map((w, i) => (
                <li key={i} className="break-words">• {w}</li>
              ))}
              {report.warnings.length > 50 && (
                <li className="text-yellow-500">... и ещё {report.warnings.length - 50}</li>
              )}
            </ul>
          </div>
        )}

        {/* Замечания к исходным файлам */}
        {loadWarnings.length > 0 && (
          <div
            className="rounded-xl p-3"
            style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
          >
            <div className="text-sm font-semibold flex items-center gap-2" style={{ color: '#fbbf24' }}>
              📄 Замечания к загруженным файлам
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
              Найдены при чтении датасета. На текущую разметку не влияют и
              автоисправлением не убираются.
            </p>
            <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
              {loadWarnings.slice(0, 50).map((w, i) => (
                <li key={i} className="break-words">• {w}</li>
              ))}
              {loadWarnings.length > 50 && (
                <li className="text-yellow-500">... и ещё {loadWarnings.length - 50}</li>
              )}
            </ul>
          </div>
        )}

        {/* All good */}
        {report.errors.length === 0 &&
          report.warnings.length === 0 &&
          loadWarnings.length === 0 && (
          <div
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e' }}
          >
            <div className="text-2xl mb-2">✅</div>
            <div className="text-sm text-white">Данные в порядке!</div>
          </div>
        )}
      </div>
    </div>
  );
};
