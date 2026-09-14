import type { Graph, MapNode } from '@campus-map/core';
import { isNodeShown, mapPointOf } from './mapView';
import type { MapView } from './mapView';

/**
 * Геометрия маршрута на карте: на плане одного этажа или на холсте кампуса.
 */

/** Точка карты: `[y, x]` в пикселях плана или в метрах холста. */
export type LatLngTuple = [number, number];

/** Участки маршрута на карте. */
export interface RouteRuns {
  /** Видимые участки — сплошной линией. */
  shown: LatLngTuple[][];
  /** Участки под крышей неприближенного корпуса — просвечивают пунктиром. */
  roofed: LatLngTuple[][];
  /**
   * Участки на других этажах приближенного корпуса. Лежат прямо на коридорах
   * показанного этажа, поэтому просвечивают только в обзоре маршрута.
   */
  otherFloors: LatLngTuple[][];
}

type RunKind = keyof RouteRuns;

function runKindOf(view: MapView, node: MapNode): RunKind {
  if (isNodeShown(view, node)) return 'shown';
  return view.kind === 'canvas' && view.revealed.has(node.building) ? 'otherFloors' : 'roofed';
}

/**
 * Разбивает путь на участки для отрисовки.
 *
 * На карте одного плана маршрут проходит через несколько этажей и корпусов, а
 * показан один план, поэтому узлы чужого этажа разрывают линию, и каждый
 * видимый отрезок рисуется отдельно. Невидимых участков здесь нет: у чужого
 * плана своя система координат.
 *
 * На холсте все узлы в одних метрах. Участок на этаже, который сейчас не виден,
 * возвращается отдельно — под крышей (`roofed`) или на другом этаже открытого
 * корпуса (`otherFloors`): маршрут просвечивает сквозь план, и видно, куда он
 * ведёт дальше (запись 32). Соседние участки делят граничную точку — линия не
 * рвётся.
 *
 * Отрезок короче двух точек не возвращается — одиночная точка линией не
 * является. Функция чистая и живёт отдельно от компонента: это главная
 * нетривиальная логика слоя маршрута, и её нужно уметь проверить тестом.
 */
export function routeRuns(path: readonly string[], graph: Graph, view: MapView): RouteRuns {
  const runs: RouteRuns = { shown: [], roofed: [], otherFloors: [] };
  let current: LatLngTuple[] = [];
  let currentKind: RunKind = 'shown';

  const flush = () => {
    if (current.length > 1) runs[currentKind].push(current);
  };

  for (const nodeId of path) {
    const node = graph.getNode(nodeId);
    if (!node) continue;

    const kind = runKindOf(view, node);
    const point = mapPointOf(graph, view, node);

    if (view.kind === 'plan') {
      if (kind === 'shown') {
        current.push(point);
      } else {
        flush();
        current = [];
      }
      continue;
    }

    if (current.length > 0 && kind !== currentKind) {
      const boundary = current[current.length - 1];
      flush();
      current = [boundary];
    }
    current.push(point);
    currentKind = kind;
  }

  flush();
  return runs;
}

/** Все точки маршрута на карте — обзор маршрута на холсте вписывает его целиком. */
export function routePoints(path: readonly string[], graph: Graph, view: MapView): LatLngTuple[] {
  const points: LatLngTuple[] = [];
  for (const nodeId of path) {
    const node = graph.getNode(nodeId);
    if (node) points.push(mapPointOf(graph, view, node));
  }
  return points;
}

/**
 * Точки, под которые карта подгоняется на шаге пошаговой навигации.
 *
 * Узлы участка шага и по одному соседнему узлу пути с каждой стороны. Соседи
 * нужны переходу: у лифта на этаже прибытия есть один узел, а человеку важно
 * видеть, куда от него идти. На карте одного плана — только узлы показанного
 * плана; на холсте — все: этаж шага откроется, а вид от открытых этажей
 * зависеть не должен.
 *
 * @param range индексы узлов пути, оба конца включительно (`RouteStep.pathRange`)
 */
export function stepFocusPoints(
  path: readonly string[],
  range: readonly [number, number],
  graph: Graph,
  view: MapView
): LatLngTuple[] {
  const points: LatLngTuple[] = [];
  const first = Math.max(0, range[0] - 1);
  const last = Math.min(path.length - 1, range[1] + 1);

  for (let i = first; i <= last; i++) {
    const node = graph.getNode(path[i]);
    if (node && (view.kind === 'canvas' || isNodeShown(view, node))) points.push(mapPointOf(graph, view, node));
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
