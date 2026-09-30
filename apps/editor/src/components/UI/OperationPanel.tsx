import React, { useEffect, useMemo, useState } from 'react';
import { floorLabel } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { openingFloorOf } from '../../stores/editor/viewSlice';
import { placingAllowsScale } from '../../stores/editor/placeSlice';
import type { OverlayShow } from '../../stores/editor/placeSlice';
import { alignmentFit } from '../../stores/editor/alignSlice';
import type { PlanRef } from '../../stores/editor/structureSlice';
import { rotationOf, scaleOf } from '../../import/planGeometry';
import { withScaleAndRotation } from '../../import/placementMath';
import { nodeTitle } from '../../utils/labels';
import { FieldLabel, InfoTip, Section } from './Field';
import { Icon } from './Icon';

/**
 * Пошаговые панели операций (запись 64): размещение корпуса, совмещение
 * этажа, замер масштаба территории, совмещение точек с новым планом.
 *
 * Операция занимает правую колонку: шаги с номерами — что сделано, что
 * сейчас, что дальше; ниже — показ и числа; внизу — «Отмена» и «Готово».
 * Поверх карты — ничего: раньше полоса операции закрывала низ плана.
 */

/** Число для человека: запятая, без лишних нулей. */
const human = (value: number, digits: number) => String(Math.round(value * 10 ** digits) / 10 ** digits).replace('.', ',');
const parse = (text: string) => Number(text.trim().replace(',', '.').replace(/[−–—]/g, '-'));

export const OperationPanel: React.FC = () => {
  const placing = useEditorStore((s) => s.placing !== null);
  const measuring = useEditorStore((s) => s.measuring !== null);
  const alignment = useEditorStore((s) => s.alignment !== null);
  if (placing) return <PlacementPanel />;
  if (measuring) return <MeasurePanel />;
  if (alignment) return <AlignmentPanel />;
  return null;
};

type StepState = 'done' | 'now' | 'later';

/** Шаги операции: номер или галочка, заголовок, что делать. */
const Steps: React.FC<{ steps: { title: string; text: React.ReactNode; state: StepState }[] }> = ({ steps }) => (
  <ol className="editor-steps">
    {steps.map((step, index) => (
      <li key={step.title} className={`editor-steps__item editor-steps__item--${step.state}`} aria-current={step.state === 'now' ? 'step' : undefined}>
        <span className="editor-steps__mark" aria-hidden="true">
          {step.state === 'done' ? '✓' : index + 1}
        </span>
        <span className="editor-steps__body">
          <span className="editor-steps__title">{step.title}</span>
          {step.state !== 'later' && <span className="editor-steps__text">{step.text}</span>}
        </span>
      </li>
    ))}
  </ol>
);

/** Кнопки внизу операции: «Отмена» слева, главное действие справа. */
const Footer: React.FC<{ onCancel: () => void; cancelLabel?: string; onDone: () => void; doneDisabled?: boolean; children?: React.ReactNode }> = ({
  onCancel,
  cancelLabel = 'Отмена',
  onDone,
  doneDisabled,
  children,
}) => (
  <div className="editor-operation__footer">
    <button type="button" className="editor-button editor-button--ghost" onClick={onCancel}>
      {cancelLabel}
    </button>
    {children}
    <button type="button" className="editor-button editor-button--primary" onClick={onDone} disabled={doneDisabled}>
      Готово
    </button>
  </div>
);

