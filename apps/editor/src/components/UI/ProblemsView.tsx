import React, { useMemo, useState } from 'react';
import { createCampusProjection } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from './Icon';
import { useValidationReport } from '../../hooks/useValidationReport';
import { autoFixSummary } from '../../utils/autoFix';

/**
 * Вкладка «Проверка» инспектора: ошибки и предупреждения в данных,
 * автоисправление и замечания к загруженным файлам.
 */
export const ProblemsView: React.FC = () => {
  const autoFix = useEditorStore((s) => s.autoFix);
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

  const report = useValidationReport();

  const handleAutoFix = () => {
    const lines = autoFixSummary(autoFix());
    setLastFixReport(
      lines.length === 0
        ? 'Исправлять нечего: того, что умеет чинить редактор, в данных нет.'
        : `Исправлено (можно отменить Ctrl+Z):\n${lines.map((line) => `• ${line.text}: ${line.count}`).join('\n')}`
    );
  };

  return (
    <div className="space-y-3">
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
          <span className="inline-flex items-center gap-2"><Icon name="zap" />Исправить что можно</span>
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
              <Icon name="errorCircle" size={14} />
              Ошибки
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
              <Icon name="warning" size={14} />
              Предупреждения
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
              <Icon name="note" size={14} />
              Замечания к загруженным файлам
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
            <div className="mb-2 flex justify-center" style={{ color: '#22c55e' }}>
              <Icon name="checkCircle" size={28} />
            </div>
            <div className="text-sm text-white">Данные в порядке!</div>
          </div>
        )}
    </div>
  );
};
