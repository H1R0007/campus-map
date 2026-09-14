import type { Graph, ViewScope } from '@campus-map/core';
import { isNodeInScope } from '@campus-map/core';


/** Одна и та же ли это область карты — территория или этаж корпуса. */
export function sameScope(a: ViewScope, b: ViewScope): boolean {
  if (a.mode === 'campus' || b.mode === 'campus') return a.mode === b.mode;
  return a.buildingId === b.buildingId && a.floor === b.floor;
}

/**
 * Проходит ли маршрут через показанную область карты — этаж или территорию.
 *
 * Пересчёт маршрута сменой ограничения не уводит карту с вида, через который
 * новый путь проходит: человек рассматривал именно этот этаж (запись 5).
 */
export function routePassesScope(graph: Graph, path: readonly string[], scope: ViewScope): boolean {
  return path.some((nodeId) => {
    const node = graph.getNode(nodeId);
    if (!node) return false;
    return isNodeInScope(node, scope);
  });
}
