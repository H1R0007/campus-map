import type { PlanOutlinePoint } from '@campus-map/core';
import { silhouette } from '../overlay/lineArt';
import type { Pixels } from '../overlay/lineArt';
import type { Box } from './trim';

/**
 * Контур здания на листе (запись 73): корпуса не всегда прямоугольные —
 * Г-образные, со скруглёнными углами, полукруглыми выступами, ротондой. Всё
 * за контуром в готовом плане прозрачно.
 *
 * Контур — вершины по порядку обхода; у каждой `bulge` — изгиб ребра до
 * следующей вершины, как в DXF: 0 — прямая, `tan(угол дуги / 4)` — дуга, 1 —
 * полуокружность. Знак: положительный изгиб выгибает ребро влево от
 * направления обхода на экране (ось y вниз). Координаты — единицы повёрнутой
 * страницы, как у обрезки.
 */

export type OutlinePoint = PlanOutlinePoint;

interface Point {
  x: number;
  y: number;
}

/** Нормаль ребра a→b влево на экране и длина ребра. */
function edgeFrame(a: Point, b: Point): { mid: Point; normal: Point; length: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const normal = length === 0 ? { x: 0, y: 0 } : { x: dy / length, y: -dx / length };
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, normal, length };
}

/** Середина ребра на дуге: за неё тянут, выгибая ребро. */
export function edgeHandle(a: Point, b: Point, bulge = 0): Point {
  const { mid, normal, length } = edgeFrame(a, b);
  const sagitta = (bulge * length) / 2;
  return { x: mid.x + normal.x * sagitta, y: mid.y + normal.y * sagitta };
}

/** Изгиб ребра, середина дуги которого — в `handle` (тянут за ручку ребра). */
export function bulgeThrough(a: Point, b: Point, handle: Point, max = 4): number {
  const { mid, normal, length } = edgeFrame(a, b);
  if (length === 0) return 0;
  const sagitta = (handle.x - mid.x) * normal.x + (handle.y - mid.y) * normal.y;
  const bulge = (2 * sagitta) / length;
  return Math.max(-max, Math.min(max, bulge));
}

/**
 * Точки ребра a→b без самой `a`: у прямой — только `b`, у дуги — точки по
 * дуге не реже, чем через `step` радиан, и `b`.
 */
export function edgePoints(a: Point, b: Point, bulge = 0, step = Math.PI / 36): Point[] {
  if (!bulge) return [{ x: b.x, y: b.y }];
  const { normal, length } = edgeFrame(a, b);
  if (length === 0) return [{ x: b.x, y: b.y }];
  const angle = 4 * Math.atan(bulge);
  const radius = (length * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const arcMid = edgeHandle(a, b, bulge);
  const center = { x: arcMid.x - normal.x * Math.sign(bulge) * radius, y: arcMid.y - normal.y * Math.sign(bulge) * radius };
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  // Направление обхода — то, при котором середина пути приходится на середину дуги.
  const at = (sweep: number) => ({ x: center.x + radius * Math.cos(start + sweep / 2), y: center.y + radius * Math.sin(start + sweep / 2) });
  const sweep = Math.abs(angle);
  const forward = at(sweep);
  const direction = Math.hypot(forward.x - arcMid.x, forward.y - arcMid.y) <= Math.hypot(at(-sweep).x - arcMid.x, at(-sweep).y - arcMid.y) ? 1 : -1;
  const count = Math.max(2, Math.ceil(sweep / step));
  const points: Point[] = [];
  for (let i = 1; i < count; i += 1) {
    const t = start + (direction * sweep * i) / count;
    points.push({ x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) });
  }
  points.push({ x: b.x, y: b.y });
  return points;
}

/** Контур ломаной: дуги — отрезками. Замкнутый, первая точка не повторяется. */
export function flattenOutline(outline: readonly OutlinePoint[], step?: number): Point[] {
  if (outline.length === 0) return [];
  const points: Point[] = [{ x: outline[0].x, y: outline[0].y }];
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    points.push(...edgePoints(a, b, a.bulge, step));
  }
  points.pop();
  return points;
}

