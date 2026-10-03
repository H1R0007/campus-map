import {
  AliasManager,
  Graph,
  PANORAMAS_PATH,
  createHttpDatasetSource,
  indexBuildingMetas,
  loadDataset,
  parsePanoramas,
  planRotationLookup,
} from '@campus-map/core';
import type { BuildingMeta, Dataset, DatasetSource, Panorama } from '@campus-map/core';

/** Всё, что нужно экскурсии: датасет, граф, названия и панорамы. */
export interface Tour {
  dataset: Dataset;
  graph: Graph;
  aliases: AliasManager;
  buildingMetas: ReadonlyMap<string, BuildingMeta>;
  panoramas: ReadonlyMap<string, Panorama>;
  /** Поворот плана этажа относительно территории, градусы. */
  planRotation: (building: string, floor: number) => number | null;
  warnings: string[];
}

/**
 * Загружает датасет ядром и описание панорам рядом с ним.
 *
 * `panoramas.json` читается тем же источником, что и датасет: в прототипе его
 * разбор — отдельный вызов, а не часть `loadDataset` (запись 90).
 */
export async function loadTour(
  source: DatasetSource = createHttpDatasetSource({ baseUrl: `${import.meta.env.BASE_URL}data` })
): Promise<Tour> {
  const { dataset, warnings } = await loadDataset(source);
  const graph = Graph.fromDataset(dataset);

  const aliases = new AliasManager();
  aliases.load(dataset.aliases);

  const parsed = parsePanoramas(await source.readJson(PANORAMAS_PATH), (id) => graph.hasNode(id));

  return {
    dataset,
    graph,
    aliases,
    buildingMetas: indexBuildingMetas(dataset.buildingMetas),
    panoramas: parsed.panoramas,
    planRotation: planRotationLookup(dataset.buildingMetas),
    warnings: [...warnings, ...parsed.warnings],
  };
}
