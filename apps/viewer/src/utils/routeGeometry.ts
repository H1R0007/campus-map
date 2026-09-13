import type { Graph, ViewScope } from '@campus-map/core';
import { isNodeInScope } from '@campus-map/core';

/**
 * Геометрия маршрута на текущем плане.
 */

/** Точка Leaflet в `CRS.Simple`. */
export type LatLngTuple = [number, number];

/**
 * Разбивает путь на непрерывные отрезки, видимые в заданной области.
 *
 * Маршрут проходит через несколько этажей и корпусов, а показывается один
 * план, поэтому узлы чужого этажа разрывают линию, и каждый отрезок рисуется
 * отдельно. Отрезок короче двух точек не возвращается — одиночная точка
 * линией не является.
 *
 * Leaflet в `CRS.Simple` принимает координаты как `[y, x]`: вертикальная ось
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
