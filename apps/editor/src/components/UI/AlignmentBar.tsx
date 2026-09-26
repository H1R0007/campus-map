import React, { useMemo } from 'react';
import { floorLabel } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { alignmentFit } from '../../stores/editor/alignSlice';
import type { PlanRef } from '../../stores/editor/structureSlice';
import { rotationOf, scaleOf } from '../../import/planGeometry';
import { nodeTitle } from '../../utils/labels';

/**
 * Полоса совмещения над картой (запись 49): что делать сейчас, какие пары уже
 * есть и насколько они согласны друг с другом.
 */
export const AlignmentBar: React.FC = () => {
  const alignment = useEditorStore((s) => s.alignment);
  const nodes = useEditorStore((s) => s.nodes);
  const aliases = useEditorStore((s) => s.aliases);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const applyAlignment = useEditorStore((s) => s.applyAlignment);
  const skipAlignment = useEditorStore((s) => s.skipAlignment);
  const alignRemovePair = useEditorStore((s) => s.alignRemovePair);
  const alignClearPending = useEditorStore((s) => s.alignClearPending);

  const fit = useMemo(() => (alignment ? alignmentFit(alignment.pairs, nodes) : null), [alignment, nodes]);
  if (!alignment) return null;

  const planName = (plan: PlanRef) =>
    plan.building === null
      ? 'территория'
      : `${buildingMetas.get(plan.building)?.name ?? plan.building}, этаж ${floorLabel(buildingMetas.get(plan.building), plan.floor ?? 0)}`;

  const { pairs, pending } = alignment;
  const residuals = fit?.residuals ?? [];
  // Пара, которая расходится заметно сильнее других, — скорее всего ошибка.
  const typical = [...residuals].sort((a, b) => a - b)[Math.floor(residuals.length / 2)] ?? 0;
  const suspicious = residuals.map((value) => pairs.length >= 3 && value > 10 && value > typical * 3);

  const instruction = pending
    ? `Теперь щёлкните место на плане, где должна стоять «${nodeTitle(pending, aliases)}».`
    : pairs.length === 0
      ? 'Щёлкните точку, затем место на новом плане, где она должна стоять. Нужны две пары, лучше три-четыре — в разных концах плана.'
      : pairs.length === 1
        ? 'Ещё одна пара — подальше от первой: по двум парам видно масштаб и поворот.'
        : 'Бледные кружки — куда встанут все точки. Совпали с планом — «Применить»; третья пара уточнит.';

  return (
    <section className="editor-align-bar" aria-label="Совмещение точек с планом">
      <h2 className="editor-align-bar__title">Совмещение точек с новым планом — {planName(alignment.plan)}</h2>
      <p className="editor-align-bar__text" role="status">
        {instruction}
      </p>
      {pairs.length > 0 && (
        <ol className="editor-align-bar__pairs">
          {pairs.map((pair, index) => (
            <li key={pair.nodeId} className={suspicious[index] ? 'editor-align-bar__pair--bad' : undefined}>
              {nodeTitle(pair.nodeId, aliases)}
              {fit && ` — расхождение ${Math.round(residuals[index])} пикс.`}
              {suspicious[index] && ' — проверьте эту пару'}
              <button type="button" className="editor-link-button" onClick={() => alignRemovePair(index)}>
                убрать
              </button>
            </li>
          ))}
        </ol>
      )}
      {fit && (
        <p className="editor-align-bar__text">
          Масштаб ×{scaleOf(fit.transform).toFixed(3).replace('.', ',')}, поворот{' '}
          {rotationOf(fit.transform).toFixed(1).replace('.', ',')}°, среднее расхождение {fit.rms.toFixed(1).replace('.', ',')} пикс.
        </p>
      )}
      <div className="editor-card__actions">
        {pending && (
          <button type="button" className="editor-button editor-button--ghost" onClick={alignClearPending}>
            Выбрать другую точку
          </button>
        )}
        <button type="button" className="editor-button editor-button--primary" disabled={!fit} onClick={applyAlignment}>
          Применить
        </button>
        <button type="button" className="editor-button editor-button--ghost" onClick={skipAlignment}>
          Оставить как есть
        </button>
      </div>
      {alignment.queue.length > 0 && (
        <p className="editor-align-bar__text">Потом: {alignment.queue.map(planName).join('; ')}</p>
      )}
    </section>
  );
};
