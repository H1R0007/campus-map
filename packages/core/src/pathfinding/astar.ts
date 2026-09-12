// packages/core/src/pathfinding/astar.ts

import type { MapNode } from '../types/node';
import type { PathfindingOptions, PathResult, PathSegment, MultiPathResult } from '../types/pathfinding';
import type { TransitionType } from '../types/transition';
import type { Graph } from '../graph/Graph';

/**
 * Элемент приоритетной очереди
 */
interface QueueItem {
  nodeId: string;
  fScore: number;
}

/**
 * Минимальная приоритетная очередь (min-heap)
 */
class PriorityQueue {
  private items: QueueItem[] = [];

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
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.items[parentIndex].fScore <= this.items[index].fScore) break;
      [this.items[parentIndex], this.items[index]] = [this.items[index], this.items[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < length && this.items[leftChild].fScore < this.items[smallest].fScore) {
        smallest = leftChild;
      }
      if (rightChild < length && this.items[rightChild].fScore < this.items[smallest].fScore) {
        smallest = rightChild;
      }
      if (smallest === index) break;

      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }
}

/**
 * Нормализованные опции с дефолтами
 */
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
    maxIterations: options.maxIterations ?? 50000,
  };
}

/**
 * Эвристика — чистое евклидово расстояние (admissible)
 * Не учитываем этажи в эвристике, чтобы не переоценивать
 */
