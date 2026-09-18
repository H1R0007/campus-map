import type { MapNode, Transition } from '@campus-map/core';

/** Сводка по одному плану для обзора в инспекторе. */
export interface PlanStats {
  nodes: number;
  /** Узлы, у которых есть хотя бы одно название. */
  named: number;
  /** Связи внутри плана, каждая один раз. */
  links: number;
  /** Узлы без единой связи. */
  isolated: number;
  /** Переходы, у которых хотя бы один конец на этом плане. */
  transitions: number;
  /**
   * На сколько не связанных между собой частей распадается план, если идти
   * только по связям этого плана. Больше одной — либо забытая связь, либо
   * крылья соединены через другой этаж.
   */
  parts: number;
}

/**
 * Считает сводку по узлам одного плана.
 *
 * Чистая функция от данных: обзор плана пересчитывает её в `useMemo` и не
 * хранит второй копии чисел, которую пришлось бы обновлять после правок.
 */
export function planStats(
  planNodes: readonly MapNode[],
  aliases: ReadonlyMap<string, readonly string[]>,
  transitions: readonly Transition[]
): PlanStats {
  const ids = new Set(planNodes.map((node) => node.id));
  const byId = new Map(planNodes.map((node) => [node.id, node]));

  let named = 0;
  let linkEnds = 0;
  let isolated = 0;
  for (const node of planNodes) {
    if ((aliases.get(node.id)?.length ?? 0) > 0) named += 1;
    const onPlan = node.neighbors.filter((id) => ids.has(id) && id !== node.id);
    linkEnds += onPlan.length;
    if (node.neighbors.length === 0) isolated += 1;
  }

  // Части плана — обход в ширину по связям в обе стороны: связь, записанная
  // только у одного конца, всё равно соединяет узлы на плане.
  const adjacency = new Map<string, Set<string>>();
  for (const node of planNodes) adjacency.set(node.id, new Set());
  for (const node of planNodes) {
    for (const id of node.neighbors) {
      if (!ids.has(id) || id === node.id) continue;
      adjacency.get(node.id)!.add(id);
      adjacency.get(id)!.add(node.id);
    }
  }
  const seen = new Set<string>();
  let parts = 0;
  for (const start of byId.keys()) {
    if (seen.has(start)) continue;
    parts += 1;
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }

  const planTransitions = transitions.filter((t) => ids.has(t.fromNode) || ids.has(t.toNode)).length;

  return {
    nodes: planNodes.length,
    named,
    // Двусторонняя связь записана у обоих концов; односторонняя — ошибка,
    // которую покажет проверка, а здесь она считается половиной.
    links: Math.round(linkEnds / 2),
    isolated,
    transitions: planTransitions,
    parts,
  };
}
