import { distance, edgeKey } from '../geometry.js';
import type { Graph } from '../graph/Graph.js';
import type { MapNode } from '../types/node.js';
import type {
  MultiPathResult,
  PathfindingOptions,
  PathResult,
  PathSegment,
} from '../types/pathfinding.js';
import type { TransitionType } from '../types/transition.js';

/**
 * Поиск кратчайшего пути алгоритмом A*.
 */

/** Ограничение итераций по умолчанию — защита от зацикливания на битых данных. */
const DEFAULT_MAX_ITERATIONS = 50_000;

/**
 * Штраф за ребро, соединяющее разные этажи или корпуса без описанного
 * перехода. Маршрут через него технически возможен, но делается заведомо
 * дорогим, чтобы при наличии корректного перехода выбрался именно он.
 */
const CROSS_FLOOR_WITHOUT_TRANSITION_COST = 10_000;

/** Элемент приоритетной очереди. */
interface QueueItem {
  nodeId: string;
  fScore: number;
}

/**
 * Приоритетная очередь на бинарной куче.
 *
 * `Array.prototype.sort` на каждой вставке дал бы O(N log N) на шаг и
 * превратил бы поиск в O(N² log N) — на графах с тысячами узлов это
 * заметно, поэтому куча обязательна.
 */
class PriorityQueue {
  private readonly items: QueueItem[] = [];

