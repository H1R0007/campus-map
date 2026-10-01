import React from 'react';
import type { Box, CropHandle } from '../../import/trim';
import type { SheetView } from '../../import/sheetView';

/**
 * Рамка области, которая станет планом (записи 48 и 80), — поверх листа в
 * мастерской.
 *
 * Рамку тянут за края и углы или двигают целиком; с клавиатуры — стрелками на
 * выбранном крае (Shift — крупнее). Всё вне рамки затемнено. Рамка и ручки — в
 * пикселях экрана: при любом приближении ручки одного размера и не закрывают
 * лист. Сами перетаскивания ведёт холст (`SheetCanvas`).
 */

const HANDLES: { handle: Exclude<CropHandle, 'move'>; label: string }[] = [
  { handle: 'nw', label: 'Левый верхний угол области' },
  { handle: 'n', label: 'Верхний край области' },
  { handle: 'ne', label: 'Правый верхний угол области' },
  { handle: 'e', label: 'Правый край области' },
  { handle: 'se', label: 'Правый нижний угол области' },
  { handle: 's', label: 'Нижний край области' },
  { handle: 'sw', label: 'Левый нижний угол области' },
  { handle: 'w', label: 'Левый край области' },
];

export const CropOverlay: React.FC<{
  box: Box;
  view: SheetView;
  onHandleDown: (handle: CropHandle, event: React.PointerEvent) => void;
  onHandleKey: (handle: CropHandle, event: React.KeyboardEvent) => void;
}> = ({ box, view, onHandleDown, onHandleKey }) => (
  <div
    className="editor-crop__box"
    style={{ left: view.x + box.x * view.scale, top: view.y + box.y * view.scale, width: box.width * view.scale, height: box.height * view.scale }}
    onPointerDown={(event) => onHandleDown('move', event)}
    role="group"
    aria-label="Область, которая станет планом"
    data-crop={`${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`}
  >
    {HANDLES.map(({ handle, label }) => (
      <button
        key={handle}
        type="button"
        className={`editor-crop__handle editor-crop__handle--${handle}`}
        aria-label={label}
        title={`${label}: тяните мышью или двигайте стрелками`}
        onPointerDown={(event) => onHandleDown(handle, event)}
        onKeyDown={(event) => onHandleKey(handle, event)}
      />
    ))}
  </div>
);
