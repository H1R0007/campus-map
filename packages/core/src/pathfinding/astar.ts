import type { MapNode } from '../types/node';
import type { PathfindingOptions, PathResult } from '../types/pathfinding';
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
 * Эвристика — евклидово расстояние + штраф за разницу этажей
 */
function heuristic(a: MapNode, b: MapNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const floorDiff = Math.abs(a.floor - b.floor);
  const FLOOR_COST = 100; // виртуальное расстояние на этаж
  
  return Math.sqrt(dx * dx + dy * dy + (floorDiff * FLOOR_COST) ** 2);
}

/**
 * Стоимость ребра между двумя узлами
 */
function edgeCost(
  a: MapNode,
  b: MapNode,
  transitionType: TransitionType | null,
  options: Required<PathfindingOptions>
): number {
  // Если есть переход — проверяем разрешения
  if (transitionType) {
    switch (transitionType) {
      case 'stairs':
        if (!options.allowStairs) return Infinity;
        return 100;
      case 'lift':
        if (!options.allowLift) return Infinity;
        return 10;
      case 'bridge':
        if (!options.allowBridge) return Infinity;
        return 20;
      case 'door':
        if (!options.allowDoor) return Infinity;
        return 1;
      default:
        return 50;
    }
  }

  // Обычное ребро на одном этаже
  if (a.floor === b.floor) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Переход между этажами без transition — очень дорого (не должно быть)
  return 1000;
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
  const MAX_ITERATIONS = 10000;

  // Значения по умолчанию
  const opts: Required<PathfindingOptions> = {
    allowStairs: options.allowStairs ?? true,
    allowLift: options.allowLift ?? true,
    allowBridge: options.allowBridge ?? true,
    allowDoor: options.allowDoor ?? true,
  };

  const startNode = graph.getNode(startId);
  const endNode = graph.getNode(endId);

  if (!startNode) {
    return { found: false, path: [], totalDistance: 0, error: `Start node "${startId}" not found` };
  }
  if (!endNode) {
    return { found: false, path: [], totalDistance: 0, error: `End node "${endId}" not found` };
  }

  // g-score: стоимость пути от старта до узла
  const gScore = new Map<string, number>();
  gScore.set(startId, 0);

  // Откуда пришли
  const cameFrom = new Map<string, string>();

  // Приоритетная очередь
  const openSet = new PriorityQueue();
  openSet.push({ nodeId: startId, fScore: heuristic(startNode, endNode) });

  const visited = new Set<string>();
  let iterations = 0;

  while (!openSet.isEmpty) {
    if (++iterations > MAX_ITERATIONS) {
      return { found: false, path: [], totalDistance: 0, error: 'Iteration limit exceeded' };
    }

    const current = openSet.pop()!;
    const currentId = current.nodeId;

    // Уже обработали
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Достигли цели
    if (currentId === endId) {
      const path = reconstructPath(cameFrom, endId);
      return {
        found: true,
        path,
        totalDistance: gScore.get(endId) ?? 0,
      };
    }

    const currentNode = graph.getNode(currentId);
    if (!currentNode) continue;

    // Обрабатываем соседей
    const neighbors = graph.getNeighbors(currentId);
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;

      const neighborNode = graph.getNode(neighborId);
      if (!neighborNode) continue;

      const transitionType = graph.getTransitionType(currentId, neighborId);
      const cost = edgeCost(currentNode, neighborNode, transitionType, opts);

      if (cost === Infinity) continue;

      const tentativeG = (gScore.get(currentId) ?? Infinity) + cost;

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeG);
        
        const fScore = tentativeG + heuristic(neighborNode, endNode);
        openSet.push({ nodeId: neighborId, fScore });
      }
    }
  }

  return { found: false, path: [], totalDistance: 0, error: 'No path found' };
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