  push(item: QueueItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): QueueItem | undefined {
    if (this.items.length === 0) return undefined;

    const result = this.items[0];
    const last = this.items.pop()!;

    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return result;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.items[parentIndex].fScore <= this.items[index].fScore) break;
      [this.items[parentIndex], this.items[index]] = [this.items[index], this.items[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;

    for (;;) {
      const left = 2 * index + 1;
      const right = left + 1;
      let smallest = index;

      if (left < length && this.items[left].fScore < this.items[smallest].fScore) {
        smallest = left;
      }
      if (right < length && this.items[right].fScore < this.items[smallest].fScore) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }
}

/** Опции после подстановки значений по умолчанию. */
interface NormalizedOptions {
  allowStairs: boolean;
  allowLift: boolean;
  allowBridge: boolean;
  allowEntrance: boolean;
  preferLift: boolean;
  maxIterations: number;
}

function normalizeOptions(options: PathfindingOptions = {}): NormalizedOptions {
  return {
    allowStairs: options.allowStairs ?? true,
    allowLift: options.allowLift ?? true,
    allowBridge: options.allowBridge ?? true,
    allowEntrance: options.allowEntrance ?? true,
    preferLift: options.preferLift ?? false,
    maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
  };
}

/**
 * Веса переходов: чем меньше, тем предпочтительнее.
 *
 * Переход всегда «дешевле» длинного пешего отрезка, но дороже короткого:
 * вход стоит 5 условных метров, лестница — 40. Значения подобраны так,
 * чтобы маршрут не петлял через лишние лестницы, но и не запрещал их.
 */
const TRANSITION_WEIGHTS: Record<TransitionType, number> = {
  entrance: 5,
  lift: 15,
  bridge: 25,
  stairs: 40,
};

/**
 * Стоимость ребра между двумя узлами.
 *
 * `Infinity` означает «ребро запрещено настройками» — так A* просто его не
 * рассматривает, и отдельной ветки фильтрации в обходе не нужно.
 *
 * Эта же функция используется и для подсчёта стоимости шагов маршрута,
 * поэтому сумма `segments[].distance` всегда совпадает с `totalDistance`.
 * Раньше сегменты считались по «сырым» весам без учёта `preferLift`, из-за
 * чего итог расходился с суммой шагов ровно на величину надбавки.
 */
function edgeCost(
  a: MapNode,
  b: MapNode,
  transitionType: TransitionType | null,
  opts: NormalizedOptions
): number {
  if (transitionType !== null) {
    switch (transitionType) {
      case 'stairs':
        if (!opts.allowStairs) return Number.POSITIVE_INFINITY;
        return opts.preferLift ? TRANSITION_WEIGHTS.stairs * 1.5 : TRANSITION_WEIGHTS.stairs;
      case 'lift':
        if (!opts.allowLift) return Number.POSITIVE_INFINITY;
        return opts.preferLift ? TRANSITION_WEIGHTS.lift * 0.7 : TRANSITION_WEIGHTS.lift;
      case 'bridge':
        if (!opts.allowBridge) return Number.POSITIVE_INFINITY;
        return TRANSITION_WEIGHTS.bridge;
      case 'entrance':
        if (!opts.allowEntrance) return Number.POSITIVE_INFINITY;
        return TRANSITION_WEIGHTS.entrance;
    }
  }

  // Обычное ребро внутри этажа — расстояние в пикселях карты.
  if (a.building === b.building && a.floor === b.floor) {
    return distance(a, b);
  }

  // Ребро между этажами или корпусами без перехода — ошибка в данных.
  return CROSS_FLOOR_WITHOUT_TRANSITION_COST;
}

/**
 * Восстанавливает путь по карте предшественников.
 */
function reconstructPath(cameFrom: Map<string, string>, endId: string): string[] {
  const path: string[] = [endId];
  let current = endId;

  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    path.unshift(current);
  }

  return path;
}

/**
 * Разбивает путь на шаги с типами переходов и стоимостями.
 */
function buildSegments(
  graph: Graph,
  path: string[],
  opts: NormalizedOptions
): PathSegment[] {
  const segments: PathSegment[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const fromNode = graph.getNode(path[i]);
    const toNode = graph.getNode(path[i + 1]);
    if (!fromNode || !toNode) continue;

    const transitionType = graph.getTransitionType(fromNode.id, toNode.id);

    segments.push({
      fromNode: fromNode.id,
      toNode: toNode.id,
      transitionType,
      distance: edgeCost(fromNode, toNode, transitionType, opts),
    });
  }

  return segments;
}

/**
 * Общий A*-обход.
 *
 * Единственная реализация поиска: `findPath` и `findAlternativePaths`
 * отличаются только необязательным исключением одного ребра, поэтому
 * вторая копия алгоритма не нужна.
 *
 * @param excludeEdgeKey канонический ключ ребра, которое нельзя использовать
 */
function search(
  graph: Graph,
  startId: string,
  endId: string,
  opts: NormalizedOptions,
  excludeEdgeKey?: string
): PathResult {
  const startNode = graph.getNode(startId);
  const endNode = graph.getNode(endId);

  if (!startNode) {
    return {
      found: false,
      path: [],
      totalDistance: 0,
      error: `Начальная точка "${startId}" не найдена`,
    };
  }
  if (!endNode) {
    return {
      found: false,
      path: [],
      totalDistance: 0,
      error: `Конечная точка "${endId}" не найдена`,
    };
  }
  if (startId === endId) {
    return { found: true, path: [startId], totalDistance: 0, segments: [] };
  }

  const gScore = new Map<string, number>([[startId, 0]]);
  const cameFrom = new Map<string, string>();
  const closed = new Set<string>();

  const openSet = new PriorityQueue();
  openSet.push({ nodeId: startId, fScore: distance(startNode, endNode) });

  let iterations = 0;

  while (!openSet.isEmpty) {
    if (++iterations > opts.maxIterations) {
      return {
        found: false,
        path: [],
        totalDistance: 0,
        error: `Превышен лимит итераций (${opts.maxIterations})`,
      };
    }

    const currentId = openSet.pop()!.nodeId;

    if (currentId === endId) {
      const path = reconstructPath(cameFrom, endId);
      return {
        found: true,
        path,
        totalDistance: gScore.get(endId) ?? 0,
        segments: buildSegments(graph, path, opts),
      };
    }

    // Ленивое удаление: узел мог попасть в очередь несколько раз с разной
    // оценкой, обрабатываем только первое извлечение.
    if (closed.has(currentId)) continue;
    closed.add(currentId);

    const currentNode = graph.getNode(currentId);
    if (!currentNode) continue;

    for (const neighborId of graph.getNeighbors(currentId)) {
      if (closed.has(neighborId)) continue;

      if (excludeEdgeKey !== undefined && edgeKey(currentId, neighborId) === excludeEdgeKey) {
        continue;
      }

      const neighborNode = graph.getNode(neighborId);
      if (!neighborNode) continue;

      const transitionType = graph.getTransitionType(currentId, neighborId);
      const cost = edgeCost(currentNode, neighborNode, transitionType, opts);
      if (!Number.isFinite(cost)) continue;

      const tentativeG = (gScore.get(currentId) ?? Number.POSITIVE_INFINITY) + cost;
      if (tentativeG >= (gScore.get(neighborId) ?? Number.POSITIVE_INFINITY)) continue;

      cameFrom.set(neighborId, currentId);
      gScore.set(neighborId, tentativeG);
      openSet.push({ nodeId: neighborId, fScore: tentativeG + distance(neighborNode, endNode) });
    }
  }

  return {
    found: false,
    path: [],
    totalDistance: 0,
    error: 'Путь не найден — точки не связаны',
  };
}

/**
 * Ищет кратчайший путь между двумя узлами.
 *
 * Эвристика — евклидово расстояние без учёта этажа и корпуса. Она
 * допустима (никогда не переоценивает), поэтому результат оптимален.
 * Для кросс-этажных маршрутов эвристика слабая, но корректная: стоимость
 * перехода всё равно меньше любого реального обходного пути.
 */
export function findPath(
  graph: Graph,
  startId: string,
  endId: string,
  options: PathfindingOptions = {}
): PathResult {
  return search(graph, startId, endId, normalizeOptions(options));
}

/**
 * Ищет основной путь и альтернативные варианты.
 *
 * Метод исключения рёбер: поочерёдно запрещаем каждое ребро основного пути
 * и пересчитываем маршрут. Если после запрета путь всё ещё существует и
 * отличается от уже найденных — это альтернатива.
 *
 * Обход рёбер детерминирован (от старта к финишу), поэтому результат
 * воспроизводим от запуска к запуску. Прежняя версия выбирала ребро
 * двойным взятием остатка от середины пути и вела неиспользуемый набор
 * `usedEdges`; поведение было трудно предсказать и невозможно объяснить.
 *
 * На графе-дереве альтернатив нет по определению — это корректный
 * результат, а не ошибка.
 */
export function findAlternativePaths(
  graph: Graph,
  startId: string,
  endId: string,
  options: PathfindingOptions = {},
  maxPaths: number = 3
): MultiPathResult {
  const opts = normalizeOptions(options);
  const primary = search(graph, startId, endId, opts);

  if (!primary.found || maxPaths < 2 || primary.path.length < 2) {
    return { primary, alternatives: [] };
  }

  const alternatives: PathResult[] = [];
  const seenPaths = new Set<string>([primary.path.join(',')]);
  const wanted = maxPaths - 1;

  for (let i = 0; i < primary.path.length - 1 && alternatives.length < wanted; i++) {
    const exclude = edgeKey(primary.path[i], primary.path[i + 1]);
    const candidate = search(graph, startId, endId, opts, exclude);

    if (!candidate.found) continue;

    const key = candidate.path.join(',');
    if (seenPaths.has(key)) continue;

    seenPaths.add(key);
    alternatives.push(candidate);
  }

  alternatives.sort((a, b) => a.totalDistance - b.totalDistance);

  return { primary, alternatives: alternatives.slice(0, wanted) };
}
