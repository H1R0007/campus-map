import type { Graph, MapNode, TransitionType } from '@campus-map/core';

/**
 * Тип перехода, обслуживающий узел.
 *
 * У узла может быть несколько переходов (например, лестница и лифт рядом) —
 * берётся первый найденный: этого достаточно для иконки на плане и подписи в
 * карточке места.
 *
 * @returns `null`, если у узла нет ни одного перехода — у портала это ошибка
 *          разметки, которую диагностика редактора показывает отдельно
 */
export function portalTypeOf(graph: Graph, node: MapNode): TransitionType | null {
  for (const neighborId of graph.getNeighbors(node.id)) {
    const type = graph.getTransitionType(node.id, neighborId);
    if (type !== null) return type;
  }
  return null;
}
