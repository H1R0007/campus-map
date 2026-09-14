import { useMemo } from 'react';
import { DATA_BASE_URL } from '../config/dataBase';
import { useMapStore } from '../stores/mapStore';
import { canvasLayoutOf } from '../utils/canvasLayout';
import type { CanvasLayout } from '../utils/canvasLayout';

/** Раскладка холста кампуса; `null`, пока данных нет или они не привязаны к метрике. */
export function useCanvasLayout(): CanvasLayout | null {
  const graph = useMapStore((s) => s.graph);
  const campusMeta = useMapStore((s) => s.campusMeta);
  const buildingMetas = useMapStore((s) => s.buildingMetas);

  return useMemo(
    () =>
      graph?.isMetric && campusMeta && buildingMetas
        ? canvasLayoutOf(graph, campusMeta, buildingMetas, DATA_BASE_URL)
        : null,
    [graph, campusMeta, buildingMetas]
  );
}