/** Описанный прямоугольник контура: он и есть обрезка, по нему — размер плана. */
export function outlineBox(outline: readonly OutlinePoint[]): Box {
  const points = flattenOutline(outline);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Контур-прямоугольник по обрезке: с него начинают, превращая рамку в контур. */
export function outlineOfBox(box: Box): OutlinePoint[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}

/**
 * Новая вершина посередине ребра `index` → `index + 1`. У дуги вершина
 * встаёт на саму дугу, а половинки сохраняют её форму: изгиб половины дуги —
 * `tan(угол / 8)`.
 */
export function splitOutlineEdge(outline: readonly OutlinePoint[], index: number): OutlinePoint[] {
  const a = outline[index];
  const b = outline[(index + 1) % outline.length];
  const bulge = a.bulge ?? 0;
  const mid = edgeHandle(a, b, bulge);
  const half = bulge ? bulge / (1 + Math.sqrt(1 + bulge * bulge)) : 0;
  const withBulge = (point: Point, value: number): OutlinePoint => (value ? { x: point.x, y: point.y, bulge: value } : { x: point.x, y: point.y });
  return [...outline.slice(0, index), withBulge(a, half), withBulge(mid, half), ...outline.slice(index + 1)];
}

/**
 * Новая вершина на ребре `index` → `index + 1` там, куда щёлкнули («+» на
 * линии, запись 80). У дуги — посередине дуги (`splitOutlineEdge`): точка
 * щелчка на дуге не лежит.
 */
export function insertOutlinePoint(outline: readonly OutlinePoint[], index: number, point: Point): OutlinePoint[] {
  if (outline[index]?.bulge) return splitOutlineEdge(outline, index);
  return [...outline.slice(0, index + 1), { x: point.x, y: point.y }, ...outline.slice(index + 1)];
}

/**
 * Убирает вершину. Контуру нужно хотя бы три вершины — или две, если ребро
 * между ними дуга (круг, «линза»).
 */
export function removeOutlinePoint(outline: readonly OutlinePoint[], index: number): OutlinePoint[] {
  const next = outline.filter((_, i) => i !== index);
  if (next.length >= 3) return next;
  if (next.length === 2 && next.some((point) => point.bulge)) return next;
  return [...outline];
}

/**
 * Поворот контура вместе с листом на четверть оборота — тем же правилом, что
 * поворачивается обрезка (`rotatePiece`). Поворот не отражает, поэтому
 * изгибы рёбер остаются прежними.
 */
export function rotateOutline(outline: readonly OutlinePoint[], size: { width: number; height: number }, direction: 1 | -1): OutlinePoint[] {
  return outline.map((point) => {
    const turned = direction === 1 ? { x: size.height - point.y, y: point.x } : { x: point.y, y: size.width - point.x };
    return point.bulge ? { ...turned, bulge: point.bulge } : turned;
  });
}

/** Сдвигает и масштабирует контур: из единиц листа в точки плана. */
export function transformOutline(outline: readonly OutlinePoint[], dx: number, dy: number, scale: number): OutlinePoint[] {
  return outline.map((point) => ({ ...point, x: (point.x + dx) * scale, y: (point.y + dy) * scale }));
}

/** Путь SVG контура (дуги — отрезками): для маски и для показа на листе. */
export function outlinePath(outline: readonly OutlinePoint[]): string {
  const points = flattenOutline(outline);
  if (points.length === 0) return '';
  const r = (value: number) => Math.round(value * 100) / 100;
  return `M${points.map((p) => `${r(p.x)} ${r(p.y)}`).join('L')}Z`;
}

// ---------- контур здания по картинке ----------

/** Упрощение ломаной (Дуглас — Пекер) до отклонения не больше `epsilon`. */
function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const a = points[first];
    const b = points[last];
    const { normal, length } = edgeFrame(a, b);
    let worst = -1;
    let worstAway = 0;
    for (let i = first + 1; i < last; i += 1) {
      const p = points[i];
      const away = length === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs((p.x - a.x) * normal.x + (p.y - a.y) * normal.y);
      if (away > worstAway) {
        worstAway = away;
        worst = i;
      }
    }
    if (worst !== -1 && worstAway > epsilon) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Граница маски обходом соседей (Мур) от верхней левой точки; `null` — маска пустая. */
function traceBoundary(mask: Uint8Array, width: number, height: number): Point[] | null {
  let start = -1;
  for (let p = 0; p < mask.length; p += 1) {
    if (mask[p]) {
      start = p;
      break;
    }
  }
  if (start === -1) return null;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  // Соседи по часовой стрелке, начиная с запада.
  const dirs = [
    [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1],
  ];
  const sx = start % width;
  const sy = (start - sx) / width;
  const boundary: Point[] = [{ x: sx, y: sy }];
  let x = sx;
  let y = sy;
  let from = 0; // пришли «с запада»: слева от верхней левой точки пусто
  for (let guard = 0; guard < mask.length * 4; guard += 1) {
    let found = false;
    for (let k = 0; k < 8; k += 1) {
      const d = (from + 1 + k) % 8;
      const nx = x + dirs[d][0];
      const ny = y + dirs[d][1];
      if (inside(nx, ny)) {
        x = nx;
        y = ny;
        from = (d + 4) % 8;
        found = true;
        break;
      }
    }
    if (!found || (x === sx && y === sy)) break;
    boundary.push({ x, y });
  }
  return boundary;
}

/** Картинка без полосы у краёв шириной `margin` — там обычно рамка листа. */
function withoutMargin(src: Pixels, margin: number): Pixels {
  const data = new Uint8ClampedArray(src.data);
  const { width, height } = src;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= margin && y >= margin && x < width - margin && y < height - margin) continue;
      data.set([255, 255, 255, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/**
 * Контур здания на картинке: силуэт (тот же, что у наложения, запись 62),
 * его граница и упрощение до вершин.
 *
 * Рамка листа замыкает всё внутри себя, и силуэтом оказывался бы весь лист;
 * тогда полоса у краёв стирается, и поиск повторяется.
 *
 * @returns вершины в пикселях картинки или `null`, если здания не нашлось
 */
export function traceBuildingOutline(src: Pixels, maxPoints = 48): OutlinePoint[] | null {
  const area = src.width * src.height;
  let mask: Uint8Array | null = null;
  for (const share of [0, 0.02, 0.04, 0.07, 0.1]) {
    const margin = Math.round(Math.min(src.width, src.height) * share);
    const candidate = silhouette(margin === 0 ? src : withoutMargin(src, margin));
    let filled = 0;
    for (let p = 0; p < candidate.length; p += 1) filled += candidate[p];
    if (filled === 0) continue;
    mask = candidate;
    if (filled < area * 0.85) break;
  }
  if (!mask) return null;
  const boundary = traceBoundary(mask, src.width, src.height);
  if (!boundary || boundary.length < 3) return null;
  let epsilon = Math.max(1.5, Math.max(src.width, src.height) * 0.004);
  let points = simplify([...boundary, boundary[0]], epsilon).slice(0, -1);
  while (points.length > maxPoints) {
    epsilon *= 1.5;
    points = simplify([...boundary, boundary[0]], epsilon).slice(0, -1);
  }
  return points.length >= 3 ? points.map((p) => ({ x: p.x, y: p.y })) : null;
}
