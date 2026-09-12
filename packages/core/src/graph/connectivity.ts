import type { Graph } from './Graph.js';

/**
 * Результат проверки связности графа.
 */
export interface ConnectivityResult {
  /** Все ли узлы принадлежат одной компоненте связности */
  connected: boolean;

  /** Компоненты связности в порядке обхода */
  components: string[][];

  /** Узлы, до которых невозможно добраться из основной компоненты */
  isolatedNodeIds: string[];
}

/**
 * Разбивает граф на компоненты связности обходом в ширину.
 *
 * Живёт в ядре, потому что связность нужна и редактору (панель статистики и
 * диагностика данных), и любому будущему валидатору датасета. Прежняя копия
 * в `editorStore` для каждого узла перебирала весь массив переходов, то есть
 * работала за O(N·T) — на реальных объёмах данных это квадратично.
 */
export function findConnectedComponents(graph: Graph): ConnectivityResult {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const startId of graph.getAllNodes().map((n) => n.id)) {
    if (visited.has(startId)) continue;

    const component: string[] = [];
    const queue: string[] = [startId];
    visited.add(startId);

    // Курсор вместо `queue.shift()`: shift линейно сдвигает массив и
    // превращает обход в O(N²).
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      component.push(current);

      for (const neighbor of graph.getNeighbors(current)) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    components.push(component);
  }

  // Основная компонента — самая крупная: именно в неё попадает кампус и все
  // связанные с ним корпуса.
  const largest = components.reduce(
    (max, c) => (c.length > max.length ? c : max),
    [] as string[]
  );
  const largestSet = new Set(largest);

  const isolatedNodeIds = components
    .filter((c) => c !== largest)
    .flat()
    .filter((id) => !largestSet.has(id));

  return {
    connected: components.length <= 1,
    components,
    isolatedNodeIds,
  };
}
