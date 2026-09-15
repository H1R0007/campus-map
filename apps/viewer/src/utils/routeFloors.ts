import type { Graph, ViewScope } from '@campus-map/core';
import { CAMPUS_BUILDING_ID, isNodeInScope } from '@campus-map/core';


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

/**
 * Этажи, которые маршрут открывает в корпусах: в каждом корпусе — этаж, на
 * котором маршрут в нём заканчивается или из него выходит. На холсте в корпусе
 * цели виден этаж цели, а не входной (запись 32).
 */
export function routeBuildingFloors(graph: Graph, path: readonly string[]): Record<string, number> {
  const floors: Record<string, number> = {};
  for (const nodeId of path) {
    const node = graph.getNode(nodeId);
    if (node && node.building !== CAMPUS_BUILDING_ID) floors[node.building] = node.floor;
  }
  return floors;
}
