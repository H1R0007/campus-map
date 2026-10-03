import React, { useEffect, useRef } from 'react';
import { toScreen } from '../../import/sheetView';
import type { Point, SheetView, Size } from '../../import/sheetView';
import { Icon } from './Icon';
import { TOOLS } from './sheetToolList';
import type { SheetTool } from './sheetToolList';

/**
 * Инструменты мастерской листов (запись 81): панель слева от листа, меню по
 * правой кнопке и то, что рисуется, пока инструментом работают, — точки
 * обводки и растягиваемый прямоугольник. Сами жесты ведёт холст
 * (`SheetCanvas`).
 */

export const ToolPalette: React.FC<{ tool: SheetTool; onTool: (tool: SheetTool) => void }> = ({ tool, onTool }) => (
  <div className="editor-workshop__palette" role="toolbar" aria-label="Инструменты листа" aria-orientation="vertical">
    {TOOLS.map((info) => (
      <button
        key={info.tool}
        type="button"
        className="editor-icon-button"
        aria-label={info.label}
        aria-pressed={tool === info.tool}
        aria-keyshortcuts={info.key}
        title={`${info.label} (${info.key}) — ${info.does}`}
        onClick={() => onTool(info.tool)}
      >
        <Icon name={info.icon} size={18} />
      </button>
    ))}
  </div>
);

export interface MenuItem {
  label: string;
  /** Клавиша, которая делает то же, — справа в пункте. */
  key?: string;
  disabled?: boolean;
  run: () => void;
}

/**
 * Меню по правой кнопке у точки листа. Стрелки выбирают пункт, Enter —
 * выполняет, Escape и щелчок мимо закрывают (их ловит холст).
 */
export const SheetMenu: React.FC<{ x: number; y: number; area: Size; items: readonly MenuItem[]; onClose: () => void }> = ({ x, y, area, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, []);
  const move = (event: React.KeyboardEvent, step: 1 | -1 | 'first' | 'last') => {
    event.preventDefault();
    event.stopPropagation();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = step === 'first' ? 0 : step === 'last' ? buttons.length - 1 : (index + step + buttons.length) % buttons.length;
    buttons[next].focus();
  };
  // Меню не выходит за край листа: у правого и нижнего края — раскрывается внутрь.
  const width = 248;
  const height = items.length * 34 + 8;
  return (
    <div
      ref={ref}
      className="editor-workshop__menu"
      role="menu"
      aria-label="Действия с листом"
      style={{ left: Math.max(4, Math.min(x, area.width - width - 4)), top: Math.max(4, Math.min(y, area.height - height - 4)), width }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') move(event, 1);
        else if (event.key === 'ArrowUp') move(event, -1);
        else if (event.key === 'Home') move(event, 'first');
        else if (event.key === 'End') move(event, 'last');
        else if (event.key === 'Tab') {
          event.preventDefault();
          onClose();
        } else event.stopPropagation();
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="editor-workshop__menu-item"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          <span>{item.label}</span>
          {item.key && <kbd className="editor-workshop__kbd">{item.key}</kbd>}
        </button>
      ))}
    </div>
  );
};

/** Обводка по точкам, пока её ставят: точки, рёбра и резинка к указателю. */
export const SketchOverlay: React.FC<{ points: readonly Point[]; cursor: Point | null; closing: boolean; view: SheetView; area: Size }> = ({
  points,
  cursor,
  closing,
  view,
  area,
}) => {
  const screen = points.map((point) => toScreen(view, point));
  const tail = cursor ? toScreen(view, cursor) : null;
  const line = [...screen, ...(tail ? [tail] : [])].map((p) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(' ');
  return (
    <div className="editor-workshop__sketch" data-sketch={points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')} aria-hidden="true">
      <svg width={area.width} height={area.height}>
        <polyline className="editor-workshop__sketch-line" points={line} />
      </svg>
      {screen.map((p, index) => (
        <span
          key={index}
          className={`editor-workshop__sketch-point${index === 0 && closing ? ' editor-workshop__sketch-point--close' : ''}`}
          style={{ left: p.x, top: p.y }}
        />
      ))}
    </div>
  );
};

/** Растягиваемый прямоугольник: рамка будущей области или вырез. */
export const FrameOverlay: React.FC<{ kind: 'rect' | 'cut'; from: Point; to: Point; view: SheetView }> = ({ kind, from, to, view }) => {
  const a = toScreen(view, { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y) });
  const b = toScreen(view, { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y) });
  return (
    <div
      className={`editor-workshop__frame editor-workshop__frame--${kind}`}
      style={{ left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y }}
      aria-hidden="true"
    />
  );
};
