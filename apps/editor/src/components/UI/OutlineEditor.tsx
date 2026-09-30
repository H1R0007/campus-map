import React, { useRef } from 'react';
import type { MapSize } from '@campus-map/core';
import { bulgeThrough, edgeHandle, outlinePath, removeOutlinePoint, splitOutlineEdge } from '../../import/outline';
import type { OutlinePoint } from '../../import/outline';

/**
 * Контур здания на листе (запись 73) — поверх листа в окне загрузки.
 *
 * Квадратные ручки — углы: тянут мышью или стрелками, Delete или двойной
 * щелчок убирает угол. Круглая ручка на середине ребра выгибает его в дугу
 * (закругление, полукруглый выступ); вернуть ребро прямым — довести ручку до
 * хорды; двойной щелчок по ней или Enter — новый угол на этом месте. Всё за
 * контуром затемнено — в план не попадёт.
 */

/** Ближе, чем столько точек экрана, изгиб прилипает к прямой. */
const STRAIGHT_SNAP_PX = 5;

type Drag = { kind: 'corner' | 'edge'; index: number; pointer: number };

export const OutlineEditor: React.FC<{
  outline: OutlinePoint[];
  pageSize: MapSize;
  /** Точек экрана на единицу листа. */
  scale: number;
  onChange: (outline: OutlinePoint[]) => void;
}> = ({ outline, pageSize, scale, onChange }) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
  /** Место на листе под указателем. */
  const pagePoint = (event: React.PointerEvent) => {
    const rect = layerRef.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / scale, pageSize.width), y: clamp((event.clientY - rect.top) / scale, pageSize.height) };
  };

  const setCorner = (index: number, x: number, y: number) =>
    onChange(outline.map((point, i) => (i === index ? { ...point, x: clamp(x, pageSize.width), y: clamp(y, pageSize.height) } : point)));
  const setBulge = (index: number, bulge: number) =>
    onChange(outline.map((point, i) => (i !== index ? point : bulge ? { ...point, bulge } : { x: point.x, y: point.y })));

  const start = (kind: Drag['kind'], index: number) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { kind, index, pointer: event.pointerId };
  };
  const move = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const p = pagePoint(event);
    if (current.kind === 'corner') {
      setCorner(current.index, p.x, p.y);
      return;
    }
    const a = outline[current.index];
    const b = outline[(current.index + 1) % outline.length];
    const bulge = bulgeThrough(a, b, p);
    // Почти прямая — прямая: иначе ребро не вернуть к хорде точно.
    const sagittaPx = (Math.abs(bulge) * Math.hypot(b.x - a.x, b.y - a.y) * scale) / 2;
    setBulge(current.index, sagittaPx < STRAIGHT_SNAP_PX ? 0 : Math.round(bulge * 1e4) / 1e4);
  };
  const end = () => {
    drag.current = null;
  };

  const step = (event: React.KeyboardEvent) => (event.shiftKey ? 0.05 : 0.01) * Math.max(pageSize.width, pageSize.height);
  const arrows = (event: React.KeyboardEvent, amount: number) =>
    ({ ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] })[event.key];

  const cornerKeys = (index: number) => (event: React.KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      onChange(removeOutlinePoint(outline, index));
      return;
    }
    const delta = arrows(event, step(event));
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    setCorner(index, outline[index].x + delta[0], outline[index].y + delta[1]);
  };
  const edgeKeys = (index: number) => (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      onChange(splitOutlineEdge(outline, index));
      return;
    }
    // Стрелки вверх и вниз меняют изгиб ребра.
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    const delta = (event.shiftKey ? 0.2 : 0.05) * (event.key === 'ArrowUp' ? 1 : -1);
    const next = Math.round(((outline[index].bulge ?? 0) + delta) * 1e4) / 1e4;
    setBulge(index, Math.abs(next) < 1e-6 ? 0 : next);
  };

  const { width, height } = pageSize;
  const path = outlinePath(outline);

  return (
    <div
      ref={layerRef}
      className="editor-outline"
      role="group"
      aria-label="Контур здания, который станет планом"
      data-outline={outline.map((p) => `${Math.round(p.x)},${Math.round(p.y)}${p.bulge ? `~${p.bulge}` : ''}`).join(' ')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <svg className="editor-outline__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="editor-outline__shade" d={`M0 0H${width}V${height}H0Z${path}`} fillRule="evenodd" />
        <path className="editor-outline__line" d={path} vectorEffect="non-scaling-stroke" />
      </svg>
      {outline.map((point, index) => {
        const next = outline[(index + 1) % outline.length];
        const mid = edgeHandle(point, next, point.bulge ?? 0);
        return (
          <React.Fragment key={index}>
            <button
              type="button"
              className={`editor-outline__edge${point.bulge ? ' editor-outline__edge--arc' : ''}`}
              style={{ left: mid.x * scale, top: mid.y * scale }}
              aria-label={`Середина ребра ${index + 1}${point.bulge ? ', дуга' : ''}`}
              title="Тяните — ребро выгнется дугой, к хорде — снова прямое; двойной щелчок или Enter — новый угол; стрелки вверх и вниз — изгиб"
              onPointerDown={start('edge', index)}
              onDoubleClick={() => onChange(splitOutlineEdge(outline, index))}
              onKeyDown={edgeKeys(index)}
            />
            <button
              type="button"
              className="editor-outline__corner"
              style={{ left: point.x * scale, top: point.y * scale }}
              aria-label={`Угол контура ${index + 1}`}
              title="Тяните мышью или двигайте стрелками; двойной щелчок или Delete — убрать угол"
              onPointerDown={start('corner', index)}
              onDoubleClick={() => onChange(removeOutlinePoint(outline, index))}
              onKeyDown={cornerKeys(index)}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};
