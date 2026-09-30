import React, { useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';

/** Пределы ширины колонок, CSS-пиксели. */
export const COLUMN_LIMITS = {
  structure: { min: 200, max: 480 },
  inspector: { min: 280, max: 640 },
} as const;

type Column = keyof typeof COLUMN_LIMITS;

/** Шаг клавиш-стрелок, CSS-пиксели. */
const KEY_STEP = 16;

/**
 * Край колонки, который тянут мышью (запись 57), — как в VS Code.
 *
 * Двойной щелчок возвращает ширину по умолчанию; с клавиатуры — стрелки
 * (Home и End — самая узкая и самая широкая). Ширину помнит браузер; карта
 * подстраивается сама (`MapResizeWatcher`).
 *
 * @param column чья ширина
 * @param edge с какой стороны колонки край: у левой колонки — справа
 * @param columnRef колонка — её ширина на экране в начале перетаскивания
 */
export const ColumnResizer: React.FC<{
  column: Column;
  edge: 'left' | 'right';
  label: string;
  columnRef: React.RefObject<HTMLElement | null>;
}> = ({ column, edge, label, columnRef }) => {
  const width = useEditorStore((s) => (column === 'structure' ? s.structureWidth : s.inspectorWidth));
  const setColumnWidth = useEditorStore((s) => s.setColumnWidth);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const { min, max } = COLUMN_LIMITS[column];
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
  const current = () => width ?? columnRef.current?.getBoundingClientRect().width ?? min;
  // Край справа от колонки тянут вправо — шире; край слева — наоборот.
  const direction = edge === 'right' ? 1 : -1;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width: current() };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setColumnWidth(column, clamp(drag.current.width + (event.clientX - drag.current.x) * direction), false);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const latest = useEditorStore.getState();
    setColumnWidth(column, column === 'structure' ? latest.structureWidth : latest.inspectorWidth);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? KEY_STEP * direction : event.key === 'ArrowLeft' ? -KEY_STEP * direction : 0;
    const next = event.key === 'Home' ? min : event.key === 'End' ? max : step !== 0 ? clamp(current() + step) : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    setColumnWidth(column, next);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(current())}
      tabIndex={0}
      title={`${label}: тяните, двойной щелчок — как было`}
      className={`editor-resizer editor-resizer--${edge}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setColumnWidth(column, null)}
      onKeyDown={onKeyDown}
    />
  );
};