/** Выбор из нескольких вариантов кнопками в ряд. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="editor-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className="editor-segmented__item"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Размещение корпуса на территории и совмещение этажа с этажом входа (записи 50, 53, 62, 63). */
const PlacementPanel: React.FC = () => {
  const placing = useEditorStore((s) => s.placing);
  const meta = useEditorStore((s) => (s.placing ? s.buildingMetas.get(s.placing.building) : undefined));
  const setPlacingFrame = useEditorStore((s) => s.setPlacingFrame);
  const setPlacingPin = useEditorStore((s) => s.setPlacingPin);
  const setPlacingShow = useEditorStore((s) => s.setPlacingShow);
  const setPlacingStrength = useEditorStore((s) => s.setPlacingStrength);
  const applyPlacing = useEditorStore((s) => s.applyPlacing);
  const cancelPlacing = useEditorStore((s) => s.cancelPlacing);

  // Метров в пикселе того, что под планом. Если масштаб территории ещё не
  // задан — тот, что получится по этому корпусу.
  const baseMpp = placing ? (placing.baseMpp ?? (placing.planMpp ?? 0) / scaleOf(placing.frame)) : 1;
  const mpp = placing ? scaleOf(placing.frame) * baseMpp : 0;
  const angle = placing ? rotationOf(placing.frame) : 0;
  const [mppText, setMppText] = useState('');
  const [angleText, setAngleText] = useState('');
  useEffect(() => setMppText(human(mpp, 4)), [mpp]);
  useEffect(() => setAngleText(human(angle, 1)), [angle]);

  if (!placing || !meta) return null;
  const floorMode = placing.mode === 'floor';
  const entrance = floorMode ? floorLabel(meta, openingFloorOf(meta) ?? 0) : '';
  const reference = floorMode ? `этажом входа ${entrance}` : 'территорией';
  const referenceNoun = floorMode ? `этаж входа ${entrance}` : 'территория';
  const allowScale = placingAllowsScale(placing);
  const pinned = placing.pin !== null;

  const commit = () => {
    const nextMpp = parse(mppText);
    const nextAngle = parse(angleText);
    if (!(nextMpp > 0) || !Number.isFinite(nextAngle)) {
      setMppText(human(mpp, 4));
      setAngleText(human(angle, 1));
      return;
    }
    setPlacingFrame(withScaleAndRotation(placing.frame, placing.planSize, nextMpp / baseMpp, nextAngle));
  };

  const showOptions: { id: OverlayShow; label: string }[] = floorMode
    ? [
        { id: 'contour', label: 'Контур' },
        { id: 'lines', label: 'Все стены' },
        { id: 'swipe', label: 'Шторка' },
      ]
    : [
        { id: 'lines', label: 'Линии' },
        { id: 'swipe', label: 'Шторка' },
      ];

  return (
    <section className="editor-operation" aria-label={floorMode ? 'Совмещение этажей' : 'Размещение корпуса'}>
      <p className="editor-operation__subject">
        {floorMode ? `${meta.name}: этаж ${floorLabel(meta, placing.floor)} поверх этажа входа ${entrance}` : `${meta.name} на территории — план этажа ${floorLabel(meta, placing.floor)}`}
      </p>
      <Steps
        steps={[
          {
            title: 'Приблизительно',
            text: allowScale
              ? 'Перетащите план за середину, поверните за верхнюю ручку, растяните за угол.'
              : 'Перетащите план за середину и поверните за верхнюю ручку. Размер задан масштабом чертежа.',
            state: pinned ? 'done' : 'now',
          },
          {
            title: 'Булавка',
            text: `Щёлкните угол здания там, где он уже совпал с ${reference}, — туда встанет булавка.`,
            state: pinned ? 'done' : 'now',
          },
          {
            title: 'Довернуть',
            text: `Тяните оранжевую ручку в дальнем углу плана к её месту: план ${allowScale ? 'поворачивается и растягивается' : 'поворачивается'} вокруг булавки.`,
            state: pinned ? 'now' : 'later',
          },
        ]}
      />
      {pinned && (
        <div className="editor-card__actions">
          <button type="button" className="editor-button editor-button--ghost" onClick={() => setPlacingPin(null)}>
            Открепить булавку
          </button>
        </div>
      )}

      <Section title="Показ" label="Показ наложения" info={`Красным — ${referenceNoun}: по ней равняют план. Пробел зажат — виден только эталон.`}>
        <Segmented label="Как показывать эталон" value={placing.show} options={showOptions} onChange={setPlacingShow} />
        {placing.show !== 'swipe' && (
          <label className="editor-field editor-field--range">
            <span className="editor-field__label">
              Чувствительность линий
              <InfoTip about="Чувствительность линий">Для бледного скана — больше: линии светлее обычного.</InfoTip>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={placing.strength}
              aria-label="Чувствительность линий"
              onChange={(event) => setPlacingStrength(Number(event.target.value))}
            />
          </label>
        )}
        <p className="editor-operation__keys">
          <kbd>Пробел</kbd> — только {referenceNoun}
        </p>
      </Section>

      {placing.baseMpp !== null && (
        <Section title="Числа" label="Числа размещения">
          <div className="editor-card__row">
            <div className="editor-field">
              <FieldLabel label="1 пикс. плана, м" info="Масштаб плана: сколько метров в одном пикселе." />
              <input
                aria-label={floorMode ? 'Масштаб плана этажа: 1 пикс. =' : 'Масштаб плана корпуса: 1 пикс. ='}
                className="editor-input"
                inputMode="decimal"
                value={mppText}
                onChange={(e) => setMppText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                }}
              />
            </div>
            <div className="editor-field">
              <FieldLabel label="Поворот, °" />
              <input
                aria-label={floorMode ? 'Поворот относительно этажа входа' : 'Поворот'}
                className="editor-input"
                inputMode="decimal"
                value={angleText}
                onChange={(e) => setAngleText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                }}
              />
            </div>
          </div>
          {placing.planMpp !== null && Math.abs(mpp / placing.planMpp - 1) > 0.01 && (
            <p className="editor-operation__note">
              По чертежу 1 пикс. = {human(placing.planMpp, 4)} м.{' '}
              <button
                type="button"
                className="editor-link-button"
                onClick={() => setPlacingFrame(withScaleAndRotation(placing.frame, placing.planSize, placing.planMpp! / placing.baseMpp!, angle))}
              >
                Вернуть масштаб чертежа
              </button>
            </p>
          )}
        </Section>
      )}
      {placing.baseMpp === null && (
        <p className="editor-operation__note">
          Масштаб территории ещё не задан — он найдётся по этому корпусу: растяните план точно по очертаниям корпуса на территории.
        </p>
      )}

      <Footer onCancel={cancelPlacing} onDone={applyPlacing} />
    </section>
  );
};

