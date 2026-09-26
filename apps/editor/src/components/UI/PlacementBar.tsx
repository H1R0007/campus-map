import React, { useEffect, useMemo, useState } from 'react';
import { floorLabel } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { placingFit } from '../../stores/editor/placeSlice';
import { rotationOf, scaleOf } from '../../import/planGeometry';
import { withScaleAndRotation } from '../../import/placementMath';

/** Число для человека: запятая, без лишних нулей. */
const human = (value: number, digits: number) => String(Math.round(value * 10 ** digits) / 10 ** digits).replace('.', ',');
const parse = (text: string) => Number(text.trim().replace(',', '.').replace(/[−–—]/g, '-'));

/**
 * Полоса постановки корпуса (запись 50): что делать, числа постановки и
 * пары. Внизу карты, как полоса совмещения.
 */
export const PlacementBar: React.FC = () => {
  const placing = useEditorStore((s) => s.placing);
  const meta = useEditorStore((s) => (s.placing ? s.buildingMetas.get(s.placing.building) : undefined));
  const campusMpp = useEditorStore((s) => s.campusMeta?.metersPerPixel);
  const setPlacingFrame = useEditorStore((s) => s.setPlacingFrame);
  const setPairMode = useEditorStore((s) => s.setPairMode);
  const placingRemovePair = useEditorStore((s) => s.placingRemovePair);
  const applyPlacing = useEditorStore((s) => s.applyPlacing);
  const cancelPlacing = useEditorStore((s) => s.cancelPlacing);

  const fit = useMemo(() => (placing ? placingFit(placing.pairs) : null), [placing]);
  const mpp = placing && campusMpp !== undefined ? scaleOf(placing.frame) * campusMpp : 0;
  const angle = placing ? rotationOf(placing.frame) : 0;
  const [mppText, setMppText] = useState('');
  const [angleText, setAngleText] = useState('');
  useEffect(() => setMppText(human(mpp, 4)), [mpp]);
  useEffect(() => setAngleText(human(angle, 1)), [angle]);

  if (!placing || !meta || campusMpp === undefined) return null;

  const commit = () => {
    const nextMpp = parse(mppText);
    const nextAngle = parse(angleText);
    if (!(nextMpp > 0) || !Number.isFinite(nextAngle)) {
      setMppText(human(mpp, 4));
      setAngleText(human(angle, 1));
      return;
    }
    setPlacingFrame(withScaleAndRotation(placing.frame, placing.planSize, nextMpp / campusMpp, nextAngle));
  };
  const field = (label: string, value: string, change: (text: string) => void, suffix: string) => (
    <label className="editor-place-field">
      <span className="editor-section__hint">{label}</span>
      <span className="editor-place-field__row">
        <input
          aria-label={label}
          className="editor-input editor-input--narrow"
          inputMode="decimal"
          value={value}
          onChange={(e) => change(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        {suffix}
      </span>
    </label>
  );

  const instruction = placing.pairMode
    ? placing.pendingFrom
      ? 'Теперь щёлкните то же место на территории.'
      : 'Щёлкните приметное место на плане корпуса — угол, выступ, вход, — затем то же место на территории. Две пары ставят корпус, третья и дальше уточняют.'
    : 'Тяните корпус за середину, поворачивайте за верхнюю ручку, растягивайте за угол. Для точности — «По парам точек».';

  return (
    <section className="editor-align-bar" aria-label="Постановка корпуса">
      <h2 className="editor-align-bar__title">
        {meta.name} на территории — план этажа {floorLabel(meta, placing.floor)}
      </h2>
      <p className="editor-align-bar__text" role="status">
        {instruction}
      </p>
      {!placing.pairMode && (
        <div className="editor-card__row">
          {field('Масштаб плана корпуса: 1 пикс. =', mppText, setMppText, 'м')}
          {field('Поворот', angleText, setAngleText, '°')}
        </div>
      )}
      {placing.pairs.length > 0 && (
        <ol className="editor-align-bar__pairs">
          {placing.pairs.map((_, index) => (
            <li key={index}>
              Пара {index + 1}
              {fit && ` — расхождение ${human(fit.residuals[index] * campusMpp, 2)} м`}
              <button type="button" className="editor-link-button" onClick={() => placingRemovePair(index)}>
                убрать
              </button>
            </li>
          ))}
        </ol>
      )}
      {fit && placing.pairs.length > 2 && (
        <p className="editor-align-bar__text">Среднее расхождение {human(fit.rms * campusMpp, 2)} м</p>
      )}
      <div className="editor-card__actions">
        <button type="button" className="editor-button editor-button--ghost" onClick={() => setPairMode(!placing.pairMode)}>
          {placing.pairMode ? 'Ручками' : 'По парам точек'}
        </button>
        <button type="button" className="editor-button editor-button--primary" onClick={applyPlacing}>
          Применить
        </button>
        <button type="button" className="editor-button editor-button--ghost" onClick={cancelPlacing}>
          Отмена
        </button>
      </div>
    </section>
  );
};

/** Полоса замера масштаба территории. */
export const MeasureBar: React.FC = () => {
  const measuring = useEditorStore((s) => s.measuring);
  const campusMpp = useEditorStore((s) => s.campusMeta?.metersPerPixel);
  const applyMeasuring = useEditorStore((s) => s.applyMeasuring);
  const cancelMeasuring = useEditorStore((s) => s.cancelMeasuring);
  const [meters, setMeters] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  if (!measuring) return null;

  const [a, b] = measuring.points;
  const pixels = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const apply = () => setProblem(applyMeasuring(parse(meters)));

  return (
    <section className="editor-align-bar" aria-label="Масштаб территории">
      <h2 className="editor-align-bar__title">Масштаб территории</h2>
      <p className="editor-align-bar__text" role="status">
        {pixels === 0
          ? 'Щёлкните два места на плане территории, расстояние между которыми знаете: углы корпуса, края дороги, столбы ограды.'
          : `Между местами ${Math.round(pixels)} пикс. плана. Сколько это в метрах?`}
      </p>
      {campusMpp !== undefined && <p className="editor-align-bar__text">Сейчас: 1 пикс. = {human(campusMpp, 4)} м. Поставленные корпуса останутся на своих местах.</p>}
      {pixels > 0 && (
        <label className="editor-place-field">
          <span className="editor-section__hint">Расстояние, м</span>
          <input
            aria-label="Расстояние, м"
            className="editor-input editor-input--narrow"
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
        </label>
      )}
      {problem && <p className="editor-section__hint editor-section__hint--problem">{problem}</p>}
      <div className="editor-card__actions">
        <button type="button" className="editor-button editor-button--primary" disabled={pixels === 0} onClick={apply}>
          Применить
        </button>
        <button type="button" className="editor-button editor-button--ghost" onClick={cancelMeasuring}>
          Отмена
        </button>
      </div>
    </section>
  );
};
