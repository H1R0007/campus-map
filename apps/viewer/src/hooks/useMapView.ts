import { useMemo } from 'react';
import { scopeOf, shownFloorOf, useMapStore } from '../stores/mapStore';
import type { MapView } from '../utils/mapView';

/**
 * Что показывает карта (`MapView`): холст кампуса, если данные привязаны к
 * метрике, иначе один план — территория или этаж.
 */
export function useMapView(): MapView {
  const onCanvas = useMapStore((s) => s.graph?.isMetric === true);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const buildingFloors = useMapStore((s) => s.buildingFloors);
  const revealedBuildings = useMapStore((s) => s.revealedBuildings);
  const buildingMetas = useMapStore((s) => s.buildingMetas);

  // Холст от текущего корпуса не зависит: иначе каждый пролёт камеры над
  // корпусами пересобирал бы вид для всех слоёв.
  const planFloor = onCanvas ? null : activeFloor;

  return useMemo<MapView>(() => {
    if (!onCanvas) return { kind: 'plan', scope: scopeOf(planFloor) };

    const floors = new Map<string, number>();
    for (const meta of buildingMetas?.values() ?? []) {
      floors.set(meta.id, shownFloorOf(buildingFloors, meta, meta.id));
    }
    return { kind: 'canvas', floors, revealed: new Set(revealedBuildings) };
  }, [onCanvas, planFloor, buildingFloors, revealedBuildings, buildingMetas]);
}
