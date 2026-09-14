import type { BuildingMeta, CampusMeta, Graph } from '@campus-map/core';
import { scopeOfNode } from '@campus-map/core';
import { scopePlanUrl } from './planUrls';

/**
 * Адреса планов, через которые идёт маршрут, в порядке прохождения: территория
 * и этажи корпусов, без повторов (запись 26), в формате из данных (запись 29).
 */
export function routePlanUrls(
  graph: Graph,
  path: readonly string[],
  campusMeta: CampusMeta | null,
  buildingMetas: ReadonlyMap<string, BuildingMeta> | null,
  baseUrl: string
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const nodeId of path) {
    const node = graph.getNode(nodeId);
    if (!node) continue;

    const url = scopePlanUrl(scopeOfNode(node), campusMeta, buildingMetas, baseUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}
