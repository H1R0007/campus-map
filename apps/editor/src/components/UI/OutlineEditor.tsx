import React from 'react';
import { edgeHandle, flattenOutline } from '../../import/outline';
import type { OutlinePoint } from '../../import/outline';
import { toScreen } from '../../import/sheetView';
import type { Point, SheetView, Size } from '../../import/sheetView';

/**
 * Контур здания на листе (записи 73 и 80) — поверх листа в мастерской.
 *
 * Углы — маленькие квадраты, середины рёбер — кружки; все в пикселях экрана,
 * поэтому одного размера при любом приближении и не закрывают мелкий выступ
 * (прежде квадрат был 18 px, и на маленьком выступе четыре ручки налезали друг
 * на друга). Выбранный угол залит: Delete его убирает, стрелки двигают.
 * Наведённая на прямую линия показывает «+» — щелчок ставит угол в этом месте.
 * Круглая ручка выгибает ребро дугой; двойной щелчок по ней — угол посередине.
 * За контуром затемнено — в план не попадёт. Перетаскивания ведёт холст.
 */

/** Путь контура в пикселях экрана. */
function screenPath(outline: readonly OutlinePoint[], view: SheetView): string {
  const points = flattenOutline(outline).map((point) => toScreen(view, point));
  if (points.length === 0) return '';
  const r = (value: number) => Math.round(value * 10) / 10;
  return `M${points.map((p) => `${r(p.x)} ${r(p.y)}`).join('L')}Z`;
}

export const OutlineOverlay: React.FC<{
  outline: OutlinePoint[];
  view: SheetView;
  /** Размер области листа на экране — для затемнения. */
  area: Size;
  selected: number | null;
  /** Куда встанет новый угол, если щёлкнуть, — «+» на линии. */
  addAt: Point | null;
  onCornerDown: (index: number, event: React.PointerEvent) => void;
  onEdgeDown: (index: number, event: React.PointerEvent) => void;
  onEdgeDoubleClick: (index: number) => void;
  onCornerKey: (index: number, event: React.KeyboardEvent) => void;
  onEdgeKey: (index: number, event: React.KeyboardEvent) => void;
  onCornerFocus: (index: number) => void;
}> = ({ outline, view, area, selected, addAt, onCornerDown, onEdgeDown, onEdgeDoubleClick, onCornerKey, onEdgeKey, onCornerFocus }) => {
  const path = screenPath(outline, view);
  const add = addAt ? toScreen(view, addAt) : null;

  return (
    <div
      className="editor-outline"
      role="group"
      aria-label="Контур здания, который станет планом"
      data-outline={outline.map((p) => `${Math.round(p.x)},${Math.round(p.y)}${p.bulge ? `~${p.bulge}` : ''}`).join(' ')}
    >
      <svg className="editor-outline__svg" width={area.width} height={area.height} aria-hidden="true">
        <path className="editor-outline__shade" d={`M0 0H${area.width}V${area.height}H0Z${path}`} fillRule="evenodd" />
        <path className="editor-outline__line" d={path} />
      </svg>
      {outline.map((point, index) => {
        const next = outline[(index + 1) % outline.length];
        const mid = toScreen(view, edgeHandle(point, next, point.bulge ?? 0));
        const corner = toScreen(view, point);
        return (
          <React.Fragment key={index}>
            <button
              type="button"
              className={`editor-outline__edge${point.bulge ? ' editor-outline__edge--arc' : ''}`}
              data-edge={index}
              style={{ left: mid.x, top: mid.y }}
              aria-label={`Середина ребра ${index + 1}${point.bulge ? ', дуга' : ''}`}
              title="Тяните — ребро выгнется дугой, к прямой — снова прямое; двойной щелчок или Enter — новый угол"
              onPointerDown={(event) => onEdgeDown(index, event)}
              onDoubleClick={() => onEdgeDoubleClick(index)}
              onKeyDown={(event) => onEdgeKey(index, event)}
            />
            <button
              type="button"
              className="editor-outline__corner"
              data-corner={index}
              style={{ left: corner.x, top: corner.y }}
              aria-label={`Угол контура ${index + 1}`}
              aria-pressed={selected === index}
              title="Тяните мышью или двигайте стрелками; Delete — убрать угол"
              onPointerDown={(event) => onCornerDown(index, event)}
              onKeyDown={(event) => onCornerKey(index, event)}
              onFocus={() => onCornerFocus(index)}
            />
          </React.Fragment>
        );
      })}
      {add && <span className="editor-outline__add" style={{ left: add.x, top: add.y }} aria-hidden="true" />}
    </div>
  );
};
