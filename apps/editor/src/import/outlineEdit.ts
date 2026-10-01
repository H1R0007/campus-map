import polygonClipping from 'polygon-clipping';
import type { Pair, Ring } from 'polygon-clipping';
import { edgePoints, outlineOfBox } from './outline';
import type { OutlinePoint } from './outline';
import type { Box } from './trim';

/**
 * Инструменты контура в мастерской листов (запись 81): вырезать прямоугольник
 * (штамп, заголовок, прилипшие к зданию) и обвести здание по точкам.
 *
 * Многоугольники режет `polygon-clipping`: у выреза много краевых случаев —
 * угол ровно на линии, совпадающие рёбра, — и самописный вариант на них
 * ломается. Дуги библиотека не знает, поэтому контур перед ней становится
 * ломаной, а после — дуги, которых вырез не коснулся, собираются обратно:
 * отрезанный штамп не превращает ротонду в многоугольник.
 */

interface Point {
  x: number;
  y: number;
}

export type OutlineChange = { outline: OutlinePoint[]; dropped: number } | { problem: string };

/** Ключ точки для поиска «та же точка» после библиотеки: она может сдвинуть на пылинку. */
const keyOf = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;

/** Площадь кольца со знаком (обход по часовой на экране — положительная). */
function ringArea(ring: readonly Pair[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Кольцо библиотеки без повтора первой точки в конце и без точек на прямой. */
function openRing(ring: Ring): Pair[] {
  const points = ring.slice(0, -1);
  return points.filter((point, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const cross = (point[0] - prev[0]) * (next[1] - point[1]) - (point[1] - prev[1]) * (next[0] - point[0]);
    return Math.abs(cross) > 1e-9 * (1 + Math.abs(point[0]) + Math.abs(point[1]));
  });
}

/** Контур ломаной для библиотеки — и где на ней вершины и точки дуг. */
function flattenTracked(outline: readonly OutlinePoint[]) {
  const ring: Pair[] = [];
  const vertex = new Map<string, number>();
  /** Точки дуги ребра `edge` по порядку, без концов. */
  const arcs = new Map<number, string[]>();
  outline.forEach((point, index) => {
    ring.push([point.x, point.y]);
    vertex.set(keyOf(point.x, point.y), index);
    if (!point.bulge) return;
    const next = outline[(index + 1) % outline.length];
    const inner = edgePoints(point, next, point.bulge).slice(0, -1);
    arcs.set(
      index,
      inner.map((p) => keyOf(p.x, p.y))
    );
    for (const p of inner) ring.push([p.x, p.y]);
  });
  return { ring, vertex, arcs };
}

/**
 * Кольцо после библиотеки — снова контур: где подряд идут вершина, все точки
 * её дуги и следующая вершина, там снова дуга. Обратный обход — дуга с
 * изгибом противоположного знака: «влево» сменилось на «вправо».
 */
function restoreArcs(ring: Pair[], outline: readonly OutlinePoint[], tracked: ReturnType<typeof flattenTracked>): OutlinePoint[] {
  const n = ring.length;
  const keys = ring.map(([x, y]) => keyOf(x, y));
  const vertexAt = (k: number) => tracked.vertex.get(keys[((k % n) + n) % n]);
  // Начать с уцелевшей вершины: тогда дуга не рвётся на стыке начала и конца.
  let start = 0;
  for (let k = 0; k < n; k += 1) {
    if (vertexAt(k) !== undefined) {
      start = k;
      break;
    }
  }
  const out: OutlinePoint[] = [];
  let k = 0;
  while (k < n) {
    const [x, y] = ring[(start + k) % n];
    const index = vertexAt(start + k);
    let bulge = 0;
    let skip = 0;
    if (index !== undefined) {
      const count = outline.length;
      // Вперёд: ребро index → index + 1.
      const forward = tracked.arcs.get(index);
      if (forward && matches(keys, start + k + 1, forward, n) && vertexAt(start + k + 1 + forward.length) === (index + 1) % count) {
        bulge = outline[index].bulge!;
        skip = forward.length;
      }
      // Назад: ребро index − 1 → index, пройденное от конца к началу.
      const previous = (index - 1 + count) % count;
      const backward = tracked.arcs.get(previous);
      if (!skip && backward && matches(keys, start + k + 1, [...backward].reverse(), n) && vertexAt(start + k + 1 + backward.length) === previous) {
        bulge = -outline[previous].bulge!;
        skip = backward.length;
      }
    }
    out.push(bulge ? { x, y, bulge } : { x, y });
    k += 1 + skip;
  }
  return out;
}

function matches(keys: readonly string[], from: number, wanted: readonly string[], n: number): boolean {
  return wanted.every((key, i) => keys[(from + i) % n] === key);
}

/** Самый большой кусок мультимногоугольника и сколько кусков отброшено. */
function largest(pieces: Pair[][][]): { piece: Pair[][]; dropped: number } | null {
  let best: Pair[][] | null = null;
  let bestArea = 0;
  for (const piece of pieces) {
    const area = Math.abs(ringArea(piece[0])) - piece.slice(1).reduce((sum, hole) => sum + Math.abs(ringArea(hole)), 0);
    if (area > bestArea) {
      bestArea = area;
      best = piece;
    }
  }
  return best ? { piece: best, dropped: pieces.length - 1 } : null;
}

/**
 * Вырезать прямоугольник `cut` из плана: из контура, а если его нет — из
 * рамки (`crop`, нет и её — весь лист `page`). Отрезанные куски, не связанные
 * с основным, убираются: прилипший штамп уходит целиком. Дыру посреди плана
 * контур держать не умеет — такой вырез отклоняется словами.
 */
export function cutOutline(outline: readonly OutlinePoint[] | null, crop: Box | null, page: { width: number; height: number }, cut: Box): OutlineChange {
  const base = outline && outline.length >= 2 ? outline : outlineOfBox(crop ?? { x: 0, y: 0, ...page });
  const tracked = flattenTracked(base);
  const hole: Pair[] = [
    [cut.x, cut.y],
    [cut.x + cut.width, cut.y],
    [cut.x + cut.width, cut.y + cut.height],
    [cut.x, cut.y + cut.height],
  ];
  const result = polygonClipping.difference([closeRing(tracked.ring)], [closeRing(hole)]);
  const kept = largest(result);
  if (!kept) return { problem: 'Прямоугольник закрыл весь план — нарисуйте его поменьше' };
  if (kept.piece.length > 1) {
    return { problem: 'Прямоугольник целиком внутри плана: вырезать можно только от края — начните его за линией контура' };
  }
  const before = Math.abs(ringArea(tracked.ring));
  const after = Math.abs(ringArea(openRing(kept.piece[0])));
  if (kept.dropped === 0 && Math.abs(before - after) <= before * 1e-9) {
    return { problem: 'Прямоугольник не задел план — вырезать нечего' };
  }
  return { outline: restoreArcs(openRing(kept.piece[0]), base, tracked), dropped: kept.dropped };
}

/**
 * Контур из точек, поставленных щелчками. Пересекающиеся рёбра («бантик»)
 * разбираются библиотекой на куски — остаётся самый большой; меньше трёх
 * разных точек — не контур.
 */
export function outlineFromClicks(points: readonly Point[]): OutlinePoint[] | null {
  const distinct = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-6);
  if (distinct.length < 3) return null;
  const ring: Pair[] = distinct.map((p) => [p.x, p.y]);
  if (Math.abs(ringArea(ring)) < 1e-6) return null;
  const kept = largest(polygonClipping.union([closeRing(ring)]));
  if (!kept) return null;
  const outer = openRing(kept.piece[0]);
  return outer.length >= 3 ? outer.map(([x, y]) => ({ x, y })) : null;
}

const closeRing = (ring: Pair[]): Pair[] => [...ring, ring[0]];
