import type { Graph } from '@campus-map/core';

/**
 * Этажи корпуса, через которые проходит маршрут.
 *
 * Панель этажей отмечает их, чтобы было видно, куда переключаться, не
 * открывая шаги маршрута. Узлы территории и других корпусов не учитываются:
 * номер этажа имеет смысл только внутри своего здания.
 */
export function routeFloorsIn(
  graph: Graph,
  path: readonly string[],
  buildingId: string
): ReadonlySet<number> {
  const floors = new Set<number>();

  for (const nodeId of path) {
    const node = graph.getNode(nodeId);
    if (node?.building === buildingId) floors.add(node.floor);
  }

  return floors;
}
