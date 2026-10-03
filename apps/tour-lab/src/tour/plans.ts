import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import type { MapNode, Panorama } from '@campus-map/core';
import type { Tour } from './loadTour';

/** План: территория или этаж корпуса. */
export interface PlanKey {
  building: string;
  floor: number;
}

export const planKeyOf = (node: Pick<MapNode, 'building' | 'floor'>): string => `${node.building}#${node.floor}`;

/** Планы, на которых есть снимки: территория первой, дальше корпуса и этажи по порядку. */
export function plansWithPanoramas(tour: Tour, panoramas: ReadonlyMap<string, Panorama>): PlanKey[] {
  const plans = new Map<string, PlanKey>();
  for (const id of panoramas.keys()) {
    const node = tour.graph.getNode(id);
    if (node) plans.set(planKeyOf(node), { building: node.building, floor: node.floor });
  }
  return [...plans.values()].sort((a, b) =>
    a.building === b.building
      ? a.floor - b.floor
      : a.building === CAMPUS_BUILDING_ID
        ? -1
        : b.building === CAMPUS_BUILDING_ID
          ? 1
          : a.building.localeCompare(b.building)
  );
}
