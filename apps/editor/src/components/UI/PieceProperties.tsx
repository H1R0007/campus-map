import React, { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { nextBuildingName } from '../../stores/editor/structureSlice';
import { outlineBox, outlineOfBox, traceBuildingOutline } from '../../import/outline';
import type { OutlinePoint } from '../../import/outline';
import { rotatePiece } from '../../import/importModel';
import type { BuildingChoice, Piece, PieceCheck, PieceTarget } from '../../import/importModel';
import { metersPerUnitOf, previewPlan } from '../../import/output';
import { displayName } from '../../import/readers';
import type { ImportSheet } from '../../import/readers';
import { clampBox, contentBox, scaleBox } from '../../import/trim';
import type { Size } from '../../import/sheetView';
import { Icon } from './Icon';

/**
 * Свойства листа в мастерской (записи 48 и 80) — правая колонка: что на
 * листе, корпус и этаж, откуда догадка, поворот, форма области, масштаб.
 *
 * Каждая правка — одна запись в истории мастерской: Ctrl+Z возвращает её.
 * Набор в одном поле подряд — одна запись, а не по букве.
 */

/** Длинная сторона листа при поиске полей. */
const TRIM_SIDE = 640;
/** Длинная сторона области при поиске контура. */
const TRACE_SIDE = 1400;

export const PieceProperties: React.FC<{
  piece: Piece;
  sheet: ImportSheet;
  /** Размер повёрнутого листа. */
  page: Size;
  pieces: readonly Piece[];
  check: PieceCheck;
  confirmed: boolean;
  /** Правка листа; подряд с одним `key` — одна запись истории. */
  onEdit: (change: (piece: Piece) => Piece, key?: string) => void;
  onConfirm: () => void;
  onSplit: () => void;
  onRemove?: () => void;
}> = ({ piece, sheet, page, pieces, check, confirmed, onEdit, onConfirm, onSplit, onRemove }) => {
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const [trimming, setTrimming] = useState(false);
  const [tracing, setTracing] = useState<string | null>(null);

  const setTarget = (target: PieceTarget, key?: string) => onEdit((current) => ({ ...current, target }), key);
  const floorTarget = piece.target.kind === 'floor' ? piece.target : null;

  // Новые корпуса, уже названные в других листах, — в списке рядом с существующими.
  const newNames = [
    ...new Set(
      pieces.flatMap((item) =>
        item.target.kind === 'floor' && item.target.building && 'newName' in item.target.building ? [item.target.building.newName.trim()] : []
      )
    ),
  ].filter(Boolean);
  const choiceValue = (choice: BuildingChoice | null) =>
    choice === null ? '' : 'id' in choice ? `id:${choice.id}` : `new:${choice.newName.trim()}`;
  const suggestedName = nextBuildingName([...buildingMetas.values(), ...newNames.map((name) => ({ id: '', name, floors: [] }))]);

  const trim = async () => {
    setTrimming(true);
    try {
      const scale = TRIM_SIDE / Math.max(page.width, page.height);
      const canvas = await sheet.render(piece.rotation, null, scale);
      const box = contentBox(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      onEdit((current) => ({ ...current, crop: box ? clampBox(scaleBox(box, 1 / scale), page) : null, outline: null, trimmed: box !== null }));
    } finally {
      setTrimming(false);
    }
  };

  // Контур здания (запись 73): обрезка — его описанный прямоугольник.
  const setOutline = (outline: OutlinePoint[] | null) =>
    onEdit((current) => ({ ...current, outline, crop: outline ? clampBox(outlineBox(outline), page) : current.crop, trimmed: false }));
  const traceOutline = async () => {
    setTracing('Поиск контура…');
    try {
      // Ищется внутри нынешней рамки: поля и соседние чертежи листа не мешают.
      const area = piece.crop ?? { x: 0, y: 0, ...page };
      const scale = TRACE_SIDE / Math.max(area.width, area.height);
      const canvas = await sheet.render(piece.rotation, area, scale);
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      const found = traceBuildingOutline({ width: canvas.width, height: canvas.height, data: pixels.data });
      if (!found) {
        setTracing('Контур не нашёлся: обведите углы вручную');
        return;
      }
      setOutline(found.map((point) => ({ x: area.x + point.x / scale, y: area.y + point.y / scale })));
      setTracing(null);
    } catch (cause) {
      setTracing(`Контур не нашёлся: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  const result = previewPlan(sheet, { rotation: piece.rotation, crop: piece.crop, outline: piece.outline ?? null });
  const metersPerUnit = metersPerUnitOf(sheet, Number(piece.scaleText) || undefined);

  return (
    <section aria-label={`Лист: ${displayName(sheet)}`} className="editor-import__piece">
      <h3 className="editor-workshop__sheet-name" title={displayName(sheet)}>
        {displayName(sheet)}
      </h3>
      <fieldset className="editor-fieldset">
        <legend className="editor-card__heading">Что на листе</legend>
        <div className="editor-card__actions" role="radiogroup" aria-label="Что на листе">
          {(
            [
              ['floor', 'Этаж корпуса'],
              ['campus', 'План территории'],
              ['skip', 'Не план — пропустить'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={piece.target.kind === kind}
              className="editor-chip"
              onClick={() =>
                setTarget(kind === 'floor' ? (floorTarget ?? { kind: 'floor', building: null, floorText: '', label: '' }) : { kind })
              }
            >
              {label}
            </button>
          ))}
        </div>

        {floorTarget && (
          <div className="editor-workshop__fields">
            <label className="editor-card__field">
              <span className="editor-section__hint">Корпус</span>
              <select
                aria-label="Корпус"
                className="editor-input"
                value={choiceValue(floorTarget.building)}
                onChange={(e) => {
                  const value = e.target.value;
                  const building: BuildingChoice | null =
                    value === '' ? null : value.startsWith('id:') ? { id: value.slice(3) } : { newName: value === 'new' ? suggestedName : value.slice(4) };
                  setTarget({ ...floorTarget, building });
                }}
              >
                <option value="">Выберите корпус</option>
                {[...buildingMetas.values()].map((meta) => (
                  <option key={meta.id} value={`id:${meta.id}`}>
                    {meta.name}
                  </option>
                ))}
                {newNames.map((name) => (
                  <option key={name} value={`new:${name}`}>
                    {name} — новый
                  </option>
                ))}
                <option value="new">Новый корпус…</option>
              </select>
            </label>
            {floorTarget.building && 'newName' in floorTarget.building && (
              <label className="editor-card__field">
                <span className="editor-section__hint">Название нового корпуса</span>
                <input
                  aria-label="Название нового корпуса"
                  className="editor-input"
                  value={floorTarget.building.newName}
                  onChange={(e) => setTarget({ ...floorTarget, building: { newName: e.target.value } }, `${piece.id}-building`)}
                />
              </label>
            )}
            <div className="editor-card__row">
              <label className="editor-card__field">
                <span className="editor-section__hint">Этаж</span>
                <input
                  aria-label="Номер этажа"
                  className="editor-input editor-input--narrow"
                  inputMode="decimal"
                  value={floorTarget.floorText}
                  placeholder="1"
                  onChange={(e) => setTarget({ ...floorTarget, floorText: e.target.value }, `${piece.id}-floor`)}
                />
              </label>
              <label className="editor-card__field">
                <span className="editor-section__hint">Подпись</span>
                <input
                  aria-label="Подпись этажа"
                  className="editor-input editor-input--narrow"
                  value={floorTarget.label}
                  placeholder={floorTarget.floorText.trim() || '—'}
                  onChange={(e) => setTarget({ ...floorTarget, label: e.target.value }, `${piece.id}-label`)}
                />
              </label>
            </div>
          </div>
        )}
      </fieldset>

      {check.problem && <p className="editor-section__hint editor-section__hint--problem">{check.problem}</p>}
      {check.note && <p className="editor-section__hint">{check.note}</p>}
      {piece.notes.length > 0 && (
        <ul className="editor-import__notes" aria-label="Откуда догадка">
          {piece.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <fieldset className="editor-fieldset editor-import__shape">
        <legend className="editor-card__heading">Форма плана</legend>
        <div className="editor-segmented" role="radiogroup" aria-label="Форма области">
          <button type="button" role="radio" aria-checked={!piece.outline} className="editor-segmented__item" onClick={() => piece.outline && setOutline(null)}>
            Прямоугольник
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={Boolean(piece.outline)}
            className="editor-segmented__item"
            onClick={() => !piece.outline && setOutline(outlineOfBox(piece.crop ?? { x: 0, y: 0, ...page }))}
          >
            Контур
          </button>
        </div>
        <button type="button" className="editor-button editor-button--ghost" onClick={() => void traceOutline()} disabled={tracing === 'Поиск контура…'}>
          <Icon name="building" />
          Найти контур здания
        </button>
        {tracing && (
          <span className="editor-section__hint" role="status">
            {tracing}
          </span>
        )}
      </fieldset>

      <fieldset className="editor-fieldset">
        <legend className="editor-card__heading">Лист</legend>
        <div className="editor-workshop__tools" role="toolbar" aria-label="Лист">
          <button type="button" className="editor-button editor-button--ghost" onClick={() => onEdit((current) => rotatePiece(current, sheet.size, -1))}>
            <Icon name="undo" />
            Повернуть влево
          </button>
          <button type="button" className="editor-button editor-button--ghost" onClick={() => onEdit((current) => rotatePiece(current, sheet.size, 1))}>
            <Icon name="redo" />
            Повернуть вправо
          </button>
          <button type="button" className="editor-button editor-button--ghost" onClick={() => void trim()} disabled={trimming}>
            Обрезать поля
          </button>
          <button
            type="button"
            className="editor-button editor-button--ghost"
            onClick={() => onEdit((current) => ({ ...current, crop: null, outline: null, trimmed: false }))}
          >
            Весь лист
          </button>
          <button type="button" className="editor-button editor-button--ghost" onClick={onSplit}>
            <Icon name="plus" />
            Ещё область на этом листе
          </button>
          {onRemove && (
            <button type="button" className="editor-button editor-button--ghost" onClick={onRemove}>
              <Icon name="trash" />
              Убрать эту область
            </button>
          )}
        </div>
      </fieldset>

      <p className="editor-section__hint">
        {piece.trimmed ? 'Поля обрезаны сами — поправьте рамку, если план задело. ' : ''}
        {piece.outline ? 'За контуром план прозрачный — на территории ляжет силуэтом здания. ' : ''}
        Получится: {result.format.toUpperCase()}, {result.size.width} × {result.size.height} пикс.
        {result.asIs ? ' — файл как есть' : ''}
        {metersPerUnit ? `, 1 пикс. = ${String(Math.round((metersPerUnit / result.scale) * 10000) / 10000).replace('.', ',')} м` : ''}.
      </p>
      {sheet.unitMeters !== undefined &&
        (sheet.realScale ? (
          <p className="editor-section__hint">Чертёж в натуральную величину: масштаб известен сам — корпус встанет на территорию в своём размере.</p>
        ) : (
          <label className="editor-card__field">
            <span className="editor-section__hint">Масштаб чертежа</span>
            <span className="editor-place-field__row">
              1 :
              <input
                aria-label="Масштаб чертежа"
                className="editor-input editor-input--narrow"
                inputMode="numeric"
                value={piece.scaleText ?? ''}
                placeholder="200"
                onChange={(e) => onEdit((current) => ({ ...current, scaleText: e.target.value.replace(/[^\d]/g, '') }), `${piece.id}-scale`)}
              />
            </span>
            <span className="editor-section__hint">
              {sheet.drawingScale && piece.scaleText === String(sheet.drawingScale.ratio)
                ? `По надписи на листе «${sheet.drawingScale.text}» — корпус встанет на территорию в своём размере`
                : 'Если масштаб указан на листе, впишите его — корпус встанет на территорию в своём размере. Не знаете — оставьте пустым'}
            </span>
          </label>
        ))}
      <div className="editor-workshop__confirm">
        <button
          type="button"
          className={`editor-button editor-button--block ${confirmed ? 'editor-button--ghost' : 'editor-button--primary'}`}
          onClick={onConfirm}
          disabled={check.problem !== null}
          title={check.problem ?? 'Лист проверен — к следующему, где нужен взгляд (Enter)'}
        >
          <Icon name="checkCircle" />
          {confirmed ? 'Проверен — к следующему' : 'Лист готов — дальше'}
          <kbd className="editor-workshop__kbd">Enter</kbd>
        </button>
      </div>
    </section>
  );
};