/** Замер масштаба территории: два места и расстояние между ними (запись 50). */
const MeasurePanel: React.FC = () => {
  const measuring = useEditorStore((s) => s.measuring);
  const campusMpp = useEditorStore((s) => s.campusMeta?.metersPerPixel);
  const applyMeasuring = useEditorStore((s) => s.applyMeasuring);
  const cancelMeasuring = useEditorStore((s) => s.cancelMeasuring);
  const [meters, setMeters] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  if (!measuring) return null;

  const [a, b] = measuring.points;
  const pixels = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const count = measuring.points.length;
  const apply = () => setProblem(applyMeasuring(parse(meters)));

  return (
    <section className="editor-operation" aria-label="Масштаб территории">
      <Steps
        steps={[
          { title: 'Первое место', text: 'Щёлкните на плане территории место, от которого знаете расстояние: угол корпуса, край дороги, столб ограды.', state: count >= 1 ? 'done' : 'now' },
          { title: 'Второе место', text: 'Щёлкните второе место — подальше от первого.', state: count >= 2 ? 'done' : count === 1 ? 'now' : 'later' },
          { title: 'Расстояние', text: `Между местами ${Math.round(pixels)} пикс. плана. Сколько это в метрах?`, state: count >= 2 ? 'now' : 'later' },
        ]}
      />
      {count >= 2 && (
        <div className="editor-field">
          <FieldLabel label="Расстояние, м" />
          <input
            aria-label="Расстояние, м"
            className="editor-input"
            inputMode="decimal"
            value={meters}
            autoFocus
            onChange={(e) => {
              setMeters(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply();
            }}
          />
          {problem && <span className="editor-field__problem">{problem}</span>}
        </div>
      )}
      {campusMpp !== undefined && (
        <p className="editor-operation__note">Сейчас 1 пикс. = {human(campusMpp, 4)} м. Размещённые корпуса останутся на своих местах. Третий щелчок начинает замер заново.</p>
      )}
      <Footer onCancel={cancelMeasuring} onDone={apply} doneDisabled={count < 2} />
    </section>
  );
};

/** Совмещение точек с новым планом по парам (запись 49). */
const AlignmentPanel: React.FC = () => {
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
  const typical = [...residuals].sort((x, y) => x - y)[Math.floor(residuals.length / 2)] ?? 0;
  const suspicious = residuals.map((value) => pairs.length >= 3 && value > 10 && value > typical * 3);

  return (
    <section className="editor-operation" aria-label="Совмещение точек с планом">
      <p className="editor-operation__subject">Новый план — {planName(alignment.plan)}</p>
      <Steps
        steps={[
          {
            title: pending ? `Точка «${nodeTitle(pending, aliases)}»` : 'Точка',
            text: 'Щёлкните точку, которая стоит не на своём месте.',
            state: pending ? 'done' : 'now',
          },
          {
            title: 'Её место',
            text: pending ? `Теперь щёлкните место на плане, где должна стоять «${nodeTitle(pending, aliases)}».` : 'Затем щёлкните место на плане, где она должна стоять.',
            state: pending ? 'now' : 'later',
          },
          {
            title: 'Ещё пары',
            text:
              pairs.length < 2
                ? 'Нужны две пары, лучше три-четыре — в разных концах плана.'
                : 'Бледные кружки — куда встанут все точки. Совпали с планом — «Готово».',
            state: pairs.length >= 2 ? 'done' : pairs.length === 1 && !pending ? 'now' : 'later',
          },
        ]}
      />
      {pending && (
        <div className="editor-card__actions">
          <button type="button" className="editor-button editor-button--ghost" onClick={alignClearPending}>
            Выбрать другую точку
          </button>
        </div>
      )}
      {pairs.length > 0 && (
        <Section title={`Пары · ${pairs.length}`} label="Пары точек">
          <ol className="editor-operation__pairs">
            {pairs.map((pair, index) => (
              <li key={pair.nodeId} className={suspicious[index] ? 'editor-operation__pair--bad' : undefined}>
                <span>
                  {nodeTitle(pair.nodeId, aliases)}
                  {fit && ` — расхождение ${Math.round(residuals[index])} пикс.`}
                  {suspicious[index] && ' — проверьте эту пару'}
                </span>
                <button type="button" className="editor-icon-button" aria-label={`Убрать пару «${nodeTitle(pair.nodeId, aliases)}»`} onClick={() => alignRemovePair(index)}>
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ol>
          {fit && (
            <p className="editor-operation__note">
              Масштаб ×{scaleOf(fit.transform).toFixed(3).replace('.', ',')}, поворот {rotationOf(fit.transform).toFixed(1).replace('.', ',')}°, среднее
              расхождение {fit.rms.toFixed(1).replace('.', ',')} пикс.
            </p>
          )}
        </Section>
      )}
      {alignment.queue.length > 0 && <p className="editor-operation__note">Потом: {alignment.queue.map(planName).join('; ')}</p>}
      <Footer onCancel={skipAlignment} cancelLabel="Оставить как есть" onDone={applyAlignment} doneDisabled={!fit} />
    </section>
  );
};