function heuristic(a: MapNode, b: MapNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Евклидово расстояние между узлами
 */
function euclidean(a: MapNode, b: MapNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Веса переходов (чем меньше — тем предпочтительнее)
 */
const TRANSITION_WEIGHTS: Record<TransitionType, number> = {
  entrance: 5,    // Вход/выход — почти бесплатно
  lift: 15,       // Лифт — быстро
  bridge: 25,     // Переход между корпусами
  stairs: 40,     // Лестница — дольше
};

/**
 * Стоимость ребра между двумя узлами
 */
function edgeCost(
  a: MapNode,
  b: MapNode,
  transitionType: TransitionType | null,
  opts: NormalizedOptions
): number {
  // Если есть переход — проверяем разрешения и возвращаем его вес
  if (transitionType) {
    switch (transitionType) {
      case 'stairs':
        if (!opts.allowStairs) return Infinity;
        return opts.preferLift ? TRANSITION_WEIGHTS.stairs * 1.5 : TRANSITION_WEIGHTS.stairs;
      case 'lift':
        if (!opts.allowLift) return Infinity;
        return opts.preferLift ? TRANSITION_WEIGHTS.lift * 0.7 : TRANSITION_WEIGHTS.lift;
      case 'bridge':
        if (!opts.allowBridge) return Infinity;
        return TRANSITION_WEIGHTS.bridge;
      case 'entrance':
        if (!opts.allowEntrance) return Infinity;
        return TRANSITION_WEIGHTS.entrance;
      default:
        return TRANSITION_WEIGHTS.entrance;
    }
  }

  // Обычное ребро на одном этаже — евклидово расстояние
  if (a.building === b.building && a.floor === b.floor) {
    return euclidean(a, b);
  }

  // Ребро между разными этажами/зданиями без transition — это ошибка в данных
  // Но чтобы алгоритм не падал, даём очень высокую цену
  return 10000;
}

/**
 * Восстановление пути из карты предшественников
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
 * Построение сегментов пути для инструкций
 */
function buildSegments(graph: Graph, path: string[]): PathSegment[] {
  const segments: PathSegment[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const fromNode = graph.getNode(path[i]);
    const toNode = graph.getNode(path[i + 1]);

    if (!fromNode || !toNode) continue;

    const transitionType = graph.getTransitionType(path[i], path[i + 1]);
    const distance = transitionType
      ? TRANSITION_WEIGHTS[transitionType]
      : euclidean(fromNode, toNode);

    segments.push({
      fromNode: path[i],
      toNode: path[i + 1],
      transitionType,
      distance,
    });
  }

  return segments;
}

/**
 * Поиск кратчайшего пути алгоритмом A*
 */
export function findPath(
  graph: Graph,
  startId: string,
  endId: string,
  options: PathfindingOptions = {}
): PathResult {
  const opts = normalizeOptions(options);

  const startNode = graph.getNode(startId);
  const endNode = graph.getNode(endId);

  if (!startNode) {
    return { found: false, path: [], totalDistance: 0, error: `Начальная точка "${startId}" не найдена` };
  }
  if (!endNode) {
    return { found: false, path: [], totalDistance: 0, error: `Конечная точка "${endId}" не найдена` };
  }
  if (startId === endId) {
    return { found: true, path: [startId], totalDistance: 0, segments: [] };
  }

  // g-score: стоимость пути от старта до узла
  const gScore = new Map<string, number>();
  gScore.set(startId, 0);

  // Откуда пришли
  const cameFrom = new Map<string, string>();

  // Приоритетная очередь
  const openSet = new PriorityQueue();
  openSet.push({ nodeId: startId, fScore: heuristic(startNode, endNode) });

  // Множество посещённых (для оптимизации, но с возможностью переоткрытия)
  const closedSet = new Set<string>();

  let iterations = 0;

  while (!openSet.isEmpty) {
    if (++iterations > opts.maxIterations) {
      return {
        found: false,
        path: [],
        totalDistance: 0,
        error: `Превышен лимит итераций (${opts.maxIterations})`
      };
    }

    const current = openSet.pop()!;
    const currentId = current.nodeId;

    // Достигли цели
    if (currentId === endId) {
      const path = reconstructPath(cameFrom, endId);
      const segments = buildSegments(graph, path);
      const totalDistance = gScore.get(endId) ?? 0;

      return {
        found: true,
        path,
        totalDistance,
        segments,
      };
    }

    // Уже в closed set — пропускаем
    if (closedSet.has(currentId)) continue;
    closedSet.add(currentId);

    const currentNode = graph.getNode(currentId);
    if (!currentNode) continue;

    // Обрабатываем соседей
    const neighbors = graph.getNeighbors(currentId);

    for (const neighborId of neighbors) {
      if (closedSet.has(neighborId)) continue;

      const neighborNode = graph.getNode(neighborId);
      if (!neighborNode) continue;

      const transitionType = graph.getTransitionType(currentId, neighborId);
      const cost = edgeCost(currentNode, neighborNode, transitionType, opts);

      if (!Number.isFinite(cost)) continue;

      const tentativeG = (gScore.get(currentId) ?? Infinity) + cost;
      const previousG = gScore.get(neighborId) ?? Infinity;

      if (tentativeG < previousG) {
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeG);

        const fScore = tentativeG + heuristic(neighborNode, endNode);
        openSet.push({ nodeId: neighborId, fScore });
      }
    }
  }

  return {
    found: false,
    path: [],
    totalDistance: 0,
    error: 'Путь не найден — точки не связаны'
  };
}

/**
 * Поиск нескольких альтернативных путей
 * Использует метод "penalty" — после нахождения пути увеличиваем стоимость его рёбер
 */
export function findAlternativePaths(
  graph: Graph,
  startId: string,
  endId: string,
  options: PathfindingOptions = {},
  maxPaths: number = 3
): MultiPathResult {
  const primary = findPath(graph, startId, endId, options);

  if (!primary.found) {
    return { primary, alternatives: [] };
  }

  if (primary.path.length < 2) {
    // Слишком короткий путь — альтернатив нет
    return { primary, alternatives: [] };
  }

  const alternatives: PathResult[] = [];
  const usedEdges = new Set<string>();

  // Добавляем рёбра основного пути
  for (let i = 0; i < primary.path.length - 1; i++) {
    const edgeKey = [primary.path[i], primary.path[i + 1]].sort().join('|');
    usedEdges.add(edgeKey);
  }

  // Ищем альтернативы, исключая рёбра
  for (let attempt = 0; attempt < maxPaths * 2 && alternatives.length < maxPaths - 1; attempt++) {
    const pathToExclude = alternatives.length === 0 ? primary : alternatives[alternatives.length - 1];

    if (pathToExclude.path.length < 2) continue;

    // Пробуем исключить разные рёбра основного пути
    const edgeIndex = Math.floor(pathToExclude.path.length / 2) + (attempt % (pathToExclude.path.length - 1));
    const actualIndex = edgeIndex % (pathToExclude.path.length - 1);

    const excludeFrom = pathToExclude.path[actualIndex];
    const excludeTo = pathToExclude.path[actualIndex + 1];

    // Создаём временный граф без этого ребра
    const altPath = findPathExcludingEdge(graph, startId, endId, excludeFrom, excludeTo, options);

    if (altPath.found) {
      // Проверяем что путь действительно отличается
      const pathKey = altPath.path.join(',');
      const isDuplicate =
        pathKey === primary.path.join(',') ||
        alternatives.some(a => a.path.join(',') === pathKey);

      if (!isDuplicate) {
        alternatives.push(altPath);
      }
    }
  }

  // Сортируем альтернативы по длине
  alternatives.sort((a, b) => a.totalDistance - b.totalDistance);

  return { primary, alternatives: alternatives.slice(0, maxPaths - 1) };
}

/**
 * Поиск пути с исключением конкретного ребра
 */
function findPathExcludingEdge(
  graph: Graph,
  startId: string,
  endId: string,
  excludeFrom: string,
  excludeTo: string,
  options: PathfindingOptions
): PathResult {
  const opts = normalizeOptions(options);

  const startNode = graph.getNode(startId);
  const endNode = graph.getNode(endId);

  if (!startNode || !endNode) {
    return { found: false, path: [], totalDistance: 0 };
  }

  const gScore = new Map<string, number>();
  gScore.set(startId, 0);

  const cameFrom = new Map<string, string>();
  const openSet = new PriorityQueue();
  openSet.push({ nodeId: startId, fScore: heuristic(startNode, endNode) });

  const closedSet = new Set<string>();
  let iterations = 0;

  while (!openSet.isEmpty) {
    if (++iterations > opts.maxIterations) {
      return { found: false, path: [], totalDistance: 0 };
    }

    const current = openSet.pop()!;
    const currentId = current.nodeId;

    if (currentId === endId) {
      const path = reconstructPath(cameFrom, endId);
      const segments = buildSegments(graph, path);
      return {
        found: true,
        path,
        totalDistance: gScore.get(endId) ?? 0,
        segments,
      };
    }

    if (closedSet.has(currentId)) continue;
    closedSet.add(currentId);

    const currentNode = graph.getNode(currentId);
    if (!currentNode) continue;

    const neighbors = graph.getNeighbors(currentId);

    for (const neighborId of neighbors) {
      // Исключаем запрещённое ребро
      if (
        (currentId === excludeFrom && neighborId === excludeTo) ||
        (currentId === excludeTo && neighborId === excludeFrom)
      ) {
        continue;
      }

      if (closedSet.has(neighborId)) continue;

      const neighborNode = graph.getNode(neighborId);
      if (!neighborNode) continue;

      const transitionType = graph.getTransitionType(currentId, neighborId);
      const cost = edgeCost(currentNode, neighborNode, transitionType, opts);

      if (!Number.isFinite(cost)) continue;

      const tentativeG = (gScore.get(currentId) ?? Infinity) + cost;

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeG);
        openSet.push({ nodeId: neighborId, fScore: tentativeG + heuristic(neighborNode, endNode) });
      }
    }
  }

  return { found: false, path: [], totalDistance: 0 };
}

/**
 * Получить веса переходов (для UI)
 */
export function getTransitionWeights(): Record<TransitionType, number> {
  return { ...TRANSITION_WEIGHTS };
}
