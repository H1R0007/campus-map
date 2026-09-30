import React, { useLayoutEffect, useRef, useState } from 'react';
import type { MapSize } from '@campus-map/core';
import { dragBox } from '../../import/trim';
import type { Box, CropHandle } from '../../import/trim';
import type { OutlinePoint } from '../../import/outline';
import { OutlineEditor } from './OutlineEditor';

/**
 * Лист с областью, которая станет планом (запись 48).
 *
 * Область тянут за края и углы или двигают целиком; с клавиатуры — стрелками
 * на выбранном крае (Shift — крупнее). Всё вне области затемнено: сразу видно,
 * что уйдёт в план, а что нет.
 */

type Handle = CropHandle;

const HANDLES: { handle: Exclude<Handle, 'move'>; label: string }[] = [
  { handle: 'nw', label: 'Левый верхний угол области' },
  { handle: 'n', label: 'Верхний край области' },
  { handle: 'ne', label: 'Правый верхний угол области' },
  { handle: 'e', label: 'Правый край области' },
  { handle: 'se', label: 'Правый нижний угол области' },
  { handle: 's', label: 'Нижний край области' },
  { handle: 'sw', label: 'Левый нижний угол области' },
  { handle: 'w', label: 'Левый край области' },
];

export const CropEditor: React.FC<{
  imageUrl: string | null;
  /** Почему лист не нарисовался; `null` — ещё рисуется или уже нарисован. */
  failure?: string | null;
  /** Размер повёрнутого листа в его единицах. */
  pageSize: MapSize;
  crop: Box | null;
  onChange: (crop: Box) => void;
  /** Контур здания (запись 73): с ним вместо рамки — углы и дуги. */
  outline?: OutlinePoint[] | null;
  onOutlineChange?: (outline: OutlinePoint[]) => void;
}> = ({ imageUrl, failure = null, pageSize, crop, onChange, outline = null, onOutlineChange }) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Box } | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => setFrameWidth(frame.clientWidth));
    observer.observe(frame);
    setFrameWidth(frame.clientWidth);
    return () => observer.disconnect();
  }, []);

  const scale = frameWidth > 0 ? frameWidth / pageSize.width : 0;
  const box = crop ?? { x: 0, y: 0, width: pageSize.width, height: pageSize.height };

  const start = (handle: Handle) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { handle, x: event.clientX, y: event.clientY, start: box };
  };
  const move = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current || scale === 0) return;
    onChange(dragBox(current.start, current.handle, (event.clientX - current.x) / scale, (event.clientY - current.y) / scale, pageSize));
  };
  const end = () => {
    drag.current = null;
  };

  const keyboard = (handle: Handle) => (event: React.KeyboardEvent) => {
    const step = (event.shiftKey ? 0.05 : 0.01) * Math.max(pageSize.width, pageSize.height);
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(dragBox(box, handle, delta[0], delta[1], pageSize));
  };

  return (
    <div
      ref={frameRef}
      className="editor-crop"
      style={{ aspectRatio: `${pageSize.width} / ${pageSize.height}`, width: `min(100%, calc(52vh * ${pageSize.width / pageSize.height}))` }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {imageUrl ? (
        <img className="editor-crop__image" src={imageUrl} alt="" draggable={false} />
      ) : failure ? (
        <div className="editor-crop__loading" role="alert">
          Лист не нарисовался: {failure}
        </div>
      ) : (
        <div className="editor-crop__loading">Лист рисуется…</div>
      )}
      {scale > 0 && outline && onOutlineChange && (
        <OutlineEditor outline={outline} pageSize={pageSize} scale={scale} onChange={onOutlineChange} />
      )}
      {scale > 0 && !outline && (
        <div
          className="editor-crop__box"
          style={{ left: box.x * scale, top: box.y * scale, width: box.width * scale, height: box.height * scale }}
          onPointerDown={start('move')}
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
              onPointerDown={start(handle)}
              onKeyDown={keyboard(handle)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
