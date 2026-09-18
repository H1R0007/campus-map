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

  const clean = report.errors.length === 0 && report.warnings.length === 0 && loadWarnings.length === 0;

  return (
    <div className="editor-card">
      <section className="editor-card__section editor-card__section--first" aria-label="Итог проверки">
        <dl className="editor-facts">
          <dt>Ошибки</dt>
          <dd className={report.errors.length > 0 ? 'editor-facts__bad' : 'editor-facts__ok'}>{report.errors.length}</dd>
          <dt>Предупреждения</dt>
          <dd className={report.warnings.length > 0 ? 'editor-facts__warn' : 'editor-facts__ok'}>
            {report.warnings.length}
          </dd>
        </dl>

        {clean && <div className="editor-callout editor-callout--ok">Данные в порядке.</div>}

        <button
          type="button"
          onClick={handleAutoFix}
          disabled={report.errors.length === 0 && report.warnings.length === 0}
          className="editor-button editor-button--primary editor-button--block mt-2"
        >
          <Icon name="zap" />
          Исправить что можно
        </button>

        {lastFixReport && (
          <div className="editor-callout editor-callout--pre" role="status">
            {lastFixReport}
          </div>
        )}
      </section>

      <ProblemList title="Ошибки" kind="error" items={report.errors} />
      <ProblemList title="Предупреждения" kind="warn" items={report.warnings} />
      <ProblemList
        title="Замечания к загруженным файлам"
        kind="note"
        items={loadWarnings}
        hint="Найдены при чтении файлов данных. На текущую разметку не влияют и автоисправлением не убираются."
      />

      <section className="editor-card__section" aria-labelledby="problems-metric">
        <h3 id="problems-metric" className="editor-card__heading">
          Метрика кампуса
        </h3>
        <p className="editor-section__hint">
          {metricMode === 'metric'
            ? 'Планы привязаны к территории: навигатор показывает время в пути.'
            : 'Пиксельный режим: планы не привязаны к метрике кампуса, и навигатор не показывает время в пути.'}
        </p>
      </section>
    </div>
  );
};

/** Не больше 50 замечаний одного вида: список читают глазами, а не машиной. */
const SHOWN = 50;

const ProblemList: React.FC<{ title: string; kind: 'error' | 'warn' | 'note'; items: string[]; hint?: string }> = ({
  title,
  kind,
  items,
  hint,
}) => {
  if (items.length === 0) return null;

  return (
    <section className="editor-card__section" aria-label={`${title}: ${items.length}`}>
      <h3 className={`editor-card__heading editor-problems__title editor-problems__title--${kind}`}>
        <Icon name={kind === 'error' ? 'errorCircle' : kind === 'warn' ? 'warning' : 'note'} />
        {title} ({items.length})
      </h3>
      {hint && <p className="editor-section__hint">{hint}</p>}
      <ul className="editor-problems">
        {items.slice(0, SHOWN).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
        {items.length > SHOWN && <li>…и ещё {items.length - SHOWN}</li>}
      </ul>
    </section>
  );
};
