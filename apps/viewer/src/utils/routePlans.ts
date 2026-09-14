import type { Graph } from '@campus-map/core';
import { campusMapUrl, floorMapUrl, scopeOfNode } from '@campus-map/core';

/**
 * Адреса планов, через которые идёт маршрут, в порядке прохождения: территория
 * и этажи корпусов, без повторов (запись 26).
 */
export function routePlanUrls(graph: Graph, path: readonly string[], baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const nodeId of path) {
    const node = graph.getNode(nodeId);
    if (!node) continue;

    const scope = scopeOfNode(node);
    const url =
      scope.mode === 'campus' ? campusMapUrl(baseUrl) : floorMapUrl(scope.buildingId, scope.floor, baseUrl);

    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}
