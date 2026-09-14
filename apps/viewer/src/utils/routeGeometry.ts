import type { Graph, ViewScope } from '@campus-map/core';
import { isNodeInScope } from '@campus-map/core';

/**
 * Геометрия маршрута на текущем плане.
 */

/** Точка карты плана: `[y, x]` в пикселях изображения. */
export type LatLngTuple = [number, number];

/**
 * Разбивает путь на непрерывные отрезки, видимые в заданной области.
 *
 * Маршрут проходит через несколько этажей и корпусов, а показывается один
 * план, поэтому узлы чужого этажа разрывают линию, и каждый отрезок рисуется
 * отдельно. Отрезок короче двух точек не возвращается — одиночная точка
 * линией не является.
 *
 * Карта плана (`PixelMap`) принимает координаты как `[y, x]`: вертикальная ось
 * карты соответствует `y` узла в пикселях плана.
 *
 * Функция чистая и живёт отдельно от компонента: это единственная
 * нетривиальная логика слоя маршрута, и её нужно уметь проверить тестом.
 */
export function visiblePolylines(
  path: readonly string[],
  graph: Graph,
  scope: ViewScope
): LatLngTuple[][] {
  const segments: LatLngTuple[][] = [];
  let current: LatLngTuple[] = [];

  for (const nodeId of path) {
    const node = graph.getNode(nodeId);
    if (!node) continue;

    if (isNodeInScope(node, scope)) {
      current.push([node.y, node.x]);
      continue;
    }

    if (current.length > 1) segments.push(current);
    current = [];
  }

  if (current.length > 1) segments.push(current);

  return segments;
}

/**
 * Точки, под которые карта подгоняется на шаге пошаговой навигации.
 *
 * Узлы участка шага и по одному соседнему узлу пути с каждой стороны — только
 * те, что лежат в показанной области. Соседи нужны переходу: у лифта на этаже
 * прибытия есть один узел, а человеку важно видеть, куда от него идти.
 *
 * @param range индексы узлов пути, оба конца включительно (`RouteStep.pathRange`)
 */
export function stepFocusPoints(
  path: readonly string[],
  range: readonly [number, number],
  graph: Graph,
  scope: ViewScope
): LatLngTuple[] {
  const points: LatLngTuple[] = [];
  const first = Math.max(0, range[0] - 1);
  const last = Math.min(path.length - 1, range[1] + 1);

  for (let i = first; i <= last; i++) {
    const node = graph.getNode(path[i]);
    if (node && isNodeInScope(node, scope)) points.push([node.y, node.x]);
  }

  return points;
}

/**
 * Прямоугольник, под который подгоняется карта: охватывает точки и не меньше
 * `minSpan` по каждой стороне, с тем же центром.
 *
 * Участок шага бывает в пару шагов: дверь и первый узел коридора, лестница и
 * узел рядом. Подгонка вплотную к таким точкам приближала план до предела —
 * картинка расплывалась, и где ты на этаже, было не понять. Минимальный размер
 * оставляет вокруг участка часть этажа.
 *
 * @param points хотя бы одна точка `[y, x]`
 * @returns углы `[[minY, minX], [maxY, maxX]]`
 */
export function focusBounds(points: readonly LatLngTuple[], minSpan: number): [LatLngTuple, LatLngTuple] {
  let minY = Number.POSITIVE_INFINITY;
  let minX = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  for (const [y, x] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  const grow = (min: number, max: number): [number, number] => {
    if (max - min >= minSpan) return [min, max];
    const center = (min + max) / 2;
    return [center - minSpan / 2, center + minSpan / 2];
  };

  const [top, bottom] = grow(minY, maxY);
  const [left, right] = grow(minX, maxX);
  return [
    [top, left],
    [bottom, right],
  ];
}
