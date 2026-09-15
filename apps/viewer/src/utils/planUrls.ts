import type { BuildingMeta, CampusMeta, ViewScope } from '@campus-map/core';
import { campusMapUrl, floorMapUrl, planFormatOf } from '@campus-map/core';

/**
 * Адрес плана области карты — территории или этажа — в формате из данных
 * (`planFormat`, запись 29).
 */
export function scopePlanUrl(
  scope: ViewScope,
  campusMeta: CampusMeta | null,
  buildingMetas: ReadonlyMap<string, BuildingMeta> | null,
  baseUrl: string
): string {
  if (scope.mode === 'campus') return campusMapUrl(baseUrl, planFormatOf(campusMeta ?? undefined));

  const floorMeta = buildingMetas?.get(scope.buildingId)?.floors.find((meta) => meta.floor === scope.floor);
  return floorMapUrl(scope.buildingId, scope.floor, baseUrl, planFormatOf(floorMeta));
}
